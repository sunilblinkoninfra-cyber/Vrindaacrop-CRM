"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import {
  scheduleCampaignOutreach,
  getOutreachSendingStatus,
  resumeOutreachSending,
  type OutreachSendingStatus,
} from "@/app/(app)/campaigns/actions";

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
  steps?: Array<{
    id: string;
    order: number;
    delayDays: number;
    templateId: string;
    templateName: string;
    subjectA?: string;
    subjectB?: string | null;
    html?: string;
    aiEnabled?: boolean;
  }>;
  sampleLead?: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    sector: string | null;
    city: string | null;
    email: string;
  };
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

const PRESET_LIMITS = [10, 25, 50, 100];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const TIME_PRESETS = [
  { label: "09:30 AM (Morning)", value: "09:30" },
  { label: "11:30 AM (Pre-Lunch)", value: "11:30" },
  { label: "02:30 PM (Afternoon)", value: "14:30" },
  { label: "04:30 PM (End of Day)", value: "16:30" },
];

function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

function getTodayKey(): string {
  const now = new Date();
  return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function getTomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

type CalendarDayCell = {
  key: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  dateObj: Date;
};

function generateMonthGrid(viewDate: Date): CalendarDayCell[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayKey = getTodayKey();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDaysCount = new Date(year, month, 0).getDate();

  const cells: CalendarDayCell[] = [];

  // Padding days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthDaysCount - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const key = formatDateKey(prevDate.getFullYear(), prevDate.getMonth(), dayNum);
    cells.push({
      key,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: key === todayKey,
      isPast: key < todayKey,
      dateObj: prevDate,
    });
  }

  // Current month days
  for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
    const key = formatDateKey(year, month, dayNum);
    const dateObj = new Date(year, month, dayNum);
    cells.push({
      key,
      dayNumber: dayNum,
      isCurrentMonth: true,
      isToday: key === todayKey,
      isPast: key < todayKey,
      dateObj,
    });
  }

  // Trailing padding to make clean 7-column rows
  const remainder = cells.length % 7;
  if (remainder > 0) {
    const nextDaysNeeded = 7 - remainder;
    for (let dayNum = 1; dayNum <= nextDaysNeeded; dayNum++) {
      const nextDate = new Date(year, month + 1, dayNum);
      const key = formatDateKey(nextDate.getFullYear(), nextDate.getMonth(), dayNum);
      cells.push({
        key,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: key === todayKey,
        isPast: key < todayKey,
        dateObj: nextDate,
      });
    }
  }

  return cells;
}

