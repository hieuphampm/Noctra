import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../data/local/hive_storage_service.dart';
import '../../data/local/secure_credential_store.dart';
import '../../data/repositories/conversation_repository_impl.dart';
import '../../data/repositories/prompt_repository_impl.dart';
import '../../data/repositories/provider_repository_impl.dart';
import '../../data/repositories/settings_repository_impl.dart';
import '../../domain/entities/ai_persona.dart';
import '../../domain/entities/ai_provider_config.dart';
import '../../domain/entities/app_settings.dart';
import '../../domain/entities/prompt_template.dart';
import '../../domain/entities/system_prompt.dart';
import '../../domain/repositories/conversation_repository.dart';
import '../../domain/repositories/prompt_repository.dart';
import '../../domain/repositories/provider_repository.dart';
import '../../domain/repositories/settings_repository.dart';
import '../../domain/usecases/context_builder_usecase.dart';
import '../../services/ai/ai_client_interface.dart';
import '../../services/ai/openai_compatible_client.dart';
import '../../services/file_processing/attachment_processor_service.dart';
import '../../services/networking/network_monitor_service.dart';
import '../../services/security/biometric_auth_service.dart';
import '../../services/storage/data_export_service.dart';

// --- Core Infrastructure Providers ---

final hiveStorageServiceProvider = Provider<HiveStorageService>((ref) {
  throw UnimplementedError('hiveStorageServiceProvider must be overridden in main()');
});

final secureCredentialStoreProvider = Provider<SecureCredentialStore>((ref) {
  return KeystoreSecureCredentialStore();
});

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return SettingsRepositoryImpl();
});

final providerRepositoryProvider = Provider<ProviderRepository>((ref) {
  return ProviderRepositoryImpl(
    hive: ref.watch(hiveStorageServiceProvider),
    secureStore: ref.watch(secureCredentialStoreProvider),
  );
});

final conversationRepositoryProvider = Provider<ConversationRepository>((ref) {
  return ConversationRepositoryImpl(
    hive: ref.watch(hiveStorageServiceProvider),
  );
});

final promptRepositoryProvider = Provider<PromptRepository>((ref) {
  return PromptRepositoryImpl(
    hive: ref.watch(hiveStorageServiceProvider),
  );
});

final aiClientProvider = Provider<AiClientInterface>((ref) {
  return OpenAiCompatibleClient();
});

final contextBuilderUseCaseProvider = Provider<ContextBuilderUseCase>((ref) {
  return const ContextBuilderUseCase();
});

final attachmentProcessorProvider = Provider<AttachmentProcessorService>((ref) {
  return AttachmentProcessorService();
});

final dataExportServiceProvider = Provider<DataExportService>((ref) {
  return const DataExportService();
});

final biometricAuthServiceProvider = Provider<BiometricAuthService>((ref) {
  return BiometricAuthService();
});

final networkMonitorServiceProvider = Provider<NetworkMonitorService>((ref) {
  return NetworkMonitorService();
});

// --- Network Connectivity State ---

class NetworkConnectivityNotifier extends Notifier<bool> {
  @override
  bool build() {
    final service = ref.watch(networkMonitorServiceProvider);
    service.checkIsOnline().then((online) {
      state = online;
    });
    final sub = service.onConnectivityChanged.listen((online) {
      state = online;
    });
    ref.onDispose(sub.cancel);
    return true;
  }

  Future<void> refreshConnectivity() async {
    final online = await ref.read(networkMonitorServiceProvider).checkIsOnline();
    state = online;
  }
}

final isOnlineProvider = NotifierProvider<NetworkConnectivityNotifier, bool>(
  NetworkConnectivityNotifier.new,
);

// --- App Settings Notifier ---

class AppSettingsNotifier extends Notifier<AppSettings> {
  @override
  AppSettings build() {
    _loadInitial();
    return const AppSettings();
  }

  Future<void> _loadInitial() async {
    final loaded = await ref.read(settingsRepositoryProvider).loadSettings();
    state = loaded;
  }

  Future<void> updateSettings(AppSettings updated) async {
    state = updated;
    await ref.read(settingsRepositoryProvider).saveSettings(updated);
  }

  Future<void> setAmoledMode(bool enabled) async {
    await updateSettings(state.copyWith(amoledMode: enabled));
  }

  Future<void> setFontScale(double scale) async {
    await updateSettings(state.copyWith(fontScale: scale.clamp(0.85, 1.30)));
  }

  Future<void> setMessageSpacing(MessageSpacingDensity density) async {
    await updateSettings(state.copyWith(messageSpacing: density));
  }

  Future<void> setHapticFeedback(bool enabled) async {
    await updateSettings(state.copyWith(hapticFeedback: enabled));
  }

  Future<void> setEnableAnimations(bool enabled) async {
    await updateSettings(state.copyWith(enableAnimations: enabled));
  }

  Future<void> setWelcomeMessage(String message) async {
    await updateSettings(
      state.copyWith(
        welcomeMessage: message.trim().isEmpty
            ? 'Good evening. What would you like to explore?'
            : message.trim(),
      ),
    );
  }

