use crate::error::{AppError, AppResult};
use crate::storage::models::InternetSettings;
use futures_util::stream::{self, StreamExt};
use std::collections::{BTreeSet, HashMap};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{lookup_host, TcpStream};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use url::Url;

pub struct InternetToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub category: String,
    pub is_active_probe: bool,
}

pub fn builtin_internet_tool_specs() -> Vec<InternetToolSpec> {
    vec![
        InternetToolSpec {
            name: "net_dns_lookup".into(),
            description: "Resolve DNS records (IPv4/IPv6 addresses) for an authorized domain or hostname.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "description": "Domain name or hostname to resolve (e.g. 'example.com')"
                    }
                },
                "required": ["host"]
            }),
            category: "internet_access".into(),
            is_active_probe: true,
        },
        InternetToolSpec {
            name: "net_port_scan".into(),
            description: "Perform an authorized asynchronous TCP port scan on a domain or IP address with optional service banner grabbing and risk classification.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "Authorized domain name or IP address to scan (e.g. 'example.com')"
                    },
                    "ports": {
                        "type": "string",
                        "description": "Preset ('common', 'web', 'database', 'top100') or comma-separated ports/ranges (e.g. '22,80,443,8000-8010'). Defaults to 'common'."
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Per-port TCP connect timeout in milliseconds (clamped to user Internet Mode settings)"
                    },
                    "grab_banner": {
                        "type": "boolean",
                        "description": "Read lightweight service banner on open ports (default: true)"
                    }
                },
                "required": ["target"]
            }),
            category: "internet_access".into(),
            is_active_probe: true,
        },
        InternetToolSpec {
            name: "net_http_security_check".into(),
            description: "Inspect HTTP/HTTPS response headers, HSTS/CSP/cookie security posture, information disclosure headers, and HTTP-to-HTTPS redirect behavior for an authorized domain or URL.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "Authorized domain or URL to audit (defaults to https:// if no scheme provided)"
                    },
                    "check_http_redirect": {
                        "type": "boolean",
                        "description": "Also check whether plain HTTP redirects to HTTPS (default: true)"
                    }
                },
                "required": ["target"]
            }),
            category: "internet_access".into(),
            is_active_probe: true,
        },
        InternetToolSpec {
            name: "net_fetch_url".into(),
            description: "Fetch text content from a public HTTP/HTTPS URL (such as /.well-known/security.txt, robots.txt, or public pages) while respecting Internet Mode target restrictions.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Full http:// or https:// URL to retrieve"
                    },
                    "max_chars": {
                        "type": "integer",
                        "description": "Maximum response characters to return (default: 12000, max: 30000)"
                    }
                },
                "required": ["url"]
            }),
            category: "internet_access".into(),
            is_active_probe: true,
        },
    ]
}

pub fn internet_mode_system_prompt(settings: &InternetSettings) -> String {
    let clean = settings.sanitized();
    let scope_line = if clean.allowed_domains.is_empty() {
        "Allowed domains: any public domain (subject to user approval)".to_string()
    } else {
        format!("Allowed domains allowlist: {}", clean.allowed_domains.join(", "))
    };
    let priv_line = if clean.allow_private_targets {
        "Private/LAN targets: enabled by user"
    } else {
        "Private/LAN targets: blocked (public targets only)"
    };
    format!(
        "## Internet Mode Active (Security & Network Diagnostics)\n\
         Available built-in tools: `net_dns_lookup`, `net_port_scan`, `net_http_security_check`, `net_fetch_url`.\n\
         Guardrails: max {} ports/scan, {}ms timeout, {} max concurrency. {} | {}.\n\
         Rules:\n\
         - Only scan or inspect domains/hosts that the user explicitly requests and is authorized to audit.\n\
         - Prefer starting with `net_dns_lookup`, `net_port_scan` (preset 'common' or user-requested ports), and `net_http_security_check` when asked to check domain security.\n\
         - Present results clearly in structured tables with open ports, detected services/banners, severity levels, and concrete defensive hardening steps.",
        clean.max_ports_per_scan,
        clean.scan_timeout_ms,
        clean.max_concurrency,
        scope_line,
        priv_line
    )
}

pub fn extract_target_host_from_args(tool_name: &str, args: &serde_json::Value) -> Option<String> {
    let raw = match tool_name {
        "net_dns_lookup" => args.get("host").or_else(|| args.get("target")),
        "net_port_scan" | "net_http_security_check" => args.get("target").or_else(|| args.get("host")).or_else(|| args.get("url")),
        "net_fetch_url" => args.get("url").or_else(|| args.get("target")),
        _ => args.get("target").or_else(|| args.get("url")).or_else(|| args.get("host")),
    }
    .and_then(|v| v.as_str())?;
    normalize_host(raw).ok()
}

