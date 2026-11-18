import '../entities/ai_persona.dart';
import '../entities/prompt_template.dart';
import '../entities/system_prompt.dart';

abstract class PromptRepository {
  Future<List<SystemPrompt>> getSystemPrompts();
  Future<void> saveSystemPrompt(SystemPrompt prompt);
  Future<void> deleteSystemPrompt(String id);

  Future<List<AiPersona>> getPersonas();
  Future<void> saveCustomPersona(AiPersona persona);
  Future<void> deleteCustomPersona(String id);

  Future<List<PromptTemplate>> getPromptTemplates();
  Future<void> savePromptTemplate(PromptTemplate template);
  Future<void> deletePromptTemplate(String id);

  Future<void> clearAllPromptsAndPersonas();
}
