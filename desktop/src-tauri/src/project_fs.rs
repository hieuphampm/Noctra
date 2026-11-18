use crate::error::{AppError, AppResult};
use crate::security::sandbox::verify_path_within_roots;
use crate::storage::models::ProjectWorkspace;
use crate::storage::Database;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTreeNode {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub children: Option<Vec<ProjectTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetadata {
    pub git_branch: Option<String>,
    pub tech_stack: Vec<String>,
    pub file_count: usize,
    pub dir_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImportResult {
    pub project: ProjectWorkspace,
    pub metadata: ProjectMetadata,
    pub reused_existing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileContent {
    pub relative_path: String,
    pub kind: String, // "text" | "image" | "binary"
    pub content: Option<String>,
    pub data_url: Option<String>,
    pub size_bytes: u64,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSearchMatch {
    pub relative_path: String,
    pub line_number: usize,
    pub line_text: String,
}

pub fn is_ignored_dir_name(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".dart_tool"
            | "__pycache__"
            | ".next"
            | ".nuxt"
            | ".turbo"
            | ".venv"
            | "venv"
            | ".gradle"
            | ".idea"
    )
}

/// Resolves a relative or absolute path and verifies it stays strictly inside `root`.
pub fn resolve_project_path(root: &Path, raw_path: &str) -> AppResult<(PathBuf, String)> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == "/" || trimmed == "\\" {
        let canon_root = root
            .canonicalize()
            .map_err(|e| AppError::NotFound(format!("Project root not accessible: {e}")))?;
        return Ok((canon_root, String::new()));
    }

    let candidate = if Path::new(trimmed).is_absolute() {
        PathBuf::from(trimmed)
    } else {
        let cleaned = trimmed.trim_start_matches(['/', '\\']);
        root.join(cleaned)
    };

    let safe = verify_path_within_roots(&candidate, &[root.to_path_buf()])?;
    let canon_root = root
        .canonicalize()
        .unwrap_or_else(|_| root.to_path_buf());
    let rel = safe
        .strip_prefix(&canon_root)
        .unwrap_or(&safe)
        .to_string_lossy()
        .replace('\\', "/");
    Ok((safe, rel))
}

/// Imports an existing folder as a ProjectWorkspace (or reuses an existing workspace pointing to the same folder).
pub fn import_project_folder(
    db: &Database,
    folder_path: &Path,
    name_override: Option<&str>,
) -> AppResult<ProjectImportResult> {
    if !folder_path.exists() {
        return Err(AppError::NotFound(format!(
            "Folder '{}' does not exist",
            folder_path.display()
        )));
    }
    if !folder_path.is_dir() {
        return Err(AppError::Validation(format!(
            "'{}' is not a directory",
            folder_path.display()
        )));
    }

    let canon_root = folder_path
        .canonicalize()
        .map_err(|e| AppError::Io(e.to_string()))?;
    // Normalize Windows extended path prefix (\\?\) for clean UI display when safe
    let display_root = strip_verbatim_prefix(&canon_root);
    let metadata = inspect_project_metadata(&canon_root);
    let now = Utc::now().to_rfc3339();

    let existing = db.list_projects()?.into_iter().find(|p| {
        Path::new(&p.root_path)
            .canonicalize()
            .map(|c| c == canon_root)
            .unwrap_or(false)
    });

    if let Some(mut proj) = existing {
        proj.updated_at = now;
        if let Some(n) = name_override.map(str::trim).filter(|s| !s.is_empty()) {
            proj.name = n.to_string();
        }
        db.upsert_project(&proj)?;
        db.log_event(
            "project",
            "info",
            &format!("Opened imported project '{}'", proj.name),
            Some(&proj.root_path),
        );
        return Ok(ProjectImportResult {
            project: proj,
            metadata,
            reused_existing: true,
        });
    }

    let folder_name = canon_root
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Imported Project");
    let final_name = name_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(folder_name)
        .to_string();

    let mut default_agents = Vec::new();
    if let Ok(agents) = db.list_agents() {
        for candidate in ["tpl-coding", "tpl-files"] {
            if agents.iter().any(|a| a.id == candidate) {
                default_agents.push(candidate.to_string());
            }
        }
    }

    let stack_desc = if metadata.tech_stack.is_empty() {
        "Local folder workspace".to_string()
    } else {
        format!("Detected stack: {}", metadata.tech_stack.join(", "))
    };

    let proj = ProjectWorkspace {
        id: Uuid::new_v4().to_string(),
        name: final_name,
        description: stack_desc,
        root_path: display_root,
        instructions: String::new(),
        assigned_agent_ids: default_agents,
        assigned_skill_ids: vec![],
        allowed_tool_ids: vec![],
        created_at: now.clone(),
        updated_at: now,
    };

    db.upsert_project(&proj)?;
    db.log_event(
        "project",
        "info",
        &format!("Imported project folder '{}'", proj.name),
        Some(&proj.root_path),
    );

    Ok(ProjectImportResult {
        project: proj,
        metadata,
        reused_existing: false,
    })
}

fn strip_verbatim_prefix(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    #[cfg(windows)]
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    s
}

pub fn inspect_project_metadata(root: &Path) -> ProjectMetadata {
    let git_branch = read_git_branch(root);
    let mut stack = Vec::new();
    let markers: &[(&str, &str)] = &[
        ("package.json", "Node.js"),
        ("tsconfig.json", "TypeScript"),
        ("Cargo.toml", "Rust"),
        ("pubspec.yaml", "Flutter / Dart"),
        ("pyproject.toml", "Python"),
        ("requirements.txt", "Python"),
        ("go.mod", "Go"),
        ("pom.xml", "Java / Maven"),
        ("build.gradle", "Gradle"),
        ("src-tauri/tauri.conf.json", "Tauri"),
        ("tauri.conf.json", "Tauri"),
        ("vite.config.ts", "Vite"),
        ("vite.config.js", "Vite"),
    ];
    let mut seen = HashSet::new();
    for (file, label) in markers {
        if root.join(file).exists() && seen.insert(*label) {
            stack.push((*label).to_string());
        }
    }

    let mut file_count = 0usize;
    let mut dir_count = 0usize;
    count_entries(root, 0, 8, &mut file_count, &mut dir_count);

    ProjectMetadata {
        git_branch,
        tech_stack: stack,
        file_count,
        dir_count,
    }
}

fn read_git_branch(root: &Path) -> Option<String> {
    let head = fs::read_to_string(root.join(".git").join("HEAD")).ok()?;
    let trimmed = head.trim();
    if let Some(branch) = trimmed.strip_prefix("ref: refs/heads/") {
        return Some(branch.to_string());
    }
    if trimmed.len() >= 7 {
        return Some(trimmed[..7].to_string());
    }
    None
}

fn count_entries(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    files: &mut usize,
    dirs: &mut usize,
) {
    if depth > max_depth || (*files + *dirs) > 8000 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            if is_ignored_dir_name(&name) {
                continue;
            }
            *dirs += 1;
            count_entries(&entry.path(), depth + 1, max_depth, files, dirs);
        } else {
            *files += 1;
        }
    }
}

