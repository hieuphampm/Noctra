enum ProviderConnectionStatus {
  untested,
  connected,
  failed,
}

class AiProviderConfig {
  final String id;
  final String name;
  final String baseUrl;
  final String modelName;
  final List<String> discoveredModels;
  final Map<String, String> customHeaders;
  final int timeoutSeconds;
  final double temperature;
  final int maxTokens;
  final double topP;
  final bool stream;
  final String defaultSystemPrompt;
  final bool supportsVision;
  final bool supportsFileInput;
  final bool allowInsecureHttp;
  final ProviderConnectionStatus connectionStatus;
  final DateTime? lastTestedAt;
  final String? lastError;
  final DateTime createdAt;

  const AiProviderConfig({
    required this.id,
    required this.name,
    required this.baseUrl,
    required this.modelName,
    this.discoveredModels = const [],
    this.customHeaders = const {},
    this.timeoutSeconds = 60,
    this.temperature = 0.7,
    this.maxTokens = 2048,
    this.topP = 1.0,
    this.stream = true,
    this.defaultSystemPrompt =
        'You are NOCTRA AI, a precise, thoughtful, and privacy-respecting assistant.',
    this.supportsVision = true,
    this.supportsFileInput = false,
    this.allowInsecureHttp = false,
    this.connectionStatus = ProviderConnectionStatus.untested,
    this.lastTestedAt,
    this.lastError,
    required this.createdAt,
  });

  AiProviderConfig copyWith({
    String? id,
    String? name,
    String? baseUrl,
    String? modelName,
    List<String>? discoveredModels,
    Map<String, String>? customHeaders,
    int? timeoutSeconds,
    double? temperature,
    int? maxTokens,
    double? topP,
    bool? stream,
    String? defaultSystemPrompt,
    bool? supportsVision,
    bool? supportsFileInput,
    bool? allowInsecureHttp,
    ProviderConnectionStatus? connectionStatus,
    DateTime? lastTestedAt,
    String? lastError,
    bool clearError = false,
    DateTime? createdAt,
  }) {
    return AiProviderConfig(
      id: id ?? this.id,
      name: name ?? this.name,
      baseUrl: baseUrl ?? this.baseUrl,
      modelName: modelName ?? this.modelName,
      discoveredModels: discoveredModels ?? this.discoveredModels,
      customHeaders: customHeaders ?? this.customHeaders,
      timeoutSeconds: timeoutSeconds ?? this.timeoutSeconds,
      temperature: temperature ?? this.temperature,
      maxTokens: maxTokens ?? this.maxTokens,
      topP: topP ?? this.topP,
      stream: stream ?? this.stream,
      defaultSystemPrompt: defaultSystemPrompt ?? this.defaultSystemPrompt,
      supportsVision: supportsVision ?? this.supportsVision,
      supportsFileInput: supportsFileInput ?? this.supportsFileInput,
      allowInsecureHttp: allowInsecureHttp ?? this.allowInsecureHttp,
      connectionStatus: connectionStatus ?? this.connectionStatus,
      lastTestedAt: lastTestedAt ?? this.lastTestedAt,
      lastError: clearError ? null : (lastError ?? this.lastError),
      createdAt: createdAt ?? this.createdAt,
    );
  }

  /// Serializes non-sensitive metadata for local storage.
  /// IMPORTANT: API keys are NEVER included here; they live exclusively in FlutterSecureStorage.
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'baseUrl': baseUrl,
      'modelName': modelName,
      'discoveredModels': discoveredModels,
      'customHeaders': customHeaders,
      'timeoutSeconds': timeoutSeconds,
      'temperature': temperature,
      'maxTokens': maxTokens,
      'topP': topP,
      'stream': stream,
      'defaultSystemPrompt': defaultSystemPrompt,
      'supportsVision': supportsVision,
      'supportsFileInput': supportsFileInput,
      'allowInsecureHttp': allowInsecureHttp,
      'connectionStatus': connectionStatus.name,
      'lastTestedAt': lastTestedAt?.toIso8601String(),
      'lastError': lastError,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  factory AiProviderConfig.fromMap(Map<String, dynamic> map) {
    final statusName = map['connectionStatus'] as String? ?? 'untested';
    final status = ProviderConnectionStatus.values.firstWhere(
      (e) => e.name == statusName,
      orElse: () => ProviderConnectionStatus.untested,
    );

    final rawHeaders = map['customHeaders'];
    final parsedHeaders = <String, String>{};
    if (rawHeaders is Map) {
      for (final entry in rawHeaders.entries) {
        parsedHeaders[entry.key.toString()] = entry.value.toString();
      }
    }

    final rawModels = map['discoveredModels'];
    final parsedModels = <String>[];
    if (rawModels is List) {
      for (final item in rawModels) {
        parsedModels.add(item.toString());
      }
    }

    return AiProviderConfig(
      id: map['id'] as String? ?? '',
      name: map['name'] as String? ?? 'Custom Provider',
      baseUrl: map['baseUrl'] as String? ?? '',
      modelName: map['modelName'] as String? ?? '',
      discoveredModels: parsedModels,
      customHeaders: parsedHeaders,
      timeoutSeconds: (map['timeoutSeconds'] as num?)?.toInt() ?? 60,
      temperature: (map['temperature'] as num?)?.toDouble() ?? 0.7,
      maxTokens: (map['maxTokens'] as num?)?.toInt() ?? 2048,
      topP: (map['topP'] as num?)?.toDouble() ?? 1.0,
      stream: map['stream'] as bool? ?? true,
      defaultSystemPrompt: map['defaultSystemPrompt'] as String? ??
          'You are NOCTRA AI, a precise, thoughtful, and privacy-respecting assistant.',
      supportsVision: map['supportsVision'] as bool? ?? true,
      supportsFileInput: map['supportsFileInput'] as bool? ?? false,
      allowInsecureHttp: map['allowInsecureHttp'] as bool? ?? false,
      connectionStatus: status,
      lastTestedAt: map['lastTestedAt'] != null
          ? DateTime.tryParse(map['lastTestedAt'].toString())
          : null,
      lastError: map['lastError'] as String?,
      createdAt: map['createdAt'] != null
          ? (DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
    );
  }
}
