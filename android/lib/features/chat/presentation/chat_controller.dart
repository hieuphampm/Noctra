import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../core/errors/noctra_exception.dart';
import '../../../core/providers/app_providers.dart';
import '../../../domain/entities/ai_persona.dart';
import '../../../domain/entities/ai_provider_config.dart';
import '../../../domain/entities/app_settings.dart';
import '../../../domain/entities/attachment_item.dart';
import '../../../domain/entities/chat_message.dart';
import '../../../domain/entities/conversation.dart';

enum ConversationSortOrder {
  newest,
  oldest,
  alphabetical,
}

class ChatSessionState {
  final List<Conversation> conversations;
  final String? activeConversationId;
  final List<ChatMessage> activeMessages;
  final List<AttachmentItem> stagedAttachments;
  final String searchQuery;
  final ConversationSortOrder sortOrder;
  final bool showArchived;
  final bool isGenerating;
  final String? activeErrorBanner;
  final List<String> activeContextWarnings;
  final String? unsentComposerDraft;

  const ChatSessionState({
    this.conversations = const [],
    this.activeConversationId,
    this.activeMessages = const [],
    this.stagedAttachments = const [],
    this.searchQuery = '',
    this.sortOrder = ConversationSortOrder.newest,
    this.showArchived = false,
    this.isGenerating = false,
    this.activeErrorBanner,
    this.activeContextWarnings = const [],
    this.unsentComposerDraft,
  });

  Conversation? get activeConversation {
    if (activeConversationId == null) return null;
    for (final c in conversations) {
      if (c.id == activeConversationId) return c;
    }
    return null;
  }

  List<Conversation> get filteredConversations {
    final q = searchQuery.trim().toLowerCase();
    final filtered = conversations.where((c) {
      if (c.isArchived != showArchived) return false;
      if (q.isEmpty) return true;
      return c.title.toLowerCase().contains(q) ||
          c.lastMessagePreview.toLowerCase().contains(q);
    }).toList();

    filtered.sort((a, b) {
      if (a.isPinned != b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      switch (sortOrder) {
        case ConversationSortOrder.newest:
          return b.updatedAt.compareTo(a.updatedAt);
        case ConversationSortOrder.oldest:
          return a.updatedAt.compareTo(b.updatedAt);
        case ConversationSortOrder.alphabetical:
          return a.title.toLowerCase().compareTo(b.title.toLowerCase());
      }
    });

    return filtered;
  }

  /// Groups filtered conversations into Pinned, Today, Yesterday, Previous 7 Days, and Older.
  Map<String, List<Conversation>> get groupedConversations {
    final groups = <String, List<Conversation>>{};
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    final yesterdayStart = todayStart.subtract(const Duration(days: 1));
    final weekStart = todayStart.subtract(const Duration(days: 7));

    for (final conv in filteredConversations) {
      String groupKey;
      if (conv.isPinned) {
        groupKey = 'Pinned';
      } else if (conv.updatedAt.isAfter(todayStart)) {
        groupKey = 'Today';
      } else if (conv.updatedAt.isAfter(yesterdayStart)) {
        groupKey = 'Yesterday';
      } else if (conv.updatedAt.isAfter(weekStart)) {
        groupKey = 'Previous 7 Days';
      } else {
        groupKey = 'Older';
      }
      groups.putIfAbsent(groupKey, () => <Conversation>[]).add(conv);
    }
    return groups;
  }

  ChatSessionState copyWith({
    List<Conversation>? conversations,
    String? activeConversationId,
    bool clearActiveConversation = false,
    List<ChatMessage>? activeMessages,
    List<AttachmentItem>? stagedAttachments,
    String? searchQuery,
    ConversationSortOrder? sortOrder,
    bool? showArchived,
    bool? isGenerating,
    String? activeErrorBanner,
    bool clearErrorBanner = false,
    List<String>? activeContextWarnings,
    String? unsentComposerDraft,
    bool clearDraft = false,
  }) {
    return ChatSessionState(
      conversations: conversations ?? this.conversations,
      activeConversationId: clearActiveConversation
          ? null
          : (activeConversationId ?? this.activeConversationId),
      activeMessages: activeMessages ?? this.activeMessages,
      stagedAttachments: stagedAttachments ?? this.stagedAttachments,
      searchQuery: searchQuery ?? this.searchQuery,
      sortOrder: sortOrder ?? this.sortOrder,
      showArchived: showArchived ?? this.showArchived,
      isGenerating: isGenerating ?? this.isGenerating,
      activeErrorBanner: clearErrorBanner
          ? null
          : (activeErrorBanner ?? this.activeErrorBanner),
      activeContextWarnings:
          activeContextWarnings ?? this.activeContextWarnings,
      unsentComposerDraft:
          clearDraft ? null : (unsentComposerDraft ?? this.unsentComposerDraft),
    );
  }
}

class ChatController extends Notifier<ChatSessionState> {
  static const _uuid = Uuid();
  CancelToken? _activeCancelToken;

