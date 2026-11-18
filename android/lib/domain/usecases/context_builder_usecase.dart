import '../../core/utilities/token_estimator.dart';
import '../entities/ai_persona.dart';
import '../entities/ai_provider_config.dart';
import '../entities/attachment_item.dart';
import '../entities/chat_message.dart';
import '../entities/conversation.dart';

class PreparedApiPayload {
  final List<Map<String, dynamic>> apiMessages;
  final int estimatedInputTokens;
  final List<String> warnings;

  const PreparedApiPayload({
    required this.apiMessages,
    required this.estimatedInputTokens,
    required this.warnings,
  });
}

class ContextBuilderUseCase {
  const ContextBuilderUseCase();

  /// Constructs the OpenAI-compatible `messages` payload while respecting:
  /// 1. Conversation context clearing (`contextClearedAtCount`)
  /// 2. User privacy toggles (`sendChatHistory`, `sendAttachments`)
  /// 3. Maximum context window limit (`maxContextMessages`)
  /// 4. Vision capability checks (`provider.supportsVision`)
  PreparedApiPayload buildMessagesPayload({
    required Conversation conversation,
    required AiProviderConfig provider,
    required List<ChatMessage> allMessages,
    required ChatMessage currentMessage,
    required String fallbackSystemPrompt,
    AiPersona? activePersona,
  }) {
    final warnings = <String>[];
    final apiMessages = <Map<String, dynamic>>[];

    // 1. Resolve System Prompt (Conversation Override > Persona > Provider Default > Global Default)
    String effectiveSystemPrompt = fallbackSystemPrompt.trim();
    if (provider.defaultSystemPrompt.trim().isNotEmpty) {
      effectiveSystemPrompt = provider.defaultSystemPrompt.trim();
    }
    if (activePersona != null && activePersona.systemPrompt.trim().isNotEmpty) {
      effectiveSystemPrompt = activePersona.systemPrompt.trim();
    }
    if (conversation.systemPromptOverride != null &&
        conversation.systemPromptOverride!.trim().isNotEmpty) {
      effectiveSystemPrompt = conversation.systemPromptOverride!.trim();
    }

    int estimatedTokens = 0;
    if (effectiveSystemPrompt.isNotEmpty) {
      apiMessages.add({
        'role': 'system',
        'content': effectiveSystemPrompt,
      });
      estimatedTokens += TokenEstimator.estimateTokens(effectiveSystemPrompt);
    }

    // 2. Include prior history only if user enabled `sendChatHistory`
    if (conversation.sendChatHistory) {
      final startIndex = conversation.contextClearedAtCount.clamp(
        0,
        allMessages.length,
      );
      final activeHistory = allMessages
          .sublist(startIndex)
          .where((m) =>
              m.id != currentMessage.id &&
              m.status == MessageDeliveryStatus.completed &&
              (m.content.trim().isNotEmpty || m.attachments.isNotEmpty))
          .toList();

      final maxHistory = conversation.maxContextMessages.clamp(1, 200);
      final windowedHistory = activeHistory.length > maxHistory
          ? activeHistory.sublist(activeHistory.length - maxHistory)
          : activeHistory;

      for (final msg in windowedHistory) {
        final formatted = _formatSingleMessage(
          message: msg,
          provider: provider,
          includeAttachments: conversation.sendAttachments,
          warnings: warnings,
        );
        apiMessages.add(formatted);
        estimatedTokens += TokenEstimator.estimateTokens(msg.content);
      }
    }

    // 3. Add the current user message
    final formattedCurrent = _formatSingleMessage(
      message: currentMessage,
      provider: provider,
      includeAttachments: conversation.sendAttachments,
      warnings: warnings,
    );
    apiMessages.add(formattedCurrent);
    estimatedTokens += TokenEstimator.estimateTokens(currentMessage.content);
    for (final att in currentMessage.attachments) {
      if (att.extractedText != null) {
        estimatedTokens += TokenEstimator.estimateTokens(att.extractedText!);
      } else if (att.isImage) {
        estimatedTokens += 255; // Approximate vision tile token cost
      }
    }

    return PreparedApiPayload(
      apiMessages: apiMessages,
      estimatedInputTokens: estimatedTokens,
      warnings: warnings.toSet().toList(),
    );
  }

  Map<String, dynamic> _formatSingleMessage({
    required ChatMessage message,
    required AiProviderConfig provider,
    required bool includeAttachments,
    required List<String> warnings,
  }) {
    final roleStr = message.role.name;
    if (!includeAttachments || message.attachments.isEmpty) {
      return {
        'role': roleStr,
        'content': message.content,
      };
    }

    final textBuffer = StringBuffer(message.content.trim());
    final imageParts = <Map<String, dynamic>>[];

    for (final att in message.attachments) {
      if (att.category == AttachmentCategory.image) {
        if (!provider.supportsVision) {
          warnings.add(
            'Selected model (${provider.modelName}) is configured without Vision support. Image "${att.fileName}" was omitted.',
          );
          continue;
        }
        if (att.base64DataUrl != null && att.base64DataUrl!.isNotEmpty) {
          imageParts.add({
            'type': 'image_url',
            'image_url': {
              'url': att.base64DataUrl!,
            },
          });
        }
      } else if (att.extractedText != null &&
          att.extractedText!.trim().isNotEmpty) {
        textBuffer.writeln('\n\n--- Attached File: ${att.fileName} ---');
        textBuffer.writeln(att.extractedText!.trim());
        textBuffer.writeln('--- End of ${att.fileName} ---');
      } else if (att.category == AttachmentCategory.unsupported) {
        warnings.add(
          'Attachment "${att.fileName}" has an unsupported format and could not be included.',
        );
      }
    }

    final combinedText = textBuffer.toString().trim();

    if (imageParts.isNotEmpty) {
      final contentList = <Map<String, dynamic>>[];
      if (combinedText.isNotEmpty) {
        contentList.add({
          'type': 'text',
          'text': combinedText,
        });
      } else {
        contentList.add({
          'type': 'text',
          'text': 'Please analyze the attached image(s).',
        });
      }
      contentList.addAll(imageParts);
      return {
        'role': roleStr,
        'content': contentList,
      };
    }

    return {
      'role': roleStr,
      'content': combinedText,
    };
  }

  /// Generates an automatic, concise conversation title from the first user prompt.
  String generateAutomaticTitle(String firstUserPrompt) {
    final cleaned = firstUserPrompt
        .replaceAll(RegExp(r'```[\s\S]*?```'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (cleaned.isEmpty) {
      return 'Attachment Analysis';
    }
    final words = cleaned.split(' ');
    if (words.length <= 6) {
      return cleaned.length > 42 ? '${cleaned.substring(0, 42)}...' : cleaned;
    }
    final firstSix = words.take(6).join(' ');
    return firstSix.length > 44 ? '${firstSix.substring(0, 44)}...' : firstSix;
  }
}
