use crate::error::{AppError, AppResult};
use crate::security::sandbox::verify_path_within_roots;
use crate::storage::models::{SkillRecord, SkillSupportingFile};
use crate::storage::Database;
use chrono::Utc;
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSkillMd {
    pub name: String,
    pub description: String,
    pub category: String,
    pub version: String,
    pub dependencies: Vec<String>,
    pub frontmatter: serde_json::Value,
    pub instructions_md: String,
    pub validation_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSkillPreview {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub commit_sha: Option<String>,
    pub subdirectory: String,
    pub skill_name: String,
    pub description: String,
    pub skill_md_raw: String,
    pub required_files: Vec<String>,
    pub has_scripts: bool,
    pub validation_errors: Vec<String>,
    pub trust_warning: String,
}

pub fn parse_skill_md(raw: &str) -> ParsedSkillMd {
    let trimmed = raw.trim_start();
    let mut errors = Vec::new();
    let mut frontmatter = serde_json::json!({});
    let mut instructions_md = raw.to_string();

    if let Some(after_open) = trimmed.strip_prefix("---") {
        if let Some(end_idx) = after_open.find("\n---") {
            let yaml_block = after_open[..end_idx].trim();
            let body = after_open[end_idx + 4..].trim_start_matches(['\r', '\n']);
            instructions_md = body.to_string();
            match serde_yaml::from_str::<serde_json::Value>(yaml_block) {
                Ok(val) => frontmatter = val,
                Err(e) => errors.push(format!("Invalid YAML frontmatter: {e}")),
            }
        } else {
            errors.push("Unclosed YAML frontmatter delimiter '---'".into());
        }
    } else {
        errors.push("Missing YAML frontmatter block starting with '---'".into());
    }

    let name = frontmatter
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if name.is_empty() {
        errors.push("YAML frontmatter must define a non-empty 'name'".into());
    }

    let description = frontmatter
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if description.is_empty() {
        errors.push("YAML frontmatter must define a 'description'".into());
    }

    let category = frontmatter
        .get("category")
        .and_then(|v| v.as_str())
        .unwrap_or("general")
        .trim()
        .to_string();

    let version = frontmatter
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.1.0")
        .trim()
        .to_string();

    let dependencies = frontmatter
        .get("dependencies")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if instructions_md.trim().is_empty() {
        errors.push("SKILL.md instructions body is empty".into());
    }

    ParsedSkillMd {
        name: if name.is_empty() { "unnamed-skill".into() } else { name },
        description,
        category,
        version,
        dependencies,
        frontmatter,
        instructions_md,
        validation_errors: errors,
    }
}

pub fn slugify(name: &str) -> String {
    let s: String = name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = s.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("skill-{}", &Uuid::new_v4().to_string()[..8])
    } else {
        trimmed
    }
}

pub fn scan_supporting_files(skill_dir: &Path) -> Vec<SkillSupportingFile> {
    let mut files = Vec::new();
    fn walk(base: &Path, cur: &Path, out: &mut Vec<SkillSupportingFile>) {
        let Ok(entries) = std::fs::read_dir(cur) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(base, &path, out);
            } else if let Ok(rel) = path.strip_prefix(base) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if rel_str.eq_ignore_ascii_case("SKILL.md") {
                    continue;
                }
                let kind = if rel_str.starts_with("references/") {
                    "reference"
                } else if rel_str.starts_with("scripts/") {
                    "script"
                } else if rel_str.starts_with("assets/") {
                    "asset"
                } else {
                    "other"
                };
                let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(SkillSupportingFile {
                    relative_path: rel_str,
                    kind: kind.into(),
                    size_bytes,
                });
            }
        }
    }
    walk(skill_dir, skill_dir, &mut files);
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    files
}

