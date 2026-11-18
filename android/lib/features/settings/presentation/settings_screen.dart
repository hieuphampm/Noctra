import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/theme/noctra_colors.dart';
import '../../../domain/entities/app_settings.dart';
import '../../chat/presentation/chat_controller.dart';
import '../../privacy/presentation/privacy_center_screen.dart';
import '../../prompts/presentation/prompts_and_templates_screen.dart';
import '../../providers/presentation/provider_editor_screen.dart';
import '../../providers/presentation/providers_screen.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(appSettingsProvider);
    final activeProvider = ref.watch(activeProviderConfigProvider);
    final providersState = ref.watch(providersNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
        children: [
          // 1. GENERAL SECTION
          const _SectionHeader(title: 'GENERAL'),
          _SettingsCard(
            children: [
              SwitchListTile(
                title: const Text('AMOLED Pure Black Mode'),
                subtitle: const Text(
                  'Use #000000 pure black surfaces for OLED power efficiency',
                ),
                value: settings.amoledMode,
                onChanged: (v) =>
                    ref.read(appSettingsProvider.notifier).setAmoledMode(v),
              ),
              const Divider(height: 1),
              ListTile(
                title: Text(
                  'Font Scale (${(settings.fontScale * 100).round()}%)',
                ),
                subtitle: Slider(
                  value: settings.fontScale,
                  min: 0.85,
                  max: 1.30,
                  divisions: 9,
                  label: '${(settings.fontScale * 100).round()}%',
                  onChanged: (v) =>
                      ref.read(appSettingsProvider.notifier).setFontScale(v),
                ),
              ),
              const Divider(height: 1),
              ListTile(
                title: const Text('Message Spacing'),
                subtitle: const Text('Vertical density between chat messages'),
                trailing: DropdownButton<MessageSpacingDensity>(
                  value: settings.messageSpacing,
                  underline: const SizedBox.shrink(),
                  onChanged: (v) {
                    if (v != null) {
                      ref
                          .read(appSettingsProvider.notifier)
                          .setMessageSpacing(v);
                    }
                  },
                  items: const [
                    DropdownMenuItem(
                      value: MessageSpacingDensity.compact,
                      child: Text('Compact'),
                    ),
                    DropdownMenuItem(
                      value: MessageSpacingDensity.comfortable,
                      child: Text('Comfortable'),
                    ),
                    DropdownMenuItem(
                      value: MessageSpacingDensity.spacious,
                      child: Text('Spacious'),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              ListTile(
                title: const Text('Home Screen Welcome Message'),
                subtitle: Text(
                  settings.welcomeMessage,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: const Icon(Icons.edit_outlined, size: 18),
                onTap: () => _editWelcomeMessageDialog(
                  context,
                  ref,
                  settings.welcomeMessage,
                ),
              ),
              const Divider(height: 1),
              ListTile(
                title: const Text('Interface Language'),
                trailing: DropdownButton<String>(
                  value: settings.languageCode,
                  underline: const SizedBox.shrink(),
                  onChanged: (v) {
                    if (v != null) {
                      ref
                          .read(appSettingsProvider.notifier)
                          .updateSettings(settings.copyWith(languageCode: v));
                    }
                  },
                  items: const [
                    DropdownMenuItem(value: 'en', child: Text('English')),
                    DropdownMenuItem(value: 'es', child: Text('Español')),
                    DropdownMenuItem(value: 'fr', child: Text('Français')),
                    DropdownMenuItem(value: 'de', child: Text('Deutsch')),
                    DropdownMenuItem(value: 'ja', child: Text('日本語')),
                  ],
                ),
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Haptic Feedback'),
                subtitle: const Text('Tactile response on actions and sends'),
                value: settings.hapticFeedback,
                onChanged: (v) => ref
                    .read(appSettingsProvider.notifier)
                    .setHapticFeedback(v),
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Smooth UI Animations'),
                subtitle: const Text(
                  'Enable transitions and smooth auto-scroll animations',
                ),
                value: settings.enableAnimations,
                onChanged: (v) => ref
                    .read(appSettingsProvider.notifier)
                    .setEnableAnimations(v),
              ),
            ],
          ),

          const SizedBox(height: 22),

          // 2. AI PROVIDERS SECTION
          const _SectionHeader(title: 'AI PROVIDERS'),
          _SettingsCard(
            children: [
              ListTile(
                leading: const Icon(
                  Icons.hub_rounded,
                  color: NoctraColors.electricViolet,
                ),
                title: const Text('Manage AI Providers'),
                subtitle: Text(
                  '${providersState.providers.length} configured • Active: ${activeProvider?.name ?? "None"}',
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ProvidersScreen(),
                    ),
                  );
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(
                  Icons.add_circle_outline_rounded,
                  color: NoctraColors.cyanAccent,
                ),
                title: const Text('Add New AI Provider'),
                subtitle: const Text(
                  'Configure API Base URL, Keystore API key, and model',
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ProviderEditorScreen(),
                    ),
                  );
                },
              ),
              if (activeProvider != null) ...[
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: Text('Edit Active Provider (${activeProvider.name})'),
                  subtitle: Text('Default Model: ${activeProvider.modelName}'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ProviderEditorScreen(
                          existingProvider: activeProvider,
                        ),
                      ),
                    );
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(
                    Icons.network_check_rounded,
                    color: NoctraColors.successGreen,
                  ),
                  title: const Text('Test Active Provider Connection'),
                  subtitle: Text(activeProvider.baseUrl),
                  trailing: providersState.isTestingConnection
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.play_arrow_rounded),
                  onTap: () async {
                    final res = await ref
                        .read(providersNotifierProvider.notifier)
                        .testProviderConnection(activeProvider);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(res.message)),
                      );
                    }
                  },
                ),
              ],
            ],
          ),

          const SizedBox(height: 22),

          // 3. CHAT SECTION
          const _SectionHeader(title: 'CHAT & AI BEHAVIOR'),
          _SettingsCard(
            children: [
              ListTile(
                leading: const Icon(
                  Icons.bolt_rounded,
                  color: NoctraColors.electricViolet,
                ),
                title: const Text('System Prompts, Personas & Templates'),
                subtitle: const Text(
                  'Configure custom system instructions and AI personas',
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const PromptsAndTemplatesScreen(),
                    ),
                  );
                },
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Stream Responses by Default (SSE)'),
                subtitle: const Text(
                  'Stream tokens in real time when supported by the provider',
                ),
                value: settings.defaultStream,
                onChanged: (v) => ref
                    .read(appSettingsProvider.notifier)
                    .updateSettings(settings.copyWith(defaultStream: v)),
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Render Markdown & Syntax Highlighting'),
                subtitle: const Text(
                  'Format headings, tables, LaTeX math, and code blocks',
                ),
                value: settings.renderMarkdown,
                onChanged: (v) => ref
                    .read(appSettingsProvider.notifier)
                    .updateSettings(settings.copyWith(renderMarkdown: v)),
              ),
              const Divider(height: 1),
              ListTile(
                title: Text(
                  'Default Temperature (${settings.defaultTemperature.toStringAsFixed(2)})',
                ),
                subtitle: Slider(
                  value: settings.defaultTemperature,
                  min: 0.0,
                  max: 2.0,
                  divisions: 40,
                  onChanged: (v) => ref
                      .read(appSettingsProvider.notifier)
                      .updateSettings(settings.copyWith(defaultTemperature: v)),
                ),
              ),
              const Divider(height: 1),
              ListTile(
                title: Text(
                  'Default Context Limit (${settings.defaultContextLimit} messages)',
                ),
                subtitle: Slider(
                  value: settings.defaultContextLimit.toDouble().clamp(2, 100),
                  min: 2,
                  max: 100,
                  divisions: 49,
                  onChanged: (v) => ref
                      .read(appSettingsProvider.notifier)
                      .updateSettings(
                        settings.copyWith(defaultContextLimit: v.round()),
                      ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 22),

          // 4. PRIVACY SECTION
          const _SectionHeader(title: 'PRIVACY & DATA SOVEREIGNTY'),
          _SettingsCard(
            children: [
              ListTile(
                leading: const Icon(
                  Icons.shield_outlined,
                  color: NoctraColors.cyanAccent,
                ),
                title: const Text('Privacy Center & Data Management'),
                subtitle: const Text(
                  'App lock, auto-deletion, JSON export/import, and full wipe',
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const PrivacyCenterScreen(),
                    ),
                  );
                },
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Biometric App Lock'),
                subtitle: const Text('Require authentication to unlock app'),
                value: settings.biometricLockEnabled,
                onChanged: (v) => ref
                    .read(appSettingsProvider.notifier)
                    .setBiometricLock(v),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.ios_share_rounded),
                title: const Text('Quick Export All Conversations (JSON)'),
                onTap: () async {
                  final jsonStr = await ref
                      .read(chatControllerProvider.notifier)
                      .exportAllConversationsJson();
                  await SharePlus.instance.share(
                    ShareParams(
                      text: jsonStr,
                      subject: 'noctra_ai_backup.json',
                    ),
                  );
                },
              ),
            ],
          ),

          const SizedBox(height: 22),

          // 5. ABOUT SECTION
          const _SectionHeader(title: 'ABOUT'),
          _SettingsCard(
            children: [
              const ListTile(
                leading: Icon(
                  Icons.auto_awesome_rounded,
                  color: NoctraColors.electricViolet,
                ),
                title: Text(AppConstants.appName),
                subtitle: Text(
                  '${AppConstants.appTagline}\nVersion ${AppConstants.appVersion} (Build ${AppConstants.appBuildNumber})',
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.policy_outlined),
                title: const Text('Privacy Policy & Architecture Statement'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => _showPrivacyPolicyDialog(context),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: const Text('Open-Source Licenses'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  showLicensePage(
                    context: context,
                    applicationName: AppConstants.appName,
                    applicationVersion: AppConstants.appVersion,
                    applicationLegalese: AppConstants.appTagline,
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _editWelcomeMessageDialog(
    BuildContext context,
    WidgetRef ref,
    String current,
  ) {
    final ctrl = TextEditingController(text: current);
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Customize Welcome Message'),
        content: TextField(
          controller: ctrl,
          maxLines: 2,
          decoration: const InputDecoration(
            hintText: 'Good evening. What would you like to explore?',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              ref
                  .read(appSettingsProvider.notifier)
                  .setWelcomeMessage(ctrl.text);
              Navigator.of(context).pop();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showPrivacyPolicyDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('NOCTRA AI Privacy Policy'),
        content: const SingleChildScrollView(
          child: Text(
            '1. Zero Data Collection\n'
            'NOCTRA AI operates without any backend server, user account system, analytics SDK, or telemetry pipeline. The developer of NOCTRA AI never receives, views, stores, or monetizes your conversations, files, or API credentials.\n\n'
            '2. Local-First Storage & Encryption\n'
            'All conversation histories, personas, and settings are stored strictly in local device storage. API keys are encrypted via Android Keystore through Flutter Secure Storage and are excluded from conversation exports.\n\n'
            '3. Direct Provider Communication\n'
            'When you send a message, your device connects directly to the OpenAI-compatible API endpoint URL that you explicitly configured. Your selected AI provider processes the prompt, included history, and attached files according to that provider\'s own terms and privacy policy.',
            style: TextStyle(height: 1.45, fontSize: 13.5),
          ),
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Understood'),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title,
        style: const TextStyle(
          color: NoctraColors.textSecondary,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.9,
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final List<Widget> children;

  const _SettingsCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: NoctraColors.cardBackground,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: NoctraColors.borderSubtle),
      ),
      child: Column(children: children),
    );
  }
}
