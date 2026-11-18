export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "general" | "noctra-ai" | "noctra-studio" | "privacy";
}

export const faqItems: FaqItem[] = [
  {
    id: "what-is-noctra",
    question: "What is NOCTRA?",
    answer:
      "NOCTRA is a privacy-first, local-first AI software ecosystem built around user ownership. It consists of NOCTRA AI (a mobile AI chat client for Android) and NOCTRA STUDIO (a desktop AI agent, MCP, Skills, and workflow orchestration platform).",
    category: "general",
  },
  {
    id: "difference-ai-vs-studio",
    question: "What is the difference between NOCTRA AI and NOCTRA STUDIO?",
    answer:
      "NOCTRA AI is focused on fast, private conversational AI on Android—supporting multiple OpenAI-compatible providers, local document/image extraction, personas, and biometric lock. NOCTRA STUDIO is a full desktop workstation built with Tauri 2 and Rust for connecting MCP servers, building custom agents, installing Skills from GitHub, and running node-based multi-agent workflows.",
    category: "general",
  },
  {
    id: "need-an-account",
    question: "Do I need an account?",
    answer:
      "No. Neither NOCTRA AI nor NOCTRA STUDIO requires a NOCTRA user account, cloud sign-in, or developer-operated backend to run.",
    category: "privacy",
  },
  {
    id: "own-api-key",
    question: "Can I use my own API key?",
    answer:
      "Yes. Both products follow a Bring-Your-Own-Provider model. Your API keys are stored using OS-native encrypted storage—Android Keystore on mobile and Windows Credential Manager, macOS Keychain, or Linux Secret Service on desktop—and are never written into plain-text exports.",
    category: "privacy",
  },
  {
    id: "supported-providers",
    question: "Which AI providers are supported?",
    answer:
      "Any service or local server exposing an OpenAI-compatible API (POST /chat/completions and GET /models) is supported, including cloud endpoints and local inference engines such as Ollama or LM Studio.",
    category: "general",
  },
  {
    id: "what-is-mcp",
    question: "What is MCP?",
    answer:
      "Model Context Protocol (MCP) is an open protocol for connecting AI models to external tools, resources, and prompts. NOCTRA STUDIO implements an MCP (2025-03-26) JSON-RPC 2.0 client supporting both local stdio servers and remote Streamable HTTP servers with explicit per-tool permission controls.",
    category: "noctra-studio",
  },
  {
    id: "skills-from-github",
    question: "Can I install Skills from GitHub?",
    answer:
      "Yes, in NOCTRA STUDIO. You can inspect a GitHub repository, branch, commit, or subdirectory—previewing its SKILL.md instructions and file manifest—before installing. External Skills are marked unverified by default, and supporting scripts are never executed automatically.",
    category: "noctra-studio",
  },
  {
    id: "is-noctra-free",
    question: "Is NOCTRA free?",
    answer:
      "NOCTRA does not charge a platform subscription to run the client software with your own local models or API keys. Note that if you connect paid third-party AI APIs, usage costs are billed directly by your chosen provider.",
    category: "general",
  },
  {
    id: "conversation-storage",
    question: "Where is my conversation history stored?",
    answer:
      "All conversations, prompts, agent configurations, and workflow runs are stored locally on your device—in Hive storage on Android (NOCTRA AI) and a local SQLite database on desktop (NOCTRA STUDIO). Note that prompts and attachments you choose to send to an external AI provider are transmitted to that provider.",
    category: "privacy",
  },
  {
    id: "collect-analytics",
    question: "Does NOCTRA collect analytics?",
    answer:
      "No. NOCTRA AI and NOCTRA STUDIO include zero analytics SDKs, zero advertising trackers, and zero automatic crash-reporting uploads by default.",
    category: "privacy",
  },
  {
    id: "work-offline",
    question: "Does NOCTRA work offline?",
    answer:
      "Your local history, prompts, documents, agents, and settings remain accessible offline. Generating AI responses offline works when connected to a local inference server on your machine or LAN (such as Ollama or LM Studio); cloud providers require an internet connection.",
    category: "general",
  },
  {
    id: "supported-os",
    question: "Which operating systems are supported?",
    answer:
      "NOCTRA AI targets Android. NOCTRA STUDIO is built on Tauri 2 targeting Windows, macOS, and Linux. Check the Download Center for currently published public builds and source build instructions.",
    category: "general",
  },
];