pub fn import_local_skill_folder(db: &Database, source_dir: &Path) -> AppResult<SkillRecord> {
    let skill_md_path = source_dir.join("SKILL.md");
    if !skill_md_path.exists() {
        return Err(AppError::Skill(format!(
            "Folder '{}' does not contain a SKILL.md file",
            source_dir.display()
        )));
    }
    let raw = std::fs::read_to_string(&skill_md_path)?;
    let parsed = parse_skill_md(&raw);
    let slug = slugify(&parsed.name);
    let dest = db.skills_dir().join(&slug);
    if dest != source_dir {
        copy_dir_recursive(source_dir, &dest)?;
    }

    let now = Utc::now().to_rfc3339();
    let record = SkillRecord {
        id: Uuid::new_v4().to_string(),
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        source_type: "local".into(),
        source_url: Some(source_dir.to_string_lossy().to_string()),
        branch_or_tag: None,
        subdirectory: None,
        commit_sha: None,
        version: parsed.version,
        local_path: dest.to_string_lossy().to_string(),
        enabled: true,
        trust_level: "trusted".into(),
        frontmatter: parsed.frontmatter,
        instructions_md: raw,
        dependencies: parsed.dependencies,
        supporting_files: scan_supporting_files(&dest),
        validation_errors: parsed.validation_errors,
        created_at: now.clone(),
        updated_at: now,
    };
    db.upsert_skill(&record)?;
    db.log_event("skill", "info", &format!("Imported local skill '{}'", record.name), None);
    Ok(record)
}

pub fn import_zip_skill(db: &Database, zip_path: &Path) -> AppResult<SkillRecord> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Skill(format!("Invalid ZIP package: {e}")))?;

    let tmp_dir = db.data_dir.join("tmp_skill_extract").join(Uuid::new_v4().to_string());
    std::fs::create_dir_all(&tmp_dir)?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Skill(format!("ZIP read error: {e}")))?;
        let Some(rel_path) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out_path = tmp_dir.join(&rel_path);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            std::fs::write(&out_path, buf)?;
        }
    }

    let skill_root = find_skill_root(&tmp_dir).ok_or_else(|| {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        AppError::Skill("ZIP archive does not contain a SKILL.md definition".into())
    })?;

    let mut record = import_local_skill_folder(db, &skill_root)?;
    record.source_type = "zip".into();
    record.source_url = Some(zip_path.to_string_lossy().to_string());
    record.trust_level = "unverified".into();
    db.upsert_skill(&record)?;
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(record)
}

fn find_skill_root(dir: &Path) -> Option<PathBuf> {
    if dir.join("SKILL.md").exists() {
        return Some(dir.to_path_buf());
    }
    let entries = std::fs::read_dir(dir).ok()?;
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if let Some(found) = find_skill_root(&p) {
                return Some(found);
            }
        }
    }
    None
}

pub fn create_or_save_skill(
    db: &Database,
    existing_id: Option<String>,
    raw_skill_md: String,
    source_type: Option<String>,
) -> AppResult<SkillRecord> {
    let parsed = parse_skill_md(&raw_skill_md);
    let now = Utc::now().to_rfc3339();

    if let Some(id) = existing_id {
        let mut rec = db
            .get_skill(&id)?
            .ok_or_else(|| AppError::NotFound(format!("Skill '{id}' not found")))?;
        let dir = PathBuf::from(&rec.local_path);
        std::fs::create_dir_all(&dir)?;
        std::fs::write(dir.join("SKILL.md"), &raw_skill_md)?;
        rec.name = parsed.name;
        rec.description = parsed.description;
        rec.category = parsed.category;
        rec.version = parsed.version;
        rec.frontmatter = parsed.frontmatter;
        rec.instructions_md = raw_skill_md;
        rec.dependencies = parsed.dependencies;
        rec.supporting_files = scan_supporting_files(&dir);
        rec.validation_errors = parsed.validation_errors;
        rec.updated_at = now;
        db.upsert_skill(&rec)?;
        return Ok(rec);
    }

    let slug = slugify(&parsed.name);
    let dir = db.skills_dir().join(&slug);
    std::fs::create_dir_all(&dir)?;
    std::fs::create_dir_all(dir.join("references"))?;
    std::fs::create_dir_all(dir.join("assets"))?;
    std::fs::write(dir.join("SKILL.md"), &raw_skill_md)?;

    let rec = SkillRecord {
        id: Uuid::new_v4().to_string(),
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        source_type: source_type.unwrap_or_else(|| "custom".into()),
        source_url: None,
        branch_or_tag: None,
        subdirectory: None,
        commit_sha: None,
        version: parsed.version,
        local_path: dir.to_string_lossy().to_string(),
        enabled: true,
        trust_level: "trusted".into(),
        frontmatter: parsed.frontmatter,
        instructions_md: raw_skill_md,
        dependencies: parsed.dependencies,
        supporting_files: scan_supporting_files(&dir),
        validation_errors: parsed.validation_errors,
        created_at: now.clone(),
        updated_at: now,
    };
    db.upsert_skill(&rec)?;
    Ok(rec)
}

