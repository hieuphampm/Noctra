import 'package:shared_preferences/shared_preferences.dart';
import '../../domain/entities/app_settings.dart';
import '../../domain/repositories/settings_repository.dart';

class SettingsRepositoryImpl implements SettingsRepository {
  static const _kAmoledMode = 'noctra_pref_amoled_mode';
  static const _kFontScale = 'noctra_pref_font_scale';
  static const _kMessageSpacing = 'noctra_pref_message_spacing';
  static const _kHapticFeedback = 'noctra_pref_haptic_feedback';
  static const _kEnableAnimations = 'noctra_pref_enable_animations';
  static const _kLanguageCode = 'noctra_pref_language_code';
  static const _kWelcomeMessage = 'noctra_pref_welcome_message';
  static const _kActiveProviderId = 'noctra_pref_active_provider_id';
  static const _kActivePersonaId = 'noctra_pref_active_persona_id';
  static const _kDefaultSystemPrompt = 'noctra_pref_default_system_prompt';
  static const _kDefaultTemperature = 'noctra_pref_default_temperature';
  static const _kDefaultTopP = 'noctra_pref_default_top_p';
  static const _kDefaultMaxTokens = 'noctra_pref_default_max_tokens';
  static const _kDefaultStream = 'noctra_pref_default_stream';
  static const _kRenderMarkdown = 'noctra_pref_render_markdown';
  static const _kDefaultContextLimit = 'noctra_pref_default_context_limit';
  static const _kSendChatHistory = 'noctra_pref_send_chat_history';
  static const _kSendAttachments = 'noctra_pref_send_attachments';
  static const _kBiometricLock = 'noctra_pref_biometric_lock';
  static const _kAutoDelete = 'noctra_pref_auto_delete';

  @override
  Future<AppSettings> loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final spacingName = prefs.getString(_kMessageSpacing) ?? 'comfortable';
    final autoDeleteName = prefs.getString(_kAutoDelete) ?? 'never';

    return AppSettings(
      amoledMode: prefs.getBool(_kAmoledMode) ?? false,
      fontScale: prefs.getDouble(_kFontScale) ?? 1.0,
      messageSpacing: MessageSpacingDensity.values.firstWhere(
        (e) => e.name == spacingName,
        orElse: () => MessageSpacingDensity.comfortable,
      ),
      hapticFeedback: prefs.getBool(_kHapticFeedback) ?? true,
      enableAnimations: prefs.getBool(_kEnableAnimations) ?? true,
      languageCode: prefs.getString(_kLanguageCode) ?? 'en',
      welcomeMessage: prefs.getString(_kWelcomeMessage) ??
          'Good evening. What would you like to explore?',
      activeProviderId: prefs.getString(_kActiveProviderId),
      activePersonaId:
          prefs.getString(_kActivePersonaId) ?? 'persona_general',
      defaultSystemPrompt: prefs.getString(_kDefaultSystemPrompt) ??
          'You are NOCTRA AI, a precise, thoughtful, and privacy-respecting assistant.',
      defaultTemperature: prefs.getDouble(_kDefaultTemperature) ?? 0.7,
      defaultTopP: prefs.getDouble(_kDefaultTopP) ?? 1.0,
      defaultMaxTokens: prefs.getInt(_kDefaultMaxTokens) ?? 2048,
      defaultStream: prefs.getBool(_kDefaultStream) ?? true,
      renderMarkdown: prefs.getBool(_kRenderMarkdown) ?? true,
      defaultContextLimit: prefs.getInt(_kDefaultContextLimit) ?? 20,
      sendChatHistoryByDefault: prefs.getBool(_kSendChatHistory) ?? true,
      sendAttachmentsByDefault: prefs.getBool(_kSendAttachments) ?? true,
      biometricLockEnabled: prefs.getBool(_kBiometricLock) ?? false,
      autoDeleteDuration: AutoDeleteDuration.values.firstWhere(
        (e) => e.name == autoDeleteName,
        orElse: () => AutoDeleteDuration.never,
      ),
    );
  }

  @override
  Future<void> saveSettings(AppSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kAmoledMode, settings.amoledMode);
    await prefs.setDouble(_kFontScale, settings.fontScale);
    await prefs.setString(_kMessageSpacing, settings.messageSpacing.name);
    await prefs.setBool(_kHapticFeedback, settings.hapticFeedback);
    await prefs.setBool(_kEnableAnimations, settings.enableAnimations);
    await prefs.setString(_kLanguageCode, settings.languageCode);
    await prefs.setString(_kWelcomeMessage, settings.welcomeMessage);
    if (settings.activeProviderId != null) {
      await prefs.setString(_kActiveProviderId, settings.activeProviderId!);
    } else {
      await prefs.remove(_kActiveProviderId);
    }
    await prefs.setString(_kActivePersonaId, settings.activePersonaId);
    await prefs.setString(_kDefaultSystemPrompt, settings.defaultSystemPrompt);
    await prefs.setDouble(_kDefaultTemperature, settings.defaultTemperature);
    await prefs.setDouble(_kDefaultTopP, settings.defaultTopP);
    await prefs.setInt(_kDefaultMaxTokens, settings.defaultMaxTokens);
    await prefs.setBool(_kDefaultStream, settings.defaultStream);
    await prefs.setBool(_kRenderMarkdown, settings.renderMarkdown);
    await prefs.setInt(_kDefaultContextLimit, settings.defaultContextLimit);
    await prefs.setBool(
      _kSendChatHistory,
      settings.sendChatHistoryByDefault,
    );
    await prefs.setBool(
      _kSendAttachments,
      settings.sendAttachmentsByDefault,
    );
    await prefs.setBool(_kBiometricLock, settings.biometricLockEnabled);
    await prefs.setString(_kAutoDelete, settings.autoDeleteDuration.name);
  }

  @override
  Future<void> resetSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }
}
