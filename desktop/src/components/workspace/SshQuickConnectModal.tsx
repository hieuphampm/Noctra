import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, Server, Terminal, X, Zap } from "lucide-react";
import { api } from "@/services/tauri";
import { useI18n } from "@/i18n";
import type { SshServer } from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SshQuickConnectModalProps {
  open: boolean;
  existingServer?: SshServer | null;
  onClose: () => void;
  onConnected: (server: SshServer, enableTurbo: boolean) => Promise<void> | void;
}

export function SshQuickConnectModal({
  open,
  existingServer,
  onClose,
  onConnected,
}: SshQuickConnectModalProps) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [name, setName] = React.useState("");
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState(22);
  const [username, setUsername] = React.useState("root");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [savePassword, setSavePassword] = React.useState(true);
  const [defaultWorkingDir, setDefaultWorkingDir] = React.useState("");
  const [enableTurbo, setEnableTurbo] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setPassword("");
    setShowPassword(false);
    if (existingServer) {
      setName(existingServer.name);
      setHost(existingServer.host);
      setPort(existingServer.port);
      setUsername(existingServer.username);
      setDefaultWorkingDir(existingServer.defaultWorkingDir);
    } else {
      setName("");
      setHost("");
      setPort(22);
      setUsername("root");
      setDefaultWorkingDir("");
    }
  }, [open, existingServer]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!host.trim() || !username.trim()) {
      setErrorMsg("Host and username are required.");
      return;
    }
    setBusy(true);
    try {
      const saved = await api.saveSshServer({
        id: existingServer?.id ?? null,
        name: name.trim() || `${username.trim()}@${host.trim()}`,
        host: host.trim(),
        port: Number(port) || 22,
        username: username.trim(),
        authType: existingServer?.authType ?? "password",
        password: password || null,
        savePassword,
        clearPassword: false,
        privateKeyPath: existingServer?.privateKeyPath ?? null,
        privateKeyPem: null,
        clearPrivateKey: false,
        passphrase: null,
        defaultWorkingDir: defaultWorkingDir.trim(),
        notes: existingServer?.notes ?? "",
      });

      const connected = await api.connectSshServer({
        id: saved.id,
        password: password || null,
        savePassword,
        trustHostKey: false,
      });

      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
      await onConnected(connected, enableTurbo);
      onClose();
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#252B3A] bg-[#121622] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#252B3A] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F3F4F8]">
                {t("ssh.quickConnectTitle")}
              </h3>
              <p className="text-xs text-[#9399AA]">{t("ssh.quickConnectHint")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 p-5 text-xs">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12">
              <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.name")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production VPS (optional)"
              />
            </div>

            <div className="col-span-8">
              <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.host")} *</label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.10 or server.example.com"
                required
                autoFocus={!existingServer}
              />
            </div>

            <div className="col-span-4">
              <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.port")}</label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 22)}
              />
            </div>

            <div className="col-span-6">
              <label className="mb-1 block text-[11px] text-[#9399AA]">
                {t("ssh.username")} *
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
                required
              />
            </div>

            <div className="col-span-6">
              <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.workingDir")}</label>
              <Input
                value={defaultWorkingDir}
                onChange={(e) => setDefaultWorkingDir(e.target.value)}
                placeholder="/var/www or /root"
              />
            </div>

            <div className="col-span-12">
              <div className="mb-1 flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[11px] text-[#9399AA]">
                  <KeyRound className="h-3 w-3 text-[#67DDF2]" />
                  {t("ssh.password")}
                </label>
                {existingServer?.hasPassword && (
                  <Badge variant="success">Saved in Keychain</Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    existingServer?.hasPassword
                      ? t("ssh.passwordSavedPlaceholder")
                      : t("ssh.passwordPlaceholder")
                  }
                  className="pr-9"
                  autoFocus={Boolean(existingServer)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9399AA] hover:text-[#F3F4F8] cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[#252B3A] bg-[#0D1018] p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={savePassword}
                onChange={(e) => setSavePassword(e.target.checked)}
                className="mt-0.5 accent-[#A78BFA]"
              />
              <div>
                <div className="text-[#F3F4F8] font-medium">{t("ssh.savePasswordKeychain")}</div>
                <div className="text-[10px] text-[#9399AA]">{t("ssh.sessionOnlyHint")}</div>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer border-t border-[#252B3A] pt-2">
              <input
                type="checkbox"
                checked={enableTurbo}
                onChange={(e) => setEnableTurbo(e.target.checked)}
                className="mt-0.5 accent-emerald-400"
              />
              <div>
                <div className="flex items-center gap-1 text-emerald-300 font-medium">
                  <Zap className="h-3 w-3" />
                  Turbo Auto Mode
                </div>
                <div className="text-[10px] text-[#9399AA]">
                  Let AI automatically run SSH commands on this server without pausing for each step.
                </div>
              </div>
            </label>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 break-words">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#252B3A]">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Terminal className="h-3.5 w-3.5" />
              )}
              {t("ssh.connectAndAttach")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
