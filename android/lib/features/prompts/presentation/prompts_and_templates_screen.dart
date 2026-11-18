import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/theme/noctra_colors.dart';
import '../../../domain/entities/ai_persona.dart';
import '../../../domain/entities/prompt_template.dart';
import '../../../domain/entities/system_prompt.dart';
import '../../chat/presentation/chat_controller.dart';

class PromptsAndTemplatesScreen extends ConsumerStatefulWidget {
  const PromptsAndTemplatesScreen({super.key});

  @override
  ConsumerState<PromptsAndTemplatesScreen> createState() =>
      _PromptsAndTemplatesScreenState();
}

class _PromptsAndTemplatesScreenState
    extends ConsumerState<PromptsAndTemplatesScreen>
    with SingleTickerProviderStateMixin {
  static const _uuid = Uuid();
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(promptsAndPersonasProvider);
    final settings = ref.watch(appSettingsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Prompts, Personas & Templates'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: NoctraColors.electricViolet,
          labelColor: NoctraColors.electricViolet,
          unselectedLabelColor: NoctraColors.textSecondary,
          tabs: const [
            Tab(text: 'Personas'),
            Tab(text: 'System Prompts'),
            Tab(text: 'Templates'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          switch (_tabController.index) {
            case 0:
              _showPersonaDialog(context);
              break;
            case 1:
              _showSystemPromptDialog(context);
              break;
            case 2:
              _showTemplateDialog(context);
              break;
          }
        },
        backgroundColor: NoctraColors.electricViolet,
        foregroundColor: const Color(0xFF090B10),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Create New'),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // TAB 1: AI PERSONAS
          ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: state.personas.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final persona = state.personas[index];
              final isSelected = settings.activePersonaId == persona.id;
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: NoctraColors.cardBackground,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isSelected
                        ? NoctraColors.electricViolet
                        : NoctraColors.borderSubtle,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            persona.name,
                            style: const TextStyle(
                              color: NoctraColors.textMain,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (persona.isBuiltIn)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: NoctraColors.backgroundSecondary,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'BUILT-IN',
                              style: TextStyle(
                                color: NoctraColors.textMuted,
                                fontSize: 10,
                              ),
                            ),
                          )
                        else ...[
                          IconButton(
                            onPressed: () =>
                                _showPersonaDialog(context, existing: persona),
                            icon: const Icon(Icons.edit_outlined, size: 18),
                          ),
                          IconButton(
                            onPressed: () => ref
                                .read(promptsAndPersonasProvider.notifier)
                                .deleteCustomPersona(persona.id),
                            icon: const Icon(
                              Icons.delete_outline_rounded,
                              size: 18,
                              color: NoctraColors.errorCoral,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      persona.description,
                      style: const TextStyle(
                        color: NoctraColors.cyanAccent,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      persona.systemPrompt,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Suggested Temp: ${persona.suggestedTemperature}',
                          style: const TextStyle(
                            color: NoctraColors.textMuted,
                            fontSize: 11.5,
                          ),
                        ),
                        isSelected
                            ? const Chip(
                                label: Text(
                                  'Active Persona',
                                  style: TextStyle(
                                    color: NoctraColors.electricViolet,
                                    fontSize: 11.5,
                                  ),
                                ),
                              )
                            : OutlinedButton(
                                onPressed: () => ref
                                    .read(appSettingsProvider.notifier)
                                    .setActivePersonaId(persona.id),
                                child: const Text('Activate Persona'),
                              ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),

          // TAB 2: SYSTEM PROMPTS
          ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: state.systemPrompts.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final prompt = state.systemPrompts[index];
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: NoctraColors.cardBackground,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: prompt.isDefault
                        ? NoctraColors.electricViolet
                        : NoctraColors.borderSubtle,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            prompt.title,
                            style: const TextStyle(
                              color: NoctraColors.textMain,
                              fontSize: 15.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => _showSystemPromptDialog(
                            context,
                            existing: prompt,
                          ),
                          icon: const Icon(Icons.edit_outlined, size: 18),
                        ),
                        IconButton(
                          onPressed: () => ref
                              .read(promptsAndPersonasProvider.notifier)
                              .deleteSystemPrompt(prompt.id),
                          icon: const Icon(
                            Icons.delete_outline_rounded,
                            size: 18,
                            color: NoctraColors.errorCoral,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      prompt.content,
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: () async {
                            await ref
                                .read(promptsAndPersonasProvider.notifier)
                                .saveSystemPrompt(
                                  prompt.copyWith(isDefault: true),
                                );
                          },
                          child: Text(
                            prompt.isDefault
                                ? 'Default Global Prompt'
                                : 'Set as Global Default',
                          ),
                        ),
                        OutlinedButton(
                          onPressed: () async {
                            final activeConv = ref
                                .read(chatControllerProvider)
                                .activeConversation;
                            if (activeConv != null) {
                              await ref
                                  .read(chatControllerProvider.notifier)
                                  .updateConversationSettings(
                                    activeConv.copyWith(
                                      systemPromptOverride: prompt.content,
                                    ),
                                  );
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Assigned system prompt to current conversation',
                                    ),
                                  ),
                                );
                              }
                            }
                          },
                          child: const Text('Assign to Active Chat'),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),

          // TAB 3: PROMPT TEMPLATES
          ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: state.templates.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final tpl = state.templates[index];
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: NoctraColors.cardBackground,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: NoctraColors.borderSubtle),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            tpl.title,
                            style: const TextStyle(
                              color: NoctraColors.textMain,
                              fontSize: 15.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Chip(
                          label: Text(
                            tpl.category,
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                        IconButton(
                          onPressed: () =>
                              _showTemplateDialog(context, existing: tpl),
                          icon: const Icon(Icons.edit_outlined, size: 18),
                        ),
                        IconButton(
                          onPressed: () => ref
                              .read(promptsAndPersonasProvider.notifier)
                              .deletePromptTemplate(tpl.id),
                          icon: const Icon(
                            Icons.delete_outline_rounded,
                            size: 18,
                            color: NoctraColors.errorCoral,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      tpl.promptText,
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  void _showPersonaDialog(BuildContext context, {AiPersona? existing}) {
    final nameCtrl = TextEditingController(text: existing?.name ?? '');
    final descCtrl = TextEditingController(text: existing?.description ?? '');
    final promptCtrl =
        TextEditingController(text: existing?.systemPrompt ?? '');
    double temp = existing?.suggestedTemperature ?? 0.7;

    showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            existing == null ? 'Create Custom Persona' : 'Edit Custom Persona',
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(labelText: 'Persona Name'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: descCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Short Description'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: promptCtrl,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Persona System Prompt',
                  ),
                ),
                const SizedBox(height: 10),
                Text('Suggested Temperature: ${temp.toStringAsFixed(1)}'),
                Slider(
                  value: temp,
                  min: 0.0,
                  max: 1.5,
                  divisions: 15,
                  onChanged: (v) => setDialogState(() => temp = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty ||
                    promptCtrl.text.trim().isEmpty) {
                  return;
                }
                final persona = AiPersona(
                  id: existing?.id ?? _uuid.v4(),
                  name: nameCtrl.text.trim(),
                  description: descCtrl.text.trim(),
                  systemPrompt: promptCtrl.text.trim(),
                  suggestedTemperature: temp,
                  isBuiltIn: false,
                );
                await ref
                    .read(promptsAndPersonasProvider.notifier)
                    .saveCustomPersona(persona);
                if (context.mounted) Navigator.of(context).pop();
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  void _showSystemPromptDialog(BuildContext context, {SystemPrompt? existing}) {
    final titleCtrl = TextEditingController(text: existing?.title ?? '');
    final contentCtrl = TextEditingController(text: existing?.content ?? '');

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          existing == null ? 'New System Prompt' : 'Edit System Prompt',
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(labelText: 'Prompt Title'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: contentCtrl,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: 'System Instructions',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleCtrl.text.trim().isEmpty ||
                  contentCtrl.text.trim().isEmpty) {
                return;
              }
              final item = SystemPrompt(
                id: existing?.id ?? _uuid.v4(),
                title: titleCtrl.text.trim(),
                content: contentCtrl.text.trim(),
                isDefault: existing?.isDefault ?? false,
                createdAt: existing?.createdAt ?? DateTime.now(),
              );
              await ref
                  .read(promptsAndPersonasProvider.notifier)
                  .saveSystemPrompt(item);
              if (context.mounted) Navigator.of(context).pop();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showTemplateDialog(BuildContext context, {PromptTemplate? existing}) {
    final titleCtrl = TextEditingController(text: existing?.title ?? '');
    final catCtrl =
        TextEditingController(text: existing?.category ?? 'General');
    final promptCtrl = TextEditingController(text: existing?.promptText ?? '');

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          existing == null ? 'New Prompt Template' : 'Edit Prompt Template',
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(labelText: 'Template Name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: catCtrl,
                decoration: const InputDecoration(
                  labelText: 'Category (e.g. Coding, Analysis, Writing)',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: promptCtrl,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Prompt Content'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleCtrl.text.trim().isEmpty ||
                  promptCtrl.text.trim().isEmpty) {
                return;
              }
              final tpl = PromptTemplate(
                id: existing?.id ?? _uuid.v4(),
                title: titleCtrl.text.trim(),
                category: catCtrl.text.trim().isEmpty
                    ? 'General'
                    : catCtrl.text.trim(),
                promptText: promptCtrl.text.trim(),
                createdAt: existing?.createdAt ?? DateTime.now(),
              );
              await ref
                  .read(promptsAndPersonasProvider.notifier)
                  .savePromptTemplate(tpl);
              if (context.mounted) Navigator.of(context).pop();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
