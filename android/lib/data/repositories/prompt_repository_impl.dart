import '../../core/constants/app_constants.dart';
import '../../domain/entities/ai_persona.dart';
import '../../domain/entities/prompt_template.dart';
import '../../domain/entities/system_prompt.dart';
import '../../domain/repositories/prompt_repository.dart';
import '../local/hive_storage_service.dart';

class PromptRepositoryImpl implements PromptRepository {
  final HiveStorageService hive;

  PromptRepositoryImpl({required this.hive});

  @override
  Future<List<SystemPrompt>> getSystemPrompts() async {
    final maps = hive.getAllMapsByName(AppConstants.systemPromptsBox);
    if (maps.isEmpty) {
      final defaults = [
        SystemPrompt(
          id: 'sys_default_concise',
          title: 'NOCTRA Core (Balanced)',
          content:
              'You are NOCTRA AI, a precise, thoughtful, and privacy-respecting assistant. Provide clear, well-structured responses.',
          category: 'General',
          isDefault: true,
          createdAt: DateTime.now(),
        ),
        SystemPrompt(
          id: 'sys_deep_technical',
          title: 'Principal Systems Architect',
          content:
              'Act as a Principal Engineer. Prioritize production reliability, edge-case handling, security, and clean modular architecture.',
          category: 'Engineering',
          isDefault: false,
          createdAt: DateTime.now(),
        ),
      ];
      for (final p in defaults) {
        await saveSystemPrompt(p);
      }
      return defaults;
    }
    final list = maps.map(SystemPrompt.fromMap).toList();
    list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return list;
  }

  @override
  Future<void> saveSystemPrompt(SystemPrompt prompt) async {
    if (prompt.isDefault) {
      final all = hive.getAllMapsByName(AppConstants.systemPromptsBox);
      for (final m in all) {
        final existing = SystemPrompt.fromMap(m);
        if (existing.isDefault && existing.id != prompt.id) {
          await hive.putMapByName(
            AppConstants.systemPromptsBox,
            existing.id,
            existing.copyWith(isDefault: false).toMap(),
          );
        }
      }
    }
    await hive.putMapByName(
      AppConstants.systemPromptsBox,
      prompt.id,
      prompt.toMap(),
    );
  }

  @override
  Future<void> deleteSystemPrompt(String id) async {
    await hive.deleteKey(AppConstants.systemPromptsBox, id);
  }

  @override
  Future<List<AiPersona>> getPersonas() async {
    final builtIns = AiPersona.builtInPersonas();
    final customMaps = hive.getAllMapsByName(AppConstants.personasBox);
    final customs = customMaps.map(AiPersona.fromMap).toList();
    return [...builtIns, ...customs];
  }

  @override
  Future<void> saveCustomPersona(AiPersona persona) async {
    await hive.putMapByName(
      AppConstants.personasBox,
      persona.id,
      persona.toMap(),
    );
  }

  @override
  Future<void> deleteCustomPersona(String id) async {
    await hive.deleteKey(AppConstants.personasBox, id);
  }

  @override
  Future<List<PromptTemplate>> getPromptTemplates() async {
    final maps = hive.getAllMapsByName(AppConstants.promptTemplatesBox);
    if (maps.isEmpty) {
      final defaults = PromptTemplate.defaultTemplates();
      for (final tpl in defaults) {
        await savePromptTemplate(tpl);
      }
      return defaults;
    }
    final list = maps.map(PromptTemplate.fromMap).toList();
    list.sort((a, b) => a.title.compareTo(b.title));
    return list;
  }

  @override
  Future<void> savePromptTemplate(PromptTemplate template) async {
    await hive.putMapByName(
      AppConstants.promptTemplatesBox,
      template.id,
      template.toMap(),
    );
  }

  @override
  Future<void> deletePromptTemplate(String id) async {
    await hive.deleteKey(AppConstants.promptTemplatesBox, id);
  }

  @override
  Future<void> clearAllPromptsAndPersonas() async {
    await hive.clearBox(AppConstants.systemPromptsBox);
    await hive.clearBox(AppConstants.personasBox);
    await hive.clearBox(AppConstants.promptTemplatesBox);
  }
}