  @override
  ChatSessionState build() {
    Future.microtask(initializeConversations);
    return const ChatSessionState();
  }

  Future<void> initializeConversations() async {
    final repo = ref.read(conversationRepositoryProvider);
    final settings = ref.read(appSettingsProvider);
    var all = await repo.getAllConversations();

    // Enforce optional automatic chat deletion policy (Section 8)
    if (settings.autoDeleteDuration != AutoDeleteDuration.never) {
      final now = DateTime.now();
      Duration maxAge;
      switch (settings.autoDeleteDuration) {
        case AutoDeleteDuration.after24Hours:
          maxAge = const Duration(hours: 24);
          break;
        case AutoDeleteDuration.after7Days:
          maxAge = const Duration(days: 7);
          break;
        case AutoDeleteDuration.after30Days:
          maxAge = const Duration(days: 30);
          break;
        case AutoDeleteDuration.never:
          maxAge = const Duration(days: 36500);
          break;
      }

      for (final conv in all) {
        if (!conv.isPinned && now.difference(conv.updatedAt) > maxAge) {
          await repo.deleteConversation(conv.id);
        }
      }
      all = await repo.getAllConversations();
    }

    state = state.copyWith(conversations: all);
  }

  Future<void> startNewChat() async {
    stopGeneration();
    state = state.copyWith(
      clearActiveConversation: true,
      activeMessages: const [],
      stagedAttachments: const [],
      clearErrorBanner: true,
      activeContextWarnings: const [],
    );
  }

  Future<void> selectConversation(String conversationId) async {
    stopGeneration();
    final repo = ref.read(conversationRepositoryProvider);
    final msgs = await repo.getMessagesForConversation(conversationId);
    state = state.copyWith(
      activeConversationId: conversationId,
      activeMessages: msgs,
      stagedAttachments: const [],
      clearErrorBanner: true,
      activeContextWarnings: const [],
    );
  }

  Future<Conversation> _ensureActiveConversation({
    required String firstPromptText,
  }) async {
    final existing = state.activeConversation;
    if (existing != null) return existing;

    final settings = ref.read(appSettingsProvider);
    final activeProvider = ref.read(activeProviderConfigProvider);
    final titleGen = ref.read(contextBuilderUseCaseProvider);
    final now = DateTime.now();

    final created = Conversation(
      id: _uuid.v4(),
      title: titleGen.generateAutomaticTitle(firstPromptText),
      createdAt: now,
      updatedAt: now,
      providerId: activeProvider?.id ?? settings.activeProviderId,
      personaId: settings.activePersonaId,
      maxContextMessages: settings.defaultContextLimit,
      sendChatHistory: settings.sendChatHistoryByDefault,
      sendAttachments: settings.sendAttachmentsByDefault,
    );

    final repo = ref.read(conversationRepositoryProvider);
    await repo.saveConversation(created);
    final all = await repo.getAllConversations();
    state = state.copyWith(
      conversations: all,
      activeConversationId: created.id,
    );
    return created;
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }

  void setSortOrder(ConversationSortOrder order) {
    state = state.copyWith(sortOrder: order);
  }

  void setShowArchived(bool show) {
    state = state.copyWith(showArchived: show);
  }

  void addStagedAttachment(AttachmentItem item) {
    state = state.copyWith(
      stagedAttachments: [...state.stagedAttachments, item],
    );
  }

  void removeStagedAttachment(String attachmentId) {
    state = state.copyWith(
      stagedAttachments: state.stagedAttachments
          .where((a) => a.id != attachmentId)
          .toList(),
    );
  }