pub fn get_project_tree(
    root: &Path,
    include_ignored: bool,
    max_depth: usize,
) -> AppResult<Vec<ProjectTreeNode>> {
    if !root.exists() || !root.is_dir() {
        return Err(AppError::NotFound(format!(
            "Project root '{}' not found",
            root.display()
        )));
    }
    let canon_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let mut budget = 6000usize;
    build_tree_dir(&canon_root, &canon_root, include_ignored, 0, max_depth, &mut budget)
}

fn build_tree_dir(
    root: &Path,
    dir: &Path,
    include_ignored: bool,
    depth: usize,
    max_depth: usize,
    budget: &mut usize,
) -> AppResult<Vec<ProjectTreeNode>> {
    if depth > max_depth || *budget == 0 {
        return Ok(vec![]);
    }
    let mut nodes = Vec::new();
    let rd = fs::read_dir(dir)?;
    for entry in rd {
        if *budget == 0 {
            break;
        }
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_dir = meta.is_dir();
        if is_dir && !include_ignored && is_ignored_dir_name(&name) {
            continue;
        }
        *budget -= 1;
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let children = if is_dir && depth < max_depth {
            Some(build_tree_dir(
                root,
                &path,
                include_ignored,
                depth + 1,
                max_depth,
                budget,
            )?)
        } else if is_dir {
            Some(vec![])
        } else {
            None
        };
        nodes.push(ProjectTreeNode {
            name,
            relative_path: rel,
            is_dir,
            size_bytes: if is_dir { 0 } else { meta.len() },
            children,
        });
    }

    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(nodes)
}