  Future<void> setActiveProviderId(String? providerId) async {
    if (providerId == null) {
      await updateSettings(state.copyWith(clearActiveProvider: true));
    } else {
      await updateSettings(state.copyWith(activeProviderId: providerId));
    }
  }

  Future<void> setActivePersonaId(String personaId) async {
    await updateSettings(state.copyWith(activePersonaId: personaId));
  }

  Future<void> setBiometricLock(bool enabled) async {
    await updateSettings(state.copyWith(biometricLockEnabled: enabled));
  }

  Future<void> setAutoDeleteDuration(AutoDeleteDuration duration) async {
    await updateSettings(state.copyWith(autoDeleteDuration: duration));
  }

  Future<void> resetToDefaults() async {
    await ref.read(settingsRepositoryProvider).resetSettings();
    state = const AppSettings();
  }
}

final appSettingsProvider = NotifierProvider<AppSettingsNotifier, AppSettings>(
  AppSettingsNotifier.new,
);

// --- AI Providers Notifier ---

class ProvidersState {
  final List<AiProviderConfig> providers;
  final bool isLoading;
  final bool isTestingConnection;
  final String? statusBannerMessage;

  const ProvidersState({
    this.providers = const [],
    this.isLoading = false,
    this.isTestingConnection = false,
    this.statusBannerMessage,
  });

  ProvidersState copyWith({
    List<AiProviderConfig>? providers,
    bool? isLoading,
    bool? isTestingConnection,
    String? statusBannerMessage,
    bool clearBanner = false,
  }) {
    return ProvidersState(
      providers: providers ?? this.providers,
      isLoading: isLoading ?? this.isLoading,
      isTestingConnection: isTestingConnection ?? this.isTestingConnection,
      statusBannerMessage:
          clearBanner ? null : (statusBannerMessage ?? this.statusBannerMessage),
    );
  }
}

class ProvidersNotifier extends Notifier<ProvidersState> {
  static const _uuid = Uuid();

  @override
  ProvidersState build() {
    Future.microtask(loadProviders);
    return const ProvidersState(isLoading: true);
  }

  Future<void> loadProviders() async {
    final repo = ref.read(providerRepositoryProvider);
    final list = await repo.getAllProviders();
    state = state.copyWith(providers: list, isLoading: false);

    final settings = ref.read(appSettingsProvider);
    if (list.isNotEmpty &&
        (settings.activeProviderId == null ||
            !list.any((p) => p.id == settings.activeProviderId))) {
      await ref
          .read(appSettingsProvider.notifier)
          .setActiveProviderId(list.first.id);
    }
  }

  Future<AiProviderConfig> saveProvider({
    required AiProviderConfig config,
    String? apiKey,
    bool makeActive = false,
  }) async {
    final repo = ref.read(providerRepositoryProvider);
    await repo.saveProvider(config, apiKey: apiKey);
    final updatedList = await repo.getAllProviders();
    state = state.copyWith(providers: updatedList);

    final currentActive = ref.read(appSettingsProvider).activeProviderId;
    if (makeActive || currentActive == null || updatedList.length == 1) {
      await ref
          .read(appSettingsProvider.notifier)
          .setActiveProviderId(config.id);
    }
    return config;
  }

  Future<AiProviderConfig> duplicateProvider(AiProviderConfig source) async {
    final repo = ref.read(providerRepositoryProvider);
    final existingKey = await repo.getApiKeyForProvider(source.id);
    final copy = source.copyWith(
      id: _uuid.v4(),
      name: '${source.name} (Copy)',
      connectionStatus: ProviderConnectionStatus.untested,
      createdAt: DateTime.now(),
    );
    await saveProvider(config: copy, apiKey: existingKey);
    return copy;
  }

  Future<void> deleteProvider(String id) async {
    final repo = ref.read(providerRepositoryProvider);
    await repo.deleteProvider(id);
    final remaining = await repo.getAllProviders();
    state = state.copyWith(providers: remaining);

    final activeId = ref.read(appSettingsProvider).activeProviderId;
    if (activeId == id) {
      await ref
          .read(appSettingsProvider.notifier)
          .setActiveProviderId(remaining.isNotEmpty ? remaining.first.id : null);
    }
  }

  Future<ProviderConnectionTestResult> testProviderConnection(
    AiProviderConfig provider, {
    String? overrideApiKey,
  }) async {
    state = state.copyWith(isTestingConnection: true, clearBanner: true);
    final repo = ref.read(providerRepositoryProvider);
    final client = ref.read(aiClientProvider);

    final keyToUse =
        overrideApiKey ?? await repo.getApiKeyForProvider(provider.id);

    final result = await client.testConnection(
      provider: provider,
      apiKey: keyToUse,
    );

    final mergedModels = <String>{
      ...provider.discoveredModels,
      ...result.discoveredModels,
      if (provider.modelName.trim().isNotEmpty) provider.modelName.trim(),
    }.toList()
      ..sort();

    final updatedProvider = provider.copyWith(
      discoveredModels: mergedModels,
      modelName: provider.modelName.trim().isEmpty && mergedModels.isNotEmpty
          ? mergedModels.first
          : provider.modelName,
      connectionStatus: result.success
          ? ProviderConnectionStatus.connected
          : ProviderConnectionStatus.failed,
      lastTestedAt: DateTime.now(),
      lastError: result.success ? null : result.message,
      clearError: result.success,
    );

    // If this provider is already saved in the repository, update its status
    if (state.providers.any((p) => p.id == provider.id)) {
      await repo.saveProvider(updatedProvider);
      final list = await repo.getAllProviders();
      state = state.copyWith(
        providers: list,
        isTestingConnection: false,
        statusBannerMessage: result.message,
      );
    } else {
      state = state.copyWith(
        isTestingConnection: false,
        statusBannerMessage: result.message,
      );
    }

    return result;
  }

