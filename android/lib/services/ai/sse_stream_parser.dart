import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

class AiStreamChunk {
  final String textDelta;
  final int? promptTokens;
  final int? completionTokens;
  final int? totalTokens;
  final bool isDone;

  const AiStreamChunk({
    this.textDelta = '',
    this.promptTokens,
    this.completionTokens,
    this.totalTokens,
    this.isDone = false,
  });
}

class SseStreamParser {
  SseStreamParser._();

  /// Transforms a raw byte stream from Dio `ResponseType.stream` into parsed `AiStreamChunk` events.
  /// Handles partial lines across network packets and standard OpenAI-compatible SSE `data:` frames.
  static Stream<AiStreamChunk> parseByteStream(Stream<Uint8List> byteStream) {
    final controller = StreamController<AiStreamChunk>();
    final utf8Decoder = const Utf8Decoder(allowMalformed: true);
    var buffer = '';

    StreamSubscription<Uint8List>? subscription;

    subscription = byteStream.listen(
      (Uint8List bytes) {
        final decoded = utf8Decoder.convert(bytes);
        buffer += decoded;

        while (true) {
          final newlineIdx = buffer.indexOf('\n');
          if (newlineIdx == -1) break;

          final rawLine = buffer.substring(0, newlineIdx).trim();
          buffer = buffer.substring(newlineIdx + 1);

          final chunk = parseSingleSseLine(rawLine);
          if (chunk != null) {
            controller.add(chunk);
            if (chunk.isDone) {
              break;
            }
          }
        }
      },
      onError: (Object error, StackTrace stackTrace) {
        if (!controller.isClosed) {
          controller.addError(error, stackTrace);
        }
      },
      onDone: () {
        if (buffer.trim().isNotEmpty) {
          final remaining = parseSingleSseLine(buffer.trim());
          if (remaining != null && !controller.isClosed) {
            controller.add(remaining);
          }
        }
        if (!controller.isClosed) {
          controller.close();
        }
      },
      cancelOnError: false,
    );

    controller.onCancel = () async {
      await subscription?.cancel();
    };

    return controller.stream;
  }

  /// Parses a single SSE line (`data: {...}` or `data: [DONE]`).
  /// Exposed as a static method for direct unit testing.
  static AiStreamChunk? parseSingleSseLine(String line) {
    final trimmed = line.trim();
    if (trimmed.isEmpty || trimmed.startsWith(':')) {
      return null;
    }

    String payload = trimmed;
    if (trimmed.startsWith('data:')) {
      payload = trimmed.substring(5).trim();
    } else if (!trimmed.startsWith('{')) {
      return null;
    }

    if (payload == '[DONE]') {
      return const AiStreamChunk(isDone: true);
    }

    try {
      final decoded = jsonDecode(payload);
      if (decoded is! Map<String, dynamic>) return null;

      String deltaText = '';
      final choices = decoded['choices'];
      if (choices is List && choices.isNotEmpty) {
        final firstChoice = choices.first;
        if (firstChoice is Map) {
          final delta = firstChoice['delta'];
          if (delta is Map) {
            final content = delta['content'];
            final reasoning = delta['reasoning_content'];
            if (content is String && content.isNotEmpty) {
              deltaText += content;
            } else if (reasoning is String && reasoning.isNotEmpty) {
              deltaText += reasoning;
            }
          } else if (firstChoice['message'] is Map) {
            final msgContent = firstChoice['message']['content'];
            if (msgContent is String) {
              deltaText += msgContent;
            }
          } else if (firstChoice['text'] is String) {
            deltaText += firstChoice['text'] as String;
          }
        }
      }

      int? promptTokens;
      int? completionTokens;
      int? totalTokens;
      final usage = decoded['usage'];
      if (usage is Map) {
        promptTokens = (usage['prompt_tokens'] as num?)?.toInt();
        completionTokens = (usage['completion_tokens'] as num?)?.toInt();
        totalTokens = (usage['total_tokens'] as num?)?.toInt();
      }

      if (deltaText.isEmpty &&
          promptTokens == null &&
          completionTokens == null &&
          totalTokens == null) {
        return null;
      }

      return AiStreamChunk(
        textDelta: deltaText,
        promptTokens: promptTokens,
        completionTokens: completionTokens,
        totalTokens: totalTokens,
      );
    } catch (_) {
      return null;
    }
  }
}
