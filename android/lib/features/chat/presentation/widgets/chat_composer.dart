import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/app_providers.dart';
import '../../../../core/theme/noctra_colors.dart';
import '../../../../core/utilities/token_estimator.dart';
import '../../../../shared/components/attachment_picker_sheet.dart';
import '../../../attachments/presentation/attachment_preview_bar.dart';
import '../chat_controller.dart';

class ChatComposer extends ConsumerStatefulWidget {
  final TextEditingController controller;
  final VoidCallback onOpenTemplates;
  final VoidCallback onOpenContextSettings;

  const ChatComposer({
    super.key,
    required this.controller,
    required this.onOpenTemplates,
    required this.onOpenContextSettings,
  });

  @override
  ConsumerState<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends ConsumerState<ChatComposer> {
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _hasText = widget.controller.text.trim().isNotEmpty;
    widget.controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    super.dispose();
  }

  void _onTextChanged() {
    final nowHasText = widget.controller.text.trim().isNotEmpty;
    if (nowHasText != _hasText) {
      setState(() {
        _hasText = nowHasText;
      });
    }
  }

  Future<void> _handleSend() async {
    final text = widget.controller.text;
    final hasStaged =
        ref.read(chatControllerProvider).stagedAttachments.isNotEmpty;
    if (text.trim().isEmpty && !hasStaged) return;

    final haptics = ref.read(appSettingsProvider).hapticFeedback;
    await HapticsHelper.lightImpact(haptics);

    widget.controller.clear();
    await ref.read(chatControllerProvider.notifier).sendMessage(text);
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatControllerProvider);
    final canSend =
        (_hasText || chatState.stagedAttachments.isNotEmpty) &&
            !chatState.isGenerating;

    // Restore unsent draft if a request failed and composer is empty
    if (chatState.unsentComposerDraft != null &&
        widget.controller.text.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.controller.text.isEmpty) {
          widget.controller.text = chatState.unsentComposerDraft!;
        }
      });
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AttachmentPreviewBar(
          attachments: chatState.stagedAttachments,
          onRemove: (id) => ref
              .read(chatControllerProvider.notifier)
              .removeStagedAttachment(id),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          decoration: const BoxDecoration(
            color: NoctraColors.backgroundSecondary,
            border: Border(
              top: BorderSide(color: NoctraColors.borderSubtle, width: 1),
            ),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Attach file/image button
                    IconButton(
                      onPressed: () {
                        showModalBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          builder: (_) => const AttachmentPickerSheet(),
                        );
                      },
                      icon: const Icon(Icons.add_circle_outline_rounded),
                      color: NoctraColors.cyanAccent,
                      tooltip: 'Attach image or file',
                    ),
                    // Prompt Templates shortcut
                    IconButton(
                      onPressed: widget.onOpenTemplates,
                      icon: const Icon(Icons.bolt_rounded),
                      color: NoctraColors.electricViolet,
                      tooltip: 'Prompt Templates',
                    ),
                    // Context & Parameters shortcut
                    IconButton(
                      onPressed: widget.onOpenContextSettings,
                      icon: const Icon(Icons.tune_rounded, size: 20),
                      color: NoctraColors.textSecondary,
                      tooltip: 'Context & Model Parameters',
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 150),
                        child: TextField(
                          controller: widget.controller,
                          maxLines: null,
                          minLines: 1,
                          textInputAction: TextInputAction.newline,
                          style: const TextStyle(
                            color: NoctraColors.textMain,
                            fontSize: 14.5,
                          ),
                          decoration: InputDecoration(
                            hintText: 'Message NOCTRA AI...',
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20),
                              borderSide: const BorderSide(
                                color: NoctraColors.borderSubtle,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20),
                              borderSide: const BorderSide(
                                color: NoctraColors.borderSubtle,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20),
                              borderSide: const BorderSide(
                                color: NoctraColors.electricViolet,
                                width: 1.4,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (chatState.isGenerating)
                      SizedBox(
                        width: 44,
                        height: 44,
                        child: IconButton.filled(
                          onPressed: () => ref
                              .read(chatControllerProvider.notifier)
                              .stopGeneration(),
                          style: IconButton.styleFrom(
                            backgroundColor: NoctraColors.errorCoral,
                            foregroundColor: const Color(0xFF090B10),
                          ),
                          icon: const Icon(Icons.stop_rounded, size: 22),
                          tooltip: 'Stop Generation',
                        ),
                      )
                    else
                      SizedBox(
                        width: 44,
                        height: 44,
                        child: IconButton.filled(
                          onPressed: canSend ? _handleSend : null,
                          style: IconButton.styleFrom(
                            backgroundColor: canSend
                                ? NoctraColors.electricViolet
                                : NoctraColors.cardBackground,
                            foregroundColor: canSend
                                ? const Color(0xFF090B10)
                                : NoctraColors.textMuted,
                          ),
                          icon: const Icon(Icons.arrow_upward_rounded, size: 22),
                          tooltip: 'Send Message',
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