  void clearStagedAttachments() {
    state = state.copyWith(stagedAttachments: const []);
  }

  void clearErrorBanner() {
    state = state.copyWith(clearErrorBanner: true);
  }

  Future<void> renameConversation(String id, String newTitle) async {
    final trimmed = newTitle.trim();
    if (trimmed.isEmpty) return;
    final repo = ref.read(conversationRepositoryProvider);
    final conv = await repo.getConversationById(id);
    if (conv == null) return;
    await repo.saveConversation(
      conv.copyWith(title: trimmed, updatedAt: DateTime.now()),
    );
    final all = await repo.getAllConversations();
    state = state.copyWith(conversations: all);
  }

  Future<void> togglePinConversation(String id) async {
    final repo = ref.read(conversationRepositoryProvider);
    final conv = await repo.getConversationById(id);
    if (conv == null) return;
    await repo.saveConversation(conv.copyWith(isPinned: !conv.isPinned));
    final all = await repo.getAllConversations();
    state = state.copyWith(conversations: all);
  }

  Future<void> toggleArchiveConversation(String id) async {
    final repo = ref.read(conversationRepositoryProvider);
    final conv = await repo.getConversationById(id);
    if (conv == null) return;
    await repo.saveConversation(conv.copyWith(isArchived: !conv.isArchived));
    final all = await repo.getAllConversations();
    final isCurrent = state.activeConversationId == id;
    state = state.copyWith(
      conversations: all,
      clearActiveConversation: isCurrent,
      activeMessages: isCurrent ? const [] : state.activeMessages,
    );
  }

  Future<void> updateConversationSettings(Conversation updated) async {
    final repo = ref.read(conversationRepositoryProvider);
    await repo.saveConversation(updated);
    final all = await repo.getAllConversations();
    state = state.copyWith(conversations: all);
  }

  /// Clears the conversation context sent to the API without deleting chat history (Requirement 12.E).
  Future<void> clearConversationContextWindow() async {
    final conv = state.activeConversation;
    if (conv == null) return;
    final updated = conv.copyWith(
      contextClearedAtCount: state.activeMessages.length,
    );
    await updateConversationSettings(updated);
  }

  Future<void> deleteConversation(String id) async {
    final repo = ref.read(conversationRepositoryProvider);
    await repo.deleteConversation(id);
    final all = await repo.getAllConversations();
    final isCurrent = state.activeConversationId == id;
    state = state.copyWith(
      conversations: all,
      clearActiveConversation: isCurrent,
      activeMessages: isCurrent ? const [] : state.activeMessages,
    );
  }

  Future<void> clearAllConversations() async {
    stopGeneration();
    final repo = ref.read(conversationRepositoryProvider);
    await repo.clearAllConversations();
    state = state.copyWith(
      conversations: const [],
      clearActiveConversation: true,
      activeMessages: const [],
      stagedAttachments: const [],
    );
  }

  Future<void> deleteMessage(String messageId) async {
    final convId = state.activeConversationId;
    if (convId == null) return;
    final repo = ref.read(conversationRepositoryProvider);
    await repo.deleteMessage(convId, messageId);
    final msgs = await repo.getMessagesForConversation(convId);
    final conv = await repo.getConversationById(convId);
    if (conv != null) {
      await repo.saveConversation(
        conv.copyWith(
          messageCount: msgs.length,
          lastMessagePreview: msgs.isNotEmpty ? msgs.last.content : '',
        ),
      );
    }
    final all = await repo.getAllConversations();
    state = state.copyWith(conversations: all, activeMessages: msgs);
  }

  void stopGeneration() {
    if (_activeCancelToken != null && !_activeCancelToken!.isCancelled) {
      _activeCancelToken!.cancel('Stopped by user');
    }
    _activeCancelToken = null;
    if (state.isGenerating) {
      state = state.copyWith(isGenerating: false);
    }
  }