pub fn describe_internet_action(tool_name: &str, args: &serde_json::Value) -> String {
    let target = extract_target_host_from_args(tool_name, args).unwrap_or_else(|| "(target)".into());
    match tool_name {
        "net_port_scan" => {
            let ports = args
                .get("ports")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("common");
            format!("TCP Port Scan on '{target}' (ports: {ports})")
        }
        "net_dns_lookup" => format!("DNS Lookup for '{target}'"),
        "net_http_security_check" => format!("HTTP/HTTPS Security Header Audit on '{target}'"),
        "net_fetch_url" => {
            let url = args
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or(&target);
            format!("Fetch URL '{url}'")
        }
        _ => format!("Run '{tool_name}' on '{target}'"),
    }
}

pub async fn execute_builtin_internet_tool(
    settings: &InternetSettings,
    tool_name: &str,
    args: &serde_json::Value,
    cancel: CancellationToken,
) -> AppResult<serde_json::Value> {
    if cancel.is_cancelled() {
        return Err(AppError::Cancelled);
    }
    let cfg = settings.sanitized();
    match tool_name {
        "net_dns_lookup" => execute_dns_lookup(&cfg, args).await,
        "net_port_scan" => execute_port_scan(&cfg, args, cancel).await,
        "net_http_security_check" => execute_http_security_check(&cfg, args, cancel).await,
        "net_fetch_url" => execute_fetch_url(&cfg, args, cancel).await,
        other => Err(AppError::NotFound(format!(
            "Unknown built-in internet tool: {other}"
        ))),
    }
}

pub fn normalize_host(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Target host or URL cannot be empty".into()));
    }
    if trimmed.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(AppError::Validation(
            "Target host contains invalid whitespace or control characters".into(),
        ));
    }

    let extracted = if trimmed.contains("://") {
        let parsed = Url::parse(trimmed)
            .map_err(|e| AppError::Validation(format!("Invalid URL '{trimmed}': {e}")))?;
        let scheme = parsed.scheme();
        if scheme != "http" && scheme != "https" {
            return Err(AppError::Validation(format!(
                "Only http:// and https:// URLs are supported (got '{scheme}')"
            )));
        }
        parsed
            .host_str()
            .ok_or_else(|| AppError::Validation(format!("URL '{trimmed}' has no host")))?
            .to_string()
    } else if let Ok(ip) = trimmed.trim_matches(['[', ']']).parse::<IpAddr>() {
        ip.to_string()
    } else {
        // Strip optional path and :port
        let without_path = trimmed.split('/').next().unwrap_or(trimmed);
        let host_only = if without_path.starts_with('[') {
            without_path
                .trim_start_matches('[')
                .split(']')
                .next()
                .unwrap_or(without_path)
        } else {
            without_path.split(':').next().unwrap_or(without_path)
        };
        host_only.trim_end_matches('.').to_string()
    };

    let lower = extracted.trim_matches(['[', ']']).to_ascii_lowercase();
    if lower.is_empty() || lower.len() > 253 {
        return Err(AppError::Validation(format!("Invalid target host: '{raw}'")));
    }

    if lower.parse::<IpAddr>().is_err() {
        // Validate standard DNS hostname characters
        let valid_dns = lower.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
        });
        if !valid_dns {
            return Err(AppError::Validation(format!(
                "Invalid domain/hostname syntax: '{raw}'"
            )));
        }
    }

    Ok(lower)
}

pub fn host_matches_allowlist(host: &str, allowed_domains: &[String]) -> bool {
    if allowed_domains.is_empty() {
        return true;
    }
    let h = host.to_ascii_lowercase();
    for raw_pat in allowed_domains {
        let pat = raw_pat.trim().to_ascii_lowercase();
        if pat.is_empty() {
            continue;
        }
        if pat == "*" || pat == h {
            return true;
        }
        let base = pat.strip_prefix("*.").unwrap_or(&pat);
        if h == base || h.ends_with(&format!(".{base}")) {
            return true;
        }
    }
    false
}

pub fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_non_public_v4(v4),
        IpAddr::V6(v6) => is_non_public_v6(v6),
    }
}

fn is_non_public_v4(ip: Ipv4Addr) -> bool {
    let oct = ip.octets();
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_documentation()
        // Shared Address Space (CGNAT 100.64.0.0/10)
        || (oct[0] == 100 && (oct[1] & 0b1100_0000) == 64)
        // Reserved / benchmarking
        || (oct[0] == 198 && (oct[1] == 18 || oct[1] == 19))
        || oct[0] >= 240
}

