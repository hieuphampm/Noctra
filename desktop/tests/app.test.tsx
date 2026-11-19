import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import App from "@/App";
import { useAppStore } from "@/stores/appStore";
import { ApprovalModal } from "@/components/ApprovalModal";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { AiChangedFilesPopup } from "@/components/workspace/AiChangedFilesPopup";

describe("NOCTRA STUDIO UI & Store", () => {
  beforeEach(() => {
    useAppStore.getState().setLanguage("en");
    useAppStore.setState({
      activeSection: "chat",
      activeConversationId: null,
      activeProjectId: null,
      preferredExecutionMode: "review",
      preferredInternetMode: false,
      settingsSection: "general",
      approvalQueue: [],
      commandPaletteOpen: false,
      inspectorVisible: true,
      sidebarCollapsed: false,
      streamingText: "",
      streamingToolCalls: [],
    });
  });

  it("renders NOCTRA STUDIO shell, navigation, inspector, and status bar", () => {
    render(<App />);
    expect(screen.getAllByText(/NOCTRA STUDIO/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Conversations")).toBeInTheDocument();
    expect(screen.getByText("MCP Hub")).toBeInTheDocument();
    expect(screen.getByText("Skills Center")).toBeInTheDocument();
    expect(screen.getByText("Workflows")).toBeInTheDocument();
    expect(screen.getByText("Contextual Inspector")).toBeInTheDocument();
    expect(screen.getByText(/MCP: 0 connected/i)).toBeInTheDocument();
  });

  it("switches across all core modules and opens command palette with Ctrl+K", () => {
    render(<App />);
    fireEvent.click(screen.getByText("AI Providers"));
    expect(screen.getByText("New AI Provider")).toBeInTheDocument();

    fireEvent.click(screen.getByText("MCP Hub"));
    expect(screen.getByText("Configure MCP Server")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Skills Center"));
    expect(screen.getByText("GitHub Installer")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Workflows"));
    expect(screen.getByText("Run Workflow")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Marketplace"));
    expect(screen.getByText("Ecosystem Marketplace")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(
      screen.getByPlaceholderText(/Type a command or navigate/i)
    ).toBeInTheDocument();
  });

  it("displays full approval details and diff preview in ApprovalModal when queued", () => {
    useAppStore.getState().pushApprovalRequest({
      id: "req-1",
      agentId: "ag-1",
      agentName: "Coding Agent",
      category: "write_files",
      actionSummary: "Write src/index.ts",
      reason: "Agent requested write_file via Filesystem MCP",
      toolName: "write_file",
      affectedResources: ["src/index.ts"],
      exactPayload: { path: "src/index.ts", content: "console.log(1)" },
      diffPreview: "--- a/src/index.ts\n+++ b/src/index.ts\n-const old = 0;\n+const next = 1;",
      createdAt: new Date().toISOString(),
    });

    render(<ApprovalModal />);
    expect(screen.getByText("Permission Approval Required")).toBeInTheDocument();
    expect(screen.getByText("Write src/index.ts")).toBeInTheDocument();
    expect(screen.getByText("Proposed File Changes (Diff)")).toBeInTheDocument();
    expect(screen.getByText("-const old = 0;")).toBeInTheDocument();
    expect(screen.getByText("+const next = 1;")).toBeInTheDocument();
    expect(screen.getByText("Allow Once")).toBeInTheDocument();
    expect(screen.getByText("Allow for Session")).toBeInTheDocument();
    expect(screen.getByText("Always Allow")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("toggles between Review and Turbo execution modes and renders Import Folder IDE", () => {
    render(<App />);
    const turboBtns = screen.getAllByRole("button", { name: /Turbo/i });
    fireEvent.click(turboBtns[0]);
    expect(useAppStore.getState().preferredExecutionMode).toBe("turbo");

    const reviewBtns = screen.getAllByRole("button", { name: /Review/i });
    fireEvent.click(reviewBtns[0]);
    expect(useAppStore.getState().preferredExecutionMode).toBe("review");

    fireEvent.click(screen.getByText("Files"));
    expect(screen.getByText("Import a Project Folder")).toBeInTheDocument();
    expect(screen.getAllByText("Import Folder").length).toBeGreaterThan(0);
  });

  it("sends message on Enter and keeps newline on Shift+Enter in Chat composer", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/Enter to send, Shift\+Enter for newline/i);
    fireEvent.change(input, { target: { value: "Hello line 1" } });

    // Shift+Enter should NOT trigger send
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.queryByText(/Desktop runtime required/i)).not.toBeInTheDocument();

    // Plain Enter SHOULD trigger send
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(await screen.findByText(/Desktop runtime required/i)).toBeInTheDocument();
  });

  it("renders AI changed files as a collapsible popup with arrow toggle", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(
      <AiChangedFilesPopup
        paths={["skills/a/SKILL.md", "skills/a/README.md"]}
        onSelectFile={onSelect}
        onDismiss={onDismiss}
      />
    );

    const toggle = screen.getByRole("button", { name: /Updated by AI \(2\)/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("skills/a/SKILL.md")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("skills/a/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("skills/a/README.md")).toBeInTheDocument();

    fireEvent.click(screen.getByText("skills/a/SKILL.md"));
    expect(onSelect).toHaveBeenCalledWith("skills/a/SKILL.md");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders markdown and fenced code blocks with copy button", () => {
    render(<MarkdownRenderer content={"### Summary\n\n```ts\nconst x = 42;\n```"} />);
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("switches UI language between English and Vietnamese in Settings", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Settings"));
    expect(screen.getByText("General Preferences")).toBeInTheDocument();

    const langSelect = screen.getByLabelText("Language") as HTMLSelectElement;
    expect(langSelect.value).toBe("en");
    fireEvent.change(langSelect, { target: { value: "vi" } });

    expect(screen.getByText("Tùy chọn chung")).toBeInTheDocument();
    expect(screen.getByText("Hội thoại")).toBeInTheDocument();
    expect(screen.getByText("Thanh kiểm tra ngữ cảnh")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ngôn ngữ"), { target: { value: "en" } });
    expect(screen.getByText("General Preferences")).toBeInTheDocument();
    expect(screen.getByText("Conversations")).toBeInTheDocument();
  });

  it("toggles Internet Mode in Chat, navigates to Internet Mode settings, and shows scan warning in ApprovalModal", () => {
    render(<App />);

    const internetToggle = screen.getByRole("switch", { name: "Internet" });
    expect(internetToggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(internetToggle);
    expect(useAppStore.getState().preferredInternetMode).toBe(true);
    expect(internetToggle).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(/Internet Mode active — built-in security tools ready/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure Guardrails" }));
    expect(screen.getByText("Internet Mode & Security Scanner")).toBeInTheDocument();
    expect(screen.getByText(/Target Domain Allowlist/i)).toBeInTheDocument();

    act(() => {
      useAppStore.getState().pushApprovalRequest({
        id: "req-net-1",
        agentId: null,
        agentName: "Internet Mode",
        category: "internet_access",
        actionSummary: "TCP Port Scan on 'example.com' (ports: common)",
        reason: "Internet Mode requested 'net_port_scan' via Internet Mode (Review Mode).",
        toolName: "net_port_scan",
        affectedResources: ["example.com"],
        exactPayload: { target: "example.com", ports: "common" },
        createdAt: new Date().toISOString(),
      });
    });

    expect(
      screen.getByText(/Network security probe — verify that you own or have explicit authorization/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("TCP Port Scan on 'example.com' (ports: common)")
    ).toBeInTheDocument();
  });

  it("navigates to SSH Servers with password input, opens Quick SSH modal in Chat, and shows SSH approval warning", () => {
    render(<App />);

    // Open Quick SSH modal right from Chat toolbar
    fireEvent.click(screen.getByRole("button", { name: /Quick SSH/i }));
    expect(screen.getByText("Connect SSH Server")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter SSH password...")).toBeInTheDocument();
    expect(screen.getByText("Connect & Attach to Chat")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Navigate to SSH Servers module
    fireEvent.click(screen.getByText("SSH Servers"));
    expect(screen.getAllByText("New SSH Server").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Enter SSH password...")).toBeInTheDocument();
    expect(screen.getByText("Automate with AI")).toBeInTheDocument();

    // Verify SSH approval banner in ApprovalModal
    act(() => {
      useAppStore.getState().pushApprovalRequest({
        id: "req-ssh-1",
        agentId: "tpl-ssh-ops",
        agentName: "SSH Server Operator",
        category: "ssh_exec",
        actionSummary: "Run SSH command on 'root@10.0.0.5:22': systemctl restart nginx",
        reason: "SSH Server Operator requested 'ssh_exec' on SSH (Prod VPS) (Review Mode).",
        toolName: "ssh_exec",
        affectedResources: ["ssh:root@10.0.0.5:22"],
        exactPayload: { command: "systemctl restart nginx" },
        createdAt: new Date().toISOString(),
      });
    });

    expect(screen.getByText(/Remote SSH Server Operation/i)).toBeInTheDocument();
    expect(
      screen.getByText("Run SSH command on 'root@10.0.0.5:22': systemctl restart nginx")
    ).toBeInTheDocument();
  });
});
