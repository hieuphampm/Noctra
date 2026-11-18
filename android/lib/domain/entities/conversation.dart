class Conversation {
  final String id;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? providerId;
  final String? modelOverride;
  final String? systemPromptOverride;
  final String? personaId;
  final double? temperatureOverride;
  final double? topPOverride;
  final int? maxTokensOverride;
  final bool? streamOverride;
  final bool isPinned;
  final bool isArchived;
  final int contextClearedAtCount;
  final int maxContextMessages;
  final bool sendChatHistory;
  final bool sendAttachments;
  final String lastMessagePreview;
  final int messageCount;

  const Conversation({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.providerId,
    this.modelOverride,
    this.systemPromptOverride,
    this.personaId,
    this.temperatureOverride,
    this.topPOverride,
    this.maxTokensOverride,
    this.streamOverride,
    this.isPinned = false,
    this.isArchived = false,
    this.contextClearedAtCount = 0,
    this.maxContextMessages = 20,
    this.sendChatHistory = true,
    this.sendAttachments = true,
    this.lastMessagePreview = '',
    this.messageCount = 0,
  });

  Conversation copyWith({
    String? id,
    String? title,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? providerId,
    String? modelOverride,
    bool clearModelOverride = false,
    String? systemPromptOverride,
    bool clearSystemPromptOverride = false,
    String? personaId,
    bool clearPersonaId = false,
    double? temperatureOverride,
    double? topPOverride,
    int? maxTokensOverride,
    bool? streamOverride,
    bool? isPinned,
    bool? isArchived,
    int? contextClearedAtCount,
    int? maxContextMessages,
    bool? sendChatHistory,
    bool? sendAttachments,
    String? lastMessagePreview,
    int? messageCount,
  }) {
    return Conversation(
      id: id ?? this.id,
      title: title ?? this.title,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      providerId: providerId ?? this.providerId,
      modelOverride:
          clearModelOverride ? null : (modelOverride ?? this.modelOverride),
      systemPromptOverride: clearSystemPromptOverride
          ? null
          : (systemPromptOverride ?? this.systemPromptOverride),
      personaId: clearPersonaId ? null : (personaId ?? this.personaId),
      temperatureOverride: temperatureOverride ?? this.temperatureOverride,
      topPOverride: topPOverride ?? this.topPOverride,
      maxTokensOverride: maxTokensOverride ?? this.maxTokensOverride,
      streamOverride: streamOverride ?? this.streamOverride,
      isPinned: isPinned ?? this.isPinned,
      isArchived: isArchived ?? this.isArchived,
      contextClearedAtCount:
          contextClearedAtCount ?? this.contextClearedAtCount,
      maxContextMessages: maxContextMessages ?? this.maxContextMessages,
      sendChatHistory: sendChatHistory ?? this.sendChatHistory,
      sendAttachments: sendAttachments ?? this.sendAttachments,
      lastMessagePreview: lastMessagePreview ?? this.lastMessagePreview,
      messageCount: messageCount ?? this.messageCount,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'title': title,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'providerId': providerId,
      'modelOverride': modelOverride,
      'systemPromptOverride': systemPromptOverride,
      'personaId': personaId,
      'temperatureOverride': temperatureOverride,
      'topPOverride': topPOverride,
      'maxTokensOverride': maxTokensOverride,
      'streamOverride': streamOverride,
      'isPinned': isPinned,
      'isArchived': isArchived,
      'contextClearedAtCount': contextClearedAtCount,
      'maxContextMessages': maxContextMessages,
      'sendChatHistory': sendChatHistory,
      'sendAttachments': sendAttachments,
      'lastMessagePreview': lastMessagePreview,
      'messageCount': messageCount,
    };
  }

  factory Conversation.fromMap(Map<String, dynamic> map) {
    return Conversation(
      id: map['id'] as String? ?? '',
      title: map['title'] as String? ?? 'New Conversation',
      createdAt: map['createdAt'] != null
          ? (DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
      updatedAt: map['updatedAt'] != null
          ? (DateTime.tryParse(map['updatedAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
      providerId: map['providerId'] as String?,
      modelOverride: map['modelOverride'] as String?,
      systemPromptOverride: map['systemPromptOverride'] as String?,
      personaId: map['personaId'] as String?,
      temperatureOverride: (map['temperatureOverride'] as num?)?.toDouble(),
      topPOverride: (map['topPOverride'] as num?)?.toDouble(),
      maxTokensOverride: (map['maxTokensOverride'] as num?)?.toInt(),
      streamOverride: map['streamOverride'] as bool?,
      isPinned: map['isPinned'] as bool? ?? false,
      isArchived: map['isArchived'] as bool? ?? false,
      contextClearedAtCount:
          (map['contextClearedAtCount'] as num?)?.toInt() ?? 0,
      maxContextMessages: (map['maxContextMessages'] as num?)?.toInt() ?? 20,
      sendChatHistory: map['sendChatHistory'] as bool? ?? true,
      sendAttachments: map['sendAttachments'] as bool? ?? true,
      lastMessagePreview: map['lastMessagePreview'] as String? ?? '',
      messageCount: (map['messageCount'] as num?)?.toInt() ?? 0,
    );
  }
}
