"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";

interface WhatsAppStatus {
  state: "open" | "connecting" | "close" | "offline" | string;
  phone: string;
  email: string;
  role: string;
  base64Qr: string | null;
  gateway: string;
}

const QR_REFRESH_INTERVAL = 50; // seconds before offering or auto-refreshing QR

export default function WhatsAppSettingsPage() {
  const [data, setData] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [countdown, setCountdown] = useState(QR_REFRESH_INTERVAL);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Strategic Memory State
  const [directives, setDirectives] = useState<{
    id: string;
    category: string;
    content: string;
    source: string;
    updatedAt: string;
  }[]>([]);
  const [newCategory, setNewCategory] = useState("standing_rule");
  const [newContent, setNewContent] = useState("");
  const [savingDirective, setSavingDirective] = useState(false);

  const loadMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/memory");
      if (res.ok) {
        const json = await res.json();
        if (json.memory?.directives) {
          setDirectives(json.memory.directives);
        }
      }
    } catch (err) {
      console.warn("Failed to load strategic memory:", err);
    }
  }, []);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  const handleAddDirective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    try {
      setSavingDirective(true);
      const res = await fetch("/api/whatsapp/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", category: newCategory, content: newContent }),
      });
      const json = await res.json();
      if (json.ok && json.memory?.directives) {
        setDirectives(json.memory.directives);
        setNewContent("");
        setFeedback({ text: "Strategic directive added! The AI agent will strictly adhere to this rule in all drafts & outreach." });
      }
    } catch (err: any) {
      setFeedback({ text: err.message || "Failed to save directive", error: true });
    } finally {
      setSavingDirective(false);
    }
  };

  const handleDeleteDirective = async (id: string) => {
    try {
      const res = await fetch("/api/whatsapp/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (json.ok && json.memory?.directives) {
        setDirectives(json.memory.directives);
        setFeedback({ text: "Directive removed." });
      }
    } catch (err: any) {
      setFeedback({ text: err.message || "Failed to delete directive", error: true });
    }
  };

  // Fetch full state including QR code
  const loadFullStatus = useCallback(async () => {
    try {
      setQrLoading(true);
      const res = await fetch("/api/whatsapp/pair", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load WhatsApp configuration");
      const json = await res.json();
      setData(json);
      setPhoneInput(json.phone || "+918287868122");
      setCountdown(QR_REFRESH_INTERVAL);
    } catch (err: any) {
      setFeedback({ text: err.message || "Failed to communicate with CRM server", error: true });
    } finally {
      setLoading(false);
      setQrLoading(false);
    }
  }, []);

  // Safe background state poll (Checks ONLY connectionState, never invalidates the QR code!)
  const pollConnectionState = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/pair?poll=true", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setData((prev) => {
        if (!prev) return json;
        const stateChanged = prev.state !== json.state;
        return {
          ...prev,
          state: json.state,
          phone: json.phone || prev.phone,
          email: json.email || prev.email,
          role: json.role || prev.role,
          // Clear QR code if newly connected
          base64Qr: json.state === "open" ? null : prev.base64Qr,
        };
      });
    } catch {
      // Quiet background poll error
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFullStatus();
  }, [loadFullStatus]);

  // Safe background polling loop every 3 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      pollConnectionState();
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [pollConnectionState]);

  // QR Code countdown timer
  useEffect(() => {
    if (data?.state === "open") return;

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [data?.state, data?.base64Qr]);

  // Explicitly refresh QR code
  const handleRefreshQr = async () => {
    try {
      setQrLoading(true);
      setFeedback(null);
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_qr" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to refresh QR code");
      setData((prev) => (prev ? { ...prev, base64Qr: json.base64Qr, state: "connecting" } : null));
      setCountdown(QR_REFRESH_INTERVAL);
      setFeedback({ text: "Generated fresh QR Code! Ready to scan." });
    } catch (err: any) {
      setFeedback({ text: err.message, error: true });
    } finally {
      setQrLoading(false);
    }
  };

  // Clean unlink / reset
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to unlink this WhatsApp device? The AI agent will pause notifications until re-linked.")) {
      return;
    }
    try {
      setLoading(true);
      setFeedback(null);
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to disconnect");
      setFeedback({ text: "Device unlinked. Loading new QR code..." });
      await loadFullStatus();
    } catch (err: any) {
      setFeedback({ text: err.message, error: true });
      setLoading(false);
    }
  };

  // Save WhatsApp Phone Number for notifications
  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingPhone(true);
      setFeedback(null);
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_phone", phone: phoneInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save phone number");
      setData((prev) => (prev ? { ...prev, phone: json.phone } : null));
      setFeedback({ text: "WhatsApp notification number updated successfully!" });
    } catch (err: any) {
      setFeedback({ text: err.message, error: true });
    } finally {
      setSavingPhone(false);
    }
  };

  // Send Live Test Message
  const handleSendTest = async () => {
    try {
      setTestSending(true);
      setFeedback(null);
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_test", phone: phoneInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send test message");
      setFeedback({ text: json.message, error: !json.ok });
    } catch (err: any) {
      setFeedback({ text: err.message, error: true });
    } finally {
      setTestSending(false);
    }
  };

  const isConnected = data?.state === "open";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">WhatsApp AI Agent Command Center</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect your WhatsApp by scanning the QR code below. Available to both <span className="font-semibold text-slate-700">owner@vrindaacorp.com</span> and <span className="font-semibold text-slate-700">admin@vrindaacorp.com</span>.
        </p>
      </div>

      {/* Access & User Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
            WA
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Logged in as: <span className="text-emerald-700">{data?.email || "Loading..."}</span> ({data?.role || "Admin"})
            </div>
            <div className="text-xs text-slate-500">
              Authorized to pair, scan QR code, configure notifications, and dispatch AI campaigns.
            </div>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
              Connected &amp; Active
            </span>
          ) : data?.state === "connecting" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-600 animate-ping" />
              Ready to Scan
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Disconnected
            </span>
          )}

          <button
            onClick={() => loadFullStatus()}
            disabled={loading || qrLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Global Feedback Alert */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-lg p-4 text-sm font-medium ${
            feedback.error ? "bg-red-50 text-red-800 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline hover:no-underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: QR Scan or Connected Dashboard */}
        <div className="space-y-6 lg:col-span-7">
          {!isConnected ? (
            /* QR Scanning Card */
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">Link Device via QR Code</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Open WhatsApp on your phone and point your camera to pair the AI agent.
                </p>
              </div>

              <div className="p-6">
                {/* 3 Steps */}
                <div className="mb-6 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3.5 text-xs text-slate-700 sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">1</span>
                    <span>Open <strong>WhatsApp</strong> on phone</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">2</span>
                    <span>Go to <strong>Linked Devices</strong> ➔ <strong>Link a Device</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">3</span>
                    <span>Scan this QR code</span>
                  </div>
                </div>

                {/* QR Code Frame */}
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6">
                  {qrLoading || loading ? (
                    <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 text-sm text-slate-500">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      <span>Generating fresh QR code...</span>
                    </div>
                  ) : data?.base64Qr ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={data.base64Qr}
                        alt="WhatsApp Linking QR Code"
                        width={280}
                        height={280}
                        className="rounded-lg shadow-md bg-white p-2"
                      />
                      {countdown === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-white/90 p-4 text-center backdrop-blur-xs">
                          <p className="text-xs font-semibold text-slate-800">QR Code Expired</p>
                          <p className="mt-1 text-[11px] text-slate-500">Click below to generate an updated QR code</p>
                          <button
                            onClick={handleRefreshQr}
                            className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
                          >
                            ↻ Generate Fresh QR
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
                      <span>No QR code active.</span>
                      <button
                        onClick={handleRefreshQr}
                        className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
                      >
                        Generate QR Code
                      </button>
                    </div>
                  )}

                  {/* QR Controls & Countdown */}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
                    {countdown > 0 && data?.base64Qr && (
                      <span className="text-slate-500">
                        Valid for: <span className="font-mono font-semibold text-slate-700">{countdown}s</span>
                      </span>
                    )}

                    <button
                      onClick={handleRefreshQr}
                      disabled={qrLoading}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
                    >
                      ↻ Refresh QR Code
                    </button>
                  </div>
                </div>

                <div className="mt-4 text-center text-xs text-slate-400">
                  Tip: Hold your phone camera steady about 20-30 cm from the screen. Once scanned, the CRM detects pairing automatically.
                </div>
              </div>
            </div>
          ) : (
            /* Connected Dashboard Card */
            <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
              <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-emerald-950">WhatsApp Agent Online &amp; Synchronized</h2>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    The autonomous AI agent is paired and ready to process replies and deliver briefings.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  ACTIVE
                </span>
              </div>

              <div className="p-6 space-y-6">
                {/* 1-Click Verification Test */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Verify 2-Way AI Communication</h3>
                      <p className="text-xs text-slate-500">
                        Dispatch a live test message to your WhatsApp number ({phoneInput || data.phone}).
                      </p>
                    </div>
                    <button
                      onClick={handleSendTest}
                      disabled={testSending}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {testSending ? "Sending..." : "Send Test WhatsApp Message"}
                    </button>
                  </div>
                </div>

                {/* Notification Target Phone Editor */}
                <form onSubmit={handleSavePhone} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Authorized Notification Number
                    </label>
                    <span className="text-[11px] text-slate-400">Must include country code (e.g. +91...)</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+918287868122"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 shadow-xs focus:border-emerald-500 focus:outline-hidden"
                    />
                    <button
                      type="submit"
                      disabled={savingPhone}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
                    >
                      {savingPhone ? "Saving..." : "Save Number"}
                    </button>
                  </div>
                </form>

                {/* Disconnect Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleDisconnect}
                    className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Unlink WhatsApp Device
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Capabilities & Commands Cheat Sheet */}
        <div className="space-y-6 lg:col-span-5">
          {/* Capabilities Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Autonomous AI Agent Schedule</h3>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-base">
                  ☀️
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">09:00 AM Morning Game Plan</div>
                  <div className="text-xs text-slate-500">
                    Daily outreach targets, sector focus, pacing cap, and domain deliverability status.
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-base">
                  ⚡
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">&lt; 30s Client Revert Response</div>
                  <div className="text-xs text-slate-500">
                    Drafts tailored proposal &amp; requests 1-tap confirmation before sending from sales@vrindaacorp.com.
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-base">
                  🌙
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">09:00 PM Day-End Briefing</div>
                  <div className="text-xs text-slate-500">
                    Sent today, total reach, open rates, response rates, and repeat openers.
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-base">
                  📈
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">Bi-Weekly Strategy Revision</div>
                  <div className="text-xs text-slate-500">
                    Domain warmup scaling review with 1-tap <em>APPROVE STRATEGY</em>.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Conversational AI Intelligence & Commands */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Conversational AI Co-Pilot</h3>
            <p className="mt-1 text-xs text-slate-500">
              The AI agent does <strong>not</strong> just rely on rigid commands. It understands natural language, contextualizes your intent, confirms what it understood, and then proceeds.
            </p>

            <div className="mt-3 space-y-2.5">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5">
                <div className="text-xs font-semibold text-emerald-900">💬 Natural Language Guidance</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  &ldquo;Offer a 10% discount on security and schedule call for Friday&rdquo;<br />
                  &ldquo;Hold off on manufacturing outreach today&rdquo;<br />
                  &ldquo;Did anyone from TechNova reply?&rdquo;
                </div>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <div className="text-xs font-semibold text-slate-800">🔁 Understand ➔ Confirm ➔ Proceed</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  For every message, the AI confirms what it understood, generates the proposal or executes the query, and requests confirmation before dispatching.
                </div>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <div className="text-xs font-semibold text-slate-800">⚡ 1-Word Quick Confirmations</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Reply <code className="font-mono text-emerald-700 font-bold">CONFIRM</code> or <code className="font-mono text-emerald-700 font-bold">YES</code> to execute any proposed action immediately.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Strategic Playbook & Standing Directives */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Owner's Strategic Playbook &amp; Standing Directives</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              The AI Agent references these directives on every turn to ensure all proposals, email replies, and actions align purely with your vision and business rules.
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700">
            {directives.length} Active Directives
          </span>
        </div>

        <div className="p-6 space-y-6">
          {/* Directives List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {directives.map((dir) => {
              const catBadge = {
                pricing_policy: "bg-emerald-50 text-emerald-800 border-emerald-200",
                sector_preference: "bg-blue-50 text-blue-800 border-blue-200",
                tone_and_style: "bg-purple-50 text-purple-800 border-purple-200",
                standing_rule: "bg-amber-50 text-amber-800 border-amber-200",
                client_instruction: "bg-indigo-50 text-indigo-800 border-indigo-200",
              }[dir.category] || "bg-slate-50 text-slate-800 border-slate-200";

              const catLabel = dir.category.replace(/_/g, " ").toUpperCase();

              return (
                <div key={dir.id} className="flex items-start justify-between gap-3 p-3.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                  <div className="space-y-1.5 flex-1">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold tracking-wider rounded border ${catBadge}`}>
                      {catLabel}
                    </span>
                    <p className="text-xs text-slate-800 leading-relaxed font-medium">
                      {dir.content}
                    </p>
                    <div className="text-[10px] text-slate-400">
                      Source: {dir.source === "owner_explicit" ? "Direct Owner Rule" : "Learned from Feedback"}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDirective(dir.id)}
                    title="Remove Directive"
                    className="text-slate-400 hover:text-red-600 transition-colors p-1"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Directive Form */}
          <form onSubmit={handleAddDirective} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Add New Strategic Directive / Business Rule</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs focus:border-emerald-500 focus:outline-hidden"
              >
                <option value="standing_rule">Standing Rule / General</option>
                <option value="pricing_policy">Pricing &amp; Discount Policy</option>
                <option value="sector_preference">Sector / Industry Rule</option>
                <option value="tone_and_style">Tone &amp; Messaging Style</option>
                <option value="client_instruction">Client / Account Instruction</option>
              </select>

              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="e.g. For healthcare companies, always emphasize NABH compliance and 24/7 supervisor audit"
                className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-emerald-500 focus:outline-hidden"
              />

              <button
                type="submit"
                disabled={savingDirective}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                {savingDirective ? "Adding..." : "+ Add Directive"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Tip: You can also teach the agent via WhatsApp simply by texting directives like <em>&ldquo;Remember that our minimum contract size is 10 guards&rdquo;</em>.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
