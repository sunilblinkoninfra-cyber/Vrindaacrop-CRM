"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import {
  deleteCampaign,
  getOutreachSendingStatus,
  resumeOutreachSending,
  type OutreachSendingStatus,
} from "./actions";
import { TriggerOutreachModal } from "@/components/trigger-outreach-modal";

type CampaignItem = {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  nextScheduledAt?: Date | string | null;
  activeValidCount?: number;
  activeTotalCount?: number;
  pausedCount?: number;
  scheduleMeta?: {
    type?: string;
    scheduledDates?: string[];
    firstSendAt?: string;
    lastSendAt?: string;
    leadsPerDay?: number;
    totalScheduled?: number;
    scheduledAt?: string;
  } | null;
  plan?: {
    sendWindowStart: string;
    sendWindowEnd: string;
    timezone: string;
    fromEmail: string;
    hardDailyCap: number;
  };
  _count: {
    steps: number;
    enrollments: number;
  };
};

function formatScheduleTiming(dateStr: Date | string | null | undefined, timezone = "Asia/Kolkata") {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  const now = new Date();
  const isPast = d.getTime() <= now.getTime();

  const dateFormatted = d.toLocaleDateString("en-IN", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFormatted = d.toLocaleTimeString("en-IN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const todayStr = now.toLocaleDateString("en-IN", { timeZone: timezone });
  const targetStr = d.toLocaleDateString("en-IN", { timeZone: timezone });

  const tomorrow = new Date(now.getTime() + 86400000);
  const tomorrowStr = tomorrow.toLocaleDateString("en-IN", { timeZone: timezone });

  let dayLabel = dateFormatted;
  if (targetStr === todayStr) {
    dayLabel = "Today";
  } else if (targetStr === tomorrowStr) {
    dayLabel = "Tomorrow";
  }

  return {
    isPast,
    dayLabel,
    timeFormatted,
    fullText: `${dayLabel}, ${timeFormatted} IST`,
  };
}

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
};

export function CampaignsList({ campaigns }: { campaigns: CampaignItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [triggeringCampaign, setTriggeringCampaign] = useState<CampaignItem | null>(null);
  const [triggeringMode, setTriggeringMode] = useState<"immediate" | "scheduled">("immediate");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sendingStatus, setSendingStatus] = useState<OutreachSendingStatus | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  useEffect(() => {
    getOutreachSendingStatus().then(setSendingStatus).catch(() => null);
  }, []);

  function handleDelete(id: string, name: string) {
    if (
      !window.confirm(
        `Are you sure you want to delete "${name}"? This will permanently remove all sequence steps and enrolled lead progress.`
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setPendingId(id);
    startTransition(async () => {
      try {
        await deleteCampaign(id);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to delete campaign.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Outreach Sending Paused Warning Banner */}
      {sendingStatus?.isPaused && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none">⚠️</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm text-amber-950">Outbound Email Outreach is Currently PAUSED</span>
                {sendingStatus.pauseReason && (
                  <span className="rounded bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    Reason: {sendingStatus.pauseReason}
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-700 mt-0.5">
                Scheduled campaign emails will not send automatically until outreach is resumed. Click Resume below to reactivate.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isResuming}
            onClick={async () => {
              setIsResuming(true);
              try {
                await resumeOutreachSending();
                const updated = await getOutreachSendingStatus();
                setSendingStatus(updated);
                setSuccess("✅ Outbound email outreach resumed successfully! Scheduled emails are now active.");
                router.refresh();
              } catch (err: any) {
                setError(err.message || "Failed to resume outreach.");
              } finally {
                setIsResuming(false);
              }
            }}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 shadow-xs"
          >
            {isResuming ? "Resuming…" : "Resume Outreach Now"}
          </Button>
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {campaigns.map((c) => {
          const isDeleting = isPending && pendingId === c.id;

          return (
            <li
              key={c.id}
              className="flex flex-col items-start justify-between gap-4 p-4.5 sm:flex-row sm:items-center hover:bg-slate-50/60 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="block truncate font-semibold text-slate-900 hover:text-brand hover:underline text-base"
                  >
                    {c.name}
                  </Link>
                  <Badge className={`shrink-0 ${statusTone[c.status] || "bg-slate-100 text-slate-600"}`}>
                    {c.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {c._count.steps} step{c._count.steps === 1 ? "" : "s"} · {c._count.enrollments} total enrolled
                </div>

                {/* Schedule Details & Timing Section */}
                {(() => {
                  const schedule = formatScheduleTiming(c.nextScheduledAt, c.plan?.timezone);
                  const windowStr = `${c.plan?.sendWindowStart || "09:00"} - ${c.plan?.sendWindowEnd || "18:00"} (${c.plan?.timezone || "Asia/Kolkata"})`;

                  return (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                      {schedule ? (
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium border shadow-2xs ${
                            schedule.isPast
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-indigo-50 text-indigo-900 border-indigo-200"
                          }`}
                        >
                          <span className="text-sm leading-none">{schedule.isPast ? "⚡" : "🗓️"}</span>
                          <span>
                            {schedule.isPast ? "Outreach Due / Running:" : "Next Scheduled Send:"}{" "}
                            <strong className="font-bold">{schedule.fullText}</strong>
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium text-slate-500 bg-slate-50 border border-slate-200">
                          <span>⏸️</span>
                          <span>No upcoming schedule set</span>
                        </div>
                      )}

                      {/* Daily Sending Window */}
                      <div
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-slate-700 bg-slate-100/90 border border-slate-200"
                        title="Configured active daily sending window"
                      >
                        <span>🕒</span>
                        <span>Window: <strong>{windowStr}</strong></span>
                      </div>

                      {/* Deliverability Guarantee: Valid Leads Only */}
                      <div
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-emerald-800 bg-emerald-50 border border-emerald-200"
                        title="Strict deliverability policy: Only 100% verified VALID mailboxes will be contacted"
                      >
                        <span>🛡️</span>
                        <span>Valid Only: <strong>{c.activeValidCount ?? 0} eligible</strong></span>
                      </div>

                      {c.pausedCount && c.pausedCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                          title="Leads automatically paused because their email is not verified as VALID (catch-all, risky, unprobed, or invalid)"
                        >
                          <span>⚠️</span> {c.pausedCount} non-valid paused
                        </span>
                      ) : null}
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {c.status === "ACTIVE" && (
                  <>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isPending}
                      onClick={() => {
                        setTriggeringMode("immediate");
                        setTriggeringCampaign(c);
                      }}
                      className="h-8 min-h-0 px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      title="Send campaign outreach immediately"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="mr-1 h-3.5 w-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>Trigger Now</span>
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => {
                        setTriggeringMode("scheduled");
                        setTriggeringCampaign(c);
                      }}
                      className="h-8 min-h-0 px-2.5 py-1 text-xs"
                      title="Schedule date, time & staggered delay up to 1 month"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="mr-1 h-3.5 w-3.5 text-slate-500"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>Schedule</span>
                    </Button>
                  </>
                )}

                {c.status === "DRAFT" && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => {
                      setTriggeringMode("scheduled");
                      setTriggeringCampaign(c);
                    }}
                    className="h-8 min-h-0 px-2.5 py-1 text-xs"
                    title="Schedule date, time & activate campaign"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="mr-1 h-3.5 w-3.5 text-slate-500"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Schedule</span>
                  </Button>
                )}

                <Link href={`/campaigns/${c.id}`}>
                  <Button variant="secondary" className="h-8 min-h-0 px-3 py-1 text-xs">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                    </svg>
                    <span>Edit</span>
                  </Button>
                </Link>

                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDelete(c.id, c.name)}
                  className="h-8 min-h-0 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.67.028 2.487.083a23.95 23.95 0 00-4.974 0C8.33 4.028 9.16 4 10 4zM8.5 8.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0v-5.5a.75.75 0 01.75-.75zm3 0a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0v-5.5a.75.75 0 01.75-.75z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{isDeleting ? "Deleting…" : "Delete"}</span>
                </Button>
              </div>
            </li>
          );
        })}

        {campaigns.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-400">
            No campaigns yet. Click "+ New campaign" to create your first outreach campaign.
          </li>
        )}
      </ul>

      {/* Trigger & Schedule Outreach Modal */}
      {triggeringCampaign && (
        <TriggerOutreachModal
          isOpen={Boolean(triggeringCampaign)}
          onClose={() => setTriggeringCampaign(null)}
          campaignId={triggeringCampaign.id}
          campaignName={triggeringCampaign.name}
          enrolledCount={triggeringCampaign._count.enrollments}
          initialMode={triggeringMode}
          onSuccess={(msg) => setSuccess(msg)}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}
