class UrlValidationResult {
  final bool isValid;
  final bool isInsecureHttp;
  final bool isLocalNetwork;
  final String normalizedUrl;
  final String? errorMessage;

  const UrlValidationResult({
    required this.isValid,
    required this.isInsecureHttp,
    required this.isLocalNetwork,
    required this.normalizedUrl,
    this.errorMessage,
  });
}

class UrlValidator {
  UrlValidator._();

  static UrlValidationResult validateApiBaseUrl(String rawUrl) {
    final trimmed = rawUrl.trim();
    if (trimmed.isEmpty) {
      return const UrlValidationResult(
        isValid: false,
        isInsecureHttp: false,
        isLocalNetwork: false,
        normalizedUrl: '',
        errorMessage: 'API Base URL cannot be empty.',
      );
    }

    final uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return UrlValidationResult(
        isValid: false,
        isInsecureHttp: false,
        isLocalNetwork: false,
        normalizedUrl: trimmed,
        errorMessage:
            'Enter a valid URL starting with https:// (or http:// for local servers).',
      );
    }

    final scheme = uri.scheme.toLowerCase();
    if (scheme != 'https' && scheme != 'http') {
      return UrlValidationResult(
        isValid: false,
        isInsecureHttp: false,
        isLocalNetwork: false,
        normalizedUrl: trimmed,
        errorMessage: 'Only HTTPS and HTTP protocols are supported.',
      );
    }

    final host = uri.host.toLowerCase();
    final isLocal = host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '10.0.2.2' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.endsWith('.local') ||
        _isPrivate172Range(host);

    // Normalize trailing slash
    var normalized = trimmed;
    while (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }

    return UrlValidationResult(
      isValid: true,
      isInsecureHttp: scheme == 'http',
      isLocalNetwork: isLocal,
      normalizedUrl: normalized,
    );
  }

  static bool _isPrivate172Range(String host) {
    if (!host.startsWith('172.')) return false;
    final parts = host.split('.');
    if (parts.length < 2) return false;
    final secondOctet = int.tryParse(parts[1]);
    if (secondOctet == null) return false;
    return secondOctet >= 16 && secondOctet <= 31;
  }

  /// Resolves the OpenAI-compatible chat completions URL from a user's base URL.
  static String buildChatCompletionsUrl(String baseUrl) {
    var clean = baseUrl.trim();
    while (clean.endsWith('/')) {
      clean = clean.substring(0, clean.length - 1);
    }
    if (clean.endsWith('/chat/completions')) {
      return clean;
    }
    return '$clean/chat/completions';
  }

  /// Resolves the OpenAI-compatible models discovery URL from a user's base URL.
  static String buildModelsUrl(String baseUrl) {
    var clean = baseUrl.trim();
    while (clean.endsWith('/')) {
      clean = clean.substring(0, clean.length - 1);
    }
    if (clean.endsWith('/chat/completions')) {
      clean = clean.substring(0, clean.length - '/chat/completions'.length);
    }
    if (clean.endsWith('/models')) {
      return clean;
    }
    return '$clean/models';
  }
}