  /// Primary entry point to send a user prompt + staged attachments to the active AI provider.
  Future<void> sendMessage(String rawText) async {
    final text = rawText.trim();
    final attachments = List<AttachmentItem>.from(state.stagedAttachments);
    if (text.isEmpty && attachments.isEmpty) return;
    if (state.isGenerating) return;

    final conv = await _ensureActiveConversation(
      firstPromptText: text.isNotEmpty
          ? text
          : attachments.map((a) => a.fileName).join(', '),
    );

    final isOnline = ref.read(isOnlineProvider);
    final userMsg = ChatMessage(
      id: _uuid.v4(),
      conversationId: conv.id,
      role: MessageRole.user,
      content: text,
      createdAt: DateTime.now(),
      attachments: attachments,
      status: isOnline
          ? MessageDeliveryStatus.completed
          : MessageDeliveryStatus.queuedOffline,
      errorMessage: isOnline
          ? null
          : 'Device is offline. Saved locally—tap Retry when connected.',
    );

    final repo = ref.read(conversationRepositoryProvider);
    await repo.saveMessage(userMsg);
    final updatedMessages = await repo.getMessagesForConversation(conv.id);

    final updatedConv = conv.copyWith(
      updatedAt: DateTime.now(),
      lastMessagePreview: text.isNotEmpty
          ? text
          : '[Attachment: ${attachments.first.fileName}]',
      messageCount: updatedMessages.length,
    );
    await repo.saveConversation(updatedConv);
    final allConversations = await repo.getAllConversations();

    state = state.copyWith(
      conversations: allConversations,
      activeMessages: updatedMessages,
      stagedAttachments: const [],
      clearErrorBanner: true,
      clearDraft: true,
    );

    if (!isOnline) {
      state = state.copyWith(
        activeErrorBanner:
            'You are currently offline. Your message was saved locally and can be sent once connectivity returns.',
      );
      return;
    }

    await _generateAssistantResponse(
      conversation: updatedConv,
      triggeringUserMessage: userMsg,
    );
  }

  /// Retries a failed or offline-queued user message or failed assistant turn.
  Future<void> retryMessage(ChatMessage message) async {
    if (state.isGenerating) return;
    final conv = state.activeConversation;
    if (conv == null) return;

    final repo = ref.read(conversationRepositoryProvider);

    if (message.isUser) {
      final cleanedUser = message.copyWith(
        status: MessageDeliveryStatus.completed,
        clearError: true,
      );
      await repo.saveMessage(cleanedUser);
      final msgs = await repo.getMessagesForConversation(conv.id);
      state = state.copyWith(activeMessages: msgs, clearErrorBanner: true);
      await _generateAssistantResponse(
        conversation: conv,
        triggeringUserMessage: cleanedUser,
      );
    } else if (message.isAssistant) {
      // Remove the failed assistant placeholder and regenerate from the last user message
      await repo.deleteMessage(conv.id, message.id);
      final msgs = await repo.getMessagesForConversation(conv.id);
      state = state.copyWith(activeMessages: msgs, clearErrorBanner: true);
      final lastUser = msgs.lastWhere(
        (m) => m.isUser,
        orElse: () => message,
      );
      if (lastUser.isUser) {
        await _generateAssistantResponse(
          conversation: conv,
          triggeringUserMessage: lastUser,
        );
      }
    }
  }

  /// Regenerates the last assistant response (Requirement 12.C).
  Future<void> regenerateLastResponse() async {
    if (state.isGenerating) return;
    final conv = state.activeConversation;
    if (conv == null || state.activeMessages.isEmpty) return;

    final repo = ref.read(conversationRepositoryProvider);
    var msgs = List<ChatMessage>.from(state.activeMessages);

    if (msgs.last.isAssistant) {
      await repo.deleteMessage(conv.id, msgs.last.id);
      msgs = await repo.getMessagesForConversation(conv.id);
      state = state.copyWith(activeMessages: msgs);
    }

    final lastUserIndex = msgs.lastIndexWhere((m) => m.isUser);
    if (lastUserIndex == -1) return;

    await _generateAssistantResponse(
      conversation: conv,
      triggeringUserMessage: msgs[lastUserIndex],
    );
  }

