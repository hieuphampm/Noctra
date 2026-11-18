import 'dart:convert';
import '../../domain/entities/chat_message.dart';
import '../../domain/entities/conversation.dart';

class ImportedBackupBundle {
  final List<Conversation> conversations;
  final Map<String, List<ChatMessage>> messagesByConversation;

  const ImportedBackupBundle({
    required this.conversations,
    required this.messagesByConversation,
  });
}

class DataExportService {
  const DataExportService();

  /// Redacts any accidental Bearer tokens or sk- API key strings before exporting conversations (Section 14).
  static String redactPotentialSecrets(String input) {
    return input
        .replaceAll(
          RegExp(r'sk-[A-Za-z0-9_\-]{20,}'),
          '[REDACTED_API_KEY]',
        )
        .replaceAll(
          RegExp(r'Bearer\s+[A-Za-z0-9._\-]{20,}', caseSensitive: false),
          'Bearer [REDACTED_TOKEN]',
        );
  }

  /// Exports a single conversation or all conversations to structured JSON.
  /// Never includes provider API keys.
  String exportConversationsToJson({
    required List<Conversation> conversations,
    required Map<String, List<ChatMessage>> messagesByConversation,
  }) {
    final payload = {
      'app': 'NOCTRA AI',
      'schemaVersion': 1,
      'exportedAt': DateTime.now().toIso8601String(),
      'conversations': conversations.map((c) {
        final msgs = messagesByConversation[c.id] ?? const <ChatMessage>[];
        return {
          'conversation': c.toMap(),
          'messages': msgs
              .map((m) => m
                  .copyWith(
                    content: redactPotentialSecrets(m.content),
                  )
                  .toMap())
              .toList(),
        };
      }).toList(),
    };

    return const JsonEncoder.withIndent('  ').convert(payload);
  }

  /// Exports a conversation to clean, human-readable Markdown.
  String exportConversationToMarkdown({
    required Conversation conversation,
    required List<ChatMessage> messages,
  }) {
    final buffer = StringBuffer();
    buffer.writeln('# ${conversation.title}');
    buffer.writeln(
      '> Exported from **NOCTRA AI** on ${DateTime.now().toIso8601String()}',
    );
    buffer.writeln();

    for (final msg in messages) {
      final speaker = msg.isUser
          ? '### User'
          : (msg.isAssistant
              ? '### Assistant (${msg.modelUsed ?? "AI"})'
              : '### System');
      buffer.writeln(speaker);
      buffer.writeln('_${msg.createdAt.toLocal().toIso8601String()}_');
      buffer.writeln();
      buffer.writeln(redactPotentialSecrets(msg.content));
      if (msg.attachments.isNotEmpty) {
        buffer.writeln();
        buffer.writeln(
          '**Attachments:** ${msg.attachments.map((a) => a.fileName).join(", ")}',
        );
      }
      buffer.writeln('\n---\n');
    }

    return buffer.toString();
  }

  /// Parses an exported JSON backup bundle for importing conversations locally.
  ImportedBackupBundle parseJsonImport(String jsonContent) {
    final decoded = jsonDecode(jsonContent);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid NOCTRA backup JSON structure.');
    }

    final rawList = decoded['conversations'];
    if (rawList is! List) {
      throw const FormatException(
        'Backup file does not contain a "conversations" list.',
      );
    }

    final conversations = <Conversation>[];
    final messagesByConv = <String, List<ChatMessage>>{};

    for (final item in rawList) {
      if (item is! Map) continue;
      final convMap = item['conversation'];
      final msgsList = item['messages'];
      if (convMap is Map) {
        final conv = Conversation.fromMap(Map<String, dynamic>.from(convMap));
        if (conv.id.isNotEmpty) {
          conversations.add(conv);
          final parsedMessages = <ChatMessage>[];
          if (msgsList is List) {
            for (final m in msgsList) {
              if (m is Map) {
                parsedMessages.add(
                  ChatMessage.fromMap(Map<String, dynamic>.from(m)),
                );
              }
            }
          }
          messagesByConv[conv.id] = parsedMessages;
        }
      }
    }

    return ImportedBackupBundle(
      conversations: conversations,
      messagesByConversation: messagesByConv,
    );
  }
}