pub fn read_skill_file(db: &Database, skill_id: &str, relative_path: &str) -> AppResult<String> {
    let skill = db
        .get_skill(skill_id)?
        .ok_or_else(|| AppError::NotFound(format!("Skill '{skill_id}' not found")))?;
    let root = PathBuf::from(&skill.local_path);
    let target = root.join(relative_path);
    let safe_path = verify_path_within_roots(&target, &[root])?;
    Ok(std::fs::read_to_string(safe_path)?)
}

pub fn write_skill_file(
    db: &Database,
    skill_id: &str,
    relative_path: &str,
    content: &str,
) -> AppResult<SkillRecord> {
    let mut skill = db
        .get_skill(skill_id)?
        .ok_or_else(|| AppError::NotFound(format!("Skill '{skill_id}' not found")))?;
    let root = PathBuf::from(&skill.local_path);
    let target = root.join(relative_path);
    let safe_path = verify_path_within_roots(&target, &[root.clone()])?;
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&safe_path, content)?;
    skill.supporting_files = scan_supporting_files(&root);
    skill.updated_at = Utc::now().to_rfc3339();
    db.upsert_skill(&skill)?;
    Ok(skill)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedGitHubUrl {
    pub owner: String,
    pub repo: String,
    pub branch: Option<String>,
    pub subdir: Option<String>,
    pub tail_segments: Vec<String>,
    pub raw_direct_url: Option<String>,
}

fn decode_percent(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn strip_skill_md_suffix(segments: &[String]) -> Option<String> {
    let mut trimmed = segments.to_vec();
    if trimmed
        .last()
        .is_some_and(|s| s.eq_ignore_ascii_case("SKILL.md"))
    {
        trimmed.pop();
    }
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.join("/"))
    }
}

pub fn parse_github_source_url(raw_url: &str) -> AppResult<ParsedGitHubUrl> {
    let trimmed = raw_url.trim();
    let normalized = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    let parsed = url::Url::parse(&normalized)
        .map_err(|e| AppError::Validation(format!("Invalid GitHub URL: {e}")))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::Validation("GitHub URL is missing a host".into()))?
        .to_ascii_lowercase();

    let segments: Vec<String> = parsed
        .path_segments()
        .map(|s| {
            s.filter(|p| !p.is_empty())
                .map(decode_percent)
                .collect()
        })
        .unwrap_or_default();

    // Case 1: raw.githubusercontent.com/{owner}/{repo}/{branch|refs/heads/...}/{...path}
    if host == "raw.githubusercontent.com" {
        if segments.len() < 4 {
            return Err(AppError::Validation(
                "Raw GitHub URL must include owner, repo, branch, and file path".into(),
            ));
        }
        let owner = segments[0].clone();
        let repo = segments[1].trim_end_matches(".git").to_string();
        let mut idx = 2usize;
        if segments.get(idx).map(String::as_str) == Some("refs")
            && matches!(
                segments.get(idx + 1).map(String::as_str),
                Some("heads") | Some("tags")
            )
            && segments.len() > idx + 2
        {
            idx += 2;
        }
        let branch = Some(segments[idx].clone());
        let tail_segments = segments[idx..].to_vec();
        let subdir = strip_skill_md_suffix(&segments[idx + 1..]);
        return Ok(ParsedGitHubUrl {
            owner,
            repo,
            branch,
            subdir,
            tail_segments,
            raw_direct_url: Some(normalized),
        });
    }

    // Case 2: GitHub Pages subdomain ({owner}.github.io/{repo}/{...subpath})
    if let Some(sub_owner) = host.strip_suffix(".github.io") {
        if sub_owner.is_empty() || sub_owner.contains('.') {
            return Err(AppError::Validation("Invalid GitHub Pages subdomain".into()));
        }
        if segments.is_empty() {
            return Err(AppError::Validation(
                "GitHub Pages skill URL must include repository name (e.g. https://owner.github.io/repo/path)".into(),
            ));
        }
        let owner = sub_owner.to_string();
        let repo = segments[0].trim_end_matches(".git").to_string();
        let subdir = strip_skill_md_suffix(&segments[1..]);
        return Ok(ParsedGitHubUrl {
            owner,
            repo,
            branch: None,
            subdir,
            tail_segments: vec![],
            raw_direct_url: None,
        });
    }

    // Case 3: github.com, *.github.com (e.g. www.github.com), or custom GitHub host
    let is_github_host = host == "github.com"
        || host.ends_with(".github.com")
        || host.contains("github");
    if !is_github_host {
        return Err(AppError::Validation(
            "URL must point to github.com, raw.githubusercontent.com, or *.github.io".into(),
        ));
    }

    if segments.len() < 2 {
        return Err(AppError::Validation(
            "GitHub URL must include owner and repository (e.g. https://github.com/owner/repo)".into(),
        ));
    }
    let owner = segments[0].clone();
    let repo = segments[1].trim_end_matches(".git").to_string();

    let mut branch = None;
    let mut subdir = None;
    let mut tail_segments = Vec::new();
    if segments.len() >= 4 && matches!(segments[2].as_str(), "tree" | "blob" | "raw") {
        tail_segments = segments[3..].to_vec();
        branch = Some(segments[3].clone());
        if segments.len() > 4 {
            subdir = strip_skill_md_suffix(&segments[4..]);
        }
    }

    Ok(ParsedGitHubUrl {
        owner,
        repo,
        branch,
        subdir,
        tail_segments,
        raw_direct_url: None,
    })
}

