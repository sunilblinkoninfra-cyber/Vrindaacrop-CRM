"use client";

import React, { useState, useEffect, useRef } from "react";
import { PageHeader, Card, Button, Input, Badge } from "@/components/ui";

export default function WhatsAppSettingsPage() {
  const [state, setState] = useState<"loading" | "open" | "connecting" | "close" | "offline">("loading");
  const [phone, setPhone] = useState("");
  const [inputPhone, setInputPhone] = useState("");
  const [base64Qr, setBase64Qr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"code" | "qr">("code");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial status fetch
  useEffect(() => {
    fetchStatus();

    // Auto-poll state every 4 seconds to detect when user scans / enters code
    pollIntervalRef.current = setInterval(() => {
      fetchStatus(true);
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  async function fetchStatus(isSilent = false) {
    try {
      const res = await fetch("/api/whatsapp/pair", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setState(data.state || "close");
      if (data.phone) {
        setPhone(data.phone);
        if (!inputPhone) setInputPhone(data.phone);
      }
      if (data.base64Qr) setBase64Qr(data.base64Qr);
      if (data.pairingCode) setPairingCode(data.pairingCode);
    } catch (err) {
      if (!isSilent) console.error("Failed to fetch WhatsApp pairing status:", err);
    }
  }

  // Request 8-character pairing code
  async function handleRequestPairingCode() {
    if (!inputPhone.trim()) {
      return setMessage({ text: "Please enter your WhatsApp mobile number.", type: "error" });
    }
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_pairing_code", phone: inputPhone.trim() }),
      });
      const data = await res.json();
      setIsLoading(false);
      if (!res.ok) {
        return setMessage({ text: data.error || "Failed to generate pairing code", type: "error" });
      }
      setPairingCode(data.pairingCode);
      if (data.base64Qr) setBase64Qr(data.base64Qr);
      setPhone(data.phone);
      setMessage({
        text: "✅ Pairing code generated! Enter this code in WhatsApp on your phone.",
        type: "success",
      });
    } catch (err: any) {
      setIsLoading(false);
      setMessage({ text: err.message || "Network error", type: "error" });
    }
  }

  // Refresh QR code
  async function handleRefreshQr() {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_qr" }),
      });
      const data = await res.json();
      setIsLoading(false);
      if (data.base64Qr) setBase64Qr(data.base64Qr);
      setMessage({ text: "✅ QR code refreshed! Valid for 60 seconds.", type: "success" });
    } catch (err: any) {
      setIsLoading(false);
      setMessage({ text: err.message || "Failed to refresh QR", type: "error" });
    }
  }

  // Send test message
  async function handleSendTest() {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_test" }),
      });
      const data = await res.json();
      setIsLoading(false);
      if (!res.ok) {
        return setMessage({ text: data.error || "Failed to send test message", type: "error" });
      }
      setMessage({ text: data.message || "✅ Test message sent! Check your WhatsApp chat.", type: "success" });
    } catch (err: any) {
      setIsLoading(false);
      setMessage({ text: err.message || "Network error", type: "error" });
    }
  }

  // Disconnect / Unlink
  async function handleDisconnect() {
    if (!confirm("Are you sure you want to unlink this WhatsApp device from the CRM?")) return;
    setIsLoading(true);
    try {
      await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      setIsLoading(false);
      setState("close");
      setBase64Qr(null);
      setPairingCode(null);
      setMessage({ text: "WhatsApp device unlinked successfully.", type: "success" });
    } catch (err: any) {
      setIsLoading(false);
      setMessage({ text: err.message || "Failed to disconnect", type: "error" });
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="WhatsApp AI Agent Command Center"
        subtitle="Connect your WhatsApp to receive autonomous morning 9am briefings, day-end 9pm performance reports, and 1-tap client reply approval prompts."
      />

      {/* Status Bar */}
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-slate-200 p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div
            className={`h-3.5 w-3.5 rounded-full ${
              state === "open"
                ? "bg-emerald-500 ring-4 ring-emerald-100 animate-pulse"
                : state === "connecting"
                ? "bg-amber-500 ring-4 ring-amber-100 animate-pulse"
                : "bg-slate-400"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {state === "open"
                  ? "WhatsApp AI Agent Active & Connected"
                  : state === "connecting"
                  ? "Waiting for Phone Pairing / Scan"
                  : "WhatsApp Gateway Disconnected"}
              </h3>
              <Badge
                tone={state === "open" ? "VALID" : state === "connecting" ? "RISKY" : "UNKNOWN"}
              >
                {state.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Whitelisted Owner Number:{" "}
              <strong className="text-slate-700">{phone || "None configured"}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state === "open" ? (
            <>
              <Button
                variant="primary"
                onClick={handleSendTest}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm"
              >
                📲 Send Test WhatsApp Message
              </Button>
              <Button
                variant="secondary"
                onClick={handleDisconnect}
                disabled={isLoading}
                className="text-xs text-red-600 hover:bg-red-50 border-red-200"
              >
                Unlink
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => fetchStatus(false)}
              disabled={isLoading}
              className="text-xs"
            >
              🔄 Refresh Status
            </Button>
          )}
        </div>
      </Card>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-sm font-medium border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Main Connection Methods (Only needed if not already open) */}
      {state !== "open" ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left: Pairing Card */}
          <Card className="md:col-span-7 p-6 space-y-5 border-slate-200">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === "code"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                🔑 Method 1: Link via Phone Pairing Code (Easiest)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("qr")}
                className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === "qr"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                📷 Method 2: Scan QR Code
              </button>
            </div>

            {/* Tab 1: Pairing Code */}
            {activeTab === "code" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Your WhatsApp Mobile Number (with country code)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="+91 82878 68122"
                      value={inputPhone}
                      onChange={(e) => setInputPhone(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="primary"
                      onClick={handleRequestPairingCode}
                      disabled={isLoading || !inputPhone}
                      className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {isLoading ? "Generating…" : "Get Pairing Code"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Format: +91 followed by your 10-digit Indian phone number.
                  </p>
                </div>

                {pairingCode && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-center space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                      Enter this code on your WhatsApp phone:
                    </p>
                    <div className="inline-block rounded-xl border border-emerald-300 bg-white px-6 py-3 shadow-xs">
                      <span className="font-mono text-2xl font-bold tracking-widest text-emerald-900 select-all">
                        {pairingCode}
                      </span>
                    </div>
                    <ol className="text-left text-xs text-slate-600 space-y-1.5 max-w-md mx-auto pt-2">
                      <li>1. Open <strong>WhatsApp</strong> on your phone.</li>
                      <li>2. Tap <strong>Settings</strong> (or `⋮` menu on Android).</li>
                      <li>3. Tap <strong>Linked Devices</strong> ➔ <strong>Link a Device</strong>.</li>
                      <li>
                        4. Tap <strong>"Link with phone number instead"</strong> at the bottom of the screen.
                      </li>
                      <li>5. Enter the code above: <strong className="text-emerald-700">{pairingCode}</strong>.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: QR Code */}
            {activeTab === "qr" && (
              <div className="space-y-4 text-center">
                <p className="text-xs text-slate-600">
                  Open WhatsApp on your phone ➔ <strong>Linked Devices</strong> ➔ <strong>Link a Device</strong> and point your camera at this QR code:
                </p>

                <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 bg-slate-50 min-h-[260px]">
                  {base64Qr ? (
                    <img
                      src={base64Qr.startsWith("data:") ? base64Qr : `data:image/png;base64,${base64Qr}`}
                      alt="WhatsApp QR Code"
                      className="w-56 h-56 object-contain rounded-lg shadow-sm border border-white"
                    />
                  ) : (
                    <div className="text-xs text-slate-400 flex flex-col items-center gap-2">
                      <svg className="w-8 h-8 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Loading fresh QR code from VPS…</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="secondary"
                  onClick={handleRefreshQr}
                  disabled={isLoading}
                  className="text-xs"
                >
                  🔄 Refresh QR Code
                </Button>
              </div>
            )}
          </Card>

          {/* Right: How It Works & Capabilities */}
          <div className="md:col-span-5 space-y-4">
            <Card className="p-5 border-slate-200 space-y-3.5 bg-slate-50/50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                🤖 Autonomous AI Agent Capabilities
              </h4>
              <ul className="text-xs text-slate-600 space-y-2.5">
                <li className="flex gap-2">
                  <span className="text-emerald-600 font-bold">☀️ 09:00 AM</span>
                  <span>Daily game plan: Outreach targets, active sectors &amp; domain health.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 font-bold">⚡ &lt;30s</span>
                  <span>Instant email reply alerts with tailored proposal drafts for 1-tap confirmation.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 font-bold">🌙 09:00 PM</span>
                  <span>Day-end debrief: Sent today, total leads, response rates &amp; repeat openers.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 font-bold">📈 14 Days</span>
                  <span>Bi-weekly warmup deliverability review with 1-tap <em>APPROVE STRATEGY</em>.</span>
                </li>
              </ul>
            </Card>

            <Card className="p-5 border-slate-200 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                💬 Interactive Commands
              </h4>
              <div className="text-xs text-slate-600 space-y-2">
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <code className="text-emerald-700 font-semibold">STATUS</code>
                  <p className="text-[11px] text-slate-500 mt-0.5">Real-time outreach &amp; send volume</p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <code className="text-emerald-700 font-semibold">WHO OPENED TODAY</code>
                  <p className="text-[11px] text-slate-500 mt-0.5">Top high-intent repeat openers</p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <code className="text-emerald-700 font-semibold">YES / SEND</code>
                  <p className="text-[11px] text-slate-500 mt-0.5">Approves and sends proposed email</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* Connected State Overview */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 border-emerald-200 bg-emerald-50/30 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-semibold text-emerald-950">WhatsApp Linked &amp; Operating</h4>
                <p className="text-xs text-emerald-700">
                  Messages and notifications are routed directly to <strong>{phone}</strong>
                </p>
              </div>
            </div>

            <div className="border-t border-emerald-200/60 pt-4 space-y-2 text-xs text-emerald-900">
              <p>• Your VPS Ollama engine is actively monitoring incoming emails.</p>
              <p>• Daily 9am and 9pm schedules are armed and running in Asia/Kolkata time.</p>
              <p>• You can query your CRM metrics anytime by sending <strong>STATUS</strong> to this chat.</p>
            </div>

            <Button
              variant="primary"
              onClick={handleSendTest}
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm"
            >
              📲 Test WhatsApp Connection Now
            </Button>
          </Card>

          <Card className="p-6 border-slate-200 space-y-4">
            <h4 className="text-sm font-semibold text-slate-800">WhatsApp Controls &amp; Settings</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Change Associated WhatsApp Number
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={inputPhone}
                    onChange={(e) => setInputPhone(e.target.value)}
                    className="text-xs font-mono"
                  />
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      setIsLoading(true);
                      await fetch("/api/whatsapp/pair", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "save_phone", phone: inputPhone }),
                      });
                      setIsLoading(false);
                      setPhone(inputPhone);
                      setMessage({ text: "Phone number updated successfully.", type: "success" });
                    }}
                    disabled={isLoading}
                    className="shrink-0 text-xs"
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="secondary"
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="w-full text-xs text-red-600 hover:bg-red-50 border-red-200"
                >
                  Unlink WhatsApp Device
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
