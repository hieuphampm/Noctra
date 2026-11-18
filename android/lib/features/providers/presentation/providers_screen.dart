import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/theme/noctra_colors.dart';
import '../../../domain/entities/ai_provider_config.dart';
import 'provider_editor_screen.dart';

class ProvidersScreen extends ConsumerWidget {
  const ProvidersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final providersState = ref.watch(providersNotifierProvider);
    final activeProvider = ref.watch(activeProviderConfigProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Providers'),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const ProviderEditorScreen(),
                ),
              );
            },
            icon: const Icon(Icons.add_rounded),
            tooltip: 'Add AI Provider',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => const ProviderEditorScreen(),
            ),
          );
        },
        backgroundColor: NoctraColors.electricViolet,
        foregroundColor: const Color(0xFF090B10),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add Provider'),
      ),
      body: providersState.providers.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 68,
                      height: 68,
                      decoration: BoxDecoration(
                        color: NoctraColors.electricVioletSoft,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.hub_rounded,
                        size: 34,
                        color: NoctraColors.electricViolet,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'No AI Providers Configured',
                      style: TextStyle(
                        color: NoctraColors.textMain,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Connect any OpenAI-compatible API endpoint. Your API keys are encrypted locally using Android Keystore.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 13.5,
                      ),
                    ),
                  ],
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              itemCount: providersState.providers.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final provider = providersState.providers[index];
                final isActive = activeProvider?.id == provider.id;
                return _ProviderCard(
                  provider: provider,
                  isActive: isActive,
                  isTesting: providersState.isTestingConnection,
                );
              },
            ),
    );
  }
}

class _ProviderCard extends ConsumerWidget {
  final AiProviderConfig provider;
  final bool isActive;
  final bool isTesting;

  const _ProviderCard({
    required this.provider,
    required this.isActive,
    required this.isTesting,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Color statusColor;
    final String statusText;
    switch (provider.connectionStatus) {
      case ProviderConnectionStatus.connected:
        statusColor = NoctraColors.successGreen;
        statusText = 'Connected';
        break;
      case ProviderConnectionStatus.failed:
        statusColor = NoctraColors.errorCoral;
        statusText = 'Connection Failed';
        break;
      case ProviderConnectionStatus.untested:
        statusColor = NoctraColors.textSecondary;
        statusText = 'Untested';
        break;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: NoctraColors.cardBackground,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isActive
              ? NoctraColors.electricViolet
              : NoctraColors.borderSubtle,
          width: isActive ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: Text(
                        provider.name,
                        style: const TextStyle(
                          color: NoctraColors.textMain,
                          fontSize: 16.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (isActive) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: NoctraColors.electricVioletSoft,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'ACTIVE',
                          style: TextStyle(
                            color: NoctraColors.electricViolet,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: (action) async {
                  final notifier = ref.read(providersNotifierProvider.notifier);
                  switch (action) {
                    case 'activate':
                      await ref
                          .read(appSettingsProvider.notifier)
                          .setActiveProviderId(provider.id);
                      break;
                    case 'edit':
                      if (context.mounted) {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) =>
                                ProviderEditorScreen(existingProvider: provider),
                          ),
                        );
                      }
                      break;
                    case 'duplicate':
                      await notifier.duplicateProvider(provider);
                      break;
                    case 'delete':
                      await notifier.deleteProvider(provider.id);
                      break;
                  }
                },
                itemBuilder: (_) => [
                  if (!isActive)
                    const PopupMenuItem(
                      value: 'activate',
                      child: Text('Set as Active Provider'),
                    ),
                  const PopupMenuItem(
                    value: 'edit',
                    child: Text('Edit Configuration'),
                  ),
                  const PopupMenuItem(
                    value: 'duplicate',
                    child: Text('Duplicate Provider'),
                  ),
                  const PopupMenuItem(
                    value: 'delete',
                    child: Text(
                      'Delete Provider',
                      style: TextStyle(color: NoctraColors.errorCoral),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            provider.baseUrl,
            style: const TextStyle(
              color: NoctraColors.textSecondary,
              fontSize: 12.5,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _InfoChip(
                icon: Icons.memory_rounded,
                label: provider.modelName.isEmpty
                    ? 'No model set'
                    : provider.modelName,
              ),
              _InfoChip(
                icon: Icons.thermostat_rounded,
                label: 'T=${provider.temperature}',
              ),
              _InfoChip(
                icon: Icons.stream_rounded,
                label: provider.stream ? 'SSE Stream' : 'Standard JSON',
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: statusColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      statusText,
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (provider.lastError != null) ...[
            const SizedBox(height: 8),
            Text(
              provider.lastError!,
              style: const TextStyle(
                color: NoctraColors.errorCoral,
                fontSize: 11.5,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              if (!isActive) ...[
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => ref
                        .read(appSettingsProvider.notifier)
                        .setActiveProviderId(provider.id),
                    child: const Text('Use Provider'),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: isTesting
                      ? null
                      : () async {
                          final res = await ref
                              .read(providersNotifierProvider.notifier)
                              .testProviderConnection(provider);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(res.message)),
                            );
                          }
                        },
                  icon: const Icon(Icons.network_check_rounded, size: 16),
                  label: const Text('Test Connection'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          ProviderEditorScreen(existingProvider: provider),
                    ),
                  );
                },
                icon: const Icon(Icons.edit_outlined, size: 19),
                tooltip: 'Edit',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: NoctraColors.backgroundSecondary,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: NoctraColors.borderSubtle),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: NoctraColors.cyanAccent),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              color: NoctraColors.textMain,
              fontSize: 11.5,
            ),
          ),
        ],
      ),
    );
  }
}
