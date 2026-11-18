import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/theme/noctra_colors.dart';
import '../../../core/utilities/token_estimator.dart';
import '../../../domain/entities/ai_persona.dart';
import '../../../shared/components/model_selector_sheet.dart';
import '../../../shared/widgets/connection_status_pill.dart';
import '../../chat/presentation/chat_controller.dart';
import '../../chat/presentation/widgets/chat_composer.dart';
import '../../chat/presentation/widgets/message_bubble.dart';
import '../../prompts/presentation/prompts_and_templates_screen.dart';
import '../../providers/presentation/provider_editor_screen.dart';
import '../../settings/presentation/settings_screen.dart';
import 'widgets/drawer_conversation_panel.dart';
import 'widgets/welcome_hero.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final TextEditingController _composerController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _showScrollToBottom = false;
  int _lastMessageCount = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScrollChanged);
  }

  @override
  void dispose() {
    _composerController.dispose();
    _scrollController.removeListener(_onScrollChanged);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScrollChanged() {
    if (!_scrollController.hasClients) return;
    final distanceFromBottom = _scrollController.position.maxScrollExtent -
        _scrollController.position.pixels;
    final shouldShow = distanceFromBottom > 240;
    if (shouldShow != _showScrollToBottom) {
      setState(() {
        _showScrollToBottom = shouldShow;
      });
    }
  }

  void _scrollToBottom({bool animated = true}) {
    if (!_scrollController.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      final target = _scrollController.position.maxScrollExtent;
      if (animated && ref.read(appSettingsProvider).enableAnimations) {
        _scrollController.animateTo(
          target,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
        );
      } else {
        _scrollController.jumpTo(target);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatControllerProvider);
    final settings = ref.watch(appSettingsProvider);
    final activeProvider = ref.watch(activeProviderConfigProvider);
    final isOnline = ref.watch(isOnlineProvider);
    final personas = ref.watch(promptsAndPersonasProvider).personas;
    final activeConv = chatState.activeConversation;

    AiPersona? activePersona;
    final personaId = activeConv?.personaId ?? settings.activePersonaId;
    for (final p in personas) {
      if (p.id == personaId) {
        activePersona = p;
        break;
      }
    }

    // Auto-scroll when a new message is added or streaming near the bottom
    if (chatState.activeMessages.length != _lastMessageCount) {
      _lastMessageCount = chatState.activeMessages.length;
      if (!_showScrollToBottom) {
        _scrollToBottom();
      }
    } else if (chatState.isGenerating && !_showScrollToBottom) {
      _scrollToBottom(animated: false);
    }

    final screenWidth = MediaQuery.of(context).size.width;
    final isWideTablet = screenWidth >= 760;

    return Scaffold(
      drawer: isWideTablet
          ? null
          : const Drawer(
              width: 315,
              child: DrawerConversationPanel(closeOnSelect: true),
            ),
      appBar: AppBar(
        titleSpacing: isWideTablet ? 16 : 4,
        title: ConnectionStatusPill(
          provider: activeProvider,
          modelOverride: activeConv?.modelOverride,
          isOnline: isOnline,
          onTap: () {
            showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => const ModelSelectorSheet(),
            );
          },
        ),
        actions: [
          IconButton(
            onPressed: () =>
                ref.read(chatControllerProvider.notifier).startNewChat(),
            icon: const Icon(Icons.edit_square, size: 20),
            tooltip: 'New Chat',
          ),
          IconButton(
            onPressed: () => _showContextAndParametersSheet(context),
            icon: const Icon(Icons.memory_rounded, size: 20),
            tooltip: 'Context & Parameters',
          ),
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const SettingsScreen(),
                ),
              );
            },
            icon: const Icon(Icons.settings_outlined, size: 21),
            tooltip: 'Settings',
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Row(
        children: [
          if (isWideTablet)
            const SizedBox(
              width: 300,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(
                    right: BorderSide(color: NoctraColors.borderSubtle),
                  ),
                ),
                child: DrawerConversationPanel(closeOnSelect: false),
              ),
            ),
          Expanded(
            child: Column(
              children: [
                // Offline Status Banner
                if (!isOnline)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    color: NoctraColors.warningAmber.withValues(alpha: 0.14),
                    child: const Row(
                      children: [
                        Icon(
                          Icons.wifi_off_rounded,
                          size: 16,
                          color: NoctraColors.warningAmber,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Offline Mode — Browse local history, manage settings, or queue messages for sending later.',
                            style: TextStyle(
                              color: NoctraColors.warningAmber,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Error Banner
                if (chatState.activeErrorBanner != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    color: NoctraColors.errorCoral.withValues(alpha: 0.14),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.error_outline_rounded,
                          size: 16,
                          color: NoctraColors.errorCoral,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            chatState.activeErrorBanner!,
                            style: const TextStyle(
                              color: NoctraColors.errorCoral,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.close_rounded,
                            size: 16,
                            color: NoctraColors.errorCoral,
                          ),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 24,
                            minHeight: 24,
                          ),
                          onPressed: () => ref
                              .read(chatControllerProvider.notifier)
                              .clearErrorBanner(),
                        ),
                      ],
                    ),
                  ),

                // Context / Vision Warnings Banner
                if (chatState.activeContextWarnings.isNotEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 6,
                    ),
                    color: NoctraColors.cyanAccentSoft,
                    child: Text(
                      chatState.activeContextWarnings.join(' '),
                      style: const TextStyle(
                        color: NoctraColors.cyanAccent,
                        fontSize: 11.5,
                      ),
                    ),
                  ),

                // Main Content: WelcomeHero or Chat Messages
                Expanded(
                  child: Stack(
                    children: [
                      if (chatState.activeConversationId == null &&
                          chatState.activeMessages.isEmpty)
                        WelcomeHero(
                          welcomeMessage: settings.welcomeMessage,
                          activeProvider: activeProvider,
                          activePersona: activePersona,
                          recentConversations: chatState.conversations
                              .where((c) => !c.isArchived)
                              .toList(),
                          onSelectPrompt: (promptText) {
                            _composerController.text = promptText;
                            _composerController.selection =
                                TextSelection.fromPosition(
                              TextPosition(offset: promptText.length),
                            );
                          },
                          onSelectConversation: (convId) => ref
                              .read(chatControllerProvider.notifier)
                              .selectConversation(convId),
                          onConfigureProvider: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => const ProviderEditorScreen(),
                              ),
                            );
                          },
                        )
                      else
                        ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.only(top: 12, bottom: 20),
                          itemCount: chatState.activeMessages.length,
                          itemBuilder: (context, index) {
                            final msg = chatState.activeMessages[index];
                            final isContextDivider = activeConv != null &&
                                activeConv.contextClearedAtCount > 0 &&
                                index == activeConv.contextClearedAtCount;

                            return Column(
                              children: [
                                if (isContextDivider)
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 10,
                                      horizontal: 24,
                                    ),
                                    child: Row(
                                      children: [
                                        const Expanded(child: Divider()),
                                        Padding(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                          ),
                                          child: Text(
                                            'Context cleared here (history preserved locally)',
                                            style: TextStyle(
                                              color: NoctraColors.cyanAccent
                                                  .withValues(alpha: 0.85),
                                              fontSize: 11,
                                            ),
                                          ),
                                        ),
                                        const Expanded(child: Divider()),
                                      ],
                                    ),
                                  ),
                                MessageBubble(
                                  message: msg,
                                  amoledMode: settings.amoledMode,
                                  renderMarkdown: settings.renderMarkdown,
                                  fontScale: settings.fontScale,
                                  verticalGap: settings.verticalMessageGap,
                                  onRetry: () => ref
                                      .read(chatControllerProvider.notifier)
                                      .retryMessage(msg),
                                  onRegenerate: () => ref
                                      .read(chatControllerProvider.notifier)
                                      .regenerateLastResponse(),
                                  onDelete: () => ref
                                      .read(chatControllerProvider.notifier)
                                      .deleteMessage(msg.id),
                                  onEditAndResend: (newText) => ref
                                      .read(chatControllerProvider.notifier)
                                      .editAndResendUserMessage(
                                        originalMessage: msg,
                                        newContent: newText,
                                      ),
                                  onQuickAction: (actionKey) => ref
                                      .read(chatControllerProvider.notifier)
                                      .executeResponseAction(
                                        actionLabel: actionKey,
                                        targetContent: msg.content,
                                      ),
                                ),
                              ],
                            );
                          },
                        ),

                      // Floating Scroll-to-Bottom Button
                      if (_showScrollToBottom &&
                          chatState.activeMessages.isNotEmpty)
                        Positioned(
                          right: 16,
                          bottom: 12,
                          child: FloatingActionButton.small(
                            onPressed: _scrollToBottom,
                            backgroundColor: NoctraColors.cardBackground,
                            foregroundColor: NoctraColors.electricViolet,
                            child: const Icon(Icons.arrow_downward_rounded),
                          ),
                        ),
                    ],
                  ),
                ),

                // Chat Composer
                ChatComposer(
                  controller: _composerController,
                  onOpenTemplates: () => _showTemplatesPickerSheet(context),
                  onOpenContextSettings: () =>
                      _showContextAndParametersSheet(context),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showTemplatesPickerSheet(BuildContext context) {
    final templates = ref.read(promptsAndPersonasProvider).templates;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Prompt Templates',
                      style: TextStyle(
                        color: NoctraColors.textMain,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const PromptsAndTemplatesScreen(),
                          ),
                        );
                      },
                      icon: const Icon(Icons.edit_note_rounded, size: 18),
                      label: const Text('Manage'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 340),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: templates.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final tpl = templates[index];
                      return ListTile(
                        tileColor: NoctraColors.cardBackground,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: const BorderSide(
                            color: NoctraColors.borderSubtle,
                          ),
                        ),
                        title: Text(
                          tpl.title,
                          style: const TextStyle(
                            color: NoctraColors.textMain,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          tpl.promptText,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: NoctraColors.textSecondary,
                            fontSize: 12,
                          ),
                        ),
                        trailing: Chip(
                          label: Text(
                            tpl.category,
                            style: const TextStyle(fontSize: 10.5),
                          ),
                        ),
                        onTap: () {
                          Navigator.of(context).pop();
                          _composerController.text = tpl.promptText;
                          _composerController.selection =
                              TextSelection.fromPosition(
                            TextPosition(offset: tpl.promptText.length),
                          );
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showContextAndParametersSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _ConversationContextSheet(),
    );
  }
}

