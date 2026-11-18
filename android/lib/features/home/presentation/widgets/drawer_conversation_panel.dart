import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/theme/noctra_colors.dart';
import '../../../../domain/entities/conversation.dart';
import '../../../chat/presentation/chat_controller.dart';
import '../../../privacy/presentation/privacy_center_screen.dart';
import '../../../prompts/presentation/prompts_and_templates_screen.dart';
import '../../../providers/presentation/providers_screen.dart';
import '../../../settings/presentation/settings_screen.dart';

class DrawerConversationPanel extends ConsumerStatefulWidget {
  final bool closeOnSelect;

  const DrawerConversationPanel({
    super.key,
    this.closeOnSelect = true,
  });

  @override
  ConsumerState<DrawerConversationPanel> createState() =>
      _DrawerConversationPanelState();
}

class _DrawerConversationPanelState
    extends ConsumerState<DrawerConversationPanel> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatControllerProvider);
    final grouped = chatState.groupedConversations;

    return Container(
      color: NoctraColors.backgroundSecondary,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Header & New Chat Button
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Row(
                children: [
                  const Icon(
                    Icons.auto_awesome_rounded,
                    color: NoctraColors.electricViolet,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      AppConstants.appName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: NoctraColors.textMain,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.0,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: () {
                      ref.read(chatControllerProvider.notifier).startNewChat();
                      if (widget.closeOnSelect && Navigator.of(context).canPop()) {
                        Navigator.of(context).pop();
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    icon: const Icon(Icons.add_rounded, size: 16),
                    label: const Text(
                      'New Chat',
                      style: TextStyle(fontSize: 12.5),
                    ),
                  ),
                ],
              ),
            ),

            // Search Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              child: TextField(
                controller: _searchController,
                onChanged: (q) => ref
                    .read(chatControllerProvider.notifier)
                    .setSearchQuery(q),
                decoration: InputDecoration(
                  hintText: 'Search local conversations...',
                  prefixIcon: const Icon(Icons.search_rounded, size: 18),
                  suffixIcon: chatState.searchQuery.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear_rounded, size: 16),
                          onPressed: () {
                            _searchController.clear();
                            ref
                                .read(chatControllerProvider.notifier)
                                .setSearchQuery('');
                          },
                        )
                      : null,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
              ),
            ),

            // Sort & Archive Filter Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Row(
                children: [
                  FilterChip(
                    label: Text(chatState.showArchived ? 'Archived' : 'Active'),
                    selected: chatState.showArchived,
                    onSelected: (v) => ref
                        .read(chatControllerProvider.notifier)
                        .setShowArchived(v),
                  ),
                  const Spacer(),
                  PopupMenuButton<ConversationSortOrder>(
                    initialValue: chatState.sortOrder,
                    onSelected: (order) => ref
                        .read(chatControllerProvider.notifier)
                        .setSortOrder(order),
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: ConversationSortOrder.newest,
                        child: Text('Sort: Newest'),
                      ),
                      PopupMenuItem(
                        value: ConversationSortOrder.oldest,
                        child: Text('Sort: Oldest'),
                      ),
                      PopupMenuItem(
                        value: ConversationSortOrder.alphabetical,
                        child: Text('Sort: Alphabetical'),
                      ),
                    ],
                    child: const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      child: Row(
                        children: [
                          Icon(
                            Icons.sort_rounded,
                            size: 16,
                            color: NoctraColors.textSecondary,
                          ),
                          SizedBox(width: 4),
                          Text(
                            'Sort',
                            style: TextStyle(
                              color: NoctraColors.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const Divider(height: 1),

            // Grouped Conversations List
            Expanded(
              child: grouped.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          chatState.searchQuery.isNotEmpty
                              ? 'No conversations match "${chatState.searchQuery}".'
                              : (chatState.showArchived
                                  ? 'No archived conversations.'
                                  : 'Your local chat history is empty.\nStart a conversation to store it privately on your device.'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: NoctraColors.textSecondary,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      children: grouped.entries.expand((entry) {
                        return [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(8, 10, 8, 4),
                            child: Text(
                              entry.key.toUpperCase(),
                              style: const TextStyle(
                                color: NoctraColors.textMuted,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                          ...entry.value.map(
                            (conv) => _buildConversationTile(
                              context,
                              conv: conv,
                              isSelected:
                                  chatState.activeConversationId == conv.id,
                            ),
                          ),
                        ];
                      }).toList(),
                    ),
            ),

            const Divider(height: 1),

            // Bottom Navigation Shortcuts
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _DrawerNavButton(
                          icon: Icons.hub_rounded,
                          label: 'AI Providers',
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => const ProvidersScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _DrawerNavButton(
                          icon: Icons.bolt_rounded,
                          label: 'Prompts & Personas',
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) =>
                                    const PromptsAndTemplatesScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: _DrawerNavButton(
                          icon: Icons.shield_outlined,
                          label: 'Privacy Vault',
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => const PrivacyCenterScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _DrawerNavButton(
                          icon: Icons.settings_outlined,
                          label: 'Settings',
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => const SettingsScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConversationTile(
    BuildContext context, {
    required Conversation conv,
    required bool isSelected,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: isSelected
            ? NoctraColors.electricVioletSoft
            : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
        dense: true,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(
          conv.isPinned
              ? Icons.push_pin_rounded
              : Icons.chat_bubble_outline_rounded,
          size: 17,
          color: isSelected
              ? NoctraColors.electricViolet
              : (conv.isPinned
                  ? NoctraColors.cyanAccent
                  : NoctraColors.textSecondary),
        ),
        title: Text(
          conv.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: NoctraColors.textMain,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            fontSize: 13.5,
          ),
        ),
        subtitle: conv.lastMessagePreview.isNotEmpty
            ? Text(
                conv.lastMessagePreview,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: NoctraColors.textSecondary,
                  fontSize: 11.5,
                ),
              )
            : null,
        onTap: () {
          ref.read(chatControllerProvider.notifier).selectConversation(conv.id);
          if (widget.closeOnSelect && Navigator.of(context).canPop()) {
            Navigator.of(context).pop();
          }
        },
        trailing: PopupMenuButton<String>(
          icon: const Icon(
            Icons.more_vert_rounded,
            size: 17,
            color: NoctraColors.textSecondary,
          ),
          onSelected: (action) =>
              _handleConversationMenu(context, conv, action),
          itemBuilder: (_) => [
            const PopupMenuItem(
              value: 'rename',
              child: Text('Rename'),
            ),
            PopupMenuItem(
              value: 'pin',
              child: Text(conv.isPinned ? 'Unpin' : 'Pin to top'),
            ),
            PopupMenuItem(
              value: 'archive',
              child: Text(conv.isArchived ? 'Unarchive' : 'Archive'),
            ),
            const PopupMenuItem(
              value: 'export_md',
              child: Text('Export Markdown'),
            ),
            const PopupMenuItem(
              value: 'delete',
              child: Text(
                'Delete',
                style: TextStyle(color: NoctraColors.errorCoral),
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }

  Future<void> _handleConversationMenu(
    BuildContext context,
    Conversation conv,
    String action,
  ) async {
    final notifier = ref.read(chatControllerProvider.notifier);
    switch (action) {
      case 'rename':
        final controller = TextEditingController(text: conv.title);
        if (!mounted) return;
        showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Rename Conversation'),
            content: TextField(
              controller: controller,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'Conversation title',
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  notifier.renameConversation(conv.id, controller.text);
                  Navigator.of(context).pop();
                },
                child: const Text('Save'),
              ),
            ],
          ),
        );
        break;
      case 'pin':
        await notifier.togglePinConversation(conv.id);
        break;
      case 'archive':
        await notifier.toggleArchiveConversation(conv.id);
        break;
      case 'export_md':
        final md = await notifier.exportSingleConversationMarkdown(conv.id);
        if (md.isNotEmpty) {
          await SharePlus.instance.share(
            ShareParams(text: md, subject: conv.title),
          );
        }
        break;
      case 'delete':
        await notifier.deleteConversation(conv.id);
        break;
    }
  }
}

class _DrawerNavButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _DrawerNavButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: NoctraColors.cardBackground,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: NoctraColors.borderSubtle),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: NoctraColors.electricViolet),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: NoctraColors.textMain,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
