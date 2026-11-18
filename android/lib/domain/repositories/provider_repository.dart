import '../entities/ai_provider_config.dart';

abstract class ProviderRepository {
  Future<List<AiProviderConfig>> getAllProviders();
  Future<AiProviderConfig?> getProviderById(String id);
  Future<void> saveProvider(AiProviderConfig config, {String? apiKey});
  Future<void> deleteProvider(String id);
  Future<String?> getApiKeyForProvider(String providerId);
  Future<void> saveApiKeyForProvider(String providerId, String apiKey);
  Future<void> clearAllProviders();
}
