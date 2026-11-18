use crate::error::{AppError, AppResult};
use crate::security::redaction::SecretRedactor;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

const KEYRING_SERVICE: &str = "noctra-studio";

/// Abstraction over OS-native credential storage (Windows Credential Manager,
/// macOS Keychain, Linux Secret Service) with an isolated in-memory backend for tests.
pub struct CredentialStore {
    backend: CredentialBackend,
    redactor: Arc<SecretRedactor>,
}

enum CredentialBackend {
    OsKeyring,
    InMemory(RwLock<HashMap<String, String>>),
}

impl CredentialStore {
    pub fn new_os(redactor: Arc<SecretRedactor>) -> Self {
        Self {
            backend: CredentialBackend::OsKeyring,
            redactor,
        }
    }

    pub fn new_in_memory(redactor: Arc<SecretRedactor>) -> Self {
        Self {
            backend: CredentialBackend::InMemory(RwLock::new(HashMap::new())),
            redactor,
        }
    }

    pub fn set_secret(&self, key: &str, value: &str) -> AppResult<()> {
        if key.trim().is_empty() {
            return Err(AppError::Validation("Credential key cannot be empty".into()));
        }
        self.redactor.register_secret(value);
        match &self.backend {
            CredentialBackend::OsKeyring => {
                let entry = keyring::Entry::new(KEYRING_SERVICE, key)
                    .map_err(|e| AppError::Credential(e.to_string()))?;
                entry
                    .set_password(value)
                    .map_err(|e| AppError::Credential(e.to_string()))
            }
            CredentialBackend::InMemory(map) => {
                let mut guard = map
                    .write()
                    .map_err(|_| AppError::Credential("Credential lock poisoned".into()))?;
                guard.insert(key.to_string(), value.to_string());
                Ok(())
            }
        }
    }

    pub fn get_secret(&self, key: &str) -> AppResult<Option<String>> {
        match &self.backend {
            CredentialBackend::OsKeyring => {
                let entry = keyring::Entry::new(KEYRING_SERVICE, key)
                    .map_err(|e| AppError::Credential(e.to_string()))?;
                match entry.get_password() {
                    Ok(val) => {
                        self.redactor.register_secret(&val);
                        Ok(Some(val))
                    }
                    Err(keyring::Error::NoEntry) => Ok(None),
                    Err(e) => Err(AppError::Credential(e.to_string())),
                }
            }
            CredentialBackend::InMemory(map) => {
                let guard = map
                    .read()
                    .map_err(|_| AppError::Credential("Credential lock poisoned".into()))?;
                Ok(guard.get(key).cloned())
            }
        }
    }

    pub fn delete_secret(&self, key: &str) -> AppResult<()> {
        match &self.backend {
            CredentialBackend::OsKeyring => {
                let entry = keyring::Entry::new(KEYRING_SERVICE, key)
                    .map_err(|e| AppError::Credential(e.to_string()))?;
                match entry.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                    Err(e) => Err(AppError::Credential(e.to_string())),
                }
            }
            CredentialBackend::InMemory(map) => {
                let mut guard = map
                    .write()
                    .map_err(|_| AppError::Credential("Credential lock poisoned".into()))?;
                if let Some(old) = guard.remove(key) {
                    self.redactor.unregister_secret(&old);
                }
                Ok(())
            }
        }
    }

    pub fn has_secret(&self, key: &str) -> bool {
        matches!(self.get_secret(key), Ok(Some(v)) if !v.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_reads_and_deletes_in_memory() {
        let redactor = Arc::new(SecretRedactor::new());
        let store = CredentialStore::new_in_memory(redactor.clone());

        store.set_secret("provider:test-1", "sk-secret-abc123").unwrap();
        assert_eq!(
            store.get_secret("provider:test-1").unwrap().as_deref(),
            Some("sk-secret-abc123")
        );
        assert!(store.has_secret("provider:test-1"));
        assert_eq!(redactor.redact("key=sk-secret-abc123"), "key=[REDACTED]");

        store.delete_secret("provider:test-1").unwrap();
        assert!(!store.has_secret("provider:test-1"));
    }
}
