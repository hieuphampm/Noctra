enum MessageSpacingDensity {
  compact,
  comfortable,
  spacious,
}

enum AutoDeleteDuration {
  never,
  after24Hours,
  after7Days,
  after30Days,
}

class AppSettings {
  final bool amoledMode;
  final double fontScale;
  final MessageSpacingDensity messageSpacing;
  final bool hapticFeedback;
  final bool enableAnimations;
  final String languageCode;
  final String welcomeMessage;
  final String? activeProviderId;
  final String activePersonaId;
  final String defaultSystemPrompt;
  final double defaultTemperature;
  final double defaultTopP;
  final int defaultMaxTokens;
  final bool defaultStream;
  final bool renderMarkdown;
  final int defaultContextLimit;
  final bool sendChatHistoryByDefault;
  final bool sendAttachmentsByDefault;
  final bool biometricLockEnabled;
  final AutoDeleteDuration autoDeleteDuration;

  const AppSettings({
    this.amoledMode = false,
    this.fontScale = 1.0,
    this.messageSpacing = MessageSpacingDensity.comfortable,
    this.hapticFeedback = true,
    this.enableAnimations = true,
    this.languageCode = 'en',
    this.welcomeMessage = 'Good evening. What would you like to explore?',
    this.activeProviderId,
    this.activePersonaId = 'persona_general',
    this.defaultSystemPrompt =
        'You are NOCTRA AI, a precise, thoughtful, and privacy-respecting assistant.',
    this.defaultTemperature = 0.7,
    this.defaultTopP = 1.0,
    this.defaultMaxTokens = 2048,
    this.defaultStream = true,
    this.renderMarkdown = true,
    this.defaultContextLimit = 20,
    this.sendChatHistoryByDefault = true,
    this.sendAttachmentsByDefault = true,
    this.biometricLockEnabled = false,
    this.autoDeleteDuration = AutoDeleteDuration.never,
  });

  double get verticalMessageGap {
    switch (messageSpacing) {
      case MessageSpacingDensity.compact:
        return 6.0;
      case MessageSpacingDensity.comfortable:
        return 12.0;
      case MessageSpacingDensity.spacious:
        return 20.0;
    }
  }

  AppSettings copyWith({
    bool? amoledMode,
    double? fontScale,
    MessageSpacingDensity? messageSpacing,
    bool? hapticFeedback,
    bool? enableAnimations,
    String? languageCode,
    String? welcomeMessage,
    String? activeProviderId,
    bool clearActiveProvider = false,
    String? activePersonaId,
    String? defaultSystemPrompt,
    double? defaultTemperature,
    double? defaultTopP,
    int? defaultMaxTokens,
    bool? defaultStream,
    bool? renderMarkdown,
    int? defaultContextLimit,
    bool? sendChatHistoryByDefault,
    bool? sendAttachmentsByDefault,
    bool? biometricLockEnabled,
    AutoDeleteDuration? autoDeleteDuration,
  }) {
    return AppSettings(
      amoledMode: amoledMode ?? this.amoledMode,
      fontScale: fontScale ?? this.fontScale,
      messageSpacing: messageSpacing ?? this.messageSpacing,
      hapticFeedback: hapticFeedback ?? this.hapticFeedback,
      enableAnimations: enableAnimations ?? this.enableAnimations,
      languageCode: languageCode ?? this.languageCode,
      welcomeMessage: welcomeMessage ?? this.welcomeMessage,
      activeProviderId: clearActiveProvider
          ? null
          : (activeProviderId ?? this.activeProviderId),
      activePersonaId: activePersonaId ?? this.activePersonaId,
      defaultSystemPrompt: defaultSystemPrompt ?? this.defaultSystemPrompt,
      defaultTemperature: defaultTemperature ?? this.defaultTemperature,
      defaultTopP: defaultTopP ?? this.defaultTopP,
      defaultMaxTokens: defaultMaxTokens ?? this.defaultMaxTokens,
      defaultStream: defaultStream ?? this.defaultStream,
      renderMarkdown: renderMarkdown ?? this.renderMarkdown,
      defaultContextLimit: defaultContextLimit ?? this.defaultContextLimit,
      sendChatHistoryByDefault:
          sendChatHistoryByDefault ?? this.sendChatHistoryByDefault,
      sendAttachmentsByDefault:
          sendAttachmentsByDefault ?? this.sendAttachmentsByDefault,
      biometricLockEnabled: biometricLockEnabled ?? this.biometricLockEnabled,
      autoDeleteDuration: autoDeleteDuration ?? this.autoDeleteDuration,
    );
  }
}