  /// Edits an earlier user message and regenerates the assistant response from that point (Requirement 12.D).
  Future<void> editAndResendUserMessage({
    required ChatMessage originalMessage,
    required String newContent,
  }) async {
    final trimmed = newContent.trim();
    if (trimmed.isEmpty || state.isGenerating) return;
    final conv = state.activeConversation;
    if (conv == null) return;

    final repo = ref.read(conversationRepositoryProvider);
    // Delete all messages strictly after this user message
    final allMsgs = await repo.getMessagesForConversation(conv.id);
    final targetIdx = allMsgs.indexWhere((m) => m.id == originalMessage.id);
    if (targetIdx == -1) return;

    for (var i = targetIdx + 1; i < allMsgs.length; i++) {
      await repo.deleteMessage(conv.id, allMsgs[i].id);
    }

    final updatedUserMsg = originalMessage.copyWith(
      content: trimmed,
      isEdited: true,
      status: MessageDeliveryStatus.completed,
      clearError: true,
    );
    await repo.saveMessage(updatedUserMsg);

    final remainingMsgs = await repo.getMessagesForConversation(conv.id);
    state = state.copyWith(
      activeMessages: remainingMsgs,
      clearErrorBanner: true,
    );

    await _generateAssistantResponse(
      conversation: conv,
      triggeringUserMessage: updatedUserMsg,
    );
  }

  /// Executes a one-tap AI Response Action (Continue writing, Summarize, Translate, Explain, Improve writing) (Requirement 12.H).
  Future<void> executeResponseAction({
    required String actionLabel,
    required String targetContent,
  }) async {
    String instruction;
    switch (actionLabel.toLowerCase()) {
      case 'continue':
        instruction =
            'Continue writing seamlessly from where the previous response left off, maintaining the exact style and depth.';
        break;
      case 'summarize':
        instruction =
            'Summarize the key points above into concise, high-signal bullet points.';
        break;
      case 'translate':
        instruction =
            'Translate the preceding response into clear, natural English (or if already in English, provide a bilingual summary in Spanish and French).';
        break;
      case 'explain':
        instruction =
            'Explain the concepts in the preceding response step-by-step using simple language and concrete examples.';
        break;
      case 'improve':
        instruction =
            'Improve and polish the writing of the preceding response for maximum clarity, precision, and impact.';
        break;
      default:
        instruction = '$actionLabel:\n\n$targetContent';
    }
    await sendMessage(instruction);
  }