export function TriggerOutreachModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  enrolledCount = 0,
  initialMode = "scheduled",
  outboundSender,
  steps = [],
  sampleLead,
  onSuccess,
  onError,
}: TriggerOutreachModalProps) {
  const router = useRouter();

  // Mode: Immediate vs Scheduled Calendar
  const [mode, setMode] = useState<"immediate" | "scheduled">(initialMode);

  // Template Preview States
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0);
  const [previewVariant, setPreviewVariant] = useState<"A" | "B">("A");
  const [showPreviewDetails, setShowPreviewDetails] = useState<boolean>(true);

  // Calendar View Month
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Selected Dates (keys: YYYY-MM-DD) — default to Today & Tomorrow
  const [selectedDateKeys, setSelectedDateKeys] = useState<string[]>(() => [
    getTodayKey(),
    getTomorrowKey(),
  ]);

  // Outbound Dispatch Time of Day (e.g. "09:30")
  const [dispatchTime, setDispatchTime] = useState<string>("09:30");

  // Email Batch Limit
  const [limit, setLimit] = useState<number>(50);
  const [customLimitInput, setCustomLimitInput] = useState<string>("50");

  // Immediate mode spacing (seconds)
  const [immediateDelay, setImmediateDelay] = useState<number>(0);

  // Outreach Sending Status (Plan & Day Health)
  const [sendingStatus, setSendingStatus] = useState<OutreachSendingStatus | null>(null);
  const [isResumingOutreach, setIsResumingOutreach] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getOutreachSendingStatus()
        .then(setSendingStatus)
        .catch(() => null);
    }
  }, [isOpen]);

  const [isPending, startTransition] = useTransition();

  // Month Grid Cells
  const monthCells = useMemo(() => {
    return generateMonthGrid(calendarMonth);
  }, [calendarMonth]);

  // Month navigation
  function handlePrevMonth() {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  function handleJumpToday() {
    setCalendarMonth(new Date());
  }

  // Toggle single date
  function handleToggleDate(key: string, isPast: boolean) {
    if (isPast) return;
    setSelectedDateKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // keep at least 1 date
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key].sort();
      }
    });
  }

  // Quick Calendar Shortcuts
  function selectToday() {
    const todayKey = getTodayKey();
    setCalendarMonth(new Date());
    setSelectedDateKeys([todayKey]);
  }

  function selectTodayAndTomorrow() {
    const todayKey = getTodayKey();
    const tomKey = getTomorrowKey();
    setCalendarMonth(new Date());
    setSelectedDateKeys([todayKey, tomKey]);
  }

  function selectTomorrow() {
    const tomKey = getTomorrowKey();
    const tomDate = new Date();
    tomDate.setDate(tomDate.getDate() + 1);
    setCalendarMonth(new Date(tomDate.getFullYear(), tomDate.getMonth(), 1));
    setSelectedDateKeys([tomKey]);
  }

  function selectNext7Days() {
    const keys: string[] = [];
    const base = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(base.getDate() + i);
      keys.push(formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    setSelectedDateKeys(keys);
  }

  function selectNext2WeeksWeekdays() {
    const keys: string[] = [];
    const base = new Date();
    let checkedDays = 1;
    while (keys.length < 10 && checkedDays <= 20) {
      const d = new Date();
      d.setDate(base.getDate() + checkedDays);
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        keys.push(formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
      }
      checkedDays++;
    }
    setSelectedDateKeys(keys);
  }

  function selectThisMonthWeekdays() {
    const keys: string[] = [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let day = today.getDate() + 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        keys.push(formatDateKey(year, month, day));
      }
    }
    if (keys.length === 0) {
      selectNext7Days();
    } else {
      setSelectedDateKeys(keys);
    }
  }

  function handleClearDates() {
    setSelectedDateKeys([getTomorrowKey()]);
  }

  function handlePresetLimitClick(value: number) {
    setLimit(value);
    setCustomLimitInput(String(value));
  }

  function handleCustomLimitChange(val: string) {
    setCustomLimitInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setLimit(Math.min(parsed, 1000));
    }
  }

  // Live Calendar Schedule Projection
  const calendarProjection = useMemo(() => {
    if (selectedDateKeys.length === 0) return null;
    const sortedKeys = [...selectedDateKeys].sort();
    const firstKey = sortedKeys[0];
    const lastKey = sortedKeys[sortedKeys.length - 1];

    const [hh, mm] = dispatchTime.split(":").map(Number);
    const firstParsed = parseDateKey(firstKey);
    const lastParsed = parseDateKey(lastKey);

    const firstDate = new Date(firstParsed.year, firstParsed.month, firstParsed.day, hh || 9, mm || 30);
    const lastDate = new Date(lastParsed.year, lastParsed.month, lastParsed.day, hh || 9, mm || 30);

    const daysCount = sortedKeys.length;
    const totalLeads = Math.max(1, limit);
    const leadsPerDay = Math.ceil(totalLeads / daysCount);

    const spanDays = Math.max(
      1,
      Math.round((lastDate.getTime() - firstDate.getTime()) / (86400 * 1000)) + 1
    );

    return {
      daysCount,
      leadsPerDay,
      firstDate,
      lastDate,
      spanDays,
    };
  }, [selectedDateKeys, dispatchTime, limit]);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalLimit = Math.max(1, Math.min(limit || 50, 1000));

    startTransition(async () => {
      try {
        if (mode === "scheduled") {
          if (selectedDateKeys.length === 0) {
            onError?.("Please select at least one date on the calendar.");
            return;
          }

          const [hh, mm] = dispatchTime.split(":").map(Number);
          const hour = isNaN(hh) ? 9 : Math.min(23, Math.max(0, hh));
          const minute = isNaN(mm) ? 30 : Math.min(59, Math.max(0, mm));
          const selectedDatesISO = selectedDateKeys.map((key) => {
            const { year, month, day } = parseDateKey(key);
            // Calculate exact UTC timestamp corresponding to hour:minute in Asia/Kolkata (IST = UTC+05:30)
            const istOffsetMinutes = 330;
            const targetMinutesFromMidnight = hour * 60 + minute;
            const utcMinutesFromMidnight = targetMinutesFromMidnight - istOffsetMinutes;
            const dt = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + utcMinutesFromMidnight * 60 * 1000);
            return dt.toISOString();
          });

          const res = await scheduleCampaignOutreach({
            campaignId,
            selectedDatesISO,
            limit: finalLimit,
            activateIfDraft: true,
          });

          onClose();
          onSuccess?.(
            res.message ||
              `📅 Outreach scheduled across ${selectedDateKeys.length} selected calendar date(s) starting ${new Date(res.scheduledAt).toLocaleString()}!`
          );
        } else {
          // Immediate mode
          const res = await scheduleCampaignOutreach({
            campaignId,
            startDateISO: new Date().toISOString(),
            limit: finalLimit,
            delaySeconds: immediateDelay,
            activateIfDraft: true,
          });

          onClose();
          if (res.backgroundQueued) {
            onSuccess?.(`⚡ ${res.message || `Outreach triggered: sending ${finalLimit} emails.`}`);
          } else if ((res.sent ?? 0) > 0) {
            onSuccess?.(`⚡ Outreach triggered: ${res.sent} email(s) sent successfully!`);
          } else if (res.capReached) {
            onSuccess?.(`Daily sending cap reached. Remaining emails remain queued for next window.`);
          } else {
            onSuccess?.(res.message || `Outreach triggered: ${res.count} leads queued.`);
          }
        }

        router.refresh();
      } catch (err: any) {
        onError?.(err.message || "Failed to dispatch/schedule campaign outreach.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => !isPending && onClose()}
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 [-webkit-overflow-scrolling:touch]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  mode === "immediate"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {mode === "immediate" ? "⚡ Instant Dispatch" : "📅 Calendar Outreach Scheduler"}
              </span>
              <h3 className="text-base font-bold text-slate-900">Campaign Outbound Scheduling</h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Pick outbound dates on the calendar and dispatch times for{" "}
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
              <span>📅 Calendar Schedule</span>
            </button>
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
              <span>⚡ Send Immediately</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
          {/* Pause Warning & 1-Click Resume Banner */}
          {sendingStatus?.isPaused && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <span className="text-lg leading-none">⚠️</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">Outreach Sending is Currently Paused</span>
                    {sendingStatus.pauseReason && (
                      <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {sendingStatus.pauseReason}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                    Submitting this dispatch or schedule will automatically reactivate outbound sending. You can also resume immediately below.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={isResumingOutreach}
                onClick={async () => {
                  setIsResumingOutreach(true);
                  try {
                    await resumeOutreachSending();
                    const updated = await getOutreachSendingStatus();
                    setSendingStatus(updated);
                    onSuccess?.("✅ Outreach sending plan and today's schedule have been resumed!");
                  } catch (err: any) {
                    onError?.(err.message || "Failed to resume outreach.");
                  } finally {
                    setIsResumingOutreach(false);
                  }
                }}
                className="shrink-0 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 shadow-xs"
              >
                {isResumingOutreach ? "Resuming…" : "Resume Outreach Now"}
              </Button>
            </div>
          )}

          {/* Active Sending Plan Summary Pill */}
          {sendingStatus && !sendingStatus.isPaused && (
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3.5 py-2 text-[11px] text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-emerald-900">Outreach System Active</span>
                <span className="text-emerald-700">
                  • Daily budget: <strong>{sendingStatus.sentToday}/{sendingStatus.allowedToday}</strong> sent
                </span>
              </div>
              <span className="text-emerald-700 font-mono text-[10px]">
                Window: {sendingStatus.sendWindowStart} – {sendingStatus.sendWindowEnd} ({sendingStatus.timezone})
              </span>
            </div>
          )}

          {/* Strict Deliverability Guard Banner */}
          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-3.5 py-2 text-[11px] text-indigo-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm leading-none">🛡️</span>
              <span>
                <strong>Strict Deliverability Guard:</strong> Only verified <strong className="text-emerald-700 font-bold">VALID</strong> mailboxes are scheduled. Non-valid are excluded.
              </span>
            </div>
            <span className="text-[10px] text-indigo-700 font-medium">Zero-Tolerance Active</span>
          </div>
          {mode === "scheduled" && (
            <div className="space-y-4">
              {/* Interactive Month Calendar Card */}
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/50 p-4 shadow-xs">
                {/* Calendar Header: Month/Year + Navigation */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                    </span>
                    <button
                      type="button"
                      onClick={handleJumpToday}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Today
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      title="Previous month"
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      title="Next month"
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Quick Date Range Selectors */}
                <div className="flex flex-wrap items-center gap-1.5 pt-3 pb-2 text-[11px]">
                  <span className="font-semibold text-slate-400 mr-0.5">Quick:</span>
                  <button
                    type="button"
                    onClick={selectToday}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-800 hover:bg-emerald-100 transition-colors"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={selectTodayAndTomorrow}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-800 hover:bg-emerald-100 transition-colors"
                  >
                    Today & Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={selectTomorrow}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-700 hover:border-brand hover:text-brand transition-colors"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={selectNext7Days}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-700 hover:border-brand hover:text-brand transition-colors"
                  >
                    Next 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={selectNext2WeeksWeekdays}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-700 hover:border-brand hover:text-brand transition-colors"
                  >
                    Next 2 Wks (Weekdays)
                  </button>
                  <button
                    type="button"
                    onClick={selectThisMonthWeekdays}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-700 hover:border-brand hover:text-brand transition-colors"
                  >
                    All Weekdays This Month
                  </button>
                  <button
                    type="button"
                    onClick={handleClearDates}
                    className="rounded-full px-2 py-0.5 font-medium text-slate-400 hover:text-red-600 transition-colors ml-auto"
                  >
                    Reset
                  </button>
                </div>

                {/* Days of week header */}
                <div className="grid grid-cols-7 gap-1 pt-1 text-center text-[11px] font-bold text-slate-400">
                  {DAY_LABELS.map((day) => (
                    <div key={day} className="py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Day Cells Grid */}
                <div className="grid grid-cols-7 gap-1 pt-1">
                  {monthCells.map((cell) => {
                    const isSelected = selectedDateKeys.includes(cell.key);

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => handleToggleDate(cell.key, cell.isPast)}
                        disabled={cell.isPast}
                        className={`group relative flex h-8 w-full sm:h-9 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                          cell.isPast
                            ? "cursor-not-allowed text-slate-300 opacity-40"
                            : isSelected
                            ? "bg-emerald-600 text-white shadow-xs font-bold ring-2 ring-emerald-500/30 hover:bg-emerald-700"
                            : cell.isCurrentMonth
                            ? "text-slate-800 hover:bg-emerald-50 hover:text-emerald-700"
                            : "text-slate-400 hover:bg-slate-100"
                        } ${
                          cell.isToday && !isSelected
                            ? "ring-1 ring-emerald-600 font-extrabold text-emerald-700 bg-emerald-50/50"
                            : ""
                        }`}
                      >
                        <span>{cell.dayNumber}</span>
                        {isSelected && (
                          <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-white opacity-80" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Dates Summary Counter */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-800">
                      {selectedDateKeys.length} dispatch date{selectedDateKeys.length > 1 ? "s" : ""} selected
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Click any day to toggle on/off
                  </span>
                </div>
              </div>

              {/* Outbound Dispatch Time Selector */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    ⏰ Outbound Sending Time of Day
                  </label>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Asia/Kolkata (IST)
                  </span>
                </div>

                {/* Quick Time Presets */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setDispatchTime(preset.value)}
                      className={`rounded-lg border px-2.5 py-1.5 text-center text-xs transition-all ${
                        dispatchTime === preset.value
                          ? "border-blue-600 bg-blue-50 font-semibold text-blue-900 shadow-2xs ring-1 ring-blue-600"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom Time Input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500 font-medium">Or set exact time:</span>
                  <input
                    type="time"
                    value={dispatchTime}
                    onChange={(e) => setDispatchTime(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs font-semibold text-slate-800 shadow-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Number of Outgoing Emails (Batch Limit) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Number of Outgoing Emails
              </label>
              {enrolledCount > 0 && (
                <span className="text-xs text-slate-500">
                  {enrolledCount} total active enrolled leads
                </span>
              )}
            </div>

            {/* Quick Limit Presets */}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {PRESET_LIMITS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetLimitClick(preset)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    limit === preset && customLimitInput === String(preset)
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
                    limit === enrolledCount && customLimitInput === String(enrolledCount)
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
            <div className="relative">
              <Input
                type="number"
                min={1}
                max={1000}
                value={customLimitInput}
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

          {/* Immediate Mode Options */}
          {mode === "immediate" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2 text-xs">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Intra-Batch Spacing Delay
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "0s Instant", value: 0 },
                  { label: "15s Spacing", value: 15 },
                  { label: "30s Warmup", value: 30 },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setImmediateDelay(item.value)}
                    className={`rounded-lg border p-2 text-xs transition-all ${
                      immediateDelay === item.value
                        ? "border-emerald-600 bg-emerald-50 font-bold text-emerald-800 ring-1 ring-emerald-600"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                Spacing between emails avoids triggering rate limits with email providers.
              </p>
            </div>
          )}

          {/* Interactive Live Schedule Projection Card */}
          {mode === "scheduled" && calendarProjection && (
            <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/50 via-white to-blue-50/30 p-4 space-y-3 text-xs shadow-xs">
              <div className="flex items-center justify-between font-semibold text-slate-800 border-b border-blue-100 pb-2">
                <span className="flex items-center gap-1.5 text-slate-900 font-bold">
                  <span>🗓️</span>
                  <span>Calendar Delivery Projection</span>
                </span>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                  {limit} total recipient{limit > 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Selected Dates
                  </span>
                  <div className="font-semibold text-slate-800">
                    {calendarProjection.daysCount} calendar day{calendarProjection.daysCount > 1 ? "s" : ""}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Daily Pacing
                  </span>
                  <div className="font-semibold text-blue-700">
                    ~{calendarProjection.leadsPerDay} emails per selected day
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Starts On
                  </span>
                  <div className="font-semibold text-slate-800">
                    {calendarProjection.firstDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at {dispatchTime}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Final Dispatch
                  </span>
                  <div className="font-semibold text-slate-800">
                    {calendarProjection.lastDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at {dispatchTime}
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-white/80 p-2 text-[11px] text-slate-600 border border-blue-100/60 flex items-center justify-between">
                <span>Total campaign window span: <strong className="text-slate-800">{calendarProjection.spanDays} days</strong></span>
                <span className="text-emerald-700 font-semibold">🛡️ Halts on prospect reply</span>
              </div>
            </div>
          )}

          {/* Interactive Email Template Preview Section */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  ✉️
                </span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Email Template Preview (Before Sending)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewDetails((p) => !p)}
                className="text-[11px] font-semibold text-brand hover:underline"
              >
                {showPreviewDetails ? "Collapse Preview ▲" : "Expand Preview ▼"}
              </button>
            </div>

            {showPreviewDetails && (
              <div className="space-y-3 pt-1">
                {steps && steps.length > 0 ? (
                  <>
                    {/* Multi-step selector */}
                    {steps.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-2">
                        <span className="text-[11px] font-semibold text-slate-500 mr-1">Select Step:</span>
                        {steps.map((s, idx) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedStepIdx(idx)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                              selectedStepIdx === idx
                                ? "bg-slate-900 text-white shadow-xs"
                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            Step {s.order + 1} {s.order === 0 ? "(Initial)" : `(+${s.delayDays}d)`}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Step Card Details */}
                    {(() => {
                      const currentStep = steps[selectedStepIdx] || steps[0];
                      const subject =
                        previewVariant === "A"
                          ? currentStep.subjectA
                          : currentStep.subjectB || currentStep.subjectA;

                      const replaceLeadTokens = (text?: string | null) => {
                        if (!text) return "";
                        const lead = sampleLead || {
                          firstName: "Rahul",
                          lastName: "Sharma",
                          company: "Apex Towers",
                          sector: "Corporate",
                          city: "Gurgaon",
                          email: "rahul.sharma@apextowers.com",
                        };
                        const tokens: Record<string, string> = {
                          firstName: lead.firstName || "there",
                          lastName: lead.lastName || "",
                          fullName: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "there",
                          company: lead.company || "your organization",
                          sector: lead.sector || "your industry",
                          industry: lead.sector || "your industry",
                          city: lead.city || "your city",
                          geography: lead.city || "your region",
                          industryHook: "facility management, housekeeping, and workplace cafeteria dining",
                        };
                        return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => tokens[k] ?? "");
                      };

                      const renderedSubj = replaceLeadTokens(subject);
                      const renderedHtml = replaceLeadTokens(currentStep.html);
                      const isOllama = currentStep.templateName?.includes("[Ollama AI]");

                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-xs">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-slate-900">
                                {currentStep.templateName}
                              </span>
                              {isOllama ? (
                                <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                  🤖 Ollama AI Generated
                                </span>
                              ) : (
                                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                  ✓ Industry Matched
                                </span>
                              )}
                            </div>

                            {currentStep.subjectB && (
                              <div className="flex items-center gap-1 text-[11px]">
                                <span className="text-slate-400 font-medium">A/B Subject:</span>
                                <button
                                  type="button"
                                  onClick={() => setPreviewVariant("A")}
                                  className={`rounded px-1.5 py-0.5 font-bold transition-colors ${
                                    previewVariant === "A"
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  Variant A
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPreviewVariant("B")}
                                  className={`rounded px-1.5 py-0.5 font-bold transition-colors ${
                                    previewVariant === "B"
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  Variant B
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1 text-xs text-slate-600 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-16 text-slate-400 font-medium">From:</span>
                              <span className="font-mono text-slate-800 text-[11px]">
                                {outboundSender?.fromEmail || "sales@vrindaacorp.com"} (VrindaaCorp Services)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-16 text-slate-400 font-medium">Sample To:</span>
                              <span className="text-slate-800 font-medium text-[11px]">
                                {sampleLead?.firstName || "Rahul"} {sampleLead?.lastName || "Sharma"} &lt;
                                {sampleLead?.email || "rahul.sharma@apextowers.com"}&gt; ({sampleLead?.company || "Apex Towers"})
                              </span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="w-16 text-slate-400 font-medium">Subject:</span>
                              <span className="font-semibold text-slate-900 text-xs">
                                {renderedSubj || "Facility management solutions for your organization"}
                              </span>
                            </div>
                          </div>

                          {/* Email Body */}
                          <div className="rounded-lg bg-slate-50/70 p-3 text-xs text-slate-800 leading-relaxed border border-slate-100 max-h-48 overflow-y-auto font-sans">
                            <div
                              className="prose prose-xs max-w-none [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>li]:mb-1 [&>a]:text-brand [&>a]:underline"
                              dangerouslySetInnerHTML={{
                                __html: renderedHtml || "<em>No content available for preview.</em>",
                              }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Personalized tags: {`{{firstName}}, {{company}}, {{city}}`}</span>
                            <span className="text-emerald-600 font-medium">Verified email preview</span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-3 text-xs text-emerald-800">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span>✨ Automatic Industry Matching & Ollama AI Active</span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-700">
                      No sequence steps were manually added. When you dispatch or schedule, <strong>Ollama AI on the VPS</strong> or the automatic industry matcher will automatically generate and attach a tailored B2B outreach email template.
                    </p>
                  </div>
                )}
              </div>
            )}
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
              disabled={isPending || limit < 1 || (mode === "scheduled" && selectedDateKeys.length === 0)}
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
                  {mode === "immediate" ? "Dispatching Outreach…" : "Scheduling Calendar Outreach…"}
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
                  Schedule {limit} Emails across {selectedDateKeys.length} Date{selectedDateKeys.length > 1 ? "s" : ""}
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
