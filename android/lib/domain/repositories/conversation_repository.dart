import '../entities/chat_message.dart';
import '../entities/conversation.dart';

abstract class ConversationRepository {
  Future<List<Conversation>> getAllConversations();
  Future<Conversation?> getConversationById(String id);
  Future<void> saveConversation(Conversation conversation);
  Future<void> deleteConversation(String id);
  Future<void> clearAllConversations();

  Future<List<ChatMessage>> getMessagesForConversation(String conversationId);
  Future<void> saveMessage(ChatMessage message);
  Future<void> deleteMessage(String conversationId, String messageId);
  Future<void> deleteMessagesFrom(String conversationId, DateTime fromTime);
}
