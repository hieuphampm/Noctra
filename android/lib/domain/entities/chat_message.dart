import 'attachment_item.dart';

enum MessageRole {
  system,
  user,
  assistant,
}

enum MessageDeliveryStatus {
  sending,
  streaming,
  completed,
  failed,
  queuedOffline,
}

class ChatMessage {
  final String id;
  final String conversationId;
  final MessageRole role;
  final String content;
  final DateTime createdAt;
  final List<AttachmentItem> attachments;
  final MessageDeliveryStatus status;
  final String? errorMessage;
  final int? promptTokens;
  final int? completionTokens;
  final int? totalTokens;
  final String? modelUsed;
  final String? providerName;
  final bool isEdited;

  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.role,
    required this.content,
    required this.createdAt,
    this.attachments = const [],
    this.status = MessageDeliveryStatus.completed,
    this.errorMessage,
    this.promptTokens,
    this.completionTokens,
    this.totalTokens,
    this.modelUsed,
    this.providerName,
    this.isEdited = false,
  });

  bool get isUser => role == MessageRole.user;
  bool get isAssistant => role == MessageRole.assistant;

  ChatMessage copyWith({
    String? id,
    String? conversationId,
    MessageRole? role,
    String? content,
    DateTime? createdAt,
    List<AttachmentItem>? attachments,
    MessageDeliveryStatus? status,
    String? errorMessage,
    bool clearError = false,
    int? promptTokens,
    int? completionTokens,
    int? totalTokens,
    String? modelUsed,
    String? providerName,
    bool? isEdited,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      conversationId: conversationId ?? this.conversationId,
      role: role ?? this.role,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      attachments: attachments ?? this.attachments,
      status: status ?? this.status,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      promptTokens: promptTokens ?? this.promptTokens,
      completionTokens: completionTokens ?? this.completionTokens,
      totalTokens: totalTokens ?? this.totalTokens,
      modelUsed: modelUsed ?? this.modelUsed,
      providerName: providerName ?? this.providerName,
      isEdited: isEdited ?? this.isEdited,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'conversationId': conversationId,
      'role': role.name,
      'content': content,
      'createdAt': createdAt.toIso8601String(),
      'attachments': attachments.map((a) => a.toMap()).toList(),
      'status': status.name,
      'errorMessage': errorMessage,
      'promptTokens': promptTokens,
      'completionTokens': completionTokens,
      'totalTokens': totalTokens,
      'modelUsed': modelUsed,
      'providerName': providerName,
      'isEdited': isEdited,
    };
  }

  factory ChatMessage.fromMap(Map<String, dynamic> map) {
    final roleName = map['role'] as String? ?? 'user';
    final statusName = map['status'] as String? ?? 'completed';
    final rawAttachments = map['attachments'];
    final parsedAttachments = <AttachmentItem>[];
    if (rawAttachments is List) {
      for (final item in rawAttachments) {
        if (item is Map) {
          parsedAttachments.add(
            AttachmentItem.fromMap(Map<String, dynamic>.from(item)),
          );
        }
      }
    }

    return ChatMessage(
      id: map['id'] as String? ?? '',
      conversationId: map['conversationId'] as String? ?? '',
      role: MessageRole.values.firstWhere(
        (e) => e.name == roleName,
        orElse: () => MessageRole.user,
      ),
      content: map['content'] as String? ?? '',
      createdAt: map['createdAt'] != null
          ? (DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
      attachments: parsedAttachments,
      status: MessageDeliveryStatus.values.firstWhere(
        (e) => e.name == statusName,
        orElse: () => MessageDeliveryStatus.completed,
      ),
      errorMessage: map['errorMessage'] as String?,
      promptTokens: (map['promptTokens'] as num?)?.toInt(),
      completionTokens: (map['completionTokens'] as num?)?.toInt(),
      totalTokens: (map['totalTokens'] as num?)?.toInt(),
      modelUsed: map['modelUsed'] as String?,
      providerName: map['providerName'] as String?,
      isEdited: map['isEdited'] as bool? ?? false,
    );
  }
}
