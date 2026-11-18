# NOCTRA STUDIO

> **"YOUR AI. YOUR AGENTS. YOUR ECOSYSTEM."**

**NOCTRA STUDIO** is a privacy-first, extensible desktop AI agent platform built with **Tauri 2**, **Rust**, **React**, **TypeScript**, and **SQLite**. It runs locally on your machine with zero telemetry, zero mandatory accounts, OS-backed credential storage, official MCP protocol support (`stdio` & `Streamable HTTP`), GitHub/local/marketplace Skills, custom AI Agents, and a real node-based Workflow Execution Engine.

---

## Core Architecture

NOCTRA STUDIO is built around five integrated subsystems backed by a Rust/SQLite core:

1. **AI Chat Engine (`src-tauri/src/ai/`)**
   - Multi-provider OpenAI-compatible client (`POST /chat/completions`, `GET /models`)
   - Server-Sent Events (SSE) streaming with automatic JSON fallback
   - Conversation memory, message editing/regeneration/deletion, and Markdown + syntax highlighting
   - Local file and multimodal image attachment processing
   - Direct Chat Mode vs. Agent Mode

2. **MCP Hub & Tool Explorer (`src-tauri/src/mcp/`)**
   - Official MCP (`2025-03-26`) JSON-RPC 2.0 client over **stdio** (filtered env, sandboxed process management) and **Streamable HTTP** (`Mcp-Session-Id`, SSE + JSON responses, Bearer/OAuth/custom headers)
   - Simultaneous multi-server management, `ping` health checks, bounded auto-reconnect, redacted logs
   - Unified Tool Explorer with strict JSON Schema input validation (`jsonschema`), manual testing, and Resources/Prompts inspection

3. **Agent Builder & Multi-Agent Runtime (`src-tauri/src/agents/`)**
   - Visual configuration for identity, model overrides, assigned MCP servers/tools, assigned Skills, directory scoping, execution limits (`maxSteps`, `maxToolCalls`, `maxRuntimeSecs`), and isolated memory
   - Built-in starter templates (General, Research, Coding, File Management, Browser Research, Data Analyst, Writing, Automation)
   - Sequential & parallel Multi-Agent Orchestrator with bounded recursion depth (`maxAgentDepth`)

4. **Skills Center & Marketplace (`src-tauri/src/skills/`, `src-tauri/src/marketplace/`)**
   - `SKILL.md` YAML frontmatter + Markdown parser and built-in Skill Editor with supporting file tree
   - GitHub repository/subdirectory/branch/commit inspector: previews `SKILL.md` and file manifests **before** installation
   - Local folder & ZIP imports; scripts are never executed automatically
   - Extensible Marketplace adapters (Official MCP Registry, GitHub directories, custom JSON catalogs)

5. **Visual Workflow Engine (`src-tauri/src/workflows/`)**
   - Node-based DAG builder (`Start`, `Input`, `AI Agent`, `MCP Tool`, `Skill`, `Conditional`, `Approval`, `Delay`, `Output`, `End`)
   - Live execution engine with pause, resume, cancel, timeline tracking, and persisted run history

---

## Security & Privacy Guarantees

- **Zero Telemetry / Zero Cloud Backend**: No accounts, no tracking, no analytics, no automatic uploads.
- **OS Credential Storage**: API keys, MCP auth secrets, and secret environment variables are stored in Windows Credential Manager / macOS Keychain / Linux Secret Service via `keyring` — never in SQLite or portable JSON exports.
- **Secret Redaction**: `SecretRedactor` scrubs known secrets and credential patterns (`Bearer ...`, `sk-...`, `ghp_...`) from all logs and UI error messages.
- **Granular Permissions & Sandbox**: `Ask every time`, `Allow for this session`, `Always allow`, `Deny` with interactive approval modals showing exact tool arguments and affected paths, plus canonicalized path containment for project scopes.

---

## Development Setup

### Prerequisites
- **Node.js** 20+ and **npm** 10+
- **Rust** (`rustup` stable toolchain; on Windows, either MSVC Build Tools or `x86_64-pc-windows-gnu` with `src-tauri/.cargo/config.toml`)
- **Platform dependencies** (WebView2 on Windows; Xcode CLT on macOS; `libwebkit2gtk-4.1-dev` & `libssl-dev` on Ubuntu/Debian)

### Install & Run

```bash
npm install
npm run tauri dev
```

### Testing & Verification

```bash
# Frontend TypeScript check, Vitest unit/UI tests, and Vite production bundle
npm run typecheck
npm test
npm run build

# Rust backend unit & integration tests (mock OpenAI SSE + mock stdio/Streamable HTTP MCP + Agent E2E + Workflow engine)
cd src-tauri
cargo test
```

### Building Desktop Installers

```bash
# Build native installer for the current OS (NSIS .exe / .msi on Windows, .dmg on macOS, .AppImage/.deb on Linux)
npm run tauri build
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/SECURITY.md`](docs/SECURITY.md) for deeper technical details.
