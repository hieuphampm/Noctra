import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import '../../core/errors/noctra_exception.dart';
import '../../core/utilities/url_validator.dart';
import '../../domain/entities/ai_provider_config.dart';
import 'ai_client_interface.dart';
import 'sse_stream_parser.dart';

class OpenAiCompatibleClient implements AiClientInterface {
  final Dio _dio;

  OpenAiCompatibleClient({Dio? dio}) : _dio = dio ?? Dio();

  Map<String, String> _buildHeaders(
    AiProviderConfig provider,
    String? apiKey, {
    bool isStreaming = false,
  }) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': isStreaming ? 'text/event-stream' : 'application/json',
    };

    if (apiKey != null && apiKey.trim().isNotEmpty) {
      headers['Authorization'] = 'Bearer ${apiKey.trim()}';
    }

    for (final entry in provider.customHeaders.entries) {
      final k = entry.key.trim();
      final v = entry.value.trim();
      if (k.isNotEmpty && v.isNotEmpty) {
        headers[k] = v;
      }
    }
    return headers;
  }

  void _validateProviderSecurity(AiProviderConfig provider) {
    final validation = UrlValidator.validateApiBaseUrl(provider.baseUrl);
    if (!validation.isValid) {
      throw NoctraException(
        type: NoctraErrorType.invalidEndpoint,
        userMessage:
            validation.errorMessage ?? 'Invalid API Base URL configuration.',
      );
    }
    if (validation.isInsecureHttp && !provider.allowInsecureHttp) {
      throw const NoctraException(
        type: NoctraErrorType.insecureHttpBlocked,
        userMessage:
            'This provider uses unencrypted HTTP. Enable "Allow Insecure HTTP" in the provider settings if you trust this local or self-hosted endpoint.',
      );
    }
    if (provider.modelName.trim().isEmpty) {
      throw const NoctraException(
        type: NoctraErrorType.modelNotFound,
        userMessage:
            'No model name is configured. Please specify a model name in Provider Settings.',
      );
    }
  }

  Map<String, dynamic> _buildRequestBody({
    required String modelName,
    required List<Map<String, dynamic>> messages,
    required double temperature,
    required double topP,
    required int maxTokens,
    required bool stream,
  }) {
    final body = <String, dynamic>{
      'model': modelName.trim(),
      'messages': messages,
      'temperature': double.parse(temperature.toStringAsFixed(2)),
      'top_p': double.parse(topP.toStringAsFixed(2)),
      'stream': stream,
    };
    if (maxTokens > 0) {
      body['max_tokens'] = maxTokens;
    }
    if (stream) {
      body['stream_options'] = {'include_usage': true};
    }
    return body;
  }

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
    _validateProviderSecurity(provider);

    final endpoint = UrlValidator.buildChatCompletionsUrl(provider.baseUrl);
    final headers = _buildHeaders(provider, apiKey, isStreaming: true);
    final timeout = Duration(seconds: provider.timeoutSeconds.clamp(10, 600));

    Response<ResponseBody> response;
    try {
      final body = _buildRequestBody(
        modelName: modelName,
        messages: messages,
        temperature: temperature,
        topP: topP,
        maxTokens: maxTokens,
        stream: true,
      );

      try {
        response = await _dio.post<ResponseBody>(
          endpoint,
          data: jsonEncode(body),
          cancelToken: cancelToken,
          options: Options(
            headers: headers,
            responseType: ResponseType.stream,
            sendTimeout: timeout,
            receiveTimeout: timeout,
          ),
        );
      } on DioException catch (e) {
        // Some OpenAI-compatible providers reject `stream_options`; retry cleanly without it if 400
        if (e.response?.statusCode == 400) {
          body.remove('stream_options');
          response = await _dio.post<ResponseBody>(
            endpoint,
            data: jsonEncode(body),
            cancelToken: cancelToken,
            options: Options(
              headers: headers,
              responseType: ResponseType.stream,
              sendTimeout: timeout,
              receiveTimeout: timeout,
            ),
          );
        } else {
          rethrow;
        }
      }
    } catch (e) {
      throw await _mapDioOrNetworkError(e);
    }

    final responseBody = response.data;
    if (responseBody == null) {
      throw const NoctraException(
        type: NoctraErrorType.emptyResponse,
        userMessage: 'The AI provider returned an empty response stream.',
      );
    }

    var receivedAnyContent = false;
    try {
      await for (final chunk
          in SseStreamParser.parseByteStream(responseBody.stream)) {
        if (chunk.textDelta.isNotEmpty) {
          receivedAnyContent = true;
        }
        yield chunk;
      }
    } catch (e) {
      if (e is DioException && CancelToken.isCancel(e)) {
        throw const NoctraException(
          type: NoctraErrorType.cancelledByUser,
          userMessage: 'Generation stopped.',
        );
      }
      throw NoctraException(
        type: NoctraErrorType.streamInterrupted,
        userMessage: receivedAnyContent
            ? 'The response stream was interrupted before completion.'
            : 'Failed to read stream from provider.',
      );
    }
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
    _validateProviderSecurity(provider);

    final endpoint = UrlValidator.buildChatCompletionsUrl(provider.baseUrl);
    final headers = _buildHeaders(provider, apiKey, isStreaming: false);
    final timeout = Duration(seconds: provider.timeoutSeconds.clamp(10, 600));

    final body = _buildRequestBody(
      modelName: modelName,
      messages: messages,
      temperature: temperature,
      topP: topP,
      maxTokens: maxTokens,
      stream: false,
    );

    try {
      final response = await _dio.post<dynamic>(
        endpoint,
        data: jsonEncode(body),
        cancelToken: cancelToken,
        options: Options(
          headers: headers,
          responseType: ResponseType.json,
          sendTimeout: timeout,
          receiveTimeout: timeout,
        ),
      );

      final rawData = response.data;
      final Map<String, dynamic> data;
      if (rawData is Map<String, dynamic>) {
        data = rawData;
      } else if (rawData is String) {
        data = jsonDecode(rawData) as Map<String, dynamic>;
      } else {
        throw const NoctraException(
          type: NoctraErrorType.malformedResponse,
          userMessage: 'Provider returned an unexpected response format.',
        );
      }

      final choices = data['choices'];
      if (choices is! List || choices.isEmpty) {
        throw const NoctraException(
          type: NoctraErrorType.emptyResponse,
          userMessage: 'Provider returned no completion choices.',
        );
      }

      final first = choices.first;
      String content = '';
      if (first is Map) {
        final msg = first['message'];
        if (msg is Map && msg['content'] != null) {
          content = msg['content'].toString();
        } else if (first['text'] != null) {
          content = first['text'].toString();
        }
      }

      if (content.trim().isEmpty) {
        throw const NoctraException(
          type: NoctraErrorType.emptyResponse,
          userMessage: 'The model returned an empty message.',
        );
      }

      int? promptTokens;
      int? completionTokens;
      int? totalTokens;
      final usage = data['usage'];
      if (usage is Map) {
        promptTokens = (usage['prompt_tokens'] as num?)?.toInt();
        completionTokens = (usage['completion_tokens'] as num?)?.toInt();
        totalTokens = (usage['total_tokens'] as num?)?.toInt();
      }

      return AiCompletionResponse(
        content: content,
        promptTokens: promptTokens,
        completionTokens: completionTokens,
        totalTokens: totalTokens,
        model: data['model']?.toString() ?? modelName,
      );
    } catch (e) {
      if (e is NoctraException) rethrow;
      throw await _mapDioOrNetworkError(e);
    }
  }

  @override
  Future<List<String>> fetchAvailableModels({
    required AiProviderConfig provider,
    required String? apiKey,
  }) async {
    final validation = UrlValidator.validateApiBaseUrl(provider.baseUrl);
    if (!validation.isValid) {
      throw NoctraException(
        type: NoctraErrorType.invalidEndpoint,
        userMessage: validation.errorMessage ?? 'Invalid API Base URL.',
      );
    }
    if (validation.isInsecureHttp && !provider.allowInsecureHttp) {
      throw const NoctraException(
        type: NoctraErrorType.insecureHttpBlocked,
        userMessage:
            'HTTP endpoint blocked. Enable "Allow Insecure HTTP" for local servers.',
      );
    }

    final modelsUrl = UrlValidator.buildModelsUrl(provider.baseUrl);
    final headers = _buildHeaders(provider, apiKey, isStreaming: false);

    try {
      final response = await _dio.get<dynamic>(
        modelsUrl,
        options: Options(
          headers: headers,
          receiveTimeout: const Duration(seconds: 15),
          sendTimeout: const Duration(seconds: 15),
        ),
      );

      final raw = response.data;
      final Map<String, dynamic> map = raw is Map<String, dynamic>
          ? raw
          : (raw is String
              ? jsonDecode(raw) as Map<String, dynamic>
              : <String, dynamic>{});

      final list = map['data'] ?? map['models'];
      if (list is List) {
        final models = <String>[];
        for (final item in list) {
          if (item is Map && item['id'] != null) {
            models.add(item['id'].toString());
          } else if (item is Map && item['name'] != null) {
            models.add(item['name'].toString());
          } else if (item is String) {
            models.add(item);
          }
        }
        models.sort();
        return models;
      }
      return [];
    } catch (e) {
      throw await _mapDioOrNetworkError(e);
    }
  }

  @override
  Future<ProviderConnectionTestResult> testConnection({
    required AiProviderConfig provider,
    required String? apiKey,
  }) async {
    final stopwatch = Stopwatch()..start();
    try {
      // First attempt GET /models discovery
      List<String> models = [];
      try {
        models = await fetchAvailableModels(
          provider: provider,
          apiKey: apiKey,
        );
      } catch (_) {
        // Some providers do not expose GET /models; proceed to chat completion probe
      }

      if (models.isNotEmpty && provider.modelName.trim().isEmpty) {
        stopwatch.stop();
        return ProviderConnectionTestResult(
          success: true,
          message:
              'Connected! Discovered ${models.length} models (${stopwatch.elapsedMilliseconds} ms).',
          discoveredModels: models,
          latencyMs: stopwatch.elapsedMilliseconds,
        );
      }

      if (provider.modelName.trim().isNotEmpty) {
        await sendChatCompletion(
          provider: provider,
          apiKey: apiKey,
          modelName: provider.modelName.trim(),
          messages: const [
            {'role': 'user', 'content': 'Reply with OK.'},
          ],
          temperature: 0.0,
          topP: 1.0,
          maxTokens: 8,
        );
      } else if (models.isEmpty) {
        throw const NoctraException(
          type: NoctraErrorType.modelNotFound,
          userMessage:
              'Endpoint did not return a /models list. Please enter a Model Name manually to test chat completion.',
        );
      }

      stopwatch.stop();
      return ProviderConnectionTestResult(
        success: true,
        message: models.isNotEmpty
            ? 'Verified chat completion & discovered ${models.length} models (${stopwatch.elapsedMilliseconds} ms).'
            : 'Verified chat completion with model "${provider.modelName}" (${stopwatch.elapsedMilliseconds} ms).',
        discoveredModels: models,
        latencyMs: stopwatch.elapsedMilliseconds,
      );
    } on NoctraException catch (e) {
      stopwatch.stop();
      return ProviderConnectionTestResult(
        success: false,
        message: '${e.title}: ${e.userMessage}',
        latencyMs: stopwatch.elapsedMilliseconds,
      );
    } catch (_) {
      stopwatch.stop();
      return ProviderConnectionTestResult(
        success: false,
        message: 'Could not reach the endpoint. Check URL and network status.',
        latencyMs: stopwatch.elapsedMilliseconds,
      );
    }
  }

  Future<NoctraException> _mapDioOrNetworkError(Object error) async {
    if (error is NoctraException) return error;

    if (error is DioException) {
      if (CancelToken.isCancel(error)) {
        return const NoctraException(
          type: NoctraErrorType.cancelledByUser,
          userMessage: 'Generation stopped.',
        );
      }

      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return const NoctraException(
            type: NoctraErrorType.requestTimeout,
            userMessage:
                'The AI provider took too long to respond. Try increasing the request timeout or checking your connection.',
          );
        case DioExceptionType.connectionError:
          return const NoctraException(
            type: NoctraErrorType.networkUnavailable,
            userMessage:
                'Unable to connect to the server. Verify your internet connection and API Base URL.',
          );
        case DioExceptionType.badCertificate:
          return const NoctraException(
            type: NoctraErrorType.invalidEndpoint,
            userMessage:
                'TLS/SSL certificate verification failed for this endpoint.',
          );
        default:
          break;
      }

      final statusCode = error.response?.statusCode;
      final providerMsg = await _extractProviderErrorMessage(error.response);

      if (statusCode == 401) {
        return NoctraException(
          type: NoctraErrorType.invalidApiKey,
          statusCode: statusCode,
          userMessage: providerMsg ??
              'Invalid or missing API key. Please check your credentials in Provider Settings.',
        );
      }
      if (statusCode == 403) {
        return NoctraException(
          type: NoctraErrorType.unauthorized,
          statusCode: statusCode,
          userMessage: providerMsg ??
              'Access denied (403). Your API key does not have permission for this model or resource.',
        );
      }
      if (statusCode == 404) {
        return NoctraException(
          type: NoctraErrorType.modelNotFound,
          statusCode: statusCode,
          userMessage: providerMsg ??
              'Endpoint or model not found (404). Verify the API Base URL and model name.',
        );
      }
      if (statusCode == 402 ||
          (providerMsg != null &&
              providerMsg.toLowerCase().contains('quota'))) {
        return NoctraException(
          type: NoctraErrorType.insufficientQuota,
          statusCode: statusCode,
          userMessage: providerMsg ??
              'Insufficient account quota or credits with the selected AI provider.',
        );
      }
      if (statusCode == 429) {
        return NoctraException(
          type: NoctraErrorType.rateLimitExceeded,
          statusCode: statusCode,
          userMessage: providerMsg ??
              'Rate limit exceeded (429). Please wait a moment before sending another request.',
        );
      }
      if (statusCode == 400 &&
          providerMsg != null &&
          (providerMsg.toLowerCase().contains('image') ||
              providerMsg.toLowerCase().contains('vision'))) {
        return NoctraException(
          type: NoctraErrorType.unsupportedImageInput,
          statusCode: statusCode,
          userMessage:
              'This model rejected image input: $providerMsg. Disable Vision in provider settings or choose a vision-capable model.',
        );
      }

      return NoctraException(
        type: NoctraErrorType.providerError,
        statusCode: statusCode,
        userMessage: providerMsg ??
            'Provider returned HTTP ${statusCode ?? "error"}. Please check your provider configuration.',
      );
    }

    if (error is SocketException) {
      return const NoctraException(
        type: NoctraErrorType.networkUnavailable,
        userMessage:
            'Network unreachable. Check your internet or local network connection.',
      );
    }

    if (error is FormatException) {
      return const NoctraException(
        type: NoctraErrorType.malformedResponse,
        userMessage: 'Received malformed JSON from the AI endpoint.',
      );
    }

    return const NoctraException(
      type: NoctraErrorType.unknown,
      userMessage: 'An unexpected communication error occurred.',
    );
  }

  Future<String?> _extractProviderErrorMessage(Response<dynamic>? res) async {
    if (res == null || res.data == null) return null;
    try {
      final data = res.data;
      String rawJson = '';
      if (data is ResponseBody) {
        final bytes = await data.stream
            .fold<List<int>>(<int>[], (prev, element) => prev..addAll(element));
        rawJson = utf8.decode(bytes, allowMalformed: true);
      } else if (data is String) {
        rawJson = data;
      } else if (data is Map) {
        return _parseErrorMap(Map<String, dynamic>.from(data));
      }

      if (rawJson.trim().isNotEmpty) {
        final decoded = jsonDecode(rawJson);
        if (decoded is Map) {
          return _parseErrorMap(Map<String, dynamic>.from(decoded));
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  String? _parseErrorMap(Map<String, dynamic> map) {
    final err = map['error'];
    if (err is Map && err['message'] != null) {
      return err['message'].toString();
    }
    if (err is String && err.isNotEmpty) {
      return err;
    }
    if (map['message'] is String) {
      return map['message'] as String;
    }
    if (map['detail'] is String) {
      return map['detail'] as String;
    }
    return null;
  }
}