pub fn read_project_file_rich(root: &Path, relative_path: &str) -> AppResult<ProjectFileContent> {
    let (safe, rel) = resolve_project_path(root, relative_path)?;
    if !safe.exists() || !safe.is_file() {
        return Err(AppError::NotFound(format!("File '{rel}' not found")));
    }
    let meta = fs::metadata(&safe)?;
    let size_bytes = meta.len();
    let ext = safe
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let language = detect_language(&safe, &ext);

    let image_mime = match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        _ => None,
    };

    if let Some(mime) = image_mime {
        if size_bytes <= 10 * 1024 * 1024 {
            let bytes = fs::read(&safe)?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
            return Ok(ProjectFileContent {
                relative_path: rel,
                kind: "image".into(),
                content: None,
                data_url: Some(format!("data:{mime};base64,{b64}")),
                size_bytes,
                language: "image".into(),
            });
        }
    }

    if size_bytes > 4 * 1024 * 1024 {
        return Ok(ProjectFileContent {
            relative_path: rel,
            kind: "binary".into(),
            content: None,
            data_url: None,
            size_bytes,
            language,
        });
    }

    let bytes = fs::read(&safe)?;
    match String::from_utf8(bytes) {
        Ok(text) => Ok(ProjectFileContent {
            relative_path: rel,
            kind: "text".into(),
            content: Some(text),
            data_url: None,
            size_bytes,
            language,
        }),
        Err(_) => Ok(ProjectFileContent {
            relative_path: rel,
            kind: "binary".into(),
            content: None,
            data_url: None,
            size_bytes,
            language,
        }),
    }
}

fn detect_language(path: &Path, ext: &str) -> String {
    let fname = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if fname == "dockerfile" {
        return "dockerfile".into();
    }
    match ext {
        "ts" | "tsx" => "typescript".into(),
        "js" | "jsx" | "mjs" | "cjs" => "javascript".into(),
        "rs" => "rust".into(),
        "dart" => "dart".into(),
        "py" => "python".into(),
        "go" => "go".into(),
        "json" => "json".into(),
        "yaml" | "yml" => "yaml".into(),
        "toml" => "toml".into(),
        "md" | "mdx" => "markdown".into(),
        "css" | "scss" => "css".into(),
        "html" | "htm" => "html".into(),
        "sql" => "sql".into(),
        "sh" | "bash" | "ps1" => "shell".into(),
        _ => "plaintext".into(),
    }
}

pub fn create_project_dir(root: &Path, relative_path: &str) -> AppResult<()> {
    let (safe, _) = resolve_project_path(root, relative_path)?;
    fs::create_dir_all(safe)?;
    Ok(())
}

pub fn rename_project_entry(root: &Path, from_rel: &str, to_rel: &str) -> AppResult<()> {
    let (from_safe, _) = resolve_project_path(root, from_rel)?;
    if !from_safe.exists() {
        return Err(AppError::NotFound(format!("Source '{from_rel}' not found")));
    }
    let (to_safe, _) = resolve_project_path(root, to_rel)?;
    if to_safe.exists() {
        return Err(AppError::Validation(format!(
            "Destination '{to_rel}' already exists"
        )));
    }
    if let Some(parent) = to_safe.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(from_safe, to_safe)?;
    Ok(())
}

pub fn search_project_files(
    root: &Path,
    query: &str,
    case_sensitive: bool,
    max_results: usize,
) -> AppResult<Vec<ProjectSearchMatch>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    let canon_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let needle = if case_sensitive {
        trimmed.to_string()
    } else {
        trimmed.to_lowercase()
    };
    let mut matches = Vec::new();
    search_dir_recursive(
        &canon_root,
        &canon_root,
        &needle,
        case_sensitive,
        max_results,
        0,
        &mut matches,
    )?;
    Ok(matches)
}

fn search_dir_recursive(
    root: &Path,
    dir: &Path,
    needle: &str,
    case_sensitive: bool,
    max_results: usize,
    depth: usize,
    out: &mut Vec<ProjectSearchMatch>,
) -> AppResult<()> {
    if depth > 12 || out.len() >= max_results {
        return Ok(());
    }
    let Ok(rd) = fs::read_dir(dir) else {
        return Ok(());
    };
    let mut entries: Vec<_> = rd.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        if out.len() >= max_results {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let path = entry.path();
        if meta.is_dir() {
            if is_ignored_dir_name(&name) {
                continue;
            }
            search_dir_recursive(root, &path, needle, case_sensitive, max_results, depth + 1, out)?;
        } else if meta.is_file() && meta.len() <= 1024 * 1024 {
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            let Ok(text) = String::from_utf8(bytes) else {
                continue;
            };
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            for (idx, line) in text.lines().enumerate() {
                let hit = if case_sensitive {
                    line.contains(needle)
                } else {
                    line.to_lowercase().contains(needle)
                };
                if hit {
                    out.push(ProjectSearchMatch {
                        relative_path: rel.clone(),
                        line_number: idx + 1,
                        line_text: line.chars().take(240).collect(),
                    });
                    if out.len() >= max_results {
                        break;
                    }
                }
            }
        }
    }
    Ok(())
}

