use crate::error::{AppError, AppResult};
use crate::storage::models::MarketplaceSource;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePackageItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub kind: String, // "mcp" | "skills" | "agent_template" | "workflow_template"
    pub category: String,
    pub source_name: String,
    pub source_url: String,
    pub repository_url: Option<String>,
    pub version: Option<String>,
    pub trust_level: String, // "verified" | "unverified" (never fabricated)
    pub transport: Option<String>,
    pub install_hint: String,
    pub command_or_endpoint: Option<String>,
    pub args: Vec<String>,
    pub compatibility: String,
}

/// Extensible marketplace adapter dispatcher.
/// Queries real remote endpoints according to the configured adapter_type;
/// never fabricates ratings, download counts, or verification badges.
pub async fn browse_marketplace_source(
    source: &MarketplaceSource,
    query: Option<&str>,
) -> AppResult<Vec<MarketplacePackageItem>> {
    let client = reqwest::Client::builder()
        .user_agent("NOCTRA-STUDIO/0.1")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| AppError::Mcp(e.to_string()))?;

    let mut items = match source.adapter_type.as_str() {
        "mcp_registry" => fetch_mcp_registry(&client, source, query).await?,
        "github_repo" => fetch_github_directory(&client, source).await?,
        "json_catalog" => fetch_json_catalog(&client, source).await?,
        other => {
            return Err(AppError::Validation(format!(
                "Unsupported marketplace adapter type: {other}"
            )));
        }
    };

    if let Some(q) = query.map(|s| s.trim().to_ascii_lowercase()).filter(|s| !s.is_empty()) {
        items.retain(|i| {
            i.name.to_ascii_lowercase().contains(&q)
                || i.description.to_ascii_lowercase().contains(&q)
                || i.category.to_ascii_lowercase().contains(&q)
        });
    }

    Ok(items)
}

async fn fetch_mcp_registry(
    client: &reqwest::Client,
    source: &MarketplaceSource,
    query: Option<&str>,
) -> AppResult<Vec<MarketplacePackageItem>> {
    let mut url = source.url.clone();
    if let Some(q) = query.filter(|s| !s.trim().is_empty()) {
        let sep = if url.contains('?') { '&' } else { '?' };
        url = format!("{url}{sep}search={}&limit=30", urlencoding_simple(q));
    } else if !url.contains("limit=") {
        let sep = if url.contains('?') { '&' } else { '?' };
        url = format!("{url}{sep}limit=30");
    }

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Mcp(format!("Failed querying '{}': {e}", source.name)))?;
    if !resp.status().is_success() {
        return Err(AppError::Mcp(format!(
            "Marketplace '{}' returned HTTP {}",
            source.name,
            resp.status().as_u16()
        )));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Mcp(format!("Invalid JSON from '{}': {e}", source.name)))?;

    let list = json
        .get("servers")
        .or_else(|| json.get("items"))
        .and_then(|v| v.as_array())
        .or_else(|| json.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for entry in list {
        let srv = entry.get("server").unwrap_or(&entry);
        let name = srv
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unnamed-mcp")
            .to_string();
        let desc = srv
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let version = srv.get("version").and_then(|v| v.as_str()).map(String::from);
        let repo_url = srv
            .pointer("/repository/url")
            .and_then(|v| v.as_str())
            .map(String::from);

        let mut transport = None;
        let mut cmd_or_ep = None;
        let mut args = Vec::new();

        if let Some(remotes) = srv.get("remotes").and_then(|v| v.as_array()) {
            if let Some(r0) = remotes.first() {
                transport = Some("streamable_http".into());
                cmd_or_ep = r0.get("url").and_then(|v| v.as_str()).map(String::from);
            }
        }
        if cmd_or_ep.is_none() {
            if let Some(pkgs) = srv.get("packages").and_then(|v| v.as_array()) {
                if let Some(p0) = pkgs.first() {
                    transport = Some("stdio".into());
                    let registry_type = p0.get("registryType").and_then(|v| v.as_str()).unwrap_or("npm");
                    let identifier = p0.get("identifier").and_then(|v| v.as_str()).unwrap_or(&name);
                    if registry_type == "npm" {
                        cmd_or_ep = Some("npx".into());
                        args = vec!["-y".into(), identifier.into()];
                    } else if registry_type == "pypi" {
                        cmd_or_ep = Some("uvx".into());
                        args = vec![identifier.into()];
                    } else {
                        cmd_or_ep = Some(identifier.into());
                    }
                }
            }
        }

        out.push(MarketplacePackageItem {
            id: format!("{}:{}", source.id, name),
            name,
            description: desc,
            kind: "mcp".into(),
            category: "Registry Server".into(),
            source_name: source.name.clone(),
            source_url: source.url.clone(),
            repository_url: repo_url,
            version,
            trust_level: if source.builtin { "verified".into() } else { "unverified".into() },
            transport,
            install_hint: "Inspect command/endpoint and permissions before connecting".into(),
            command_or_endpoint: cmd_or_ep,
            args,
            compatibility: "MCP 2025-03-26 / stdio & Streamable HTTP".into(),
        });
    }
    Ok(out)
}

