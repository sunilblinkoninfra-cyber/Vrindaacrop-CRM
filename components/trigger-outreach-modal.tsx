"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { scheduleCampaignOutreach } from "@/app/(app)/campaigns/actions";

interface TriggerOutreachModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  enrolledCount?: number;
  initialMode?: "immediate" | "scheduled";
  outboundSender?: {
    fromEmail: string;
    provider: string;
    fromName?: string;
    host?: string;
    isConfigured?: boolean;
  };
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

type DelayUnit = "seconds" | "minutes" | "hours" | "days";

const PRESET_LIMITS = [10, 25, 50, 100];

const DELAY_PRESETS: { label: string; value: number; unit: DelayUnit }[] = [
  { label: "0s (Instant)", value: 0, unit: "seconds" },
  { label: "30s (Rec.)", value: 30, unit: "seconds" },
  { label: "2 mins", value: 2, unit: "minutes" },
  { label: "15 mins", value: 15, unit: "minutes" },
  { label: "1 hour", value: 1, unit: "hours" },
  { label: "4 hours", value: 4, unit: "hours" },
  { label: "1 day", value: 1, unit: "days" },
  { label: "3 days", value: 3, unit: "days" },
  { label: "7 days (1 wk)", value: 7, unit: "days" },
  { label: "30 days (1 mo)", value: 30, unit: "days" },
];

function toSeconds(val: number, unit: DelayUnit): number {
  if (val <= 0) return 0;
  switch (unit) {
    case "seconds":
      return Math.min(val, 2592000);
    case "minutes":
      return Math.min(val * 60, 2592000);
    case "hours":
      return Math.min(val * 3600, 2592000);
    case "days":
      return Math.min(val * 86400, 2592000);
  }
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "Instant";
  if (totalSeconds < 60) return `~${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const remSec = totalSeconds % 60;
  if (minutes < 60) {
    return remSec > 0 ? `~${minutes}m ${remSec}s` : `~${minutes}m`;
  }
  const hours = (totalSeconds / 3600).toFixed(1);
  if (totalSeconds < 86400) {
    return `~${hours} hours`;
  }
  const days = (totalSeconds / 86400).toFixed(1);
  return `~${days} days`;
}

function formatPace(val: number, unit: DelayUnit): string {
  if (val <= 0) return "Instant (no delay)";
  if (unit === "seconds") return `${val}s delay between emails`;
  if (unit === "minutes") return `${val} min${val > 1 ? "s" : ""} between emails`;
  if (unit === "hours") return `${val} hour${val > 1 ? "s" : ""} between emails`;
  return `${val} day${val > 1 ? "s" : ""} between emails`;
}

function getQuickDateISO(type: "1h" | "tomorrow_morning" | "tomorrow_afternoon" | "next_monday"): string {
  const d = new Date();
  if (type === "1h") {
    d.setHours(d.getHours() + 1);
  } else if (type === "tomorrow_morning") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 30, 0, 0);
  } else if (type === "tomorrow_afternoon") {
    d.setDate(d.getDate() + 1);
    d.setHours(14, 30, 0, 0);
  } else if (type === "next_monday") {
    const daysUntilMonday = ((1 - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(10, 0, 0, 0);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${date}T${hours}:${mins}`;
}