/// Computes a concise, human-readable line diff for Review mode approval previews.
pub fn compute_unified_diff(rel_path: &str, old_text: &str, new_text: &str) -> String {
    if old_text == new_text {
        return format!("--- a/{rel_path}\n+++ b/{rel_path}\n(no changes)");
    }

    let old_lines: Vec<&str> = old_text.lines().collect();
    let new_lines: Vec<&str> = new_text.lines().collect();

    let mut prefix = 0usize;
    while prefix < old_lines.len()
        && prefix < new_lines.len()
        && old_lines[prefix] == new_lines[prefix]
    {
        prefix += 1;
    }

    let mut suffix = 0usize;
    while suffix + prefix < old_lines.len()
        && suffix + prefix < new_lines.len()
        && old_lines[old_lines.len() - 1 - suffix] == new_lines[new_lines.len() - 1 - suffix]
    {
        suffix += 1;
    }

    let ctx_before = prefix.saturating_sub(2);
    let old_end = old_lines.len().saturating_sub(suffix);
    let new_end = new_lines.len().saturating_sub(suffix);
    let ctx_after_end = (old_end + 2).min(old_lines.len());

    let mut out = Vec::new();
    out.push(format!("--- a/{rel_path}"));
    out.push(format!("+++ b/{rel_path}"));
    out.push(format!(
        "@@ -{},{} +{},{} @@",
        ctx_before + 1,
        (old_end - ctx_before) + (ctx_after_end - old_end),
        ctx_before + 1,
        (new_end - ctx_before) + (ctx_after_end - old_end)
    ));

    for line in &old_lines[ctx_before..prefix] {
        out.push(format!(" {line}"));
    }
    for line in &old_lines[prefix..old_end] {
        out.push(format!("-{line}"));
    }
    for line in &new_lines[prefix..new_end] {
        out.push(format!("+{line}"));
    }
    for line in &old_lines[old_end..ctx_after_end] {
        out.push(format!(" {line}"));
    }

    let joined = out.join("\n");
    if joined.len() > 6000 {
        let truncated: String = joined.chars().take(6000).collect();
        format!("{truncated}\n... (diff truncated)")
    } else {
        joined
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::redaction::SecretRedactor;
    use std::sync::Arc;
    use tempfile::TempDir;

    #[test]
    fn imports_folder_inspects_stack_and_prevents_duplicates() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("demo-app");
        fs::create_dir_all(proj_dir.join("src")).unwrap();
        fs::create_dir_all(proj_dir.join("node_modules/pkg")).unwrap();
        fs::write(proj_dir.join("package.json"), r#"{"name":"demo-app"}"#).unwrap();
        fs::write(proj_dir.join("tsconfig.json"), "{}").unwrap();
        fs::write(proj_dir.join("src/index.ts"), "export const hello = 'world';\n").unwrap();
        fs::write(proj_dir.join("node_modules/pkg/index.js"), "ignored").unwrap();

        let db = Database::open_in_memory(dir.path().to_path_buf(), Arc::new(SecretRedactor::new())).unwrap();

        let first = import_project_folder(&db, &proj_dir, None).unwrap();
        assert!(!first.reused_existing);
        assert_eq!(first.project.name, "demo-app");
        assert!(first.metadata.tech_stack.contains(&"Node.js".to_string()));
        assert!(first.metadata.tech_stack.contains(&"TypeScript".to_string()));
        assert_eq!(first.metadata.file_count, 3); // node_modules excluded

        let second = import_project_folder(&db, &proj_dir, None).unwrap();
        assert!(second.reused_existing);
        assert_eq!(second.project.id, first.project.id);
    }

    #[test]
    fn tree_search_rename_and_diff_respect_sandbox() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("workspace");
        fs::create_dir_all(proj_dir.join("src")).unwrap();
        fs::write(proj_dir.join("src/app.rs"), "fn main() {\n    println!(\"hello\");\n}\n").unwrap();

        let tree = get_project_tree(&proj_dir, false, 6).unwrap();
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].name, "src");
        assert_eq!(tree[0].children.as_ref().unwrap()[0].relative_path, "src/app.rs");

        let hits = search_project_files(&proj_dir, "println", false, 50).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line_number, 2);

        rename_project_entry(&proj_dir, "src/app.rs", "src/main.rs").unwrap();
        assert!(proj_dir.join("src/main.rs").exists());
        assert!(rename_project_entry(&proj_dir, "src/main.rs", "../escape.rs").is_err());

        let diff = compute_unified_diff("src/main.rs", "line1\nold\nline3", "line1\nnew\nline3");
        assert!(diff.contains("-old"));
        assert!(diff.contains("+new"));
    }
}
