use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Resolves and verifies that a target path stays within one of the allowed root directories.
/// Prevents path traversal (`..`) and out-of-scope file access.
pub fn verify_path_within_roots(target: &Path, allowed_roots: &[PathBuf]) -> AppResult<PathBuf> {
    if allowed_roots.is_empty() {
        return Err(AppError::PermissionDenied(
            "No authorized workspace directories are configured".into(),
        ));
    }

    let candidate = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| AppError::PermissionDenied(format!("Cannot resolve path: {e}")))?
    } else {
        let parent = target.parent().ok_or_else(|| {
            AppError::PermissionDenied("Invalid path without parent directory".into())
        })?;
        let file_name = target
            .file_name()
            .ok_or_else(|| AppError::PermissionDenied("Invalid target file name".into()))?;
        let canonical_parent = if parent.exists() {
            parent
                .canonicalize()
                .map_err(|e| AppError::PermissionDenied(format!("Cannot resolve parent: {e}")))?
        } else {
            // Walk up to first existing ancestor to reject '..' escapes on non-existent subdirs
            let mut cur = parent.to_path_buf();
            let mut suffixes = Vec::new();
            while !cur.exists() {
                let name = cur.file_name().ok_or_else(|| {
                    AppError::PermissionDenied("Path escapes existing filesystem roots".into())
                })?;
                if name == ".." {
                    return Err(AppError::PermissionDenied(
                        "Relative parent traversal is not permitted".into(),
                    ));
                }
                suffixes.push(name.to_os_string());
                cur = cur
                    .parent()
                    .ok_or_else(|| AppError::PermissionDenied("Invalid ancestor".into()))?
                    .to_path_buf();
            }
            let mut base = cur
                .canonicalize()
                .map_err(|e| AppError::PermissionDenied(format!("Cannot resolve ancestor: {e}")))?;
            for seg in suffixes.into_iter().rev() {
                base.push(seg);
            }
            base
        };
        canonical_parent.join(file_name)
    };

    for root in allowed_roots {
        if let Ok(canon_root) = root.canonicalize() {
            if candidate.starts_with(&canon_root) {
                return Ok(candidate);
            }
        }
    }

    Err(AppError::PermissionDenied(format!(
        "Path '{}' is outside authorized directory boundaries",
        target.display()
    )))
}

/// Builds a filtered child process environment containing only safe OS baseline variables
/// plus explicit server-specific environment variables.
pub fn build_filtered_env(explicit_env: &HashMap<String, String>) -> HashMap<String, String> {
    let mut env = HashMap::new();
    let baseline_keys = [
        "PATH",
        "Path",
        "SYSTEMROOT",
        "SystemRoot",
        "COMSPEC",
        "ComSpec",
        "TEMP",
        "TMP",
        "HOME",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "LANG",
        "LC_ALL",
        "NODE_ENV",
    ];

    for key in baseline_keys {
        if let Ok(val) = std::env::var(key) {
            env.insert(key.to_string(), val);
        }
    }

    for (k, v) in explicit_env {
        env.insert(k.clone(), v.clone());
    }

    env
}

/// Validates an MCP stdio command executable against dangerous shell wrappers unless explicitly permitted.
pub fn validate_mcp_executable(command: &str, allow_shell_wrappers: bool) -> AppResult<()> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Executable command cannot be empty".into()));
    }
    let lower = Path::new(trimmed)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(trimmed)
        .to_ascii_lowercase();

    let shell_wrappers = ["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "sh", "bash"];
    if !allow_shell_wrappers && shell_wrappers.contains(&lower.as_str()) {
        return Err(AppError::PermissionDenied(format!(
            "Direct shell wrapper '{lower}' is blocked by sandbox policy unless explicitly allowed"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn blocks_path_traversal_outside_project_root() {
        let root = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let allowed = vec![root.path().to_path_buf()];

        let inside_file = root.path().join("notes.md");
        assert!(verify_path_within_roots(&inside_file, &allowed).is_ok());

        let escape = root.path().join("..").join("secret.txt");
        assert!(verify_path_within_roots(&escape, &allowed).is_err());

        let outside_file = outside.path().join("other.txt");
        assert!(verify_path_within_roots(&outside_file, &allowed).is_err());
    }

    #[test]
    fn filters_unrelated_parent_env_vars() {
        std::env::set_var("NOCTRA_SENSITIVE_PARENT_SECRET", "do-not-leak");
        let mut custom = HashMap::new();
        custom.insert("MCP_MODE".into(), "stdio".into());

        let filtered = build_filtered_env(&custom);
        assert_eq!(filtered.get("MCP_MODE").map(String::as_str), Some("stdio"));
        assert!(!filtered.contains_key("NOCTRA_SENSITIVE_PARENT_SECRET"));
    }

    #[test]
    fn blocks_shell_wrappers_by_default() {
        assert!(validate_mcp_executable("npx", false).is_ok());
        assert!(validate_mcp_executable("python", false).is_ok());
        assert!(validate_mcp_executable("powershell.exe", false).is_err());
        assert!(validate_mcp_executable("powershell.exe", true).is_ok());
    }
}
