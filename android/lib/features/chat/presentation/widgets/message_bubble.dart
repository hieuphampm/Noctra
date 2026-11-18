import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import '../../../../core/theme/noctra_colors.dart';
import '../../../../domain/entities/attachment_item.dart';
import '../../../../domain/entities/chat_message.dart';
import '../../../../shared/components/markdown_message_view.dart';

class MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool amoledMode;
  final bool renderMarkdown;
  final double fontScale;
  final double verticalGap;
  final VoidCallback onRetry;
  final VoidCallback onRegenerate;
  final VoidCallback onDelete;
  final ValueChanged<String> onEditAndResend;
  final ValueChanged<String> onQuickAction;

  const MessageBubble({
    super.key,
    required this.message,
    required this.amoledMode,
    required this.renderMarkdown,
    required this.fontScale,
    required this.verticalGap,
    required this.onRetry,
    required this.onRegenerate,
    required this.onDelete,
    required this.onEditAndResend,
    required this.onQuickAction,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    final timeStr = DateFormat('HH:mm').format(message.createdAt.toLocal());

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: 14,
        vertical: verticalGap / 2,
      ),
      child: Column(
        crossAxisAlignment:
            isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // Header: Sender badge & timestamp
          Padding(
            padding: const EdgeInsets.only(bottom: 5, left: 4, right: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!isUser) ...[
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      color: NoctraColors.electricVioletSoft,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: NoctraColors.electricViolet,
                        width: 1,
                      ),
                    ),
                    child: const Icon(
                      Icons.auto_awesome,
                      size: 10,
                      color: NoctraColors.electricViolet,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      message.modelUsed ?? 'NOCTRA AI',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                ] else ...[
                  if (message.isEdited)
                    const Padding(
                      padding: EdgeInsets.only(right: 6),
                      child: Text(
                        'edited',
                        style: TextStyle(
                          color: NoctraColors.textMuted,
                          fontSize: 10.5,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  const Text(
                    'You',
                    style: TextStyle(
                      color: NoctraColors.electricViolet,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  timeStr,
                  style: const TextStyle(
                    color: NoctraColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),

          // Main Message Card
          GestureDetector(
            onLongPress: () => _showMessageActionsModal(context),
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width *
                    (isUser ? 0.84 : 0.94),
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 13,
              ),
              decoration: BoxDecoration(
                gradient: isUser
                    ? const LinearGradient(
                        colors: [
                          NoctraColors.userBubbleStart,
                          NoctraColors.userBubbleEnd,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      )
                    : null,
                color: isUser
                    ? null
                    : (amoledMode
                        ? NoctraColors.assistantBubbleAmoled
                        : NoctraColors.assistantBubble),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(20),
                  topRight: const Radius.circular(20),
                  bottomLeft: Radius.circular(isUser ? 20 : 6),
                  bottomRight: Radius.circular(isUser ? 6 : 20),
                ),
                border: Border.all(
                  color: message.status == MessageDeliveryStatus.failed
                      ? NoctraColors.errorCoral.withValues(alpha: 0.7)
                      : (isUser
                          ? NoctraColors.electricViolet.withValues(alpha: 0.35)
                          : NoctraColors.borderSubtle),
                  width: 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (message.attachments.isNotEmpty) ...[
                    _buildAttachedItems(message.attachments),
                    if (message.content.trim().isNotEmpty)
                      const SizedBox(height: 10),
                  ],

                  if (message.status == MessageDeliveryStatus.sending ||
                      (message.status == MessageDeliveryStatus.streaming &&
                          message.content.isEmpty))
                    const _ThinkingIndicator()
                  else if (isUser)
                    SelectableText(
                      message.content,
                      style: TextStyle(
                        color: NoctraColors.textMain,
                        fontSize: 14.5 * fontScale,
                        height: 1.48,
                      ),
                    )
                  else
                    MarkdownMessageView(
                      content: message.content,
                      renderMarkdown: renderMarkdown,
                      fontScale: fontScale,
                    ),

                  if (message.status == MessageDeliveryStatus.streaming &&
                      message.content.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 10,
                          height: 10,
                          child: CircularProgressIndicator(
                            strokeWidth: 1.6,
                            color: NoctraColors.cyanAccent,
                          ),
                        ),
                        SizedBox(width: 6),
                        Text(
                          'Streaming tokens...',
                          style: TextStyle(
                            color: NoctraColors.cyanAccent,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],

                  if (message.errorMessage != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: NoctraColors.errorCoral.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline_rounded,
                            color: NoctraColors.errorCoral,
                            size: 16,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              message.errorMessage!,
                              style: const TextStyle(
                                color: NoctraColors.errorCoral,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          TextButton.icon(
                            onPressed: onRetry,
                            icon: const Icon(Icons.refresh_rounded, size: 15),
                            label: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Footer: Token usage & quick actions bar
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!isUser &&
                    (message.totalTokens != null ||
                        message.promptTokens != null)) ...[
                  const Icon(
                    Icons.generating_tokens_rounded,
                    size: 12,
                    color: NoctraColors.textMuted,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    message.totalTokens != null
                        ? '${message.totalTokens} tok (${message.promptTokens ?? "?"} in / ${message.completionTokens ?? "?"} out)'
                        : '~${message.promptTokens} input tok',
                    style: const TextStyle(
                      color: NoctraColors.textMuted,
                      fontSize: 10.5,
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                InkWell(
                  onTap: () async {
                    await Clipboard.setData(
                      ClipboardData(text: message.content),
                    );
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Message copied to clipboard'),
                          duration: Duration(seconds: 1),
                        ),
                      );
                    }
                  },
                  borderRadius: BorderRadius.circular(6),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(
                      Icons.copy_rounded,
                      size: 13.5,
                      color: NoctraColors.textSecondary,
                    ),
                  ),
                ),
                if (isUser)
                  InkWell(
                    onTap: () => _showEditDialog(context),
                    borderRadius: BorderRadius.circular(6),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(
                        Icons.edit_rounded,
                        size: 13.5,
                        color: NoctraColors.textSecondary,
                      ),
                    ),
                  ),
                if (!isUser &&
                    message.status == MessageDeliveryStatus.completed) ...[
                  InkWell(
                    onTap: onRegenerate,
                    borderRadius: BorderRadius.circular(6),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(
                        Icons.refresh_rounded,
                        size: 14,
                        color: NoctraColors.textSecondary,
                      ),
                    ),
                  ),
                ],
                InkWell(
                  onTap: () => _showMessageActionsModal(context),
                  borderRadius: BorderRadius.circular(6),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(
                      Icons.more_horiz_rounded,
                      size: 15,
                      color: NoctraColors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttachedItems(List<AttachmentItem> items) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: items.map((att) {
        if (att.isImage &&
            att.base64DataUrl != null &&
            att.base64DataUrl!.contains(',')) {
          try {
            final bytes = base64Decode(att.base64DataUrl!.split(',').last);
            return ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                bytes,
                width: 160,
                height: 120,
                fit: BoxFit.cover,
              ),
            );
          } catch (_) {
            // Fallback chip
          }
        }
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: NoctraColors.backgroundDefault.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: NoctraColors.borderHighlight),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.attach_file_rounded,
                size: 14,
                color: NoctraColors.cyanAccent,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  '${att.fileName} (${att.formattedSize})',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: NoctraColors.textMain,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  void _showEditDialog(BuildContext context) {
    final controller = TextEditingController(text: message.content);
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit & Resend Message'),
        content: TextField(
          controller: controller,
          maxLines: 6,
          minLines: 2,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Update your message...',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final updated = controller.text.trim();
              Navigator.of(context).pop();
              if (updated.isNotEmpty) {
                onEditAndResend(updated);
              }
            },
            child: const Text('Save & Regenerate'),
          ),
        ],
      ),
    );
  }

  void _showMessageActionsModal(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
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
                const SizedBox(height: 14),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    'Message Actions',
                    style: TextStyle(
                      color: NoctraColors.textMain,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ActionChip(
                      avatar: const Icon(Icons.copy_rounded, size: 16),
                      label: const Text('Copy Text'),
                      onPressed: () async {
                        await Clipboard.setData(
                          ClipboardData(text: message.content),
                        );
                        if (context.mounted) Navigator.of(context).pop();
                      },
                    ),
                    ActionChip(
                      avatar: const Icon(Icons.share_rounded, size: 16),
                      label: const Text('Share'),
                      onPressed: () {
                        Navigator.of(context).pop();
                        SharePlus.instance.share(
                          ShareParams(text: message.content),
                        );
                      },
                    ),
                    if (message.isUser)
                      ActionChip(
                        avatar: const Icon(Icons.edit_rounded, size: 16),
                        label: const Text('Edit & Resend'),
                        onPressed: () {
                          Navigator.of(context).pop();
                          _showEditDialog(context);
                        },
                      ),
                    if (message.isAssistant)
                      ActionChip(
                        avatar: const Icon(Icons.refresh_rounded, size: 16),
                        label: const Text('Regenerate'),
                        onPressed: () {
                          Navigator.of(context).pop();
                          onRegenerate();
                        },
                      ),
                    ActionChip(
                      avatar: const Icon(
                        Icons.delete_outline_rounded,
                        size: 16,
                        color: NoctraColors.errorCoral,
                      ),
                      label: const Text(
                        'Delete',
                        style: TextStyle(color: NoctraColors.errorCoral),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop();
                        onDelete();
                      },
                    ),
                  ],
                ),
                if (message.isAssistant) ...[
                  const SizedBox(height: 16),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 8),
                    child: Text(
                      'AI FOLLOW-UP ACTIONS',
                      style: TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _buildQuickFollowUpChip(
                        context,
                        label: 'Continue writing',
                        actionKey: 'continue',
                        icon: Icons.playlist_add_rounded,
                      ),
                      _buildQuickFollowUpChip(
                        context,
                        label: 'Summarize',
                        actionKey: 'summarize',
                        icon: Icons.compress_rounded,
                      ),
                      _buildQuickFollowUpChip(
                        context,
                        label: 'Explain simply',
                        actionKey: 'explain',
                        icon: Icons.lightbulb_outline_rounded,
                      ),
                      _buildQuickFollowUpChip(
                        context,
                        label: 'Translate',
                        actionKey: 'translate',
                        icon: Icons.translate_rounded,
                      ),
                      _buildQuickFollowUpChip(
                        context,
                        label: 'Improve writing',
                        actionKey: 'improve',
                        icon: Icons.auto_fix_high_rounded,
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildQuickFollowUpChip(
    BuildContext context, {
    required String label,
    required String actionKey,
    required IconData icon,
  }) {
    return ActionChip(
      avatar: Icon(icon, size: 15, color: NoctraColors.cyanAccent),
      label: Text(label),
      onPressed: () {
        Navigator.of(context).pop();
        onQuickAction(actionKey);
      },
    );
  }
}

class _ThinkingIndicator extends StatefulWidget {
  const _ThinkingIndicator();

  @override
  State<_ThinkingIndicator> createState() => _ThinkingIndicatorState();
}

class _ThinkingIndicatorState extends State<_ThinkingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1.0).animate(_controller),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: NoctraColors.electricViolet,
            ),
          ),
          SizedBox(width: 10),
          Text(
            'NOCTRA is thinking...',
            style: TextStyle(
              color: NoctraColors.textSecondary,
              fontSize: 13,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }
}
