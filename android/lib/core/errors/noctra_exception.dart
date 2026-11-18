enum NoctraErrorType {
  invalidApiKey,
  unauthorized,
  modelNotFound,
  invalidEndpoint,
  rateLimitExceeded,
  insufficientQuota,
  networkUnavailable,
  requestTimeout,
  malformedResponse,
  unsupportedImageInput,
  unsupportedFileFormat,
  emptyResponse,
  streamInterrupted,
  cancelledByUser,
  insecureHttpBlocked,
  providerError,
  unknown,
}

class NoctraException implements Exception {
  final NoctraErrorType type;
  final String userMessage;
  final String? technicalDetails;
  final int? statusCode;

  const NoctraException({
    required this.type,
    required this.userMessage,
    this.technicalDetails,
    this.statusCode,
  });

  bool get isRetryable =>
      type == NoctraErrorType.networkUnavailable ||
      type == NoctraErrorType.requestTimeout ||
      type == NoctraErrorType.rateLimitExceeded ||
      type == NoctraErrorType.streamInterrupted ||
      type == NoctraErrorType.providerError;

  String get title {
    switch (type) {
      case NoctraErrorType.invalidApiKey:
        return 'Invalid API Key';
      case NoctraErrorType.unauthorized:
        return 'Authentication Failed';
      case NoctraErrorType.modelNotFound:
        return 'Model Not Found';
      case NoctraErrorType.invalidEndpoint:
        return 'Invalid API Endpoint';
      case NoctraErrorType.rateLimitExceeded:
        return 'Rate Limit Reached';
      case NoctraErrorType.insufficientQuota:
        return 'Insufficient Quota';
      case NoctraErrorType.networkUnavailable:
        return 'Network Unavailable';
      case NoctraErrorType.requestTimeout:
        return 'Request Timed Out';
      case NoctraErrorType.malformedResponse:
        return 'Malformed API Response';
      case NoctraErrorType.unsupportedImageInput:
        return 'Vision Input Unsupported';
      case NoctraErrorType.unsupportedFileFormat:
        return 'Unsupported Attachment';
      case NoctraErrorType.emptyResponse:
        return 'Empty Model Response';
      case NoctraErrorType.streamInterrupted:
        return 'Stream Interrupted';
      case NoctraErrorType.cancelledByUser:
        return 'Generation Stopped';
      case NoctraErrorType.insecureHttpBlocked:
        return 'Insecure HTTP Endpoint';
      case NoctraErrorType.providerError:
        return 'Provider API Error';
      case NoctraErrorType.unknown:
        return 'Unexpected Error';
    }
  }

  @override
  String toString() => 'NoctraException($type): $userMessage';
}
