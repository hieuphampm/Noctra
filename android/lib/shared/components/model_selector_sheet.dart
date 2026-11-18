import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/noctra_colors.dart';
import '../../features/chat/presentation/chat_controller.dart';
import '../../features/providers/presentation/provider_editor_screen.dart';
import '../../features/providers/presentation/providers_screen.dart';

class ModelSelectorSheet extends ConsumerStatefulWidget {
  const ModelSelectorSheet({super.key});

  @override
  ConsumerState<ModelSelectorSheet> createState() => _ModelSelectorSheetState();
}

class _ModelSelectorSheetState extends ConsumerState<ModelSelectorSheet> {
  late TextEditingController _customModelController;
  bool _isDiscovering = false;
  String? _discoveryMessage;

  @override
  void initState() {
    super.initState();
    final activeProvider = ref.read(activeProviderConfigProvider);
    final activeConv = ref.read(chatControllerProvider).activeConversation;
    _customModelController = TextEditingController(
      text: activeConv?.modelOverride ?? activeProvider?.modelName ?? '',
    );
  }

  @override
  void dispose() {
    _customModelController.dispose();
    super.dispose();
  }

  Future<void> _fetchModelsFromEndpoint() async {
    final activeProvider = ref.read(activeProviderConfigProvider);
    if (activeProvider == null) return;
    setState(() {
      _isDiscovering = true;
      _discoveryMessage = null;
    });
    try {
      final models = await ref
          .read(providersNotifierProvider.notifier)
          .discoverModels(activeProvider);
      if (mounted) {
        setState(() {
          _isDiscovering = false;
          _discoveryMessage = models.isEmpty
              ? 'Endpoint returned 0 models. Enter model name manually below.'
              : 'Discovered ${models.length} models from endpoint.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isDiscovering = false;
          _discoveryMessage =
              'Model discovery unsupported or failed. Use manual model entry below.';
        });
      }
    }
  }

