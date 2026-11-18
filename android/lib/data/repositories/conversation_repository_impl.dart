import 'dart:convert';
import '../../core/constants/app_constants.dart';
import '../../domain/entities/chat_message.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/repositories/conversation_repository.dart';
import '../local/hive_storage_service.dart';

class ConversationRepositoryImpl implements ConversationRepository {
  final HiveStorageService hive;

  ConversationRepositoryImpl({required this.hive});

  @override
  Future<List<Conversation>> getAllConversations() async {
    final maps = hive.getAllMapsByName(AppConstants.conversationsBox);
    final list = maps.map(Conversation.fromMap).toList();
    list.sort((a, b) {
      if (a.isPinned != b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return b.updatedAt.compareTo(a.updatedAt);
    });
    return list;
  }

  @override
  Future<Conversation?> getConversationById(String id) async {
    final map = hive.getMapByName(AppConstants.conversationsBox, id);
    if (map == null) return null;
    return Conversation.fromMap(map);
  }

  @override
  Future<void> saveConversation(Conversation conversation) async {
    await hive.putMapByName(
      AppConstants.conversationsBox,
      conversation.id,
      conversation.toMap(),
    );
  }

  @override
  Future<void> deleteConversation(String id) async {
    await hive.deleteKey(AppConstants.conversationsBox, id);
    await hive.deleteKey(AppConstants.messagesBox, id);
  }

  @override
  Future<void> clearAllConversations() async {
    await hive.clearBox(AppConstants.conversationsBox);
    await hive.clearBox(AppConstants.messagesBox);
  }

  @override
  Future<List<ChatMessage>> getMessagesForConversation(
    String conversationId,
  ) async {
    final raw = hive.getRaw(AppConstants.messagesBox, conversationId);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      final messages = decoded
          .whereType<Map>()
          .map((m) => ChatMessage.fromMap(Map<String, dynamic>.from(m)))
          .toList();
      messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      return messages;
    } catch (_) {
      return [];
    }
  }

  @override
  Future<void> saveMessage(ChatMessage message) async {
    final current = await getMessagesForConversation(message.conversationId);
    final idx = current.indexWhere((m) => m.id == message.id);
    if (idx >= 0) {
      current[idx] = message;
    } else {
      current.add(message);
    }
    await _persistMessageList(message.conversationId, current);
  }

  @override
  Future<void> deleteMessage(String conversationId, String messageId) async {
    final current = await getMessagesForConversation(conversationId);
    current.removeWhere((m) => m.id == messageId);
    await _persistMessageList(conversationId, current);
  }

  @override
  Future<void> deleteMessagesFrom(
    String conversationId,
    DateTime fromTime,
  ) async {
    final current = await getMessagesForConversation(conversationId);
    current.removeWhere(
      (m) =>
          m.createdAt.isAfter(fromTime) ||
          m.createdAt.isAtSameMomentAs(fromTime),
    );
    await _persistMessageList(conversationId, current);
  }

  Future<void> _persistMessageList(
    String conversationId,
    List<ChatMessage> messages,
  ) async {
    final serialized = jsonEncode(messages.map((m) => m.toMap()).toList());
    await hive.putRaw(AppConstants.messagesBox, conversationId, serialized);
  }
}
