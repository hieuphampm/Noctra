import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/theme/noctra_colors.dart';
import '../../../domain/entities/app_settings.dart';
import '../../chat/presentation/chat_controller.dart';

class PrivacyCenterScreen extends ConsumerWidget {
  const PrivacyCenterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(appSettingsProvider);
    final chatState = ref.watch(chatControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Privacy Vault & Architecture'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 40),
        children: [
          // Architectural Privacy Guarantee Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: NoctraColors.cardBackground,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: NoctraColors.electricViolet.withValues(alpha: 0.6),
              ),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.verified_user_rounded,
                      color: NoctraColors.electricViolet,
                      size: 22,
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'NOCTRA Zero-Telemetry Architecture',
                        style: TextStyle(
                          color: NoctraColors.textMain,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 10),
                _PrivacyBullet(
                  text:
                      'No account required & zero developer-operated backend servers.',
                ),
                _PrivacyBullet(
                  text:
                      'No analytics, advertising, tracking, or crash-reporting SDKs.',
                ),
                _PrivacyBullet(
                  text:
                      'API keys are stored exclusively in Android Keystore-backed encrypted storage (Flutter Secure Storage), never in plain-text SharedPreferences or exported backups.',
                ),
                _PrivacyBullet(
                  text:
                      'Conversations and attachments are stored strictly on your device.',
                ),
                _PrivacyBullet(
                  text:
                      'Transparency Notice: When you send a message online, your prompt, enabled conversation context, and enabled attachments are transmitted directly from your device to the AI provider endpoint you configured.',
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),

          const Text(
            'ACCESS PROTECTION & RETENTION',
            style: TextStyle(
              color: NoctraColors.textSecondary,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 8),
          Material(
            color: NoctraColors.cardBackground,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: NoctraColors.borderSubtle),
            ),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Biometric App Lock'),
                  subtitle: const Text(
                    'Require fingerprint or device authentication when opening NOCTRA AI',
                  ),
                  value: settings.biometricLockEnabled,
                  onChanged: (v) async {
                    if (v) {
                      final ok = await ref
                          .read(biometricAuthServiceProvider)
                          .authenticate(
                            reason: 'Confirm biometric lock for NOCTRA AI',
                          );
                      if (!ok) return;
                    }
                    await ref
                        .read(appSettingsProvider.notifier)
                        .setBiometricLock(v);
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  title: const Text('Automatic Chat Expiration'),
                  subtitle: const Text(
                    'Automatically purge unpinned conversations older than the selected period',
                  ),
                  trailing: DropdownButton<AutoDeleteDuration>(
                    value: settings.autoDeleteDuration,
                    underline: const SizedBox.shrink(),
                    onChanged: (val) {
                      if (val != null) {
                        ref
                            .read(appSettingsProvider.notifier)
                            .setAutoDeleteDuration(val);
                      }
                    },
                    items: const [
                      DropdownMenuItem(
                        value: AutoDeleteDuration.never,
                        child: Text('Never'),
                      ),
                      DropdownMenuItem(
                        value: AutoDeleteDuration.after24Hours,
                        child: Text('24 Hours'),
                      ),
                      DropdownMenuItem(
                        value: AutoDeleteDuration.after7Days,
                        child: Text('7 Days'),
                      ),
                      DropdownMenuItem(
                        value: AutoDeleteDuration.after30Days,
                        child: Text('30 Days'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 22),
          const Text(
            'PORTABLE DATA & LOCAL STORAGE CONTROL',
            style: TextStyle(
              color: NoctraColors.textSecondary,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 8),
          Material(
            color: NoctraColors.cardBackground,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: NoctraColors.borderSubtle),
            ),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(
                    Icons.file_upload_outlined,
                    color: NoctraColors.cyanAccent,
                  ),
                  title: const Text('Export All Conversations (JSON)'),
                  subtitle: Text(
                    '${chatState.conversations.length} conversations stored locally (API keys are never exported)',
                  ),
                  onTap: () async {
                    final jsonStr = await ref
                        .read(chatControllerProvider.notifier)
                        .exportAllConversationsJson();
                    await SharePlus.instance.share(
                      ShareParams(
                        text: jsonStr,
                        subject: 'noctra_ai_conversations_backup.json',
                      ),
                    );
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(
                    Icons.file_download_outlined,
                    color: NoctraColors.electricViolet,
                  ),
                  title: const Text('Import Conversations Backup (JSON)'),
                  subtitle: const Text(
                    'Restore previously exported NOCTRA AI conversations',
                  ),
                  onTap: () => _importBackupFile(context, ref),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(
                    Icons.cleaning_services_rounded,
                    color: NoctraColors.warningAmber,
                  ),
                  title: const Text('Clear All Conversations'),
                  subtitle: const Text(
                    'Permanently delete local chat history while keeping provider configs',
                  ),
                  onTap: () => _confirmClearHistory(context, ref),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(
                    Icons.delete_forever_rounded,
                    color: NoctraColors.errorCoral,
                  ),
                  title: const Text(
                    'Delete All Local Application Data',
                    style: TextStyle(
                      color: NoctraColors.errorCoral,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: const Text(
                    'Wipes all conversations, Keystore API keys, providers, and preferences',
                  ),
                  onTap: () => _confirmDeleteEverything(context, ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _importBackupFile(BuildContext context, WidgetRef ref) async {
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['json'],
      );
      if (files.isEmpty) return;

      final file = files.first;
      final bytes = await file.readAsBytes();
      final rawJson = utf8.decode(bytes, allowMalformed: true);

      final count = await ref
          .read(chatControllerProvider.notifier)
          .importConversationsJson(rawJson);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Successfully imported $count conversations.')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Import failed: $e')),
        );
      }
    }
  }

  void _confirmClearHistory(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear All Conversations?'),
        content: const Text(
          'This will permanently delete all local conversations and messages from your device. Your AI provider configurations and API keys will be kept.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: NoctraColors.errorCoral,
            ),
            onPressed: () async {
              await ref
                  .read(chatControllerProvider.notifier)
                  .clearAllConversations();
              if (context.mounted) {
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('All local conversations cleared.'),
                  ),
                );
              }
            },
            child: const Text('Clear History'),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteEverything(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete All Local Data?'),
        content: const Text(
          'This action immediately wipes all conversations, Android Keystore API keys, AI providers, custom prompts, and app settings from your device. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: NoctraColors.errorCoral,
            ),
            onPressed: () async {
              await ref
                  .read(chatControllerProvider.notifier)
                  .deleteAllLocalApplicationData();
              if (context.mounted) {
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('All local application data has been wiped.'),
                  ),
                );
              }
            },
            child: const Text('Wipe All Data'),
          ),
        ],
      ),
    );
  }
}

class _PrivacyBullet extends StatelessWidget {
  final String text;

  const _PrivacyBullet({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 3),
            child: Icon(
              Icons.check_circle_outline_rounded,
              size: 15,
              color: NoctraColors.cyanAccent,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: NoctraColors.textSecondary,
                fontSize: 12.8,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
