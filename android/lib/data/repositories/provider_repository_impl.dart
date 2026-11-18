import '../../core/constants/app_constants.dart';
import '../../domain/entities/ai_provider_config.dart';
import '../../domain/repositories/provider_repository.dart';
import '../local/hive_storage_service.dart';
import '../local/secure_credential_store.dart';

class ProviderRepositoryImpl implements ProviderRepository {
  final HiveStorageService hive;
  final SecureCredentialStore secureStore;

  ProviderRepositoryImpl({
    required this.hive,
    required this.secureStore,
  });

  @override
  Future<List<AiProviderConfig>> getAllProviders() async {
    final maps = hive.getAllMapsByName(AppConstants.providersBox);
    final providers = maps.map(AiProviderConfig.fromMap).toList();
    providers.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return providers;
  }

  @override
  Future<AiProviderConfig?> getProviderById(String id) async {
    final map = hive.getMapByName(AppConstants.providersBox, id);
    if (map == null) return null;
    return AiProviderConfig.fromMap(map);
  }

  @override
  Future<void> saveProvider(AiProviderConfig config, {String? apiKey}) async {
    await hive.putMapByName(
      AppConstants.providersBox,
      config.id,
      config.toMap(),
    );
    if (apiKey != null) {
      await secureStore.writeApiKey(config.id, apiKey);
    }
  }

  @override
  Future<void> deleteProvider(String id) async {
    await hive.deleteKey(AppConstants.providersBox, id);
    await secureStore.deleteApiKey(id);
  }

  @override
  Future<String?> getApiKeyForProvider(String providerId) async {
    return secureStore.readApiKey(providerId);
  }

  @override
  Future<void> saveApiKeyForProvider(String providerId, String apiKey) async {
    await secureStore.writeApiKey(providerId, apiKey);
  }

  @override
  Future<void> clearAllProviders() async {
    await hive.clearBox(AppConstants.providersBox);
    await secureStore.deleteAllCredentials();
  }
}
