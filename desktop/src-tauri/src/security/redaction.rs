use regex::Regex;
use std::collections::HashSet;
use std::sync::{OnceLock, RwLock};

/// Thread-safe secret redaction engine.
/// Registers runtime secret values and scrubs common credential token patterns
/// before any log, error, or telemetry-free local audit record is saved or emitted.
pub struct SecretRedactor {
    secrets: RwLock<HashSet<String>>,
}

impl SecretRedactor {
    pub fn new() -> Self {
        Self {
            secrets: RwLock::new(HashSet::new()),
        }
    }

    pub fn register_secret(&self, secret: &str) {
        let trimmed = secret.trim();
        if trimmed.len() >= 4 {
            if let Ok(mut guard) = self.secrets.write() {
                guard.insert(trimmed.to_string());
            }
        }
    }

    pub fn unregister_secret(&self, secret: &str) {
        let trimmed = secret.trim();
        if let Ok(mut guard) = self.secrets.write() {
            guard.remove(trimmed);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.secrets.write() {
            guard.clear();
        }
    }

    pub fn redact(&self, input: &str) -> String {
        let mut output = input.to_string();

        if let Ok(guard) = self.secrets.read() {
            let mut sorted: Vec<&String> = guard.iter().collect();
            sorted.sort_by(|a, b| b.len().cmp(&a.len()));
            for secret in sorted {
                if !secret.is_empty() && output.contains(secret.as_str()) {
                    output = output.replace(secret.as_str(), "[REDACTED]");
                }
            }
        }

        for re in pattern_regexes() {
            output = re
                .replace_all(&output, |caps: &regex::Captures| {
                    if caps.len() >= 2 {
                        let prefix = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                        format!("{prefix}[REDACTED]")
                    } else {
                        "[REDACTED]".to_string()
                    }
                })
                .into_owned();
        }

        output
    }
}

impl Default for SecretRedactor {
    fn default() -> Self {
        Self::new()
    }
}

fn pattern_regexes() -> &'static Vec<Regex> {
    static REGEXES: OnceLock<Vec<Regex>> = OnceLock::new();
    REGEXES.get_or_init(|| {
        vec![
            Regex::new(r"(?i)(Bearer\s+)[A-Za-z0-9\-._~+/]+=*").unwrap(),
            Regex::new(r"(?i)(Authorization:\s*(?:Bearer|Basic|Token)\s+)[^\s\r\n]+").unwrap(),
            Regex::new(r"(?i)((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s,;'\x22]+").unwrap(),
            Regex::new(r"sk-[A-Za-z0-9_-]{12,}").unwrap(),
            Regex::new(r"gh[pousr]_[A-Za-z0-9]{16,}").unwrap(),
            Regex::new(r"xox[baprs]-[A-Za-z0-9-]{10,}").unwrap(),
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_registered_and_pattern_secrets() {
        let redactor = SecretRedactor::new();
        redactor.register_secret("my-super-secret-value-991");

        let raw = "Connecting with Bearer abc123def456 and key my-super-secret-value-991 or sk-proj-1234567890abcdef";
        let scrubbed = redactor.redact(raw);

        assert!(!scrubbed.contains("abc123def456"));
        assert!(!scrubbed.contains("my-super-secret-value-991"));
        assert!(!scrubbed.contains("sk-proj-1234567890abcdef"));
        assert!(scrubbed.contains("[REDACTED]"));
    }
}
