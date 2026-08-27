"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { syncRepliesAction } from "@/app/(app)/leads/actions";

export function SyncRepliesButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  
  const isSyncingRef = useRef(false);

  const performSync = async (isAuto = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (isAuto) setIsAutoSyncing(true);

    try {
      const res = await syncRepliesAction();
      setLastSyncTime(new Date());

      if (res.ok) {
        if (res.matchedReplies > 0) {
          setFeedback({
            message: `🔥 Detected ${res.matchedReplies} new lead ${res.matchedReplies === 1 ? "reply" : "replies"}! Automatically marked as Hot & Replied.`,
            type: "success",
          });
          // Auto-refresh the leads table to reflect new replies and status changes immediately
          router.refresh();
        } else if (!isAuto) {
          setFeedback({
            message: `Inbox checked (${res.checked} messages scanned). No new replies.`,
            type: "info",
          });
        }
      } else if (!isAuto) {
        setFeedback({
          message: res.error || "Failed to sync inbox replies.",
          type: "error",
        });
      }
    } catch (err: any) {
      if (!isAuto) {
        setFeedback({
          message: err?.message || "An unexpected error occurred.",
          type: "error",
        });
      }
    } finally {
      isSyncingRef.current = false;
      if (isAuto) setIsAutoSyncing(false);
    }
  };

  // Automated Real-Time Background Polling (Runs on mount & repeats every 30 seconds)
  useEffect(() => {
    // Initial sync on page open
    performSync(true);

    // Continuous 30-second heartbeat
    const interval = setInterval(() => {
      performSync(true);
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  const handleManualSync = () => {
    setFeedback(null);
    startTransition(async () => {
      await performSync(false);
    });
  };

  return (
    <div className="relative inline-flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={isPending || isAutoSyncing}
        onClick={handleManualSync}
        className={`${className} relative flex items-center gap-2 shadow-xs`}
        title="Continuously auto-syncing sales@vrindaacorp.com for incoming replies. Click for immediate manual check."
      >
        {/* Pulsing live status dot */}
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </span>

        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 ${isPending || isAutoSyncing ? "animate-spin text-brand" : "text-slate-500"}`}
        >
          <path
            fillRule="evenodd"
            d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.75a.75.75 0 00-.75.75v4.482a.75.75 0 001.5 0v-2.128l.427.427a7 7 0 0011.712-3.138.75.75 0 00-1.327-.548zM4.688 8.576a5.5 5.5 0 019.201-2.466l.312.311H11.77a.75.75 0 000 1.5h4.482a.75.75 0 00.75-.75V2.689a.75.75 0 00-1.5 0v2.128l-.427-.427A7 7 0 003.361 7.528a.75.75 0 001.327.548z"
            clipRule="evenodd"
          />
        </svg>

        <span className="text-xs font-medium">
          {isPending || isAutoSyncing ? "Syncing Inbox…" : "Live: Auto-Syncing (30s)"}
        </span>
      </Button>

      {feedback && (
        <div
          className={`absolute right-0 top-full z-50 mt-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-medium shadow-xl ring-1 transition-all animate-in fade-in zoom-in-95 duration-200 ${
            feedback.type === "success"
              ? "bg-emerald-600 text-white ring-emerald-500"
              : feedback.type === "error"
              ? "bg-rose-600 text-white ring-rose-500"
              : "bg-slate-900 text-white ring-slate-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="ml-1 text-slate-300 hover:text-white font-bold"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