  Future<void> _generateAssistantResponse({
    required Conversation conversation,
    required ChatMessage triggeringUserMessage,
  }) async {
    final provider = _resolveProviderForConversation(conversation);
    if (provider == null) {
      state = state.copyWith(
        activeErrorBanner:
            'No AI Provider configured. Tap "Configure Provider" to add your OpenAI-compatible API endpoint and key.',
        unsentComposerDraft: triggeringUserMessage.content,
      );
      return;
    }

    final settings = ref.read(appSettingsProvider);
    final providerRepo = ref.read(providerRepositoryProvider);
    final convRepo = ref.read(conversationRepositoryProvider);
    final aiClient = ref.read(aiClientProvider);
    final contextBuilder = ref.read(contextBuilderUseCaseProvider);
    final personas = ref.read(promptsAndPersonasProvider).personas;

    final personaId = conversation.personaId ?? settings.activePersonaId;
    AiPersona? activePersona;
    for (final p in personas) {
      if (p.id == personaId) {
        activePersona = p;
        break;
      }
    }

    final apiKey = await providerRepo.getApiKeyForProvider(provider.id);
    final effectiveModel =
        (conversation.modelOverride?.trim().isNotEmpty ?? false)
            ? conversation.modelOverride!.trim()
            : provider.modelName.trim();

    final effectiveTemp = conversation.temperatureOverride ??
        activePersona?.suggestedTemperature ??
        provider.temperature;
    final effectiveTopP = conversation.topPOverride ?? provider.topP;
    final effectiveMaxTokens =
        conversation.maxTokensOverride ?? provider.maxTokens;
    final effectiveStream = conversation.streamOverride ?? provider.stream;

    final prepared = contextBuilder.buildMessagesPayload(
      conversation: conversation,
      provider: provider.copyWith(modelName: effectiveModel),
      allMessages: state.activeMessages,
      currentMessage: triggeringUserMessage,
      fallbackSystemPrompt: settings.defaultSystemPrompt,
      activePersona: activePersona,
    );

    final assistantMsgId = _uuid.v4();
    var assistantMsg = ChatMessage(
      id: assistantMsgId,
      conversationId: conversation.id,
      role: MessageRole.assistant,
      content: '',
      createdAt: DateTime.now(),
      status: effectiveStream
          ? MessageDeliveryStatus.streaming
          : MessageDeliveryStatus.sending,
      modelUsed: effectiveModel,
      providerName: provider.name,
    );

    await convRepo.saveMessage(assistantMsg);
    final initialList =
        await convRepo.getMessagesForConversation(conversation.id);

    _activeCancelToken = CancelToken();
    state = state.copyWith(
      activeMessages: initialList,
      isGenerating: true,
      clearErrorBanner: true,
      activeContextWarnings: prepared.warnings,
    );

    try {
      if (effectiveStream) {
        final buffer = StringBuffer();
        int? promptTokens;
        int? completionTokens;
        int? totalTokens;

        final stream = aiClient.streamChatCompletion(
          provider: provider,
          apiKey: apiKey,
          modelName: effectiveModel,
          messages: prepared.apiMessages,
          temperature: effectiveTemp,
          topP: effectiveTopP,
          maxTokens: effectiveMaxTokens,
          cancelToken: _activeCancelToken,
        );

        await for (final chunk in stream) {
          if (chunk.textDelta.isNotEmpty) {
            buffer.write(chunk.textDelta);
          }
          if (chunk.promptTokens != null) promptTokens = chunk.promptTokens;
          if (chunk.completionTokens != null) {
            completionTokens = chunk.completionTokens;
          }
          if (chunk.totalTokens != null) totalTokens = chunk.totalTokens;

          assistantMsg = assistantMsg.copyWith(
            content: buffer.toString(),
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: totalTokens,
            status: MessageDeliveryStatus.streaming,
          );

          // Update in-memory list immediately for smooth 60fps token streaming
          final updatedInMemory = state.activeMessages.map((m) {
            return m.id == assistantMsgId ? assistantMsg : m;
          }).toList();
          state = state.copyWith(activeMessages: updatedInMemory);
        }

        final finalContent = buffer.toString().trim();
        if (finalContent.isEmpty) {
          throw const NoctraException(
            type: NoctraErrorType.emptyResponse,
            userMessage: 'The AI provider closed the stream without returning text.',
          );
        }

        assistantMsg = assistantMsg.copyWith(
          content: buffer.toString(),
          status: MessageDeliveryStatus.completed,
          promptTokens: promptTokens ?? prepared.estimatedInputTokens,
          completionTokens: completionTokens,
          totalTokens: totalTokens,
        );
      } else {
        final response = await aiClient.sendChatCompletion(
          provider: provider,
          apiKey: apiKey,
          modelName: effectiveModel,
          messages: prepared.apiMessages,
          temperature: effectiveTemp,
          topP: effectiveTopP,
          maxTokens: effectiveMaxTokens,
          cancelToken: _activeCancelToken,
        );

        assistantMsg = assistantMsg.copyWith(
          content: response.content,
          status: MessageDeliveryStatus.completed,
          promptTokens: response.promptTokens ?? prepared.estimatedInputTokens,
          completionTokens: response.completionTokens,
          totalTokens: response.totalTokens,
          modelUsed: response.model ?? effectiveModel,
        );
      }

      await convRepo.saveMessage(assistantMsg);
      final finalMessages =
          await convRepo.getMessagesForConversation(conversation.id);
      final updatedConv = conversation.copyWith(
        updatedAt: DateTime.now(),
        lastMessagePreview: assistantMsg.content.length > 90
            ? '${assistantMsg.content.substring(0, 90)}...'
            : assistantMsg.content,
        messageCount: finalMessages.length,
      );
      await convRepo.saveConversation(updatedConv);
      final allConversations = await convRepo.getAllConversations();

      state = state.copyWith(
        conversations: allConversations,
        activeMessages: finalMessages,
        isGenerating: false,
      );
    } on NoctraException catch (e) {
      if (e.type == NoctraErrorType.cancelledByUser) {
        final partial = assistantMsg.content.trim();
        assistantMsg = assistantMsg.copyWith(
          content: partial.isEmpty ? '[Generation stopped]' : partial,
          status: MessageDeliveryStatus.completed,
        );
        await convRepo.saveMessage(assistantMsg);
        final msgs = await convRepo.getMessagesForConversation(conversation.id);
        state = state.copyWith(
          activeMessages: msgs,
          isGenerating: false,
        );
        return;
      }

      assistantMsg = assistantMsg.copyWith(
        content: assistantMsg.content.trim().isEmpty
            ? 'Request failed: ${e.userMessage}'
            : assistantMsg.content,
        status: MessageDeliveryStatus.failed,
        errorMessage: '${e.title}: ${e.userMessage}',
      );
      await convRepo.saveMessage(assistantMsg);
      final msgs = await convRepo.getMessagesForConversation(conversation.id);
      state = state.copyWith(
        activeMessages: msgs,
        isGenerating: false,
        activeErrorBanner: '${e.title}: ${e.userMessage}',
        unsentComposerDraft: triggeringUserMessage.content,
      );
    } catch (_) {
      assistantMsg = assistantMsg.copyWith(
        content: 'An unexpected error occurred while communicating with the provider.',
        status: MessageDeliveryStatus.failed,
        errorMessage: 'Unexpected error. Tap Retry to try again.',
      );
      await convRepo.saveMessage(assistantMsg);
      final msgs = await convRepo.getMessagesForConversation(conversation.id);
      state = state.copyWith(
        activeMessages: msgs,
        isGenerating: false,
        activeErrorBanner: 'Unexpected error communicating with provider.',
        unsentComposerDraft: triggeringUserMessage.content,
      );
    } finally {
      _activeCancelToken = null;
    }
  }

