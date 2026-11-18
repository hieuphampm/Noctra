import 'dart:convert';
import 'package:flutter/material.dart';
import '../../../core/theme/noctra_colors.dart';
import '../../../domain/entities/attachment_item.dart';

class AttachmentPreviewBar extends StatelessWidget {
  final List<AttachmentItem> attachments;
  final ValueChanged<String> onRemove;

  const AttachmentPreviewBar({
    super.key,
    required this.attachments,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    if (attachments.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 82,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        color: NoctraColors.backgroundSecondary,
        border: Border(
          top: BorderSide(color: NoctraColors.borderSubtle, width: 1),
        ),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: attachments.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final item = attachments[index];
          return _AttachmentChipCard(
            item: item,
            onRemove: () => onRemove(item.id),
            onTap: () => _showAttachmentDetailsDialog(context, item),
          );
        },
      ),
    );
  }

  void _showAttachmentDetailsDialog(BuildContext context, AttachmentItem item) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          item.fileName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Type: ${item.extension.toUpperCase()} (${item.mimeType}) • ${item.formattedSize}',
                style: const TextStyle(
                  color: NoctraColors.textSecondary,
                  fontSize: 12.5,
                ),
              ),
              if (item.statusMessage != null) ...[
                const SizedBox(height: 6),
                Text(
                  item.statusMessage!,
                  style: TextStyle(
                    color: item.status == AttachmentProcessingStatus.error
                        ? NoctraColors.errorCoral
                        : NoctraColors.cyanAccent,
                    fontSize: 12.5,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (item.isImage && item.base64DataUrl != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.memory(
                    base64Decode(item.base64DataUrl!.split(',').last),
                    fit: BoxFit.contain,
                  ),
                )
              else if (item.extractedText != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: NoctraColors.backgroundDefault,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: NoctraColors.borderSubtle),
                  ),
                  child: Text(
                    item.extractedText!.length > 1500
                        ? '${item.extractedText!.substring(0, 1500)}\n...[Preview truncated]'
                        : item.extractedText!,
                    style: const TextStyle(
                      color: NoctraColors.textMain,
                      fontSize: 12,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

class _AttachmentChipCard extends StatelessWidget {
  final AttachmentItem item;
  final VoidCallback onRemove;
  final VoidCallback onTap;

  const _AttachmentChipCard({
    required this.item,
    required this.onRemove,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isError = item.status == AttachmentProcessingStatus.error;
    final borderColor = isError
        ? NoctraColors.errorCoral
        : NoctraColors.borderHighlight;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 215,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: NoctraColors.cardBackground,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: borderColor),
        ),
        child: Row(
          children: [
            _buildThumbnail(),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    item.fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: NoctraColors.textMain,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${item.extension.toUpperCase()} • ${item.formattedSize}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: isError
                          ? NoctraColors.errorCoral
                          : NoctraColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onRemove,
              icon: const Icon(Icons.close_rounded, size: 16),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 26, minHeight: 26),
              color: NoctraColors.textSecondary,
              tooltip: 'Remove attachment',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildThumbnail() {
    if (item.isImage &&
        item.base64DataUrl != null &&
        item.base64DataUrl!.contains(',')) {
      try {
        final rawB64 = item.base64DataUrl!.split(',').last;
        return ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.memory(
            base64Decode(rawB64),
            width: 44,
            height: 44,
            fit: BoxFit.cover,
          ),
        );
      } catch (_) {
        // Fallback to icon
      }
    }

    IconData icon;
    Color color;
    switch (item.category) {
      case AttachmentCategory.image:
        icon = Icons.image_rounded;
        color = NoctraColors.electricViolet;
        break;
      case AttachmentCategory.pdf:
        icon = Icons.picture_as_pdf_rounded;
        color = NoctraColors.errorCoral;
        break;
      case AttachmentCategory.officeDocument:
        icon = Icons.article_rounded;
        color = NoctraColors.cyanAccent;
        break;
      case AttachmentCategory.text:
        icon = Icons.code_rounded;
        color = NoctraColors.successGreen;
        break;
      case AttachmentCategory.unsupported:
        icon = Icons.error_outline_rounded;
        color = NoctraColors.errorCoral;
        break;
    }

    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, color: color, size: 22),
    );
  }
}
