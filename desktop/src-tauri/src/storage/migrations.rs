use crate::error::AppResult;
use chrono::Utc;
use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            model_id TEXT NOT NULL,
            custom_headers_json TEXT NOT NULL,
            temperature REAL NOT NULL,
            top_p REAL NOT NULL,
            max_tokens INTEGER NOT NULL,
            timeout_secs INTEGER NOT NULL,
            streaming INTEGER NOT NULL,
            default_system_prompt TEXT NOT NULL,
            has_api_key INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            mode TEXT NOT NULL,
            execution_mode TEXT NOT NULL DEFAULT 'review',
            internet_mode INTEGER NOT NULL DEFAULT 0,
            active_provider_id TEXT,
            active_model TEXT,
            active_agent_id TEXT,
            project_id TEXT,
            system_prompt_override TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            attachments_json TEXT NOT NULL,
            tool_calls_json TEXT NOT NULL,
            tool_call_id TEXT,
            token_usage_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

        CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            source TEXT NOT NULL,
            trust_level TEXT NOT NULL,
            transport TEXT NOT NULL,
            endpoint_or_command TEXT NOT NULL,
            args_json TEXT NOT NULL,
            env_keys_json TEXT NOT NULL,
            plain_env_json TEXT NOT NULL,
            auth_type TEXT NOT NULL,
            auth_config_json TEXT NOT NULL,
            has_auth_secret INTEGER NOT NULL DEFAULT 0,
            auto_reconnect INTEGER NOT NULL DEFAULT 1,
            max_reconnects INTEGER NOT NULL DEFAULT 3,
            enabled INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'disconnected',
            last_error TEXT,
            server_info_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mcp_tools (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            input_schema_json TEXT NOT NULL,
            output_schema_json TEXT,
            required_permissions_json TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            available INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mcp_resources (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            uri TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            mime_type TEXT,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mcp_prompts (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            arguments_json TEXT NOT NULL,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_url TEXT,
            branch_or_tag TEXT,
            subdirectory TEXT,
            commit_sha TEXT,
            version TEXT NOT NULL,
            local_path TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            trust_level TEXT NOT NULL,
            frontmatter_json TEXT NOT NULL,
            instructions_md TEXT NOT NULL,
            dependencies_json TEXT NOT NULL,
            supporting_files_json TEXT NOT NULL,
            validation_errors_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            avatar TEXT NOT NULL,
            role TEXT NOT NULL,
            personality TEXT NOT NULL,
            system_instructions TEXT NOT NULL,
            provider_id TEXT,
            model_id TEXT,
            temperature REAL NOT NULL,
            max_tokens INTEGER NOT NULL,
            context_window INTEGER NOT NULL,
            assigned_mcp_server_ids_json TEXT NOT NULL,
            enabled_tool_ids_json TEXT NOT NULL,
            assigned_skill_ids_json TEXT NOT NULL,
            file_access_mode TEXT NOT NULL,
            allowed_directories_json TEXT NOT NULL,
            internet_access INTEGER NOT NULL DEFAULT 0,
            external_api_access INTEGER NOT NULL DEFAULT 0,
            autonomous_execution INTEGER NOT NULL DEFAULT 0,
            require_approval_sensitive INTEGER NOT NULL DEFAULT 1,
            max_steps INTEGER NOT NULL,
            max_tool_calls INTEGER NOT NULL,
            max_runtime_secs INTEGER NOT NULL,
            retry_policy TEXT NOT NULL,
            error_strategy TEXT NOT NULL,
            memory_config_json TEXT NOT NULL,
            is_template INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_memories (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            project_id TEXT,
            scope TEXT NOT NULL,
            key TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            root_path TEXT NOT NULL,
            instructions TEXT NOT NULL,
            assigned_agent_ids_json TEXT NOT NULL,
            assigned_skill_ids_json TEXT NOT NULL,
            allowed_tool_ids_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            nodes_json TEXT NOT NULL,
            edges_json TEXT NOT NULL,
            max_agent_depth INTEGER NOT NULL,
            max_total_tool_calls INTEGER NOT NULL,
            max_duration_secs INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_name TEXT NOT NULL,
            status TEXT NOT NULL,
            current_node_id TEXT,
            context_json TEXT NOT NULL,
            events_json TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            error TEXT
        );

        CREATE TABLE IF NOT EXISTS permission_rules (
            id TEXT PRIMARY KEY,
            scope TEXT NOT NULL,
            target_id TEXT,
            category TEXT NOT NULL,
            resource_pattern TEXT NOT NULL,
            mode TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS marketplace_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            adapter_type TEXT NOT NULL,
            url TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            builtin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
        "#,
    )?;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))?;
    if count == 0 {
        conn.execute("INSERT INTO schema_version (version) VALUES (1)", [])?;
        seed_initial_data(conn)?;
    }

    ensure_column_exists(
        conn,
        "conversations",
        "execution_mode",
        "TEXT NOT NULL DEFAULT 'review'",
    )?;

    ensure_column_exists(
        conn,
        "conversations",
        "internet_mode",
        "INTEGER NOT NULL DEFAULT 0",
    )?;

    seed_security_auditor_template(conn)?;

    Ok(())
}