pub fn parse_github_repo_url(url: &str) -> AppResult<(String, String, Option<String>, Option<String>)> {
    let parsed = parse_github_source_url(url)?;
    Ok((parsed.owner, parsed.repo, parsed.branch, parsed.subdir))
}

pub async fn inspect_github_skills(
    api_base: &str,
    repo_url: &str,
    branch_override: Option<&str>,
    subdir_override: Option<&str>,
    commit_ref: Option<&str>,
) -> AppResult<Vec<GitHubSkillPreview>> {
    inspect_github_skills_with_bases(
        api_base,
        "https://raw.githubusercontent.com",
        repo_url,
        branch_override,
        subdir_override,
        commit_ref,
    )
    .await
}

pub async fn inspect_github_skills_with_bases(
    api_base: &str,
    raw_base: &str,
    repo_url: &str,
    branch_override: Option<&str>,
    subdir_override: Option<&str>,
    commit_ref: Option<&str>,
) -> AppResult<Vec<GitHubSkillPreview>> {
    let parsed_url = parse_github_source_url(repo_url)?;
    let owner = parsed_url.owner.clone();
    let repo = parsed_url.repo.clone();
    let client = reqwest::Client::builder()
        .user_agent("NOCTRA-STUDIO/0.1")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| AppError::Skill(e.to_string()))?;

    let api_base = api_base.trim_end_matches('/');
    let raw_base = raw_base.trim_end_matches('/');

    let explicit_ref = commit_ref
        .filter(|s| !s.trim().is_empty())
        .or(branch_override.filter(|s| !s.trim().is_empty()));

    let mut branch = match explicit_ref {
        Some(r) => r.trim().to_string(),
        None => {
            if let Some(ref ub) = parsed_url.branch {
                ub.clone()
            } else {
                let meta_res = client
                    .get(format!("{api_base}/repos/{owner}/{repo}"))
                    .send()
                    .await;
                match meta_res {
                    Ok(resp) if resp.status().is_success() => resp
                        .json::<serde_json::Value>()
                        .await
                        .ok()
                        .and_then(|v| {
                            v.get("default_branch")
                                .and_then(|b| b.as_str())
                                .map(String::from)
                        })
                        .unwrap_or_else(|| "main".into()),
                    _ => "main".into(),
                }
            }
        }
    };

    let mut subdir = subdir_override
        .filter(|s| !s.trim().is_empty())
        .or(parsed_url.subdir.as_deref())
        .unwrap_or("")
        .trim_matches('/')
        .to_string();

    // Fetch recursive git tree to discover all SKILL.md files; if branch name itself contains '/',
    // progressively test candidate branch/subdir splits from URL tail segments.
    let mut tree_resp = fetch_git_tree(&client, api_base, &owner, &repo, &branch).await?;
    if !tree_resp.status().is_success()
        && explicit_ref.is_none()
        && subdir_override.filter(|s| !s.trim().is_empty()).is_none()
        && parsed_url.tail_segments.len() >= 2
    {
        let max_split = parsed_url.tail_segments.len().min(5);
        for split_idx in 2..=max_split {
            let cand_branch = parsed_url.tail_segments[..split_idx].join("/");
            if let Ok(cand_resp) =
                fetch_git_tree(&client, api_base, &owner, &repo, &cand_branch).await
            {
                if cand_resp.status().is_success() {
                    branch = cand_branch;
                    subdir = strip_skill_md_suffix(&parsed_url.tail_segments[split_idx..])
                        .unwrap_or_default();
                    tree_resp = cand_resp;
                    break;
                }
            }
        }
    }

    let sha_str = match client
        .get(format!("{api_base}/repos/{owner}/{repo}/commits/{branch}"))
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v.get("sha").and_then(|s| s.as_str()).map(String::from)),
        _ => None,
    };

    if !tree_resp.status().is_success() {
        // Fallback: if user provided a direct SKILL.md / subfolder URL, fetch SKILL.md directly from raw_base
        if let Some(fallback_preview) = try_direct_raw_skill_fallback(
            &client,
            raw_base,
            &owner,
            &repo,
            &branch,
            &subdir,
            sha_str.clone(),
            parsed_url.raw_direct_url.as_deref(),
        )
        .await
        {
            return Ok(vec![fallback_preview]);
        }
        return Err(AppError::Skill(format!(
            "GitHub returned HTTP {} while inspecting branch '{branch}'",
            tree_resp.status().as_u16()
        )));
    }

    let tree_json: serde_json::Value = tree_resp
        .json()
        .await
        .map_err(|e| AppError::Skill(e.to_string()))?;
    let all_paths: Vec<String> = tree_json
        .get("tree")
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|item| item.get("type").and_then(|t| t.as_str()) == Some("blob"))
                .filter_map(|item| item.get("path").and_then(|p| p.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut skill_dirs = Vec::new();
    for p in &all_paths {
        if p == "SKILL.md" || p.ends_with("/SKILL.md") {
            let dir = p.trim_end_matches("SKILL.md").trim_end_matches('/').to_string();
            if subdir.is_empty() || dir == subdir || dir.starts_with(&format!("{subdir}/")) {
                skill_dirs.push(dir);
            }
        }
    }
    skill_dirs.sort();
    skill_dirs.dedup();

    if skill_dirs.is_empty() {
        return Err(AppError::Skill(
            "No SKILL.md definitions found in the specified repository/subdirectory".into(),
        ));
    }

    let all_paths_ref = &all_paths;
    let client_ref = &client;
    let owner_ref = &owner;
    let repo_ref = &repo;
    let branch_ref = &branch;
    let sha_ref = &sha_str;

    let mut previews = stream::iter(skill_dirs.into_iter().take(100).map(|sdir| async move {
        let md_rel = if sdir.is_empty() {
            "SKILL.md".to_string()
        } else {
            format!("{sdir}/SKILL.md")
        };
        let raw_url = format!("{raw_base}/{owner_ref}/{repo_ref}/{branch_ref}/{md_rel}");
        let raw_md = client_ref
            .get(&raw_url)
            .send()
            .await
            .map_err(|e| AppError::Skill(e.to_string()))?
            .text()
            .await
            .map_err(|e| AppError::Skill(e.to_string()))?;

        let parsed = parse_skill_md(&raw_md);
        let prefix = if sdir.is_empty() {
            String::new()
        } else {
            format!("{sdir}/")
        };
        let required_files: Vec<String> = all_paths_ref
            .iter()
            .filter(|p| prefix.is_empty() || p.starts_with(&prefix))
            .map(|p| p.strip_prefix(&prefix).unwrap_or(p).to_string())
            .collect();
        let has_scripts = required_files.iter().any(|f| f.starts_with("scripts/"));

        Ok::<GitHubSkillPreview, AppError>(GitHubSkillPreview {
            owner: owner_ref.clone(),
            repo: repo_ref.clone(),
            branch: branch_ref.clone(),
            commit_sha: sha_ref.clone(),
            subdirectory: sdir,
            skill_name: parsed.name,
            description: parsed.description,
            skill_md_raw: raw_md,
            required_files,
            has_scripts,
            validation_errors: parsed.validation_errors,
            trust_warning: "Untrusted external repository: review SKILL.md instructions and scripts before enabling. Scripts are never executed automatically.".into(),
        })
    }))
    .buffer_unordered(8)
    .collect::<Vec<_>>()
    .await
    .into_iter()
    .collect::<AppResult<Vec<_>>>()?;

    previews.sort_by(|a, b| a.subdirectory.cmp(&b.subdirectory));
    Ok(previews)
}

async fn fetch_git_tree(
    client: &reqwest::Client,
    api_base: &str,
    owner: &str,
    repo: &str,
    branch: &str,
) -> AppResult<reqwest::Response> {
    let tree_url = format!("{api_base}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1");
    client
        .get(&tree_url)
        .send()
        .await
        .map_err(|e| AppError::Skill(format!("Failed reading GitHub tree: {e}")))
}

async fn try_direct_raw_skill_fallback(
    client: &reqwest::Client,
    raw_base: &str,
    owner: &str,
    repo: &str,
    branch: &str,
    subdir: &str,
    commit_sha: Option<String>,
    raw_direct_url: Option<&str>,
) -> Option<GitHubSkillPreview> {
    let md_rel = if subdir.is_empty() {
        "SKILL.md".to_string()
    } else {
        format!("{subdir}/SKILL.md")
    };
    let candidate = raw_direct_url
        .filter(|u| u.to_ascii_lowercase().ends_with("/skill.md"))
        .map(String::from)
        .unwrap_or_else(|| format!("{raw_base}/{owner}/{repo}/{branch}/{md_rel}"));

    let resp = client.get(&candidate).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let raw_md = resp.text().await.ok()?;
    let parsed = parse_skill_md(&raw_md);
    Some(GitHubSkillPreview {
        owner: owner.to_string(),
        repo: repo.to_string(),
        branch: branch.to_string(),
        commit_sha,
        subdirectory: subdir.to_string(),
        skill_name: parsed.name,
        description: parsed.description,
        skill_md_raw: raw_md,
        required_files: vec!["SKILL.md".into()],
        has_scripts: false,
        validation_errors: parsed.validation_errors,
        trust_warning: "Untrusted external repository: review SKILL.md instructions and scripts before enabling. Scripts are never executed automatically.".into(),
    })
}

pub async fn install_github_skill(
    db: &Database,
    preview: &GitHubSkillPreview,
) -> AppResult<SkillRecord> {
    let client = reqwest::Client::builder()
        .user_agent("NOCTRA-STUDIO/0.1")
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| AppError::Skill(e.to_string()))?;

    let slug = slugify(&preview.skill_name);
    let dest = db.skills_dir().join(&slug);
    std::fs::create_dir_all(&dest)?;

    for rel in &preview.required_files {
        // Prevent path traversal from malicious repo tree entries
        if rel.contains("..") || rel.starts_with('/') || rel.starts_with('\\') {
            continue;
        }
        let repo_path = if preview.subdirectory.is_empty() {
            rel.clone()
        } else {
            format!("{}/{}", preview.subdirectory, rel)
        };
        let raw_url = format!(
            "https://raw.githubusercontent.com/{}/{}/{}/{}",
            preview.owner, preview.repo, preview.branch, repo_path
        );
        if let Ok(resp) = client.get(&raw_url).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    let target = dest.join(rel);
                    if let Ok(safe) = verify_path_within_roots(&target, &[dest.clone()]) {
                        if let Some(parent) = safe.parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        let _ = std::fs::write(safe, bytes);
                    }
                }
            }
        }
    }

    let parsed = parse_skill_md(&preview.skill_md_raw);
    let now = Utc::now().to_rfc3339();
    let rec = SkillRecord {
        id: Uuid::new_v4().to_string(),
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        source_type: "github".into(),
        source_url: Some(format!("https://github.com/{}/{}", preview.owner, preview.repo)),
        branch_or_tag: Some(preview.branch.clone()),
        subdirectory: if preview.subdirectory.is_empty() {
            None
        } else {
            Some(preview.subdirectory.clone())
        },
        commit_sha: preview.commit_sha.clone(),
        version: parsed.version,
        local_path: dest.to_string_lossy().to_string(),
        enabled: true,
        trust_level: "unverified".into(),
        frontmatter: parsed.frontmatter,
        instructions_md: preview.skill_md_raw.clone(),
        dependencies: parsed.dependencies,
        supporting_files: scan_supporting_files(&dest),
        validation_errors: parsed.validation_errors,
        created_at: now.clone(),
        updated_at: now,
    };

    db.upsert_skill(&rec)?;
    db.log_event(
        "skill",
        "info",
        &format!(
            "Installed GitHub skill '{}' from {}/{}",
            rec.name, preview.owner, preview.repo
        ),
        None,
    );
    Ok(rec)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::redaction::SecretRedactor;
    use std::sync::Arc;
    use tempfile::TempDir;

    #[test]
    fn parses_valid_and_invalid_skill_md() {
        let valid = r#"---
name: rust-architect
description: Designs clean Rust modules and tests.
category: engineering
version: 1.2.0
dependencies:
  - cargo
---
# Instructions
Always run cargo test after edits."#;
        let parsed = parse_skill_md(valid);
        assert_eq!(parsed.name, "rust-architect");
        assert_eq!(parsed.category, "engineering");
        assert_eq!(parsed.dependencies, vec!["cargo"]);
        assert!(parsed.validation_errors.is_empty());

        let broken = "# Just markdown without frontmatter";
        let bad = parse_skill_md(broken);
        assert!(!bad.validation_errors.is_empty());
    }

    #[test]
    fn imports_local_skill_folder_and_prevents_path_escape() {
        let dir = TempDir::new().unwrap();
        let db = Database::open_in_memory(dir.path().to_path_buf(), Arc::new(SecretRedactor::new())).unwrap();

        let src = dir.path().join("src-skill");
        std::fs::create_dir_all(src.join("references")).unwrap();
        std::fs::write(
            src.join("SKILL.md"),
            "---\nname: local-helper\ndescription: Test helper\n---\nFollow local rules.",
        )
        .unwrap();
        std::fs::write(src.join("references/guide.md"), "# Guide").unwrap();

        let rec = import_local_skill_folder(&db, &src).unwrap();
        assert_eq!(rec.name, "local-helper");
        assert_eq!(rec.supporting_files.len(), 1);
        assert_eq!(
            read_skill_file(&db, &rec.id, "references/guide.md").unwrap(),
            "# Guide"
        );
        assert!(read_skill_file(&db, &rec.id, "../outside.txt").is_err());
    }

    #[test]
    fn parses_github_urls_with_branch_subdir_blob_raw_and_subdomains() {
        let (owner, repo, branch, subdir) =
            parse_github_repo_url("https://github.com/example/ai-skills/tree/main/skills/research")
                .unwrap();
        assert_eq!(owner, "example");
        assert_eq!(repo, "ai-skills");
        assert_eq!(branch.as_deref(), Some("main"));
        assert_eq!(subdir.as_deref(), Some("skills/research"));

        // Direct blob/SKILL.md link strips trailing SKILL.md cleanly
        let (o2, r2, b2, s2) =
            parse_github_repo_url("https://www.github.com/example/ai-skills/blob/main/domain/subdomain/SKILL.md")
                .unwrap();
        assert_eq!((o2.as_str(), r2.as_str()), ("example", "ai-skills"));
        assert_eq!(b2.as_deref(), Some("main"));
        assert_eq!(s2.as_deref(), Some("domain/subdomain"));

        // raw.githubusercontent.com with refs/heads/main
        let raw_parsed = parse_github_source_url(
            "https://raw.githubusercontent.com/example/ai-skills/refs/heads/main/domain/sub/SKILL.md",
        )
        .unwrap();
        assert_eq!(raw_parsed.branch.as_deref(), Some("main"));
        assert_eq!(raw_parsed.subdir.as_deref(), Some("domain/sub"));
        assert!(raw_parsed.raw_direct_url.is_some());

        // GitHub Pages subdomain (<owner>.github.io/<repo>/<subpath>)
        let pages =
            parse_github_source_url("https://example.github.io/ai-skills/domain/sub/SKILL.md")
                .unwrap();
        assert_eq!(pages.owner, "example");
        assert_eq!(pages.repo, "ai-skills");
        assert_eq!(pages.subdir.as_deref(), Some("domain/sub"));

        // Host without scheme
        let no_scheme =
            parse_github_repo_url("github.com/example/ai-skills/tree/main/sub").unwrap();
        assert_eq!(no_scheme.3.as_deref(), Some("sub"));
    }

    #[tokio::test]
    async fn inspects_github_skills_from_main_to_nested_subdomains_and_slash_branches() {
        use axum::{routing::get, Json, Router};
        use tokio::net::TcpListener;

        let app = Router::new()
            .route(
                "/api/repos/acme/skills",
                get(|| async { Json(serde_json::json!({ "default_branch": "main" })) }),
            )
            .route(
                "/api/repos/acme/skills/commits/main",
                get(|| async { Json(serde_json::json!({ "sha": "abc1234567" })) }),
            )
            .route(
                "/api/repos/acme/skills/git/trees/main",
                get(|| async {
                    Json(serde_json::json!({
                        "tree": [
                            { "type": "blob", "path": "domain/sub-a/SKILL.md" },
                            { "type": "blob", "path": "domain/sub-a/references/guide.md" },
                            { "type": "blob", "path": "domain/sub-b/SKILL.md" },
                            { "type": "blob", "path": "other/SKILL.md" }
                        ]
                    }))
                }),
            )
            .route(
                "/api/repos/acme/skills/git/trees/feat/v2",
                get(|| async {
                    Json(serde_json::json!({
                        "tree": [
                            { "type": "blob", "path": "domain/sub-a/SKILL.md" }
                        ]
                    }))
                }),
            )
            .route(
                "/raw/acme/skills/main/domain/sub-a/SKILL.md",
                get(|| async { "---\nname: sub-a\ndescription: Sub A\n---\nBody A" }),
            )
            .route(
                "/raw/acme/skills/main/domain/sub-b/SKILL.md",
                get(|| async { "---\nname: sub-b\ndescription: Sub B\n---\nBody B" }),
            )
            .route(
                "/raw/acme/skills/feat/v2/domain/sub-a/SKILL.md",
                get(|| async { "---\nname: sub-a-v2\ndescription: Sub A V2\n---\nBody V2" }),
            );

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let api_base = format!("http://{addr}/api");
        let raw_base = format!("http://{addr}/raw");

        // 1. Inspect nested domain folder from main
        let list = inspect_github_skills_with_bases(
            &api_base,
            &raw_base,
            "https://github.com/acme/skills/tree/main/domain",
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].skill_name, "sub-a");
        assert_eq!(list[0].required_files.len(), 2);
        assert_eq!(list[1].skill_name, "sub-b");

        // 2. Inspect direct blob/.../SKILL.md link
        let single = inspect_github_skills_with_bases(
            &api_base,
            &raw_base,
            "https://github.com/acme/skills/blob/main/domain/sub-a/SKILL.md",
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].subdirectory, "domain/sub-a");

        // 3. Inspect branch containing slash (feat/v2) + subpath
        let slash_branch = inspect_github_skills_with_bases(
            &api_base,
            &raw_base,
            "https://github.com/acme/skills/tree/feat/v2/domain/sub-a",
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(slash_branch.len(), 1);
        assert_eq!(slash_branch[0].branch, "feat/v2");
        assert_eq!(slash_branch[0].skill_name, "sub-a-v2");
    }
}