fn is_non_public_v6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_non_public_v4(mapped);
    }
    let seg = ip.segments();
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        // Unique Local Addresses fc00::/7
        || (seg[0] & 0xfe00) == 0xfc00
        // Link-local unicast fe80::/10
        || (seg[0] & 0xffc0) == 0xfe80
}

async fn validate_and_resolve_host(
    settings: &InternetSettings,
    raw_host: &str,
    port_hint: u16,
) -> AppResult<(String, Vec<IpAddr>)> {
    let host = normalize_host(raw_host)?;

    if !host_matches_allowlist(&host, &settings.allowed_domains) {
        return Err(AppError::PermissionDenied(format!(
            "Target '{host}' is not in the configured Internet Mode allowed domains list"
        )));
    }

    let mut ips: Vec<IpAddr> = if let Ok(ip) = host.parse::<IpAddr>() {
        vec![ip]
    } else {
        let addrs = lookup_host((host.as_str(), port_hint))
            .await
            .map_err(|e| AppError::Provider(format!("DNS resolution failed for '{host}': {e}")))?;
        let mut unique = Vec::new();
        for sa in addrs {
            if !unique.contains(&sa.ip()) {
                unique.push(sa.ip());
            }
        }
        unique
    };

    if ips.is_empty() {
        return Err(AppError::Provider(format!(
            "No IP addresses resolved for '{host}'"
        )));
    }

    if !settings.allow_private_targets {
        if let Some(blocked) = ips.iter().copied().find(|ip| is_non_public_ip(*ip)) {
            return Err(AppError::PermissionDenied(format!(
                "Target '{host}' resolved to private/local IP {blocked}, which is blocked by Internet Mode safety policy. Enable 'Allow Private / Local Targets' in Settings -> Internet Mode only if you intentionally want to test localhost or LAN hosts."
            )));
        }
    }

    // Prefer IPv4 first for deterministic TCP scanning on dual-stack hosts
    ips.sort_by_key(|ip| if ip.is_ipv4() { 0 } else { 1 });
    Ok((host, ips))
}

