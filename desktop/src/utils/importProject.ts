import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { QueryClient } from "@tanstack/react-query";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import type {
  AgentConfig,
  AiProvider,
  Conversation,
  ProjectImportResult,
} from "@/types/noctra";

export async function pickAndImportProjectFolder(params: {
  qc: QueryClient;
  activeConv?: Conversation;
  providers?: AiProvider[];
  agents?: AgentConfig[];
  openInChatSplit?: boolean;
}): Promise<ProjectImportResult | null> {
  if (!isTauriRuntime()) {
    throw new Error("Desktop runtime required to import a local folder.");
  }

  const dir = await openDialog({
    directory: true,
    multiple: false,
    title: "Import Project Folder",
  });
  if (!dir || Array.isArray(dir)) return null;

  const result = await api.importProjectFolder(dir);
  const store = useAppStore.getState();

  store.setActiveProjectId(result.project.id);
  store.setWorkspaceSplitOpen(true);

  const defaultCodingAgent =
    params.agents?.find((a) => a.id === "tpl-coding")?.id ??
    params.agents?.[0]?.id ??
    null;

  if (params.openInChatSplit) {
    if (params.activeConv) {
      const updated = await api.updateConversation({
        ...params.activeConv,
        projectId: result.project.id,
        mode: "agent",
        activeAgentId: params.activeConv.activeAgentId ?? defaultCodingAgent,
      });
      store.setActiveConversationId(updated.id);
    } else {
      const prov = params.providers?.[0];
      const created = await api.createConversation({
        title: `Project: ${result.project.name}`,
        mode: "agent",
        executionMode: store.preferredExecutionMode,
        providerId: prov?.id ?? null,
        model: prov?.modelId ?? null,
        agentId: defaultCodingAgent,
        projectId: result.project.id,
      });
      store.setActiveConversationId(created.id);
    }
    store.setActiveSection("chat");
  }

  await params.qc.invalidateQueries({ queryKey: ["projects"] });
  await params.qc.invalidateQueries({ queryKey: ["conversations"] });
  await params.qc.invalidateQueries({ queryKey: ["project-tree", result.project.id] });
  await params.qc.invalidateQueries({ queryKey: ["project-metadata", result.project.id] });

  return result;
}