  Future<void> _applyModelName(String modelName) async {
    final trimmed = modelName.trim();
    if (trimmed.isEmpty) return;

    final activeProvider = ref.read(activeProviderConfigProvider);
    final activeConv = ref.read(chatControllerProvider).activeConversation;

    if (activeConv != null) {
      await ref.read(chatControllerProvider.notifier).updateConversationSettings(
            activeConv.copyWith(modelOverride: trimmed),
          );
    }
    if (activeProvider != null) {
      await ref.read(providersNotifierProvider.notifier).saveProvider(
            config: activeProvider.copyWith(modelName: trimmed),
          );
    }
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final providersState = ref.watch(providersNotifierProvider);
    final activeProvider = ref.watch(activeProviderConfigProvider);
    final personas = ref.watch(promptsAndPersonasProvider).personas;
    final settings = ref.watch(appSettingsProvider);
    final activeConv = ref.watch(chatControllerProvider).activeConversation;

    final selectedPersonaId =
        activeConv?.personaId ?? settings.activePersonaId;

    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.45,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, scrollController) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 12,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: ListView(
            controller: scrollController,
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
                    'AI Provider, Model & Persona',
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
                          builder: (_) => const ProvidersScreen(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.tune_rounded, size: 16),
                    label: const Text('Manage'),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // 1. Provider Switcher
              const Text(
                'ACTIVE PROVIDER',
                style: TextStyle(
                  color: NoctraColors.textSecondary,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 8),
              if (providersState.providers.isEmpty)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: NoctraColors.cardBackground,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: NoctraColors.borderHighlight),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'No AI Providers Configured Yet',
                        style: TextStyle(
                          color: NoctraColors.textMain,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Connect any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, DeepSeek, Ollama, LM Studio, or your own private server).',
                        style: TextStyle(
                          color: NoctraColors.textSecondary,
                          fontSize: 12.5,
                        ),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton.icon(
                        onPressed: () {
                          Navigator.of(context).pop();
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const ProviderEditorScreen(),
                            ),
                          );
                        },
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: const Text('Add AI Provider'),
                      ),
                    ],
                  ),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: providersState.providers.map((p) {
                    final isSelected = activeProvider?.id == p.id;
                    return ChoiceChip(
                      label: Text(p.name),
                      selected: isSelected,
                      onSelected: (_) async {
                        await ref
                            .read(appSettingsProvider.notifier)
                            .setActiveProviderId(p.id);
                        if (activeConv != null) {
                          await ref
                              .read(chatControllerProvider.notifier)
                              .updateConversationSettings(
                                activeConv.copyWith(
                                  providerId: p.id,
                                  modelOverride: p.modelName,
                                ),
                              );
                        }
                        _customModelController.text = p.modelName;
                      },
                    );
                  }).toList(),
                ),

              if (activeProvider != null) ...[
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'MODEL SELECTION',
                      style: TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                    TextButton.icon(
                      onPressed:
                          _isDiscovering ? null : _fetchModelsFromEndpoint,
                      icon: _isDiscovering
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.sync_rounded, size: 15),
                      label: const Text('Fetch /models'),
                    ),
                  ],
                ),
                if (_discoveryMessage != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      _discoveryMessage!,
                      style: const TextStyle(
                        color: NoctraColors.cyanAccent,
                        fontSize: 12,
                      ),
                    ),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _customModelController,
                        decoration: const InputDecoration(
                          hintText: 'Enter or select model ID (e.g. gpt-4o)',
                          prefixIcon: Icon(Icons.memory_rounded, size: 18),
                        ),
                        onSubmitted: _applyModelName,
                      ),
                    ),
                    const SizedBox(width: 10),
                    ElevatedButton(
                      onPressed: () =>
                          _applyModelName(_customModelController.text),
                      child: const Text('Apply'),
                    ),
                  ],
                ),
                if (activeProvider.discoveredModels.isNotEmpty) ...[
                  const SizedBox(height: 12),
                   ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 150),
                    child: SingleChildScrollView(
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: activeProvider.discoveredModels.map((m) {
                          final isCurrent =
                              _customModelController.text.trim() == m;
                          return ActionChip(
                            backgroundColor: isCurrent
                                ? NoctraColors.electricVioletSoft
                                : NoctraColors.cardBackground,
                            label: Text(
                              m,
                              style: TextStyle(
                                color: isCurrent
                                    ? NoctraColors.electricViolet
                                    : NoctraColors.textMain,
                                fontSize: 12,
                              ),
                            ),
                            onPressed: () {
                              _customModelController.text = m;
                              _applyModelName(m);
                            },
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                ],
              ],

              const SizedBox(height: 22),
              const Text(
                'AI PERSONA',
                style: TextStyle(
                  color: NoctraColors.textSecondary,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 8),
              ...personas.map((persona) {
                final isSelected = persona.id == selectedPersonaId;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Material(
                    color: isSelected
                        ? NoctraColors.electricVioletSoft.withValues(alpha: 0.2)
                        : NoctraColors.cardBackground,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(
                        color: isSelected
                            ? NoctraColors.electricViolet
                            : NoctraColors.borderSubtle,
                      ),
                    ),
                    child: ListTile(
                    dense: true,
                    title: Text(
                      persona.name,
                      style: const TextStyle(
                        color: NoctraColors.textMain,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      persona.description,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                    trailing: isSelected
                        ? const Icon(
                            Icons.check_circle_rounded,
                            color: NoctraColors.electricViolet,
                            size: 20,
                          )
                        : Text(
                            'T=${persona.suggestedTemperature}',
                            style: const TextStyle(
                              color: NoctraColors.textMuted,
                              fontSize: 11,
                            ),
                          ),
                    onTap: () async {
                      await ref
                          .read(appSettingsProvider.notifier)
                          .setActivePersonaId(persona.id);
                      if (activeConv != null) {
                        await ref
                            .read(chatControllerProvider.notifier)
                            .updateConversationSettings(
                              activeConv.copyWith(personaId: persona.id),
                            );
                      }
                      if (context.mounted) {
                        Navigator.of(context).pop();
                      }
                    },
                  ),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}