async fn execute_dns_lookup(
    settings: &InternetSettings,
    args: &serde_json::Value,
) -> AppResult<serde_json::Value> {
    let raw = args
        .get("host")
        .or_else(|| args.get("target"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("Missing 'host' argument".into()))?;

    let started = Instant::now();
    let (host, ips) = validate_and_resolve_host(settings, raw, 443).await?;
    let ipv4: Vec<String> = ips
        .iter()
        .filter(|ip| ip.is_ipv4())
        .map(|ip| ip.to_string())
        .collect();
    let ipv6: Vec<String> = ips
        .iter()
        .filter(|ip| ip.is_ipv6())
        .map(|ip| ip.to_string())
        .collect();
    let records: Vec<serde_json::Value> = ips
        .iter()
        .map(|ip| {
            serde_json::json!({
                "ip": ip.to_string(),
                "family": if ip.is_ipv4() { "IPv4" } else { "IPv6" },
                "scope": if is_non_public_ip(*ip) { "private_or_local" } else { "public" }
            })
        })
        .collect();

    Ok(serde_json::json!({
        "host": host,
        "ipv4": ipv4,
        "ipv6": ipv6,
        "records": records,
        "durationMs": started.elapsed().as_millis() as u64
    }))
}

pub fn parse_port_spec(spec: Option<&str>, max_ports: u16) -> AppResult<Vec<u16>> {
    let raw = spec.unwrap_or("common").trim().to_ascii_lowercase();
    let ports: Vec<u16> = match raw.as_str() {
        "" | "common" => vec![
            21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 465, 587, 993, 995, 1433,
            1521, 2375, 3000, 3306, 3389, 5000, 5432, 5900, 6379, 8000, 8080, 8443, 9000, 9200,
            27017,
        ],
        "web" => vec![80, 443, 3000, 5000, 8000, 8008, 8080, 8081, 8443, 8888, 9000, 9443],
        "database" => vec![1433, 1521, 3306, 5432, 6379, 9200, 9300, 11211, 27017],
        "top100" => vec![
            20, 21, 22, 23, 25, 53, 67, 68, 69, 80, 81, 88, 110, 111, 119, 123, 135, 137, 138,
            139, 143, 161, 179, 194, 389, 443, 445, 464, 465, 500, 514, 515, 548, 554, 587, 631,
            636, 873, 902, 989, 990, 993, 995, 1025, 1080, 1194, 1433, 1434, 1521, 1723, 1883,
            2049, 2082, 2083, 2086, 2087, 2181, 2222, 2375, 2376, 3000, 3128, 3306, 3389, 3690,
            4000, 4369, 4444, 4500, 5000, 5060, 5432, 5672, 5900, 5984, 5985, 5986, 6379, 6443,
            7001, 8000, 8008, 8080, 8081, 8088, 8443, 8888, 9000, 9042, 9090, 9092, 9200, 9300,
            9418, 9443, 10000, 11211, 27017, 27018, 50000,
        ],
        _ => {
            let mut set = BTreeSet::new();
            for token in raw.split(',') {
                let part = token.trim();
                if part.is_empty() {
                    continue;
                }
                if let Some((start_s, end_s)) = part.split_once('-') {
                    let start: u16 = start_s.trim().parse().map_err(|_| {
                        AppError::Validation(format!("Invalid start port in range '{part}'"))
                    })?;
                    let end: u16 = end_s.trim().parse().map_err(|_| {
                        AppError::Validation(format!("Invalid end port in range '{part}'"))
                    })?;
                    if start == 0 || end == 0 || start > end {
                        return Err(AppError::Validation(format!(
                            "Invalid port range '{part}' (ports must be 1..=65535 and start <= end)"
                        )));
                    }
                    let span = (end as usize) - (start as usize) + 1;
                    if set.len() + span > max_ports as usize {
                        return Err(AppError::Validation(format!(
                            "Requested port range '{part}' exceeds configured maximum of {max_ports} ports per scan"
                        )));
                    }
                    for p in start..=end {
                        set.insert(p);
                    }
                } else {
                    let p: u16 = part
                        .parse()
                        .map_err(|_| AppError::Validation(format!("Invalid port '{part}'")))?;
                    if p == 0 {
                        return Err(AppError::Validation("Port 0 is not valid".into()));
                    }
                    set.insert(p);
                }
            }
            set.into_iter().collect()
        }
    };

    if ports.is_empty() {
        return Err(AppError::Validation("No valid ports specified".into()));
    }
    if ports.len() > max_ports as usize {
        return Err(AppError::Validation(format!(
            "Requested {} ports, which exceeds the configured limit of {} ports per scan (adjust in Settings -> Internet Mode)",
            ports.len(),
            max_ports
        )));
    }
    Ok(ports)
}

fn classify_port(port: u16) -> (&'static str, &'static str, &'static str) {
    match port {
        21 => ("ftp", "high", "Plaintext FTP exposes credentials; migrate to SFTP/FTPS or disable."),
        22 => ("ssh", "medium", "Verify key-only authentication, disable root password login, and restrict source IPs."),
        23 => ("telnet", "high", "Unencrypted Telnet remote shell; disable immediately and replace with SSH."),
        25 => ("smtp", "medium", "Verify no open mail relay and enforce STARTTLS/SPF/DKIM/DMARC."),
        53 => ("dns", "low", "Verify recursive queries and zone transfers (AXFR) are restricted."),
        80 => ("http", "low", "Ensure HTTP redirects permanently (301/308) to HTTPS."),
        110 => ("pop3", "high", "Plaintext mail retrieval; enforce POP3S (995) or disable."),
        111 => ("rpcbind", "high", "RPC portmapper should not be exposed to the public Internet."),
        135 => ("msrpc", "high", "Windows RPC endpoint mapper should be firewalled from public access."),
        139 => ("netbios-ssn", "high", "Legacy NetBIOS file sharing should never be publicly accessible."),
        143 => ("imap", "medium", "Prefer IMAPS (993) or enforce STARTTLS."),
        443 => ("https", "info", "Standard TLS web endpoint; verify TLS 1.2+/1.3 and security headers."),
        445 => ("smb", "high", "SMB exposed to the Internet is a critical attack vector; block at firewall."),
        465 | 587 => ("smtps/submission", "low", "Authenticated mail submission; enforce TLS and strong auth."),
        993 => ("imaps", "info", "Encrypted IMAP service."),
        995 => ("pop3s", "info", "Encrypted POP3 service."),
        1433 => ("mssql", "high", "Database port should be private/VPN-only, never exposed publicly."),
        1521 => ("oracle-db", "high", "Oracle DB listener should not be exposed to the public Internet."),
        2375 => ("docker-unencrypted", "high", "Unencrypted Docker API allows full host compromise; disable or bind to localhost/mTLS."),
        2376 => ("docker-tls", "medium", "Verify mutual TLS client certificate enforcement."),
        3000 | 5000 | 8000 | 8080 | 8888 | 9000 => ("http-alt", "medium", "Alternate web/dev port; verify it is not an unintended staging or admin service."),
        3306 => ("mysql", "high", "MySQL/MariaDB should be bound to private network or VPN, not public Internet."),
        3389 => ("rdp", "high", "Public RDP is frequently brute-forced/exploited; restrict behind VPN or Zero Trust."),
        5432 => ("postgresql", "high", "PostgreSQL should be restricted to private networks, not publicly reachable."),
        5900 => ("vnc", "high", "VNC remote desktop should not be exposed directly to the public Internet."),
        6379 => ("redis", "high", "Redis exposed publicly risks immediate unauthorized access; bind privately."),
        6443 => ("kubernetes-api", "medium", "Verify RBAC, anonymous auth disabled, and IP allowlisting."),
        8443 | 9443 => ("https-alt", "low", "Alternate HTTPS port; check for exposed admin consoles."),
        9200 | 9300 => ("elasticsearch", "high", "Elasticsearch/OpenSearch should require auth and never be exposed openly."),
        11211 => ("memcached", "high", "Memcached should be private-only to prevent data leaks and amplification."),
        27017 | 27018 => ("mongodb", "high", "MongoDB should require authentication and remain on a private network."),
        _ => ("unknown", "low", "Verify whether this service is intentionally exposed and properly hardened."),
    }
}

fn sanitize_banner(bytes: &[u8]) -> Option<String> {
    let text: String = bytes
        .iter()
        .map(|&b| {
            if b == b'\r' || b == b'\n' || b == b'\t' {
                ' '
            } else if (0x20..=0x7e).contains(&b) {
                b as char
            } else {
                '.'
            }
        })
        .collect();
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        None
    } else {
        Some(collapsed.chars().take(200).collect())
    }
}