fn seed_security_auditor_template(conn: &Connection) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let default_mem = serde_json::json!({
        "conversationMemory": true,
        "agentLocalMemory": true,
        "projectMemory": true,
        "retentionMessages": 30
    })
    .to_string();

    conn.execute(
        r#"INSERT OR IGNORE INTO agents (
            id, name, description, avatar, role, personality, system_instructions,
            provider_id, model_id, temperature, max_tokens, context_window,
            assigned_mcp_server_ids_json, enabled_tool_ids_json, assigned_skill_ids_json,
            file_access_mode, allowed_directories_json, internet_access, external_api_access,
            autonomous_execution, require_approval_sensitive, max_steps, max_tool_calls,
            max_runtime_secs, retry_policy, error_strategy, memory_config_json, is_template,
            created_at, updated_at
        ) VALUES (
            'tpl-security',
            'Security Auditor',
            'Audits authorized domains for open TCP ports, service banners, DNS records, and HTTP/HTTPS security headers.',
            'shield',
            'Application Security Analyst',
            'Methodical, defensive, evidence-driven',
            'You are a defensive Security Auditor. Only inspect domains and hosts the user owns or is explicitly authorized to test. Use net_dns_lookup, net_port_scan, net_http_security_check, and net_fetch_url to gather factual evidence, categorize risk severity (Critical/High/Medium/Low/Info), and provide actionable hardening recommendations.',
            NULL, NULL, 0.2, 4096, 32768,
            '[]', '[]', '[]',
            'none', '[]', 1, 1,
            0, 1, 12, 24,
            180, 'once', 'stop', ?1, 1,
            ?2, ?2
        )"#,
        rusqlite::params![default_mem, now],
    )?;
    Ok(())
}

fn ensure_column_exists(
    conn: &Connection,
    table: &str,
    column: &str,
    col_def: &str,
) -> AppResult<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !cols.iter().any(|c| c == column) {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {col_def}"),
            [],
        )?;
    }
    Ok(())
}

