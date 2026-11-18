import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:noctra_ai/core/errors/noctra_exception.dart';
import 'package:noctra_ai/core/utilities/url_validator.dart';
import 'package:noctra_ai/data/local/hive_storage_service.dart';
import 'package:noctra_ai/data/local/secure_credential_store.dart';
import 'package:noctra_ai/data/repositories/conversation_repository_impl.dart';
import 'package:noctra_ai/data/repositories/provider_repository_impl.dart';
import 'package:noctra_ai/domain/entities/ai_provider_config.dart';
import 'package:noctra_ai/domain/entities/attachment_item.dart';
import 'package:noctra_ai/domain/entities/chat_message.dart';
import 'package:noctra_ai/domain/entities/conversation.dart';
import 'package:noctra_ai/domain/usecases/context_builder_usecase.dart';
import 'package:noctra_ai/services/ai/openai_compatible_client.dart';
import 'package:noctra_ai/services/ai/sse_stream_parser.dart';
import 'package:noctra_ai/services/file_processing/attachment_processor_service.dart';
import 'package:noctra_ai/services/storage/data_export_service.dart';

class _MockHttpClientAdapter implements HttpClientAdapter {
  final Future<ResponseBody> Function(RequestOptions options) handler;

  _MockHttpClientAdapter(this.handler);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  group('SSE Streaming Parser Tests', () {
    test('Parses single SSE delta lines, usage metadata, and [DONE]', () {
      final chunk1 = SseStreamParser.parseSingleSseLine(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      );
      expect(chunk1, isNotNull);
      expect(chunk1!.textDelta, equals('Hello'));
      expect(chunk1.isDone, isFalse);

      final usageChunk = SseStreamParser.parseSingleSseLine(
        'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}',
      );
      expect(usageChunk, isNotNull);
      expect(usageChunk!.promptTokens, equals(12));
      expect(usageChunk.completionTokens, equals(8));
      expect(usageChunk.totalTokens, equals(20));

      final doneChunk = SseStreamParser.parseSingleSseLine('data: [DONE]');
      expect(doneChunk, isNotNull);
      expect(doneChunk!.isDone, isTrue);
    });

    test('Reassembles fragmented UTF-8 SSE packets across byte stream', () async {
      final controller = StreamController<Uint8List>();
      final parsedFuture =
          SseStreamParser.parseByteStream(controller.stream).toList();

      // Split a single SSE line across two network packets
      controller.add(
        Uint8List.fromList(utf8.encode('data: {"choices":[{"delta":{"con')),
      );
      controller.add(
        Uint8List.fromList(
          utf8.encode('tent":"Private "}}]}\n\ndata: {"choices":[{"delta":{"content":"Space"}}]}\ndata: [DONE]\n'),
        ),
      );
      await controller.close();

      final chunks = await parsedFuture;
      final combined = chunks.map((c) => c.textDelta).join();
      expect(combined, equals('Private Space'));
      expect(chunks.last.isDone, isTrue);
    });
  });

  group('URL Validation & Security Tests', () {
    test('Validates HTTPS and detects insecure HTTP endpoints', () {
      final httpsRes =
          UrlValidator.validateApiBaseUrl('https://api.example.com/v1/');
      expect(httpsRes.isValid, isTrue);
      expect(httpsRes.isInsecureHttp, isFalse);
      expect(httpsRes.normalizedUrl, equals('https://api.example.com/v1'));
      expect(
        UrlValidator.buildChatCompletionsUrl(httpsRes.normalizedUrl),
        equals('https://api.example.com/v1/chat/completions'),
      );

      final httpRes =
          UrlValidator.validateApiBaseUrl('http://192.168.1.50:11434/v1');
      expect(httpRes.isValid, isTrue);
      expect(httpRes.isInsecureHttp, isTrue);
      expect(httpRes.isLocalNetwork, isTrue);
    });
  });

