"use client";

import { useState } from "react";
import {
  MessageSquare,
  Server,
  Paperclip,
  Shield,
  Lock,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utilities/cn";

const tabs = [
  { id: "chat", label: "Chat Stream", icon: MessageSquare },
  { id: "providers", label: "Providers", icon: Server },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "privacy", label: "Privacy Vault", icon: Shield },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function AndroidMockupInteractive() {
  const [activeTab, setActiveTab] = useState<TabId>("chat");

  return (
    <div className="grid items-center gap-8 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-5">
        <span className="inline-block rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-3 py-1 font-mono text-[11px] text-[#A78BFA]">
          Interactive App UI Preview
        </span>
        <h3 className="text-2xl font-semibold text-[#F5F5FA]">
          Built natively for Android focus and clarity.
        </h3>
        <p className="text-sm leading-relaxed text-[#969BAD]">
          Explore the four core workflows inside NOCTRA AI: real-time SSE
          streaming chat, custom OpenAI-compatible provider setup, on-device
          document extraction, and the local Privacy Vault.
        </p>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]",
                  active
                    ? "border-[#A78BFA]/50 bg-[#A78BFA]/15 text-[#F5F5FA]"
                    : "border-white/[0.08] bg-[#10131D] text-[#969BAD] hover:border-white/[0.15] hover:text-[#F5F5FA]"
                )}
              >
                <tab.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-[#A78BFA]" : "text-[#969BAD]"
                  )}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Smartphone Frame */}
      <div className="lg:col-span-7">
        <div className="mx-auto max-w-[340px] rounded-[2.4rem] border border-white/[0.14] bg-[#090B10] p-3.5 shadow-2xl shadow-black/80">
          <div className="min-h-[500px] rounded-[1.85rem] border border-white/[0.07] bg-[#11141C] p-4">
            {/* Top Status */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <div className="text-xs font-semibold text-[#F5F5FA]">
                  NOCTRA AI
                </div>
                <div className="font-mono text-[10px] text-[#67DDF2]">
                  {activeTab === "chat" && "Streaming · Custom Endpoint"}
                  {activeTab === "providers" && "Provider Manager"}
                  {activeTab === "attachments" && "Local File Processor"}
                  {activeTab === "privacy" && "Privacy Vault · Hive"}
                </div>
              </div>
              <span className="rounded-full border border-white/[0.08] bg-[#171B26] px-2 py-0.5 font-mono text-[10px] text-[#969BAD]">
                AMOLED Ready
              </span>
            </div>

            {/* Dynamic Tab Screen */}
            {activeTab === "chat" && (
              <div className="mt-4 space-y-3 text-xs">
                <div className="rounded-xl border border-white/[0.08] bg-[#171B26] p-2.5 text-[11px] text-[#969BAD]">
                  Persona: <span className="text-[#F5F5FA]">Technical Reviewer</span>
                </div>
                <div className="ml-8 rounded-2xl rounded-tr-sm bg-[#A78BFA]/20 p-3 text-[#F5F5FA]">
                  Compare my local benchmark CSV with last week&apos;s summary.
                </div>
                <div className="mr-4 rounded-2xl rounded-tl-sm border border-white/[0.08] bg-[#171B26] p-3 leading-relaxed text-[#F5F5FA]">
                  <p>
                    Latency dropped by 18% after switching to local streaming.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-[#090B10] p-2 font-mono text-[10px] text-[#67DDF2]">
                    {`POST /v1/chat/completions\nstream: true`}
                  </pre>
                </div>
                <div className="mt-6 rounded-xl border border-white/[0.08] bg-[#090B10] px-3 py-2.5 text-[11px] text-[#969BAD]">
                  Type a prompt or attach PDF, DOCX, PNG...
                </div>
              </div>
            )}

            {activeTab === "providers" && (
              <div className="mt-4 space-y-2.5 text-xs">
                {[
                  {
                    name: "Cloud OpenAI-Compatible",
                    url: "https://api.provider.example/v1",
                    status: "Connected",
                  },
                  {
                    name: "Home Ollama LAN",
                    url: "http://192.168.1.40:11434/v1",
                    status: "Local LAN",
                  },
                  {
                    name: "LM Studio Workstation",
                    url: "http://192.168.1.25:1234/v1",
                    status: "Standby",
                  },
                ].map((provider) => (
                  <div
                    key={provider.name}
                    className="rounded-xl border border-white/[0.08] bg-[#171B26] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#F5F5FA]">
                        {provider.name}
                      </span>
                      <span className="rounded bg-[#67DDF2]/15 px-1.5 py-0.5 font-mono text-[9px] text-[#67DDF2]">
                        {provider.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-[#969BAD]">
                      {provider.url}
                    </p>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-xl border border-[#A78BFA]/25 bg-[#A78BFA]/10 p-3 text-[11px] text-[#F5F5FA]">
                  <Lock className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
                  <span>API keys stored in Android Keystore</span>
                </div>
              </div>
            )}

            {activeTab === "attachments" && (
              <div className="mt-4 space-y-2.5 text-xs">
                <p className="text-[11px] text-[#969BAD]">
                  Files are parsed locally on-device before you confirm sending:
                </p>
                {[
                  {
                    name: "architecture-spec.pdf",
                    detail: "PDF · Extracted text inspected",
                    icon: FileText,
                  },
                  {
                    name: "metrics-q4.xlsx",
                    detail: "XLSX · Parsed locally",
                    icon: FileText,
                  },
                  {
                    name: "diagram-draft.webp",
                    detail: "WEBP · Multimodal image staged",
                    icon: ImageIcon,
                  },
                ].map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#171B26] p-3"
                  >
                    <file.icon
                      className="h-4 w-4 shrink-0 text-[#67DDF2]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[11px] text-[#F5F5FA]">
                        {file.name}
                      </div>
                      <div className="text-[10px] text-[#969BAD]">
                        {file.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "privacy" && (
              <div className="mt-4 space-y-2.5 text-xs">
                {[
                  "Biometric Lock Gate (local_auth)",
                  "Android Keystore Credential Store",
                  "Secret Redaction on JSON/MD Export",
                  "Per-Chat History Transmission Toggle",
                  "Zero Analytics & Zero Ad Trackers",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#171B26] p-3 text-[11px] text-[#F5F5FA]"
                  >
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-[#A78BFA]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
