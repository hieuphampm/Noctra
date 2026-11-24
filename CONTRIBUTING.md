# Contributing to NOCTRA

Thank you for your interest in contributing to **NOCTRA**!

> **"YOUR AI. YOUR RULES. YOUR OWN ECOSYSTEM."**

NOCTRA is a privacy-first, local-first AI ecosystem spanning Android (**NOCTRA AI**) and Desktop (**NOCTRA STUDIO**). Every contribution—whether fixing a bug, hardening security guardrails, improving documentation, or proposing a thoughtful feature—helps keep powerful AI tools private and user-owned.

---

## Table of Contents

1. [Core Principles & Non-Negotiables](#1-core-principles--non-negotiables)
2. [Ways to Contribute](#2-ways-to-contribute)
3. [Repository Structure](#3-repository-structure)
4. [Development Setup & Verification](#4-development-setup--verification)
5. [Coding, Localization & Security Guidelines](#5-coding-localization--security-guidelines)
6. [Branching & Commit Conventions](#6-branching--commit-conventions)
7. [Submitting a Pull Request](#7-submitting-a-pull-request)
8. [Reporting Security Issues](#8-reporting-security-issues)
9. [License & Attribution](#9-license--attribution)

---

## 1. Core Principles & Non-Negotiables

Before submitting changes, please make sure your work aligns with NOCTRA's foundational guarantees:

- **Zero Telemetry & Zero Hidden Cloud Calls**: Never add analytics SDKs, crash uploaders, ad trackers, or background requests to unconfigured third-party endpoints.
- **Strict Credential Isolation**: API keys, MCP auth secrets, and SSH credentials must **only** be stored in hardware/OS-backed stores (`FlutterSecureStorage` / Android Keystore on Android; `keyring` OS Credential Manager on Desktop) or volatile session RAM—never in plain-text SQLite, Hive boxes, logs, or exported JSON backups.
- **Deterministic Sandboxing & Approval Gates**:
  - File operations must enforce canonicalized path containment within authorized project roots.
  - External GitHub Skills and third-party MCP servers must remain `unverified` by default; `scripts/` inside Skills must **never** be executed automatically.
  - Sensitive or destructive actions (such as mutating files in Review Mode, active network scans, remote SSH execution, or sensitive `/browser` actions like payments/form submissions/deletions) must respect `PermissionManager` and `ApprovalModal` confirmations.
- **Log Redaction**: Register sensitive runtime values with `SecretRedactor` so secrets are never leaked into audit logs, error messages, or UI snapshots.

---

## 2. Ways to Contribute

- **Bug Reports**: Open a GitHub Issue describing your OS/device, app version, reproduction steps, expected behavior, and actual behavior (ensure any logs or screenshots contain **no API keys or personal secrets**).
- **Feature Proposals**: Open an issue or discussion outlining the use case, how it fits NOCTRA's local-first architecture, and any security/permission implications before starting large implementations.
- **Code Contributions**: Fix bugs, improve performance, expand automated test coverage, or implement approved features across `android/` and `desktop/`.
- **Documentation & Localization**: Improve technical/architecture docs (`desktop/docs/`, `README.md`) or English (`en`) and Vietnamese (`vi`) translations.

---

## 3. Repository Structure

```text
noctra/
├── android/     # NOCTRA AI — Privacy-first Android AI chat app (Flutter & Dart)
├── assets/      # Brand & README media assets
└── desktop/     # NOCTRA STUDIO — Desktop AI agent, MCP, SSH, Browser & workflow platform (Tauri 2, Rust, React)
```

---

## 4. Development Setup & Verification

Fork the repository, clone your fork locally, and set up only the subproject(s) relevant to your change.

### A. NOCTRA STUDIO (`desktop/`)

**Prerequisites**: Node.js 20+, npm 10+, Rust stable toolchain (`rustup`), and platform WebView dependencies (WebView2 on Windows, Xcode CLT on macOS, `libwebkit2gtk-4.1-dev` & `libssl-dev` on Ubuntu/Debian).

```bash
cd desktop
npm install

# Start desktop app in development mode
npm run tauri dev

# Required checks before opening a PR:
npm run typecheck
npm test
npm run build

cd src-tauri
cargo test
```

### B. NOCTRA AI (`android/`)

**Prerequisites**: Flutter SDK (stable) & Android SDK.

```bash
cd android
flutter pub get

# Required checks before opening a PR:
flutter analyze
flutter test
```

---

## 5. Coding, Localization & Security Guidelines

- **Rust (`desktop/src-tauri/`)**:
  - Return structured `AppResult<T>` / `AppError` variants rather than panicking (`unwrap()`/`expect()`) in production runtime code paths.
  - Propagate `CancellationToken` on async network, MCP, SSH, Browser, and AI streaming tasks so runs can be cleanly stopped by the user.
  - Write unit/integration tests alongside modules (`#[cfg(test)] mod tests`) using in-memory SQLite (`Database::open_in_memory`) and mock local listeners (`axum` / `TcpListener`) rather than live external servers.
- **React & TypeScript (`desktop/src/`)**:
  - Keep TypeScript types strict (`npm run typecheck` must pass with zero errors) and keep Rust `serde(rename_all = "camelCase")` models synchronized with `desktop/src/types/noctra.ts`.
  - When adding user-facing text in `desktop/`, provide both **English (`en`)** and **Vietnamese (`vi`)** entries in `desktop/src/i18n/index.ts`.
- **Flutter & Dart (`android/`)**:
  - Follow Clean Architecture boundaries (`domain/`, `data/`, `services/`, `features/`) and keep `flutter analyze` warning-free.
- **Never Commit Secrets or Build Binaries**:
  - Do not commit `.env` files, private keys, API tokens, `target/`, `dist/`, `build/`, or installer binaries (`desktop/releases/`, `android/releases/`).

---

## 6. Branching & Commit Conventions

1. Create a focused feature or fix branch from `main`:
   ```bash
   git checkout -b feat/short-description
   # or: fix/short-description, docs/short-description, refactor/short-description
   ```
2. Follow **Conventional Commits** with an optional scope (`desktop`, `android`):
   - `feat(desktop): add ...`
   - `fix(android): handle ...`
   - `refactor(desktop): simplify ...`
   - `docs: update ...`
   - `test(desktop): cover ...`
   - `chore(desktop): update ...`

---

## 7. Submitting a Pull Request

Before opening your Pull Request against `main`, verify this checklist:

- [ ] Your branch is up to date with `main` and scoped to a single cohesive change.
- [ ] All relevant static checks and automated test suites pass (`cargo test`, `npm run typecheck`, `npm test`, `npm run build`, or `flutter analyze && flutter test`).
- [ ] New tools, permissions, or security-sensitive behaviors include automated tests and updated documentation (`desktop/docs/SECURITY.md` if applicable).
- [ ] User-facing UI strings in NOCTRA STUDIO include both `en` and `vi` translations.
- [ ] No secrets, credentials, or compiled release installers are included in the diff.

In your PR description, briefly explain **what** changed, **why** it is needed, and **how** you verified it.

---

## 8. Reporting Security Issues

Security and privacy are central to NOCTRA. **Please do not open a public GitHub issue for undisclosed security vulnerabilities** (such as sandbox escapes, credential exposure, SSRF bypasses, or permission gate bypasses).

Instead, report security findings privately to the maintainer:

- **Maintainer**: hieuphampm
- **Email**: `hieuphamminh976@gmail.com`

Please include affected component(s), reproduction steps or proof-of-concept, and potential impact so we can investigate and ship a fix promptly.

---

## 9. License & Attribution

By contributing to NOCTRA, you agree that your contributions will be distributed under the terms of the [**NOCTRA Non-Commercial Attribution License**](LICENSE.md).

- Personal, educational, research, and non-commercial modifications/redistributions are welcome with proper attribution to the original author (**hieuphampm**).
- Commercial use requires separate written permission as detailed in [`LICENSE.md`](LICENSE.md).