async fn probe_single_port(
    ip: IpAddr,
    host: &str,
    port: u16,
    timeout: Duration,
    grab_banner: bool,
) -> Option<serde_json::Value> {
    let addr = SocketAddr::new(ip, port);
    let start = Instant::now();
    let stream_res = tokio::time::timeout(timeout, TcpStream::connect(addr)).await;
    let Ok(Ok(mut stream)) = stream_res else {
        return None;
    };
    let latency_ms = start.elapsed().as_millis() as u64;

    let mut banner = None;
    if grab_banner {
        let banner_timeout = Duration::from_millis(timeout.as_millis().min(450) as u64);
        let mut buf = [0u8; 512];
        if let Ok(Ok(n)) = tokio::time::timeout(banner_timeout, stream.read(&mut buf)).await {
            if n > 0 {
                banner = sanitize_banner(&buf[..n]);
            }
        }
        // Lightweight HTTP HEAD probe on common plaintext HTTP ports when no passive banner arrived
        if banner.is_none() && matches!(port, 80 | 3000 | 5000 | 8000 | 8008 | 8080 | 8081 | 8888 | 9000) {
            let req = format!("HEAD / HTTP/1.0\r\nHost: {host}\r\nUser-Agent: NOCTRA-Security-Audit/0.1\r\n\r\n");
            if tokio::time::timeout(banner_timeout, stream.write_all(req.as_bytes()))
                .await
                .is_ok()
            {
                if let Ok(Ok(n)) = tokio::time::timeout(banner_timeout, stream.read(&mut buf)).await {
                    if n > 0 {
                        banner = sanitize_banner(&buf[..n]);
                    }
                }
            }
        }
    }

    let (service, risk_level, risk_note) = classify_port(port);
    Some(serde_json::json!({
        "port": port,
        "protocol": "tcp",
        "state": "open",
        "service": service,
        "riskLevel": risk_level,
        "riskNote": risk_note,
        "banner": banner,
        "latencyMs": latency_ms
    }))
}