  AiProviderConfig? _resolveProviderForConversation(Conversation conversation) {
    final providers = ref.read(providersNotifierProvider).providers;
    if (providers.isEmpty) return null;
    if (conversation.providerId != null) {
      for (final p in providers) {
        if (p.id == conversation.providerId) return p;
      }
    }
    return ref.read(activeProviderConfigProvider);
  }

  /// Exports all conversations as a sanitized JSON string.
  Future<String> exportAllConversationsJson() async {
    final convRepo = ref.read(conversationRepositoryProvider);
    final exporter = ref.read(dataExportServiceProvider);
    final allConversations = await convRepo.getAllConversations();
    final map = <String, List<ChatMessage>>{};
    for (final c in allConversations) {
      map[c.id] = await convRepo.getMessagesForConversation(c.id);
    }
    return exporter.exportConversationsToJson(
      conversations: allConversations,
      messagesByConversation: map,
    );
  }

  /// Exports a single conversation as Markdown.
  Future<String> exportSingleConversationMarkdown(String conversationId) async {
    final convRepo = ref.read(conversationRepositoryProvider);
    final exporter = ref.read(dataExportServiceProvider);
    final conv = await convRepo.getConversationById(conversationId);
    if (conv == null) return '';
    final msgs = await convRepo.getMessagesForConversation(conversationId);
    return exporter.exportConversationToMarkdown(
      conversation: conv,
      messages: msgs,
    );
  }

  /// Imports conversations from a JSON backup string.
  Future<int> importConversationsJson(String jsonContent) async {
    final convRepo = ref.read(conversationRepositoryProvider);
    final exporter = ref.read(dataExportServiceProvider);
    final bundle = exporter.parseJsonImport(jsonContent);

    for (final conv in bundle.conversations) {
      await convRepo.saveConversation(conv);
      final msgs = bundle.messagesByConversation[conv.id] ?? const [];
      for (final m in msgs) {
        await convRepo.saveMessage(m);
      }
    }

    final all = await convRepo.getAllConversations();
    state = state.copyWith(conversations: all);
    return bundle.conversations.length;
  }

  /// Deletes all local application data across Hive, SecureStorage, and SharedPreferences (Section 8).
  Future<void> deleteAllLocalApplicationData() async {
    stopGeneration();
    await ref.read(hiveStorageServiceProvider).clearAllBoxes();
    await ref.read(secureCredentialStoreProvider).deleteAllCredentials();
    await ref.read(appSettingsProvider.notifier).resetToDefaults();
    await ref.read(providersNotifierProvider.notifier).loadProviders();
    await ref.read(promptsAndPersonasProvider.notifier).reloadAll();
    state = const ChatSessionState();
  }
}

final chatControllerProvider =
    NotifierProvider<ChatController, ChatSessionState>(
  ChatController.new,
);
