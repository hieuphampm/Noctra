# NOCTRA STUDIO — Security Model

1. **Untrusted by Default**: External GitHub Skills, marketplace packages, and third-party MCP servers are flagged as `unverified` unless explicitly trusted by the user.
2. **No Automatic Script Execution**: Skill `scripts/` directories are scanned as metadata only and never executed automatically.
3. **Deterministic Tool Filtering**: An agent only receives tool definitions in its model request if the tool is globally enabled in MCP Hub, explicitly assigned to that agent, and (when in a project) permitted by the project scope.
4. **Path Containment**: Project file operations and agent file-scoped tool arguments are canonicalized and verified to stay within authorized root directories.
5. **Credential Isolation**: Secrets reside exclusively in OS Credential Storage (`noctra-studio` service) and are scrubbed from all logs and diagnostics.
