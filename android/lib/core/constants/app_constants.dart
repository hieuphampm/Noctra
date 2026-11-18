class AppConstants {
  AppConstants._();

  static const String appName = 'NOCTRA AI';
  static const String appTagline = 'Private Intelligence. Your Own Space.';
  static const String appVersion = '1.0.0';
  static const String appBuildNumber = '1';

  // Default welcome message
  static const String defaultWelcomeMessage =
      'Good evening. What would you like to explore?';

  // Hive Box Names
  static const String conversationsBox = 'noctra_conversations_box';
  static const String messagesBox = 'noctra_messages_box';
  static const String providersBox = 'noctra_providers_box';
  static const String systemPromptsBox = 'noctra_system_prompts_box';
  static const String personasBox = 'noctra_personas_box';
  static const String promptTemplatesBox = 'noctra_prompt_templates_box';

  // Secure Storage Prefix
  static const String secureApiKeyPrefix = 'noctra_api_key_';
  static const String secureCustomHeadersPrefix = 'noctra_headers_';

  // File size limits
  static const int maxAttachmentSizeBytes = 25 * 1024 * 1024; // 25 MB
  static const int maxImageSizeBytes = 12 * 1024 * 1024; // 12 MB

  // Supported extensions
  static const List<String> supportedImageExtensions = [
    'jpg',
    'jpeg',
    'png',
    'webp',
  ];

  static const List<String> supportedDocumentExtensions = [
    'pdf',
    'txt',
    'md',
    'json',
    'csv',
    'docx',
    'xlsx',
    'pptx',
  ];

  static const List<String> allSupportedExtensions = [
    ...supportedImageExtensions,
    ...supportedDocumentExtensions,
  ];

  // Suggested Home Prompts
  static const List<Map<String, String>> defaultSuggestedPrompts = [
    {
      'title': 'Explain something complex',
      'subtitle': 'Break down quantum computing or zero-knowledge proofs',
      'prompt':
          'Explain how zero-knowledge proofs work using first principles, a practical real-world analogy, and a concise technical summary.',
      'icon': 'psychology',
    },
    {
      'title': 'Write something creative',
      'subtitle': 'Craft atmospheric sci-fi prose or compelling copy',
      'prompt':
          'Write the opening scene of a neo-noir cyberpunk thriller set inside an orbital data haven where memories are encrypted by hand.',
      'icon': 'auto_awesome',
    },
    {
      'title': 'Analyze a document',
      'subtitle': 'Extract key arguments, risks, and action items',
      'prompt':
          'I want to analyze a document or text. Please summarize the core thesis, key findings, hidden assumptions, and actionable takeaways from the following content:\n\n',
      'icon': 'description',
    },
    {
      'title': 'Help me write code',
      'subtitle': 'Architect clean, modular, production-ready code',
      'prompt':
          'Design a thread-safe, resilient token-bucket rate limiter with exponential backoff and jitter. Show clean implementation code and explain edge cases.',
      'icon': 'terminal',
    },
    {
      'title': 'Brainstorm new ideas',
      'subtitle': 'Generate high-leverage product or research concepts',
      'prompt':
          'Brainstorm 5 privacy-first mobile utility concepts that solve real everyday problems using local-first architecture without cloud telemetry.',
      'icon': 'lightbulb',
    },
  ];
}