async fn execute_port_scan(
    settings: &InternetSettings,
    args: &serde_json::Value,
    cancel: CancellationToken,
) -> AppResult<serde_json::Value> {
    let raw_target = args
        .get("target")
        .or_else(|| args.get("host"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("Missing 'target' argument".into()))?;
    let ports_spec = args.get("ports").and_then(|v| v.as_str());
    let ports = parse_port_spec(ports_spec, settings.max_ports_per_scan)?;
    let requested_timeout = args
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(settings.scan_timeout_ms);
    let timeout_ms = requested_timeout.clamp(100, settings.scan_timeout_ms);
    let grab_banner = args
        .get("grab_banner")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let (host, ips) = validate_and_resolve_host(settings, raw_target, ports[0]).await?;
    let target_ip = ips[0];
    let started = Instant::now();

    let sem = Arc::new(Semaphore::new(settings.max_concurrency));
    let timeout = Duration::from_millis(timeout_ms);
    let total_ports = ports.len();

    let results: Vec<Option<serde_json::Value>> = stream::iter(ports)
        .map(|port| {
            let sem = sem.clone();
            let cancel = cancel.clone();
            let host = host.clone();
            async move {
                if cancel.is_cancelled() {
                    return None;
                }
                let _permit = sem.acquire_owned().await.ok()?;
                tokio::select! {
                    _ = cancel.cancelled() => None,
                    res = probe_single_port(target_ip, &host, port, timeout, grab_banner) => res,
                }
            }
        })
        .buffer_unordered(settings.max_concurrency)
        .collect()
        .await;

    if cancel.is_cancelled() {
        return Err(AppError::Cancelled);
    }

    let mut open_ports: Vec<serde_json::Value> = results.into_iter().flatten().collect();
    open_ports.sort_by_key(|v| v.get("port").and_then(|p| p.as_u64()).unwrap_or(0));

    let high_risk_ports: Vec<u64> = open_ports
        .iter()
        .filter(|p| p.get("riskLevel").and_then(|r| r.as_str()) == Some("high"))
        .filter_map(|p| p.get("port").and_then(|v| v.as_u64()))
        .collect();

    Ok(serde_json::json!({
        "target": host,
        "resolvedIp": target_ip.to_string(),
        "allResolvedIps": ips.iter().map(|ip| ip.to_string()).collect::<Vec<_>>(),
        "scannedCount": total_ports,
        "openCount": open_ports.len(),
        "closedOrFilteredCount": total_ports.saturating_sub(open_ports.len()),
        "timeoutMs": timeout_ms,
        "durationMs": started.elapsed().as_millis() as u64,
        "openPorts": open_ports,
        "highRiskOpenPorts": high_risk_ports
    }))
}

async fn safe_http_get_with_redirects(
    settings: &InternetSettings,
    initial_url: &str,
    cancel: CancellationToken,
    timeout_secs: u64,
) -> AppResult<(reqwest::Response, Vec<String>, String)> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(timeout_secs.clamp(3, 25)))
        .user_agent("NOCTRA-Studio-SecurityAudit/0.1")
        .build()
        .map_err(|e| AppError::Provider(format!("Failed to build HTTP client: {e}")))?;

    let mut current = Url::parse(initial_url)
        .map_err(|e| AppError::Validation(format!("Invalid URL '{initial_url}': {e}")))?;
    let mut chain = Vec::new();

    for _hop in 0..=5 {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let scheme = current.scheme();
        if scheme != "http" && scheme != "https" {
            return Err(AppError::Validation(format!(
                "Unsupported URL scheme '{scheme}'"
            )));
        }
        let host = current
            .host_str()
            .ok_or_else(|| AppError::Validation("URL is missing a host".into()))?;
        let port = current.port_or_known_default().unwrap_or(443);
        let _ = validate_and_resolve_host(settings, host, port).await?;

        let resp = tokio::select! {
            _ = cancel.cancelled() => return Err(AppError::Cancelled),
            r = client.get(current.clone()).send() => r.map_err(|e| AppError::Provider(format!("HTTP request to '{current}' failed: {e}")))?,
        };

        if resp.status().is_redirection() {
            if let Some(loc) = resp.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()) {
                chain.push(format!("{} -> {}", resp.status().as_u16(), loc));
                current = current
                    .join(loc)
                    .map_err(|e| AppError::Provider(format!("Invalid redirect target '{loc}': {e}")))?;
                continue;
            }
        }
        return Ok((resp, chain, current.to_string()));
    }

    Err(AppError::Provider("Too many HTTP redirects (> 5)".into()))
}

