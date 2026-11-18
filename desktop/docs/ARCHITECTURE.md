# NOCTRA STUDIO — Architecture Overview

## Layering

- **Frontend (`src/`)**: React 19, TypeScript, Tailwind CSS v4, Zustand (`appStore.ts`), TanStack Query, and typed Tauri IPC (`src/services/tauri.ts`).
- **Backend (`src-tauri/src/`)**:
  - `storage/`: SQLite (`rusqlite` bundled) with schema versioning, portable secret-free backup export/import, and local data wipe.
  - `security/`: `SecretRedactor`, `CredentialStore` (`keyring` OS native backend + in-memory test backend), and `sandbox` path canonicalization & child env filtering.
  - `permissions/`: Scoped rule evaluator (`agent` -> `project` -> `global`) and `oneshot`-backed interactive approval tickets.
  - `ai/`: OpenAI-compatible HTTP + SSE client with incremental `tool_calls` assembly and local attachment extraction.
  - `mcp/`: Spec-compliant MCP 2025-03-26 JSON-RPC 2.0 client (`stdio` & `Streamable HTTP`) with JSON Schema input validation (`jsonschema`).
  - `skills/` & `marketplace/`: Safe `SKILL.md` parser, GitHub tree/file inspector, ZIP/local importer, and pluggable marketplace adapters.
  - `agents/` & `workflows/`: Deterministic tool-permissioned agent loop, multi-agent coordinator, and pausable/cancellable DAG workflow executor.