class _ConversationContextSheet extends ConsumerWidget {
  const _ConversationContextSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatControllerProvider);
    final settings = ref.watch(appSettingsProvider);
    final activeProvider = ref.watch(activeProviderConfigProvider);
    final conv = chatState.activeConversation;

    final approxHistoryTokens = chatState.activeMessages.fold<int>(
      0,
      (sum, m) => sum + TokenEstimator.estimateTokens(m.content),
    );

    final sendHistory =
        conv?.sendChatHistory ?? settings.sendChatHistoryByDefault;
    final sendAttachments =
        conv?.sendAttachments ?? settings.sendAttachmentsByDefault;
    final contextLimit = conv?.maxContextMessages ?? settings.defaultContextLimit;
    final temp = conv?.temperatureOverride ??
        activeProvider?.temperature ??
        settings.defaultTemperature;
    final stream = conv?.streamOverride ??
        activeProvider?.stream ??
        settings.defaultStream;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          14,
          20,
          MediaQuery.of(context).viewInsets.bottom + 24,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: NoctraColors.borderHighlight,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Context & Privacy Controls',
                    style: TextStyle(
                      color: NoctraColors.textMain,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: NoctraColors.electricVioletSoft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '~$approxHistoryTokens tokens in chat',
                      style: const TextStyle(
                        color: NoctraColors.electricViolet,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'Explicitly control what data is included in API requests to your selected provider.',
                style: TextStyle(
                  color: NoctraColors.textSecondary,
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Include Conversation History in Requests'),
                subtitle: const Text(
                  'When off, only your current prompt and system prompt are sent.',
                ),
                value: sendHistory,
                onChanged: (v) async {
                  if (conv != null) {
                    await ref
                        .read(chatControllerProvider.notifier)
                        .updateConversationSettings(
                          conv.copyWith(sendChatHistory: v),
                        );
                  } else {
                    await ref
                        .read(appSettingsProvider.notifier)
                        .updateSettings(
                          settings.copyWith(sendChatHistoryByDefault: v),
                        );
                  }
                },
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Include Attached Files & Images'),
                subtitle: const Text(
                  'Allow attached images and extracted document text in API payloads.',
                ),
                value: sendAttachments,
                onChanged: (v) async {
                  if (conv != null) {
                    await ref
                        .read(chatControllerProvider.notifier)
                        .updateConversationSettings(
                          conv.copyWith(sendAttachments: v),
                        );
                  } else {
                    await ref
                        .read(appSettingsProvider.notifier)
                        .updateSettings(
                          settings.copyWith(sendAttachmentsByDefault: v),
                        );
                  }
                },
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Stream Token-by-Token (SSE)'),
                subtitle: const Text(
                  'Receive real-time streaming responses from the endpoint.',
                ),
                value: stream,
                onChanged: (v) async {
                  if (conv != null) {
                    await ref
                        .read(chatControllerProvider.notifier)
                        .updateConversationSettings(
                          conv.copyWith(streamOverride: v),
                        );
                  } else {
                    await ref
                        .read(appSettingsProvider.notifier)
                        .updateSettings(settings.copyWith(defaultStream: v));
                  }
                },
              ),
              const SizedBox(height: 8),
              Text(
                'Context Window Limit: Last $contextLimit messages',
                style: const TextStyle(
                  color: NoctraColors.textMain,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Slider(
                value: contextLimit.toDouble().clamp(2, 100),
                min: 2,
                max: 100,
                divisions: 49,
                label: '$contextLimit msgs',
                onChanged: (val) async {
                  final rounded = val.round();
                  if (conv != null) {
                    await ref
                        .read(chatControllerProvider.notifier)
                        .updateConversationSettings(
                          conv.copyWith(maxContextMessages: rounded),
                        );
                  } else {
                    await ref
                        .read(appSettingsProvider.notifier)
                        .updateSettings(
                          settings.copyWith(defaultContextLimit: rounded),
                        );
                  }
                },
              ),
              Text(
                'Temperature: ${temp.toStringAsFixed(2)}',
                style: const TextStyle(
                  color: NoctraColors.textMain,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Slider(
                value: temp.clamp(0.0, 2.0),
                min: 0.0,
                max: 2.0,
                divisions: 40,
                label: temp.toStringAsFixed(2),
                onChanged: (val) async {
                  if (conv != null) {
                    await ref
                        .read(chatControllerProvider.notifier)
                        .updateConversationSettings(
                          conv.copyWith(temperatureOverride: val),
                        );
                  } else {
                    await ref
                        .read(appSettingsProvider.notifier)
                        .updateSettings(
                          settings.copyWith(defaultTemperature: val),
                        );
                  }
                },
              ),
              const SizedBox(height: 8),
              if (conv != null)
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          await ref
                              .read(chatControllerProvider.notifier)
                              .clearConversationContextWindow();
                          if (context.mounted) {
                            Navigator.of(context).pop();
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Context cleared! Previous messages remain visible locally.',
                                ),
                              ),
                            );
                          }
                        },
                        icon: const Icon(Icons.cleaning_services_rounded, size: 16),
                        label: const Text('Reset Context Window (Keep History)'),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