async fn execute_http_security_check(
    settings: &InternetSettings,
    args: &serde_json::Value,
    cancel: CancellationToken,
) -> AppResult<serde_json::Value> {
    let raw_target = args
        .get("target")
        .or_else(|| args.get("url"))
        .or_else(|| args.get("host"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("Missing 'target' argument".into()))?
        .trim();

    let check_http_redirect = args
        .get("check_http_redirect")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let primary_url = if raw_target.starts_with("http://") || raw_target.starts_with("https://") {
        raw_target.to_string()
    } else {
        let host = normalize_host(raw_target)?;
        format!("https://{host}/")
    };

    let started = Instant::now();
    let (resp, redirect_chain, final_url) =
        safe_http_get_with_redirects(settings, &primary_url, cancel.clone(), 12).await?;

    let status = resp.status().as_u16();
    let mut headers_map: HashMap<String, String> = HashMap::new();
    let mut set_cookies: Vec<String> = Vec::new();
    for (k, v) in resp.headers() {
        let name = k.as_str().to_ascii_lowercase();
        let val = v.to_str().unwrap_or("<non-utf8>").to_string();
        if name == "set-cookie" {
            set_cookies.push(val);
        } else {
            headers_map.insert(name, val);
        }
    }

    let security_checks = [
        ("strict-transport-security", "HSTS", "high", "Enforces HTTPS and mitigates SSL-stripping attacks."),
        ("content-security-policy", "CSP", "high", "Mitigates XSS and unauthorized script injection."),
        ("x-content-type-options", "X-Content-Type-Options", "medium", "Set to 'nosniff' to prevent MIME-type sniffing."),
        ("x-frame-options", "X-Frame-Options", "medium", "Protects against clickjacking (or use CSP frame-ancestors)."),
        ("referrer-policy", "Referrer-Policy", "low", "Controls leakage of sensitive URLs in Referer headers."),
        ("permissions-policy", "Permissions-Policy", "low", "Restricts browser APIs (camera, microphone, geolocation)."),
        ("cross-origin-opener-policy", "COOP", "low", "Isolates browsing context against cross-origin attacks."),
    ];

    let mut present_headers = Vec::new();
    let mut missing_headers = Vec::new();
    let mut score: i32 = 100;

    for (key, label, severity, guidance) in security_checks {
        if let Some(val) = headers_map.get(key) {
            present_headers.push(serde_json::json!({
                "header": label,
                "value": val
            }));
        } else {
            let penalty = match severity {
                "high" => 20,
                "medium" => 10,
                _ => 5,
            };
            score -= penalty;
            missing_headers.push(serde_json::json!({
                "header": label,
                "severity": severity,
                "recommendation": guidance
            }));
        }
    }

    let mut disclosure_headers = Vec::new();
    for leak_key in ["server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"] {
        if let Some(val) = headers_map.get(leak_key) {
            disclosure_headers.push(serde_json::json!({
                "header": leak_key,
                "value": val
            }));
        }
    }
    if !disclosure_headers.is_empty() {
        score -= 5;
    }

    let mut cookie_issues = Vec::new();
    for raw_cookie in &set_cookies {
        let lower = raw_cookie.to_ascii_lowercase();
        let name = raw_cookie.split('=').next().unwrap_or("cookie").trim();
        let mut missing_flags = Vec::new();
        if !lower.contains("secure") {
            missing_flags.push("Secure");
        }
        if !lower.contains("httponly") {
            missing_flags.push("HttpOnly");
        }
        if !lower.contains("samesite") {
            missing_flags.push("SameSite");
        }
        if !missing_flags.is_empty() {
            cookie_issues.push(serde_json::json!({
                "cookie": name,
                "missingFlags": missing_flags
            }));
        }
    }

    let http_redirect_status = if check_http_redirect && final_url.starts_with("https://") {
        if let Ok(parsed) = Url::parse(&final_url) {
            if let Some(host) = parsed.host_str() {
                let plain_http = format!("http://{host}/");
                match safe_http_get_with_redirects(settings, &plain_http, cancel, 6).await {
                    Ok((_, chain, http_final)) => Some(serde_json::json!({
                        "redirectsToHttps": http_final.starts_with("https://"),
                        "finalUrl": http_final,
                        "redirectChain": chain
                    })),
                    Err(e) => Some(serde_json::json!({
                        "redirectsToHttps": false,
                        "note": e.to_string()
                    })),
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let clamped_score = score.clamp(0, 100);
    let grade = match clamped_score {
        90..=100 => "A",
        75..=89 => "B",
        60..=74 => "C",
        40..=59 => "D",
        _ => "F",
    };

    Ok(serde_json::json!({
        "requestedUrl": primary_url,
        "finalUrl": final_url,
        "usesHttps": final_url.starts_with("https://"),
        "statusCode": status,
        "redirectChain": redirect_chain,
        "securityScore": clamped_score,
        "grade": grade,
        "presentSecurityHeaders": present_headers,
        "missingSecurityHeaders": missing_headers,
        "informationDisclosureHeaders": disclosure_headers,
        "cookieIssues": cookie_issues,
        "httpToHttpsRedirect": http_redirect_status,
        "durationMs": started.elapsed().as_millis() as u64
    }))
}

async fn execute_fetch_url(
    settings: &InternetSettings,
    args: &serde_json::Value,
    cancel: CancellationToken,
) -> AppResult<serde_json::Value> {
    let url = args
        .get("url")
        .or_else(|| args.get("target"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("Missing 'url' argument".into()))?
        .trim();
    let max_chars = args
        .get("max_chars")
        .and_then(|v| v.as_u64())
        .unwrap_or(12_000)
        .clamp(256, 30_000) as usize;

    let started = Instant::now();
    let (resp, redirect_chain, final_url) =
        safe_http_get_with_redirects(settings, url, cancel, 15).await?;
    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = resp
        .text()
        .await
        .map_err(|e| AppError::Provider(format!("Failed reading response body: {e}")))?;

    let truncated = body.chars().count() > max_chars;
    let content: String = body.chars().take(max_chars).collect();

    Ok(serde_json::json!({
        "requestedUrl": url,
        "finalUrl": final_url,
        "statusCode": status,
        "contentType": content_type,
        "redirectChain": redirect_chain,
        "truncated": truncated,
        "content": content,
        "durationMs": started.elapsed().as_millis() as u64
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{http::HeaderValue, response::IntoResponse, routing::get, Router};
    use tokio::net::TcpListener;

    #[test]
    fn parses_port_specs_and_enforces_max_limit() {
        let common = parse_port_spec(None, 256).unwrap();
        assert!(common.contains(&80));
        assert!(common.contains(&443));
        assert!(common.contains(&22));

        let custom = parse_port_spec(Some("443, 80, 8000-8002, 80"), 10).unwrap();
        assert_eq!(custom, vec![80, 443, 8000, 8001, 8002]);

        assert!(parse_port_spec(Some("1-500"), 100).is_err());
        assert!(parse_port_spec(Some("90-80"), 100).is_err());
        assert!(parse_port_spec(Some("0"), 100).is_err());
    }

    #[test]
    fn enforces_domain_allowlist_and_private_ip_policy() {
        assert_eq!(normalize_host("https://Example.COM:8443/path").unwrap(), "example.com");
        assert!(host_matches_allowlist("api.example.com", &["*.example.com".into()]));
        assert!(host_matches_allowlist("example.com", &["*.example.com".into()]));
        assert!(!host_matches_allowlist("evil-example.com", &["*.example.com".into()]));

        assert!(is_non_public_ip("127.0.0.1".parse().unwrap()));
        assert!(is_non_public_ip("10.0.0.5".parse().unwrap()));
        assert!(is_non_public_ip("192.168.1.1".parse().unwrap()));
        assert!(is_non_public_ip("169.254.169.254".parse().unwrap()));
        assert!(is_non_public_ip("::1".parse().unwrap()));
        assert!(!is_non_public_ip("93.184.216.34".parse().unwrap()));
    }

    #[tokio::test]
    async fn blocks_private_ip_by_default_and_scans_local_listener_when_allowed() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let open_port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                let _ = sock.write_all(b"SSH-2.0-MockNoctra_1.0\r\n").await;
            }
        });

        // Allocate and drop another listener to obtain an unused closed port
        let closed_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let closed_port = closed_listener.local_addr().unwrap().port();
        drop(closed_listener);

        let default_settings = InternetSettings::default();
        let denied = execute_builtin_internet_tool(
            &default_settings,
            "net_port_scan",
            &serde_json::json!({
                "target": "127.0.0.1",
                "ports": format!("{open_port},{closed_port}")
            }),
            CancellationToken::new(),
        )
        .await;
        assert!(denied.is_err());

        let mut allowed_settings = InternetSettings::default();
        allowed_settings.allow_private_targets = true;
        let res = execute_builtin_internet_tool(
            &allowed_settings,
            "net_port_scan",
            &serde_json::json!({
                "target": "127.0.0.1",
                "ports": format!("{open_port},{closed_port}"),
                "timeout_ms": 800,
                "grab_banner": true
            }),
            CancellationToken::new(),
        )
        .await
        .unwrap();

        assert_eq!(res["openCount"], 1);
        assert_eq!(res["scannedCount"], 2);
        let open = res["openPorts"].as_array().unwrap();
        assert_eq!(open[0]["port"], open_port);
        assert!(open[0]["banner"]
            .as_str()
            .unwrap_or("")
            .contains("SSH-2.0-MockNoctra_1.0"));
    }

    #[tokio::test]
    async fn audits_http_security_headers_against_mock_server() {
        let app = Router::new().route(
            "/",
            get(|| async {
                let mut resp = "ok".into_response();
                resp.headers_mut().insert(
                    "x-content-type-options",
                    HeaderValue::from_static("nosniff"),
                );
                resp.headers_mut()
                    .insert("x-powered-by", HeaderValue::from_static("Express"));
                resp
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let mut settings = InternetSettings::default();
        settings.allow_private_targets = true;
        let res = execute_builtin_internet_tool(
            &settings,
            "net_http_security_check",
            &serde_json::json!({
                "target": format!("http://{addr}/"),
                "check_http_redirect": false
            }),
            CancellationToken::new(),
        )
        .await
        .unwrap();

        assert_eq!(res["statusCode"], 200);
        assert_eq!(res["usesHttps"], false);
        assert!(res["presentSecurityHeaders"]
            .as_array()
            .unwrap()
            .iter()
            .any(|h| h["header"] == "X-Content-Type-Options"));
        assert!(res["informationDisclosureHeaders"]
            .as_array()
            .unwrap()
            .iter()
            .any(|h| h["header"] == "x-powered-by"));
        assert!(res["missingSecurityHeaders"]
            .as_array()
            .unwrap()
            .iter()
            .any(|h| h["header"] == "HSTS"));
    }
}
