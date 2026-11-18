import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/constants/app_constants.dart';

abstract class SecureCredentialStore {
  Future<void> writeApiKey(String providerId, String apiKey);
  Future<String?> readApiKey(String providerId);
  Future<void> deleteApiKey(String providerId);
  Future<void> deleteAllCredentials();
}

/// Android Keystore-backed implementation using FlutterSecureStorage.
/// Never logs or exposes API keys to plain-text storage.
class KeystoreSecureCredentialStore implements SecureCredentialStore {
  final FlutterSecureStorage _storage;

  KeystoreSecureCredentialStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                resetOnError: true,
              ),
            );

  String _keyForProvider(String providerId) =>
      '${AppConstants.secureApiKeyPrefix}$providerId';

  @override
  Future<void> writeApiKey(String providerId, String apiKey) async {
    final trimmed = apiKey.trim();
    if (trimmed.isEmpty) {
      await deleteApiKey(providerId);
      return;
    }
    await _storage.write(
      key: _keyForProvider(providerId),
      value: trimmed,
    );
  }

  @override
  Future<String?> readApiKey(String providerId) async {
    return _storage.read(key: _keyForProvider(providerId));
  }

  @override
  Future<void> deleteApiKey(String providerId) async {
    await _storage.delete(key: _keyForProvider(providerId));
  }

  @override
  Future<void> deleteAllCredentials() async {
    await _storage.deleteAll();
  }
}

/// In-memory implementation strictly for unit/widget testing so tests never require platform channels.
class InMemorySecureCredentialStore implements SecureCredentialStore {
  final Map<String, String> _vault = {};

  @override
  Future<void> writeApiKey(String providerId, String apiKey) async {
    final trimmed = apiKey.trim();
    if (trimmed.isEmpty) {
      _vault.remove(providerId);
    } else {
      _vault[providerId] = trimmed;
    }
  }

  @override
  Future<String?> readApiKey(String providerId) async => _vault[providerId];

  @override
  Future<void> deleteApiKey(String providerId) async {
    _vault.remove(providerId);
  }

  @override
  Future<void> deleteAllCredentials() async {
    _vault.clear();
  }
}
