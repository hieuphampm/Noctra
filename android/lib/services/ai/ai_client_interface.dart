import 'package:dio/dio.dart';
import '../../domain/entities/ai_provider_config.dart';
import 'sse_stream_parser.dart';

class AiCompletionResponse {
  final String content;
  final int? promptTokens;
  final int? completionTokens;
  final int? totalTokens;
  final String? model;

  const AiCompletionResponse({
    required this.content,
    this.promptTokens,
    this.completionTokens,
    this.totalTokens,
    this.model,
  });
}

class ProviderConnectionTestResult {
  final bool success;
  final String message;
  final List<String> discoveredModels;
  final int latencyMs;

  const ProviderConnectionTestResult({
    required this.success,
    required this.message,
    this.discoveredModels = const [],
    required this.latencyMs,
  });
}

abstract class AiClientInterface {
  Stream<AiStreamChunk> streamChatCompletion({
    required AiProviderConfig provider,
    required String? apiKey,
    required String modelName,
    required List<Map<String, dynamic>> messages,
    required double temperature,
    required double topP,
    required int maxTokens,
    CancelToken? cancelToken,
  });

  Future<AiCompletionResponse> sendChatCompletion({
    required AiProviderConfig provider,
    required String? apiKey,
    required String modelName,
    required List<Map<String, dynamic>> messages,
    required double temperature,
    required double topP,
    required int maxTokens,
    CancelToken? cancelToken,
  });

  Future<List<String>> fetchAvailableModels({
    required AiProviderConfig provider,
    required String? apiKey,
  });

  Future<ProviderConnectionTestResult> testConnection({
    required AiProviderConfig provider,
    required String? apiKey,
  });
}
