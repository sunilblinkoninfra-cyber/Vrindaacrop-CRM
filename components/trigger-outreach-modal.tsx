"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { triggerCampaignOutreach } from "@/app/(app)/campaigns/actions";

interface TriggerOutreachModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  enrolledCount?: number;
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

const PRESET_LIMITS = [10, 25, 50, 100];

export function TriggerOutreachModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  enrolledCount = 0,
  outboundSender,
  onSuccess,
  onError,
}: TriggerOutreachModalProps) {
  const router = useRouter();
  const [limit, setLimit] = useState<number>(50);
  const [customInput, setCustomInput] = useState<string>("50");
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  function handlePresetClick(value: number) {
    setLimit(value);
    setCustomInput(String(value));
  }

  function handleCustomInputChange(val: string) {
    setCustomInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setLimit(Math.min(parsed, 1000));
    }
  }

  function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    const finalLimit = Math.max(1, Math.min(limit || 50, 1000));

    startTransition(async () => {
      try {
        const res = await triggerCampaignOutreach(campaignId, finalLimit);
        onClose();
        if (res.sent > 0) {
          onSuccess?.(`⚡ Outreach triggered: ${res.sent} email(s) sent successfully (Target: ${finalLimit})!`);
        } else if (res.capReached) {
          onSuccess?.(`Daily sending cap reached. Remaining emails remain queued for next window.`);
        } else {
          onSuccess?.(`Outreach triggered: ${res.attempted} processed (${res.sent} sent, ${res.skipped} skipped).`);
        }
        router.refresh();
      } catch (err: any) {
        onError?.(err.message || "Failed to trigger campaign outreach.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => !isPending && onClose()}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                ⚡ Instant Dispatch
              </span>
              <h3 className="text-base font-semibold text-slate-900">Trigger Campaign Outreach</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Set the number of outgoing emails to dispatch for <span className="font-semibold text-slate-700">{campaignName}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleDispatch} className="space-y-5 p-6">
          {/* Outgoing Email Limit Selector */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Number of Outgoing Emails
              </label>
              {enrolledCount > 0 && (
                <span className="text-xs text-slate-500">
                  {enrolledCount} total active leads
                </span>
              )}
            </div>

            {/* Quick Preset Buttons */}
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {PRESET_LIMITS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    limit === preset && customInput === String(preset)
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm ring-1 ring-emerald-600"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {preset}
                </button>
              ))}

              {enrolledCount > 0 && (
                <button
                  type="button"
                  onClick={() => handlePresetClick(enrolledCount)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    limit === enrolledCount && customInput === String(enrolledCount)
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm ring-1 ring-emerald-600"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  title="Send to all currently enrolled leads"
                >
                  All ({enrolledCount})
                </button>
              )}
            </div>

            {/* Custom Input */}
            <div className="mt-3">
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={customInput}
                  onChange={(e) => handleCustomInputChange(e.target.value)}
                  placeholder="Custom email batch size"
                  className="font-mono text-sm font-semibold"
                  required
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-slate-400">
                  emails
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Enter any custom number between 1 and 1,000 outgoing emails for this batch.
              </p>
            </div>
          </div>

          {/* Delivery Configuration & Safeguards Summary */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Outbound Mailbox:</span>
              <span className="font-mono font-medium text-slate-800">
                {outboundSender?.fromEmail || "sales@vrindaacorp.com"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Industry Customization:</span>
              <span className="font-medium text-emerald-700">
                🟢 Dynamic Sector Matching Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Inbound Reply Safety:</span>
              <span className="font-medium text-slate-700">
                🛑 Auto-Halts on Prospect Reply
              </span>
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4"
            >
              {isPending ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Dispatching {limit} Emails…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  Send {limit} Outgoing Emails Now
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