fn seed_initial_data(conn: &Connection) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();

    let starter_agents = [
        ("tpl-general", "General Assistant", "Balanced everyday assistant for reasoning, planning, and structured responses.", "sparkles", "Generalist AI", "Clear, helpful, concise", "You are a thoughtful, accurate general assistant. Ask clarifying questions only when essential and keep explanations crisp."),
        ("tpl-research", "Research Agent", "Gathers, cross-checks, and synthesizes multi-source technical and web information.", "search", "Lead Researcher", "Rigorous, evidence-driven, skeptical", "You are a Research Agent. Prioritize primary sources, verify claims, distinguish verified facts from hypotheses, and present structured citations."),
        ("tpl-coding", "Coding Agent", "Architects, writes, reviews, and debugs software across multiple languages.", "code", "Principal Software Engineer", "Pragmatic, clean, test-focused", "You are a Coding Agent. Write modular, maintainable, well-typed code. Respect workspace boundaries and explain non-obvious tradeoffs concisely."),
        ("tpl-files", "File Management Agent", "Organizes, inspects, and transforms local files strictly within authorized directories.", "folder", "Workspace Curator", "Careful, methodical, safety-first", "You are a File Management Agent. Never access paths outside authorized project scopes and confirm destructive changes before acting."),
        ("tpl-browser", "Browser Research Agent", "Guides web research and structured information extraction using permitted MCP web tools.", "globe", "Web Analyst", "Focused, structured, verifiable", "You are a Browser Research Agent. Use only permitted MCP web tools and summarize findings cleanly with source URLs."),
        ("tpl-data", "Data Analyst", "Analyzes CSV, JSON, logs, and quantitative datasets into actionable tables and insights.", "bar-chart", "Quantitative Analyst", "Precise, analytical, transparent", "You are a Data Analyst Agent. Show calculations, state assumptions, and highlight anomalies or data gaps."),
        ("tpl-writer", "Writing Agent", "Drafts polished documentation, technical specs, briefs, and executive summaries.", "pen", "Technical Writer", "Articulate, structured, adaptive", "You are a Writing Agent. Match tone to audience, eliminate fluff, and structure documents with clear headings."),
        ("tpl-automation", "Automation Agent", "Executes multi-step operational routines safely with explicit checkpoints.", "zap", "Automation Operator", "Deterministic, reliable, cautious", "You are an Automation Agent. Validate preconditions before every side-effecting step and halt cleanly on unexpected errors."),
    ];

    let default_mem = serde_json::json!({
        "conversationMemory": true,
        "agentLocalMemory": true,
        "projectMemory": true,
        "retentionMessages": 30
    })
    .to_string();

    for (id, name, desc, avatar, role, personality, instructions) in starter_agents {
        conn.execute(
            r#"INSERT OR IGNORE INTO agents (
                id, name, description, avatar, role, personality, system_instructions,
                provider_id, model_id, temperature, max_tokens, context_window,
                assigned_mcp_server_ids_json, enabled_tool_ids_json, assigned_skill_ids_json,
                file_access_mode, allowed_directories_json, internet_access, external_api_access,
                autonomous_execution, require_approval_sensitive, max_steps, max_tool_calls,
                max_runtime_secs, retry_policy, error_strategy, memory_config_json, is_template,
                created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                NULL, NULL, 0.4, 4096, 32768,
                '[]', '[]', '[]',
                'project_only', '[]', 0, 0,
                0, 1, 12, 24,
                180, 'once', 'stop', ?8, 1,
                ?9, ?9
            )"#,
            rusqlite::params![id, name, desc, avatar, role, personality, instructions, default_mem, now],
        )?;
    }

    // Seed built-in configurable marketplace adapters (real endpoints, not fake catalogs)
    let sources = [
        (
            "src-official-mcp",
            "Official MCP Registry",
            "mcp",
            "mcp_registry",
            "https://registry.modelcontextprotocol.io/v0/servers",
        ),
        (
            "src-github-mcp",
            "Model Context Protocol Reference Servers (GitHub)",
            "mcp",
            "github_repo",
            "https://api.github.com/repos/modelcontextprotocol/servers/contents/src",
        ),
        (
            "src-github-skills",
            "Agent Skills Reference Catalog (GitHub)",
            "skills",
            "github_repo",
            "https://api.github.com/repos/anthropics/skills/contents/skills",
        ),
    ];

    for (id, name, kind, adapter_type, url) in sources {
        conn.execute(
            "INSERT OR IGNORE INTO marketplace_sources (id, name, kind, adapter_type, url, enabled, builtin, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, ?6)",
            rusqlite::params![id, name, kind, adapter_type, url, now],
        )?;
    }

    Ok(())
}