  group('OpenAI-Compatible API Client Tests', () {
    test('Blocks insecure HTTP when allowInsecureHttp is false', () async {
      final client = OpenAiCompatibleClient();
      final insecureProvider = AiProviderConfig(
        id: 'p1',
        name: 'Insecure Test',
        baseUrl: 'http://example.com/v1',
        modelName: 'test-model',
        allowInsecureHttp: false,
        createdAt: DateTime.now(),
      );

      expect(
        () => client.sendChatCompletion(
          provider: insecureProvider,
          apiKey: 'secret',
          modelName: 'test-model',
          messages: const [
            {'role': 'user', 'content': 'Hi'},
          ],
          temperature: 0.7,
          topP: 1.0,
          maxTokens: 100,
        ),
        throwsA(
          isA<NoctraException>().having(
            (e) => e.type,
            'type',
            NoctraErrorType.insecureHttpBlocked,
          ),
        ),
      );
    });

    test('Parses non-streaming completion and maps 401 unauthorized errors',
        () async {
      final dio = Dio();
      int statusCodeToReturn = 200;

      dio.httpClientAdapter = _MockHttpClientAdapter((options) async {
        expect(options.headers['Authorization'], equals('Bearer test-key-123'));
        if (statusCodeToReturn == 401) {
          return ResponseBody.fromString(
            jsonEncode({
              'error': {'message': 'Incorrect API key provided'},
            }),
            401,
            headers: {
              Headers.contentTypeHeader: ['application/json'],
            },
          );
        }
        return ResponseBody.fromString(
          jsonEncode({
            'id': 'chatcmpl-1',
            'model': 'noctra-pro',
            'choices': [
              {
                'message': {
                  'role': 'assistant',
                  'content': 'Verified response from mock endpoint.',
                },
              },
            ],
            'usage': {
              'prompt_tokens': 10,
              'completion_tokens': 6,
              'total_tokens': 16,
            },
          }),
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final client = OpenAiCompatibleClient(dio: dio);
      final provider = AiProviderConfig(
        id: 'p_valid',
        name: 'Mock Provider',
        baseUrl: 'https://api.example.com/v1',
        modelName: 'noctra-pro',
        createdAt: DateTime.now(),
      );

      final res = await client.sendChatCompletion(
        provider: provider,
        apiKey: 'test-key-123',
        modelName: 'noctra-pro',
        messages: const [
          {'role': 'user', 'content': 'Hello'},
        ],
        temperature: 0.5,
        topP: 1.0,
        maxTokens: 256,
      );

      expect(res.content, equals('Verified response from mock endpoint.'));
      expect(res.totalTokens, equals(16));

      statusCodeToReturn = 401;
      expect(
        () => client.sendChatCompletion(
          provider: provider,
          apiKey: 'test-key-123',
          modelName: 'noctra-pro',
          messages: const [
            {'role': 'user', 'content': 'Hello'},
          ],
          temperature: 0.5,
          topP: 1.0,
          maxTokens: 256,
        ),
        throwsA(
          isA<NoctraException>().having(
            (e) => e.type,
            'type',
            NoctraErrorType.invalidApiKey,
          ),
        ),
      );
    });
  });

  group('Local Storage, Secure Credentials & Context Management Tests', () {
    late Directory tempDir;
    late HiveStorageService hive;
    late InMemorySecureCredentialStore secureStore;
    late ProviderRepositoryImpl providerRepo;
    late ConversationRepositoryImpl convRepo;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('noctra_test_');
      hive = HiveStorageService();
      await hive.init(testPath: tempDir.path);
      secureStore = InMemorySecureCredentialStore();
      providerRepo = ProviderRepositoryImpl(
        hive: hive,
        secureStore: secureStore,
      );
      convRepo = ConversationRepositoryImpl(hive: hive);
    });

    tearDown(() async {
      await hive.clearAllBoxes();
      await hive.close();
      try {
        if (await tempDir.exists()) {
          await tempDir.delete(recursive: true);
        }
      } catch (_) {}
    });

    test(
        'Stores API keys in SecureCredentialStore and never in Hive provider map',
        () async {
      final config = AiProviderConfig(
        id: 'prov_secure_1',
        name: 'Private Server',
        baseUrl: 'https://llm.example.org/v1',
        modelName: 'llama-3.3-70b',
        createdAt: DateTime.now(),
      );

      await providerRepo.saveProvider(
        config,
        apiKey: 'sk-super-secret-do-not-leak-99999999',
      );

      // Verify raw Hive JSON does NOT contain the API key
      final rawHiveJson = hive.providersBox.get('prov_secure_1') ?? '';
      expect(rawHiveJson.contains('sk-super-secret'), isFalse);

      // Verify SecureCredentialStore holds the key
      final retrievedKey =
          await providerRepo.getApiKeyForProvider('prov_secure_1');
      expect(retrievedKey, equals('sk-super-secret-do-not-leak-99999999'));
    });

    test('Persists conversations, messages, and respects context window reset',
        () async {
      final conv = Conversation(
        id: 'conv_1',
        title: 'Architecture Review',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        contextClearedAtCount: 1, // First message is before context reset
      );
      await convRepo.saveConversation(conv);

      final msg1 = ChatMessage(
        id: 'm1',
        conversationId: 'conv_1',
        role: MessageRole.user,
        content: 'Old message before context clear',
        createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
      );
      final msg2 = ChatMessage(
        id: 'm2',
        conversationId: 'conv_1',
        role: MessageRole.user,
        content: 'New message after context clear',
        createdAt: DateTime.now(),
      );

      await convRepo.saveMessage(msg1);
      await convRepo.saveMessage(msg2);

      final loadedMsgs = await convRepo.getMessagesForConversation('conv_1');
      expect(loadedMsgs.length, equals(2));

      const builder = ContextBuilderUseCase();
      final payload = builder.buildMessagesPayload(
        conversation: conv,
        provider: AiProviderConfig(
          id: 'p1',
          name: 'Test',
          baseUrl: 'https://api.example.com/v1',
          modelName: 'model-1',
          supportsVision: false,
          createdAt: DateTime.now(),
        ),
        allMessages: loadedMsgs,
        currentMessage: msg2,
        fallbackSystemPrompt: 'System prompt',
      );

      // Only system prompt + msg2 should be sent because contextClearedAtCount == 1
      expect(payload.apiMessages.length, equals(2));
      expect(
        payload.apiMessages.any(
          (m) => m['content'].toString().contains('Old message'),
        ),
        isFalse,
      );
    });

    test('Redacts secrets on JSON export and restores conversations on import',
        () async {
      const exporter = DataExportService();
      final conv = Conversation(
        id: 'c_export',
        title: 'Export Test',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      final msg = ChatMessage(
        id: 'm_export',
        conversationId: 'c_export',
        role: MessageRole.user,
        content:
            'Here is an accidental key sk-1234567890abcdefghijklmno that must be redacted.',
        createdAt: DateTime.now(),
      );

      final jsonStr = exporter.exportConversationsToJson(
        conversations: [conv],
        messagesByConversation: {
          'c_export': [msg],
        },
      );

      expect(jsonStr.contains('sk-1234567890abcdefghijklmno'), isFalse);
      expect(jsonStr.contains('[REDACTED_API_KEY]'), isTrue);

      final imported = exporter.parseJsonImport(jsonStr);
      expect(imported.conversations.length, equals(1));
      expect(imported.messagesByConversation['c_export']!.length, equals(1));
    });

    test('Processes text and image attachments locally', () async {
      final processor = AttachmentProcessorService();
      final textBytes =
          Uint8List.fromList(utf8.encode('# Markdown Doc\nKey privacy notes.'));
      final item = await processor.processFile(
        filePath: 'notes.md',
        originalFileName: 'notes.md',
        preloadedBytes: textBytes,
      );

      expect(item.category, equals(AttachmentCategory.text));
      expect(item.extractedText, contains('Key privacy notes.'));
    });
  });
}
