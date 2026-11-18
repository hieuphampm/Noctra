# NOCTRA AI

> **"Private Intelligence. Your Own Space."**

**NOCTRA AI** is a production-grade, privacy-first Android AI chat application built with Flutter and Dart. It enables users to connect directly to any OpenAI-compatible AI provider (`POST /chat/completions`, `GET /models`) using their own API credentials, local models (Ollama, LM Studio), or cloud endpoints without requiring an account or exposing telemetry to any developer backend.

---

## Core Architectural & Privacy Guarantees

1. **Zero-Telemetry, Zero-Backend Architecture**: NOCTRA AI contains no analytics SDKs, no crash-reporting uploaders, no advertising trackers, and no developer-operated servers.
2. **Hardware-Backed API Key Security**: All API keys are stored exclusively in Android Keystore-backed encrypted storage via `FlutterSecureStorage`. API keys are never written to plain-text `SharedPreferences`, Hive boxes, logs, or exported conversation backups.
3. **100% Local Conversation & Prompt Vault**: Conversations, messages, system prompts, custom AI personas, and prompt templates are persisted locally on-device using Hive.
4. **Explicit Transmission Control**: Users have granular per-conversation and global controls over whether prior chat history and file/image attachments are included in API payloads sent to their selected AI endpoint.
5. **Local Attachment Extraction**: Images (`JPG`, `JPEG`, `PNG`, `WEBP`), documents (`PDF`, `DOCX`, `XLSX`, `PPTX`), and data/code files (`TXT`, `MD`, `JSON`, `CSV`) are processed locally on the Android device.

---

## Visual Design System

| Token | Hex | Purpose |
| :--- | :--- | :--- |
| **Default Background** | `#090B10` | Deep obsidian primary canvas (`#000000` in AMOLED Black Mode) |
| **Secondary Background** | `#11141C` | Drawers, sheets, and composer bar |
| **Card Background** | `#171B26` | Interactive cards, input surfaces, and assistant bubbles |
| **Primary Accent** | `#9B87FF` | Electric Violet brand accent and active states |
| **Secondary Accent** | `#64DDF2` | Cyan orbital status indicators, code highlights, and badges |
| **Main Text** | `#F4F5FA` | High-contrast readable primary typography |
| **Secondary Text** | `#969BAD` | Subtitles, metadata, and secondary labels |

---

## Project Structure (Clean Architecture)

```text
lib/
  main.dart                         # App entry point, edge-to-edge UI, Hive & Riverpod bootstrap
  app.dart                          # Material 3 Dark/AMOLED theme & BiometricLockGate wrapper
  core/
    constants/app_constants.dart    # Brand constants, supported formats, default prompts
    errors/noctra_exception.dart    # Centralized error taxonomy & user-friendly error messages
    providers/app_providers.dart    # Riverpod 3.x Notifiers and dependency injection providers
    theme/
      noctra_colors.dart            # Design system color palette
      noctra_theme.dart             # Material 3 dark & AMOLED theme builder
    utilities/
      token_estimator.dart          # Heuristic token estimator & Haptics helper
      url_validator.dart            # API URL normalizer & HTTPS/HTTP security validator
  domain/
    entities/                       # Immutable domain models (Provider, Conversation, Message, etc.)
    repositories/                   # Abstract repository contracts
    usecases/                       # Context window builder & automatic title generator
  data/
    local/                          # HiveStorageService & KeystoreSecureCredentialStore
    repositories/                   # Concrete repository implementations
  services/
    ai/                             # OpenAiCompatibleClient & SseStreamParser
    file_processing/                # Local PDF, DOCX/XLSX/PPTX, text & image attachment processor
    networking/                     # Real-time online/offline connectivity monitor
    security/                       # Local biometric authentication service
    storage/                        # JSON/Markdown conversation export & secret redaction service
  shared/
    components/                     # Markdown + Syntax Highlighting + LaTeX renderer & sheets
    widgets/                        # ConnectionStatusPill & BiometricLockGate
  features/
    attachments/                    # Staged attachment preview bar & inspection modal
    chat/                           # ChatController, MessageBubble, ChatComposer
    home/                           # Adaptive HomeScreen, WelcomeHero, DrawerConversationPanel
    privacy/                        # Privacy Vault, data export/import, auto-deletion, full wipe
    prompts/                        # System Prompts, AI Personas, and Prompt Templates studio
    providers/                      # Multi-provider manager & Provider Editor with connection tester
    settings/                       # Comprehensive 5-section Settings interface
```

---

## Development, Testing & Build Commands

### 1. Install Dependencies
```bash
flutter pub get
```

### 2. Run Static Analysis
```bash
flutter analyze
```

### 3. Run Automated Unit & Widget Tests
```bash
flutter test
```

### 4. Run the App on a Connected Android Device or Emulator
```bash
flutter run
```

### 5. Build a Release APK
```bash
flutter build apk --release
```
*(Output APK: `build/app/outputs/flutter-apk/app-release.apk`)*

### 6. Build an Android App Bundle (AAB) for Play Store Distribution
```bash
flutter build appbundle --release
```
*(Output AAB: `build/app/outputs/bundle/release/app-release.aab`)*
