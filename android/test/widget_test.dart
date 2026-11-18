import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:noctra_ai/app.dart';
import 'package:noctra_ai/core/providers/app_providers.dart';
import 'package:noctra_ai/data/local/hive_storage_service.dart';
import 'package:noctra_ai/data/local/secure_credential_store.dart';
import 'package:noctra_ai/domain/entities/ai_provider_config.dart';
import 'package:noctra_ai/services/ai/ai_client_interface.dart';
import 'package:noctra_ai/services/ai/sse_stream_parser.dart';
import 'package:noctra_ai/services/networking/network_monitor_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeNetworkMonitorService implements NetworkMonitorService {
  @override
  Future<bool> checkIsOnline() async => true;

  @override
  Stream<bool> get onConnectivityChanged => const Stream<bool>.empty();
}

class FakeAiClient implements AiClientInterface {
  @override
  Stream<AiStreamChunk> streamChatCompletion({
    required AiProviderConfig provider,
    required String? apiKey,
    required String modelName,
    required List<Map<String, dynamic>> messages,
    required double temperature,
    required double topP,
    required int maxTokens,
    CancelToken? cancelToken,
  }) async* {
    yield const AiStreamChunk(textDelta: 'NOCTRA ');
    await Future<void>.delayed(const Duration(milliseconds: 10));
    yield const AiStreamChunk(
      textDelta: 'is online and private.',
      promptTokens: 14,
      completionTokens: 6,
      totalTokens: 20,
      isDone: true,
    );
  }

  @override
  Future<AiCompletionResponse> sendChatCompletion({
    required AiProviderConfig provider,
    required String? apiKey,
    required String modelName,
    required List<Map<String, dynamic>> messages,
    required double temperature,
    required double topP,
    required int maxTokens,
    CancelToken? cancelToken,
  }) async {
    return const AiCompletionResponse(
      content: 'Non-streaming private response.',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      model: 'mock-model',
    );
  }

  @override
  Future<List<String>> fetchAvailableModels({
    required AiProviderConfig provider,
    required String? apiKey,
  }) async {
    return const ['noctra-fast', 'noctra-reasoning'];
  }

  @override
  Future<ProviderConnectionTestResult> testConnection({
    required AiProviderConfig provider,
    required String? apiKey,
  }) async {
    return const ProviderConnectionTestResult(
      success: true,
      message: 'Connected to mock endpoint (12 ms)',
      discoveredModels: ['noctra-fast', 'noctra-reasoning'],
      latencyMs: 12,
    );
  }
}

void main() {
  late HiveStorageService hiveService;
  late InMemorySecureCredentialStore secureStore;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    hiveService = HiveStorageService(inMemory: true);
    await hiveService.init();
    secureStore = InMemorySecureCredentialStore();
  });

  tearDown(() async {
    await hiveService.clearAllBoxes();
    await hiveService.close();
  });

  testWidgets(
      'End-to-end Home Screen, Provider Configuration, and Streaming Chat Flow',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          hiveStorageServiceProvider.overrideWithValue(hiveService),
          secureCredentialStoreProvider.overrideWithValue(secureStore),
          aiClientProvider.overrideWithValue(FakeAiClient()),
          networkMonitorServiceProvider
              .overrideWithValue(FakeNetworkMonitorService()),
        ],
        child: const NoctraApp(),
      ),
    );
    await tester.pumpAndSettle();

    // 1. Verify NOCTRA AI branding, tagline, welcome message, and suggested prompts
    expect(find.text('NOCTRA AI'), findsWidgets);
    expect(find.text('Private Intelligence. Your Own Space.'), findsOneWidget);
    expect(
      find.text('Good evening. What would you like to explore?'),
      findsOneWidget,
    );
    expect(find.text('Explain something complex'), findsOneWidget);

    // 2. Navigate to Provider Editor and configure an AI Provider
    final configButton = find.byIcon(Icons.key_rounded);
    await tester.ensureVisible(configButton);
    await tester.tap(configButton);
    await tester.pumpAndSettle();

    expect(find.text('New AI Provider'), findsOneWidget);
    await tester.tap(find.text('OpenAI'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    // 3. Send a chat message and verify streaming AI response
    final composerFinder = find.byWidgetPredicate(
      (w) =>
          w is TextField &&
          w.decoration?.hintText == 'Message NOCTRA AI...',
    );
    await tester.enterText(composerFinder, 'Verify private streaming flow');
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpAndSettle();

    expect(find.text('Verify private streaming flow'), findsWidgets);
    expect(
      find.textContaining(
        'NOCTRA is online and private.',
        findRichText: true,
      ),
      findsWidgets,
    );

    // 4. Open Settings screen and verify sections
    await tester.tap(find.byIcon(Icons.settings_outlined).first);
    await tester.pumpAndSettle();

    expect(find.text('GENERAL'), findsOneWidget);
    expect(find.text('AI PROVIDERS'), findsOneWidget);
    expect(find.text('AMOLED Pure Black Mode'), findsOneWidget);
  });
}