async fn fetch_github_directory(
    client: &reqwest::Client,
    source: &MarketplaceSource,
) -> AppResult<Vec<MarketplacePackageItem>> {
    let resp = client
        .get(&source.url)
        .send()
        .await
        .map_err(|e| AppError::Mcp(format!("GitHub marketplace request failed: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Mcp(format!(
            "GitHub API returned HTTP {} for '{}'",
            resp.status().as_u16(),
            source.name
        )));
    }
    let arr: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| AppError::Mcp(format!("Invalid GitHub directory response: {e}")))?;

    let mut out = Vec::new();
    for entry in arr {
        if entry.get("type").and_then(|v| v.as_str()) != Some("dir") {
            continue;
        }
        let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let html_url = entry
            .get("html_url")
            .and_then(|v| v.as_str())
            .map(String::from);

        out.push(MarketplacePackageItem {
            id: format!("{}:{}", source.id, name),
            name: name.clone(),
            description: if source.kind == "skills" {
                format!("GitHub Skill directory '{name}' — inspect SKILL.md before installing.")
            } else {
                format!("GitHub MCP server directory '{name}' — inspect README/package before running.")
            },
            kind: source.kind.clone(),
            category: "GitHub Directory".into(),
            source_name: source.name.clone(),
            source_url: source.url.clone(),
            repository_url: html_url.clone(),
            version: None,
            trust_level: "unverified".into(),
            transport: if source.kind == "mcp" { Some("stdio".into()) } else { None },
            install_hint: if source.kind == "skills" {
                "Inspect SKILL.md via Skills Center GitHub Installer".into()
            } else {
                "Review source repository for launch command".into()
            },
            command_or_endpoint: html_url,
            args: vec![],
            compatibility: "GitHub Repository".into(),
        });
    }
    Ok(out)
}

async fn fetch_json_catalog(
    client: &reqwest::Client,
    source: &MarketplaceSource,
) -> AppResult<Vec<MarketplacePackageItem>> {
    let resp = client
        .get(&source.url)
        .send()
        .await
        .map_err(|e| AppError::Mcp(format!("Catalog request failed: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Mcp(format!(
            "Catalog '{}' returned HTTP {}",
            source.name,
            resp.status().as_u16()
        )));
    }
    let val: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Mcp(format!("Invalid JSON catalog: {e}")))?;
    let list = val
        .get("items")
        .or_else(|| val.get("servers"))
        .or_else(|| val.get("skills"))
        .and_then(|v| v.as_array())
        .or_else(|| val.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for item in list {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        out.push(MarketplacePackageItem {
            id: format!("{}:{}", source.id, name),
            name,
            description: item.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            kind: item
                .get("kind")
                .and_then(|v| v.as_str())
                .unwrap_or(&source.kind)
                .to_string(),
            category: item.get("category").and_then(|v| v.as_str()).unwrap_or("Community").to_string(),
            source_name: source.name.clone(),
            source_url: source.url.clone(),
            repository_url: item.get("repositoryUrl").or_else(|| item.get("url")).and_then(|v| v.as_str()).map(String::from),
            version: item.get("version").and_then(|v| v.as_str()).map(String::from),
            trust_level: "unverified".into(),
            transport: item.get("transport").and_then(|v| v.as_str()).map(String::from),
            install_hint: "Custom marketplace item — verify source before installing".into(),
            command_or_endpoint: item.get("endpoint").or_else(|| item.get("command")).and_then(|v| v.as_str()).map(String::from),
            args: item
                .get("args")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            compatibility: item.get("compatibility").and_then(|v| v.as_str()).unwrap_or("Standard").to_string(),
        });
    }
    Ok(out)
}

fn urlencoding_simple(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}