  Future<List<String>> discoverModels(
    AiProviderConfig provider, {
    String? overrideApiKey,
  }) async {
    final repo = ref.read(providerRepositoryProvider);
    final client = ref.read(aiClientProvider);
    final keyToUse =
        overrideApiKey ?? await repo.getApiKeyForProvider(provider.id);

    final models = await client.fetchAvailableModels(
      provider: provider,
      apiKey: keyToUse,
    );

    if (models.isNotEmpty && state.providers.any((p) => p.id == provider.id)) {
      final updated = provider.copyWith(
        discoveredModels: models,
        modelName:
            provider.modelName.trim().isEmpty ? models.first : provider.modelName,
      );
      await repo.saveProvider(updated);
      final list = await repo.getAllProviders();
      state = state.copyWith(providers: list);
    }
    return models;
  }
}

final providersNotifierProvider =
    NotifierProvider<ProvidersNotifier, ProvidersState>(
  ProvidersNotifier.new,
);

final activeProviderConfigProvider = Provider<AiProviderConfig?>((ref) {
  final providersState = ref.watch(providersNotifierProvider);
  final activeId = ref.watch(appSettingsProvider).activeProviderId;
  if (providersState.providers.isEmpty) return null;
  if (activeId != null) {
    for (final p in providersState.providers) {
      if (p.id == activeId) return p;
    }
  }
  return providersState.providers.first;
});

// --- Prompts, Personas, and Templates State ---

class PromptsAndPersonasState {
  final List<SystemPrompt> systemPrompts;
  final List<AiPersona> personas;
  final List<PromptTemplate> templates;

  const PromptsAndPersonasState({
    this.systemPrompts = const [],
    this.personas = const [],
    this.templates = const [],
  });

  PromptsAndPersonasState copyWith({
    List<SystemPrompt>? systemPrompts,
    List<AiPersona>? personas,
    List<PromptTemplate>? templates,
  }) {
    return PromptsAndPersonasState(
      systemPrompts: systemPrompts ?? this.systemPrompts,
      personas: personas ?? this.personas,
      templates: templates ?? this.templates,
    );
  }
}

class PromptsAndPersonasNotifier extends Notifier<PromptsAndPersonasState> {
  @override
  PromptsAndPersonasState build() {
    Future.microtask(reloadAll);
    return PromptsAndPersonasState(
      personas: AiPersona.builtInPersonas(),
      templates: PromptTemplate.defaultTemplates(),
    );
  }

  Future<void> reloadAll() async {
    final repo = ref.read(promptRepositoryProvider);
    final sys = await repo.getSystemPrompts();
    final pers = await repo.getPersonas();
    final tpls = await repo.getPromptTemplates();
    state = PromptsAndPersonasState(
      systemPrompts: sys,
      personas: pers,
      templates: tpls,
    );
  }

  Future<void> saveSystemPrompt(SystemPrompt prompt) async {
    await ref.read(promptRepositoryProvider).saveSystemPrompt(prompt);
    if (prompt.isDefault) {
      await ref.read(appSettingsProvider.notifier).updateSettings(
            ref
                .read(appSettingsProvider)
                .copyWith(defaultSystemPrompt: prompt.content),
          );
    }
    await reloadAll();
  }

  Future<void> deleteSystemPrompt(String id) async {
    await ref.read(promptRepositoryProvider).deleteSystemPrompt(id);
    await reloadAll();
  }

  Future<void> saveCustomPersona(AiPersona persona) async {
    await ref.read(promptRepositoryProvider).saveCustomPersona(persona);
    await reloadAll();
  }

  Future<void> deleteCustomPersona(String id) async {
    await ref.read(promptRepositoryProvider).deleteCustomPersona(id);
    await reloadAll();
  }

  Future<void> savePromptTemplate(PromptTemplate template) async {
    await ref.read(promptRepositoryProvider).savePromptTemplate(template);
    await reloadAll();
  }

  Future<void> deletePromptTemplate(String id) async {
    await ref.read(promptRepositoryProvider).deletePromptTemplate(id);
    await reloadAll();
  }
}

final promptsAndPersonasProvider =
    NotifierProvider<PromptsAndPersonasNotifier, PromptsAndPersonasState>(
  PromptsAndPersonasNotifier.new,
);