export function TriggerOutreachModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  enrolledCount = 0,
  initialMode = "immediate",
  outboundSender,
  onSuccess,
  onError,
}: TriggerOutreachModalProps) {
  const router = useRouter();

  // Mode: Send Immediately vs Schedule for Later
  const [mode, setMode] = useState<"immediate" | "scheduled">(initialMode);

  // Scheduled Date & Time
  const [scheduledDateTime, setScheduledDateTime] = useState<string>(() =>
    getQuickDateISO("tomorrow_morning")
  );

  // Email Batch Limit
  const [limit, setLimit] = useState<number>(50);
  const [customInput, setCustomInput] = useState<string>("50");

  // Inter-Email Delay (up to 30 days / 1 month)
  const [delayValue, setDelayValue] = useState<number>(30);
  const [delayUnit, setDelayUnit] = useState<DelayUnit>("seconds");
  const [customDelayInput, setCustomDelayInput] = useState<string>("30");

  const [isPending, startTransition] = useTransition();

  const totalDelaySeconds = useMemo(() => {
    return toSeconds(delayValue, delayUnit);
  }, [delayValue, delayUnit]);

  // Projected Schedule Summary
  const scheduleProjection = useMemo(() => {
    const startDate = mode === "immediate" ? new Date() : new Date(scheduledDateTime);
    const validStart = isNaN(startDate.getTime()) ? new Date() : startDate;
    const count = Math.max(1, limit);
    const spanSeconds = Math.max(0, count - 1) * totalDelaySeconds;
    const endDate = new Date(validStart.getTime() + spanSeconds * 1000);

    return {
      startDate: validStart,
      endDate,
      totalSpanDuration: formatDuration(spanSeconds),
    };
  }, [mode, scheduledDateTime, limit, totalDelaySeconds]);

  if (!isOpen) return null;

  function handlePresetLimitClick(value: number) {
    setLimit(value);
    setCustomInput(String(value));
  }

  function handleCustomLimitChange(val: string) {
    setCustomInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setLimit(Math.min(parsed, 1000));
    }
  }

  function handlePresetDelayClick(preset: { value: number; unit: DelayUnit }) {
    setDelayValue(preset.value);
    setDelayUnit(preset.unit);
    setCustomDelayInput(String(preset.value));
  }

  function handleCustomDelayValChange(val: string) {
    setCustomDelayInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setDelayValue(parsed);
    }
  }

  function handleQuickDateSelect(type: "1h" | "tomorrow_morning" | "tomorrow_afternoon" | "next_monday") {
    setScheduledDateTime(getQuickDateISO(type));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalLimit = Math.max(1, Math.min(limit || 50, 1000));
    const isImmediate = mode === "immediate";

    startTransition(async () => {
      try {
        const res = await scheduleCampaignOutreach({
          campaignId,
          startDateISO: isImmediate ? undefined : new Date(scheduledDateTime).toISOString(),
          limit: finalLimit,
          delaySeconds: totalDelaySeconds,
          activateIfDraft: true,
        });

        onClose();

        if (res.isImmediate) {
          if (res.backgroundQueued) {
            onSuccess?.(`⚡ ${res.message || `Outreach triggered: sending ${finalLimit} emails staggered by ${formatPace(delayValue, delayUnit)}`}`);
          } else if ((res.sent ?? 0) > 0) {
            onSuccess?.(`⚡ Outreach triggered: ${res.sent} email(s) sent successfully (Target: ${finalLimit}${totalDelaySeconds > 0 ? `, Pace: ${formatPace(delayValue, delayUnit)}` : ""})!`);
          } else if (res.capReached) {
            onSuccess?.(`Daily sending cap reached. Remaining emails remain queued for next window.`);
          } else {
            onSuccess?.(res.message || `Outreach triggered: ${res.count} leads queued.`);
          }
        } else {
          onSuccess?.(`📅 Outreach scheduled: starting ${new Date(res.scheduledAt).toLocaleString()} for ${res.count} leads (Pace: ${formatPace(delayValue, delayUnit)}).`);
        }

        router.refresh();
      } catch (err: any) {
        onError?.(err.message || "Failed to dispatch/schedule campaign outreach.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Translucent Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => !isPending && onClose()}
      />

      {/* Modal Card */}
      <div className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 [-webkit-overflow-scrolling:touch]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  mode === "immediate"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {mode === "immediate" ? "⚡ Instant Dispatch" : "📅 Scheduled Outreach"}
              </span>
              <h3 className="text-base font-bold text-slate-900">Campaign Outreach Scheduler</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Configure dates, batch limit, and delay pacing for{" "}
              <span className="font-semibold text-slate-700">{campaignName}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="border-b border-slate-100 bg-slate-100/50 p-1.5 px-5 sm:px-6">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/60 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("immediate")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
                mode === "immediate"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <span>Send Immediately</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("scheduled")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
                mode === "scheduled"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-blue-600">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
              </svg>
              <span>Schedule for Later</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
          {/* Section 1: Date & Time Picker (if scheduled) */}
          {mode === "scheduled" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-blue-900">
                  Target Start Date &amp; Time
                </label>
                <span className="text-[11px] font-medium text-blue-700">
                  Asia/Kolkata (IST)
                </span>
              </div>

              {/* Quick Presets for Date */}
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => handleQuickDateSelect("1h")}
                  className="rounded-lg border border-blue-200 bg-white p-2 text-left hover:border-blue-400 transition-all"
                >
                  <div className="font-semibold text-slate-800">In 1 Hour</div>
                  <div className="text-[10px] text-slate-400">Quick future start</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDateSelect("tomorrow_morning")}
                  className="rounded-lg border border-blue-200 bg-white p-2 text-left hover:border-blue-400 transition-all"
                >
                  <div className="font-semibold text-slate-800">Tomorrow 09:30 AM</div>
                  <div className="text-[10px] text-slate-400">Morning business slot</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDateSelect("tomorrow_afternoon")}
                  className="rounded-lg border border-blue-200 bg-white p-2 text-left hover:border-blue-400 transition-all"
                >
                  <div className="font-semibold text-slate-800">Tomorrow 02:30 PM</div>
                  <div className="text-[10px] text-slate-400">Afternoon slot</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDateSelect("next_monday")}
                  className="rounded-lg border border-blue-200 bg-white p-2 text-left hover:border-blue-400 transition-all"
                >
                  <div className="font-semibold text-slate-800">Next Monday 10:00 AM</div>
                  <div className="text-[10px] text-slate-400">Week kickoff</div>
                </button>
              </div>

              {/* Custom Datetime Input */}
              <div className="pt-1">
                <Input
                  type="datetime-local"
                  value={scheduledDateTime}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  className="w-full font-mono text-sm bg-white"
                  required
                />
              </div>
            </div>
          )}

          {/* Section 2: Number of Outgoing Emails (Batch Limit) */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Number of Outgoing Emails
              </label>
              {enrolledCount > 0 && (
                <span className="text-xs text-slate-500">
                  {enrolledCount} total active leads
                </span>
              )}
            </div>

            {/* Quick Limit Presets */}
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {PRESET_LIMITS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetLimitClick(preset)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    limit === preset && customInput === String(preset)
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs ring-1 ring-emerald-600 font-semibold"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {preset}
                </button>
              ))}

              {enrolledCount > 0 && (
                <button
                  type="button"
                  onClick={() => handlePresetLimitClick(enrolledCount)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    limit === enrolledCount && customInput === String(enrolledCount)
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs ring-1 ring-emerald-600 font-semibold"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  title="Send to all currently enrolled leads"
                >
                  All ({enrolledCount})
                </button>
              )}
            </div>

            {/* Custom Limit Input */}
            <div className="mt-2.5">
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={customInput}
                  onChange={(e) => handleCustomLimitChange(e.target.value)}
                  placeholder="Custom email batch size"
                  className="font-mono text-sm font-semibold"
                  required
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-slate-400">
                  emails
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Delay Between Every Outgoing Email (Up to 30 Days / 1 Month) */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Delay Between Every Outgoing Email
              </label>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800">
                ⏱️ {formatPace(delayValue, delayUnit)}
              </span>
            </div>

            {/* Quick Delay Presets */}
            <div className="mt-2 grid grid-cols-5 gap-1.5 sm:gap-2">
              {DELAY_PRESETS.map((preset) => {
                const isSelected =
                  delayValue === preset.value && delayUnit === preset.unit;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePresetDelayClick(preset)}
                    className={`rounded-xl border px-2 py-2 text-center text-xs font-medium transition-all ${
                      isSelected
                        ? "border-blue-600 bg-blue-50 text-blue-900 shadow-xs ring-1 ring-blue-600 font-semibold"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Delay with Unit Selector (Seconds, Minutes, Hours, Days up to 30) */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="number"
                  min={0}
                  max={
                    delayUnit === "days"
                      ? 30
                      : delayUnit === "hours"
                      ? 720
                      : delayUnit === "minutes"
                      ? 43200
                      : 2592000
                  }
                  value={customDelayInput}
                  onChange={(e) => handleCustomDelayValChange(e.target.value)}
                  placeholder="Custom delay value"
                  className="font-mono text-sm font-semibold"
                />
              </div>
              <select
                value={delayUnit}
                onChange={(e) => {
                  const newUnit = e.target.value as DelayUnit;
                  setDelayUnit(newUnit);
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days (up to 1 mo)</option>
              </select>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Staggered delays prevent email delivery throttling, warm up sending reputation, and keep replies natural.
            </p>
          </div>

          {/* Section 4: Live Interactive Schedule Projection */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 space-y-2.5 text-xs shadow-xs">
            <div className="flex items-center justify-between font-semibold text-slate-800 border-b border-slate-100 pb-2">
              <span className="flex items-center gap-1.5 text-slate-900">
                <span>🗓️</span>
                <span>Schedule &amp; Delivery Projection</span>
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                {limit} recipient{limit > 1 ? "s" : ""}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {mode === "immediate" ? "Dispatches At" : "Starts At"}
                </span>
                <div className="font-semibold text-slate-800">
                  {scheduleProjection.startDate.toLocaleString()}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Estimated End
                </span>
                <div className="font-semibold text-slate-800">
                  {totalDelaySeconds > 0
                    ? scheduleProjection.endDate.toLocaleString()
                    : "Immediate"}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Pacing
                </span>
                <div className="font-medium text-blue-700">
                  {formatPace(delayValue, delayUnit)}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Duration Span
                </span>
                <div className="font-semibold text-emerald-700">
                  {scheduleProjection.totalSpanDuration}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              <span>Mailbox: <strong className="text-slate-700">{outboundSender?.fromEmail || "sales@vrindaacorp.com"}</strong></span>
              <span className="text-emerald-700 font-medium">🛡️ Halts on prospect reply</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isPending}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isPending || limit < 1}
              className={`text-xs px-4 text-white font-semibold ${
                mode === "immediate"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isPending ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {mode === "immediate" ? "Dispatching Outreach…" : "Saving Schedule…"}
                </span>
              ) : mode === "immediate" ? (
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  Send {limit} Emails Now
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                  </svg>
                  Schedule {limit} Emails Starting {scheduleProjection.startDate.toLocaleDateString()}
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
