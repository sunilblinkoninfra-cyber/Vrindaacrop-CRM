"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { SECTORS, GEOGRAPHIES, CALENDLY_BOOKING_URL } from "@/lib/constants";
import {
  updateCampaign,
  deleteCampaign,
  updateSegment,
  addStep,
  removeStep,
  updateStep,
  setStatus,
  enrollNow,
  segmentCount,
  triggerCampaignOutreach,
  scheduleCampaignOutreach,
  refineCampaignTemplateWithAI,
  saveCampaignTemplateChanges,
} from "../actions";
import { TriggerOutreachModal } from "@/components/trigger-outreach-modal";
import type { CampaignStatus } from "@prisma/client";

const QUICK_SUGGESTIONS = [
  { label: "⚡ Make Concise (< 100 words)", prompt: "Make the email concise, punchy, and under 100 words while maintaining high engagement." },
  { label: "📅 Add Calendly Booking Link", prompt: "Add a clear call-to-action inviting the recipient to schedule a discussion using our official Calendly link: https://calendly.com/vrindaacorp-sales/30min." },
  { label: "🛡️ Emphasize PSARA & 24/7 Audits", prompt: "Highlight our PSARA compliance, verified guards, and 24/7 surprise supervisor audits." },
  { label: "🚨 15-Min Emergency Unit", prompt: "Emphasize our 15-minute quick reaction emergency response unit for Delhi-NCR and Gurgaon facilities." },
  { label: "☕ Free Tasting Session", prompt: "Add an invitation for a complimentary corporate cafeteria tasting session for the facility head." },
  { label: "💼 Consultative & Softer CTA", prompt: "Adopt a softer, consultative tone with an easy low-friction 10-minute discovery call." },
  { label: "💰 Inaugural Q1 Pricing", prompt: "Mention our inaugural first-quarter pricing benefits for premier corporate partners." },
];

type Step = {
  id: string;
  order: number;
  delayDays: number;
  templateId: string;
  templateName: string;
  subjectA?: string;
  subjectB?: string | null;
  html?: string;
  aiEnabled?: boolean;
};

type TemplateOpt = { id: string; name: string };

type OutboundSenderInfo = {
  provider: "smtp" | "ses" | "simulated";
  fromEmail: string;
  fromName: string;
  host?: string;
  isConfigured: boolean;
};

type SampleLead = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  sector: string | null;
  city: string | null;
  email: string;
};

type ScheduleDetails = {
  nextScheduledAt: string | null;
  lastScheduledAt: string | null;
  activeValidCount: number;
  activeTotalCount: number;
  pausedCount: number;
  completedCount: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  timezone: string;
  hardDailyCap: number;
  fromEmail: string;
  scheduleMeta?: {
    type?: string;
    scheduledDates?: string[];
    firstSendAt?: string;
    lastSendAt?: string;
    leadsPerDay?: number;
    totalScheduled?: number;
    scheduledAt?: string;
  } | null;
  upcomingBatches: Array<{
    dateStr: string;
    count: number;
    sampleTime: string;
  }>;
};

export function CampaignBuilder({
  campaignId,
  campaignName,
  status,
  segment,
  scheduleDetails,
  steps,
  templates,
  enrolledCount,
  outboundSender,
  sampleLead,
}: {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  segment: Record<string, string>;
  scheduleDetails?: ScheduleDetails;
  steps: Step[];
  templates: TemplateOpt[];
  enrolledCount: number;
  outboundSender?: OutboundSenderInfo;
  sampleLead?: SampleLead;
}) {
  const router = useRouter();
  const [seg, setSeg] = useState<Record<string, string>>(segment);
  const [count, setCount] = useState<number | null>(null);
  const [tpl, setTpl] = useState("auto");
  const [delay, setDelay] = useState("3");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Campaign Rename State
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(campaignName);

  // Step Editing State
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editStepTemplateId, setEditStepTemplateId] = useState("");
  const [editStepDelay, setEditStepDelay] = useState("0");

  // Sequence steps state kept in sync with props
  const [localSteps, setLocalSteps] = useState<Step[]>(steps);
  useEffect(() => {
    setLocalSteps(steps);
  }, [steps]);

  // AI Template Editor & Refinement Modal State
  const [editingTemplateStep, setEditingTemplateStep] = useState<Step | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiRefining, setIsAiRefining] = useState(false);
  const [aiChangesSummary, setAiChangesSummary] = useState<string | null>(null);
  const [editorSubjectA, setEditorSubjectA] = useState("");
  const [editorSubjectB, setEditorSubjectB] = useState("");
  const [editorHtml, setEditorHtml] = useState("");
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [editorPreviewVariant, setEditorPreviewVariant] = useState<"A" | "B">("A");

  // Step Preview Modal State
  const [previewStep, setPreviewStep] = useState<Step | null>(null);
  const [previewVariant, setPreviewVariant] = useState<"A" | "B">("A");

  // Trigger & Schedule Outreach Modal State
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"immediate" | "scheduled">("immediate");

  function openAiEditor(step: Step) {
    setEditingTemplateStep(step);
    setEditorSubjectA(step.subjectA || "");
    setEditorSubjectB(step.subjectB || "");
    setEditorHtml(step.html || "");
    setAiPrompt("");
    setAiChangesSummary(null);
    setEditorTab("edit");
    setEditorPreviewVariant("A");
  }

  async function handleAskAi(customPrompt?: string) {
    if (!editingTemplateStep) return;
    const promptToSend = (customPrompt || aiPrompt).trim();
    if (!promptToSend) return;

    setIsAiRefining(true);
    setAiChangesSummary(null);
    try {
      const res = await refineCampaignTemplateWithAI({
        campaignId,
        templateId: editingTemplateStep.templateId,
        currentSubjectA: editorSubjectA,
        currentSubjectB: editorSubjectB,
        currentHtml: editorHtml,
        instruction: promptToSend,
      });

      if (res) {
        setEditorSubjectA(res.subjectA);
        setEditorSubjectB(res.subjectB);
        setEditorHtml(res.html);
        setAiChangesSummary(res.changesSummary);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to refine template with Ollama AI.");
    } finally {
      setIsAiRefining(false);
    }
  }

  async function handleSaveTemplateChanges() {
    if (!editingTemplateStep) return;
    try {
      await saveCampaignTemplateChanges({
        campaignId,
        templateId: editingTemplateStep.templateId,
        subjectA: editorSubjectA,
        subjectB: editorSubjectB,
        html: editorHtml,
      });

      // Update in local state
      setLocalSteps((prev) =>
        prev.map((s) =>
          s.id === editingTemplateStep.id
            ? {
                ...s,
                subjectA: editorSubjectA,
                subjectB: editorSubjectB,
                html: editorHtml,
              }
            : s
        )
      );

      // Also update preview step if open
      if (previewStep?.id === editingTemplateStep.id) {
        setPreviewStep((prev) =>
          prev
            ? {
                ...prev,
                subjectA: editorSubjectA,
                subjectB: editorSubjectB,
                html: editorHtml,
              }
            : null
        );
      }

      setSuccess("Template changes saved and updated across this campaign!");
      setEditingTemplateStep(null);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save template changes.");
    }
  }

  function insertToken(token: string) {
    setEditorHtml((prev) => `${prev} {{${token}}}`);
  }

  function renderTokens(text?: string | null) {
    if (!text) return "";
    const l = sampleLead || {
      firstName: "Rahul",
      lastName: "Sharma",
      company: "Apex Towers",
      sector: seg.sector || "Corporate",
      city: seg.geography || "Gurgaon",
      email: "rahul.sharma@apextowers.com",
    };
    const tokens: Record<string, string> = {
      firstName: l.firstName || "there",
      lastName: l.lastName || "",
      fullName: `${l.firstName || ""} ${l.lastName || ""}`.trim() || "there",
      company: l.company || "your organization",
      sector: l.sector || "your industry",
      industry: l.sector || "your industry",
      city: l.city || "your city",
      geography: l.city || "your region",
      industryHook: "integrated facility management, housekeeping, and corporate catering",
    };
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => tokens[key] ?? "");
  }

  function run(fn: () => Promise<unknown>, successMsg?: string) {
    setError("");
    setSuccess("");
    start(async () => {
      try {
        await fn();
        if (successMsg) setSuccess(successMsg);
        router.refresh();
      } catch (e: any) {
        setError(e?.message ?? "Operation failed.");
      }
    });
  }

  function handleSaveName() {
    if (!nameInput.trim()) {
      setError("Campaign name cannot be empty.");
      return;
    }
    run(async () => {
      await updateCampaign(campaignId, { name: nameInput.trim() });
      setIsEditingName(false);
    }, "Campaign name updated successfully.");
  }

  function handleDeleteCampaign() {
    if (
      !window.confirm(
        `Are you sure you want to delete campaign "${campaignName}"? This will permanently remove all sequence steps and enrolled lead progress.`
      )
    ) {
      return;
    }
    setError("");
    start(async () => {
      try {
        await deleteCampaign(campaignId);
        router.push("/campaigns");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function startEditingStep(s: Step) {
    setEditingStepId(s.id);
    setEditStepTemplateId(s.templateId);
    setEditStepDelay(String(s.delayDays));
  }

  function handleSaveStep(stepId: string) {
    if (!editStepTemplateId) {
      setError("Please select a template for the step.");
      return;
    }
    run(async () => {
      await updateStep(
        stepId,
        campaignId,
        editStepTemplateId,
        parseInt(editStepDelay, 10) || 0
      );
      setEditingStepId(null);
    }, "Sequence step updated.");
  }

  function handleTriggerOutreachNow() {
    setModalMode("immediate");
    setIsTriggerModalOpen(true);
  }

  function handleOpenScheduleModal() {
    setModalMode("scheduled");
    setIsTriggerModalOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Campaign Title & Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          {isEditingName ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Campaign name"
                className="max-w-md text-lg font-semibold"
                autoFocus
              />
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={handleSaveName}
                className="h-10 px-3 text-xs"
              >
                Save Name
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setNameInput(campaignName);
                  setIsEditingName(false);
                }}
                className="h-10 px-3 text-xs"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{campaignName}</h1>
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                title="Edit campaign name"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                  <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-sm text-slate-500">Configure target segment, email sequence steps, and outreach lifecycle.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={handleDeleteCampaign}
            className="h-9 px-3 text-xs"
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
            <span>Delete Campaign</span>
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}

      {/* Campaign Schedule & Timing Details Card */}
      {scheduleDetails && (
        <Card className="overflow-hidden border-indigo-100 bg-gradient-to-b from-indigo-50/40 via-white to-white p-5 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-indigo-100/70 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Campaign Schedule & Timing Details</h2>
                <p className="text-xs text-slate-500">Live dispatch schedule, daily sending window, and deliverability protection.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={handleOpenScheduleModal}
                className="h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                <span>📅 Edit Schedule & Timing</span>
              </Button>
            </div>
          </div>

          {/* 4 Key Metrics Grid */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Next Dispatch Timing */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">Next Scheduled Send</span>
                <span className="text-indigo-600 font-semibold">IST</span>
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {scheduleDetails.nextScheduledAt
                  ? new Date(scheduleDetails.nextScheduledAt).toLocaleDateString("en-IN", {
                      timeZone: scheduleDetails.timezone,
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) + " at " +
                    new Date(scheduleDetails.nextScheduledAt).toLocaleTimeString("en-IN", {
                      timeZone: scheduleDetails.timezone,
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "Not Scheduled"}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {scheduleDetails.nextScheduledAt && new Date(scheduleDetails.nextScheduledAt) <= new Date()
                  ? "⚡ Send due / in current active window"
                  : scheduleDetails.nextScheduledAt
                  ? "Upcoming calendar dispatch"
                  : "Click Schedule to set date & time"}
              </div>
            </div>

            {/* 2. Active Sending Window */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">Daily Send Window</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Cap: {scheduleDetails.hardDailyCap}/day</span>
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {scheduleDetails.sendWindowStart} – {scheduleDetails.sendWindowEnd}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {scheduleDetails.timezone} (Indian Standard Time)
              </div>
            </div>

            {/* 3. Strict Deliverability Gate */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-emerald-800">
                <span className="font-bold">Deliverability Gate</span>
                <span className="rounded bg-emerald-200/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">ENFORCED</span>
              </div>
              <div className="mt-1 text-sm font-bold text-emerald-950">
                {scheduleDetails.activeValidCount} Valid Leads Ready
              </div>
              <div className="mt-1 text-[11px] text-emerald-700">
                Only verified VALID emails will be contacted
              </div>
            </div>

            {/* 4. Sender Account & Provider */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">Outbound Mailbox</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">SMTP</span>
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900 truncate" title={scheduleDetails.fromEmail}>
                {scheduleDetails.fromEmail}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Google Workspace SMTP authenticated
              </div>
            </div>
          </div>

          {/* Upcoming Dispatch Batches Breakdown */}
          {scheduleDetails.upcomingBatches.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-700 mb-2">Upcoming Scheduled Batches:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {scheduleDetails.upcomingBatches.map((b, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{b.dateStr}</div>
                      <div className="text-[11px] text-slate-500">Timing: {b.sampleTime}</div>
                    </div>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                      {b.count} lead{b.count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scheduleDetails.pausedCount > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
              <span>⚠️</span>
              <span>
                <strong>{scheduleDetails.pausedCount} non-valid leads</strong> (catch-all, risky, unverified) have been safely paused from this campaign to protect your sender domain reputation.
              </span>
            </div>
          )}
        </Card>
      )}

      {/* Target Segment Card */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Target segment</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
          <Select value={seg.sector ?? ""} onChange={(e) => setSeg({ ...seg, sector: e.target.value })}>
            <option value="">Any sector</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={seg.geography ?? ""} onChange={(e) => setSeg({ ...seg, geography: e.target.value })}>
            <option value="">Any geography</option>
            {GEOGRAPHIES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
          <div className="flex flex-col justify-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Validation: VALID Only (Enforced)</span>
            </span>
            <span className="text-[10px] font-normal text-emerald-600">Zero tolerance: non-valid excluded</span>
          </div>
          <Input
            placeholder="Tag"
            value={seg.tag ?? ""}
            onChange={(e) => setSeg({ ...seg, tag: e.target.value })}
          />
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={pending}
            onClick={() => run(async () => {
              setCount(await segmentCount({ ...seg, validation: "VALID" }));
            })}
          >
            Preview count
          </Button>
          {count !== null && (
            <span className="text-sm text-slate-600">{count} valid leads match (excludes non-valid & suppressed)</span>
          )}
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => run(() => updateSegment(campaignId, { ...seg, validation: "VALID" }), "Target segment saved.")}
          >
            Save segment
          </Button>
        </div>
      </Card>

      {/* Sequence Steps Card */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Sequence steps</h2>
            <p className="text-xs text-slate-400">Automatic industry template matching and Ollama AI active</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Template Matching Active</span>
          </div>
        </div>

        {localSteps.length === 0 && (
          <div className="rounded-xl border border-dashed border-emerald-300 bg-gradient-to-r from-emerald-50/70 to-teal-50/50 p-4 text-center">
            <div className="flex items-center justify-center gap-2 font-semibold text-emerald-900 text-sm">
              <span>✨ Zero-Blocker Sequence Setup</span>
            </div>
            <p className="mt-1 text-xs text-emerald-700 max-w-md mx-auto">
              No manual template selection needed. The system will automatically select the best matching industry template, or generate a brand new one using <strong>Ollama AI deployed on VPS</strong> if the industry is not provided.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await addStep(campaignId, undefined, 0);
                  }, "Step 1 automatically generated and added via Ollama AI / Industry match.")
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-1.5 font-semibold"
              >
                ⚡ Auto-Generate Step 1 with Ollama AI
              </Button>
            </div>
          </div>
        )}

        <ol className="space-y-2">
          {localSteps.map((s) => {
            const isEditingThis = editingStepId === s.id;
            const isOllama = s.templateName.includes("[Ollama AI]");

            return (
              <li
                key={s.id}
                className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-sm border border-slate-100"
              >
                {isEditingThis ? (
                  <div className="space-y-3">
                    <div className="font-semibold text-slate-700">Edit Step {s.order + 1}</div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-slate-500">Email Template</label>
                        <Select
                          value={editStepTemplateId}
                          onChange={(e) => setEditStepTemplateId(e.target.value)}
                        >
                          <option value="auto">✨ Auto-select by industry or generate with Ollama AI</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="w-full sm:w-32">
                        <label className="mb-1 block text-xs text-slate-500">
                          {s.order === 0 ? "Delay (immediate)" : "Delay (days)"}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={editStepDelay}
                          onChange={(e) => setEditStepDelay(e.target.value)}
                          disabled={s.order === 0}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={pending}
                          onClick={() => handleSaveStep(s.id)}
                          className="h-10 px-3 text-xs"
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => setEditingStepId(null)}
                          className="h-10 px-3 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">Step {s.order + 1}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-900 font-medium">{s.templateName}</span>
                      {isOllama ? (
                        <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                          🤖 Ollama AI
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          ✓ Matched
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        ({s.order === 0 ? "sent immediately" : `+${s.delayDays} days after prev`})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          setPreviewStep(s);
                          setPreviewVariant("A");
                        }}
                        className="h-8 min-h-0 px-2.5 py-1 text-xs text-slate-700 hover:text-slate-900"
                      >
                        Preview
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => openAiEditor(s)}
                        className="h-8 min-h-0 px-2.5 py-1 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 font-semibold flex items-center gap-1 shadow-2xs"
                        title="Edit template copy or suggest changes to Ollama AI"
                      >
                        <span className="text-xs">✨</span>
                        <span>Edit / Refine with AI</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => startEditingStep(s)}
                        className="h-8 min-h-0 px-2 py-1 text-xs text-slate-500"
                        title="Change step delay or select different template"
                      >
                        Delay
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => removeStep(s.id, campaignId), "Step removed.")}
                        className="h-8 min-h-0 px-2 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* Add Step Form */}
        <div className="flex flex-col items-stretch gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="mb-1 block text-xs text-slate-500">Add Next Step Template</label>
            <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="auto">✨ Auto-select by industry or generate with Ollama AI (Recommended)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Delay (days after prev)</label>
            <Input
              type="number"
              min={0}
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="w-full sm:w-28"
            />
          </div>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => run(async () => {
              await addStep(campaignId, tpl === "auto" ? undefined : tpl, parseInt(delay, 10) || 0);
              setTpl("auto");
            }, "Step added to sequence.")}
          >
            Add step
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto border-emerald-200 text-emerald-800 hover:bg-emerald-50"
            disabled={pending}
            onClick={() => run(async () => {
              await addStep(campaignId, undefined, localSteps.length === 0 ? 0 : 3);
            }, "Step automatically generated and added via Ollama AI / Industry match.")}
            title="Automatically resolve industry template or create one using Ollama AI"
          >
            ⚡ Auto-Add with AI
          </Button>
        </div>
      </Card>

      {/* Dynamic Industry Matching Notification */}
      <div className="rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50/70 to-emerald-50/50 p-4 text-xs text-teal-900 shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-teal-600">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span>Automatic Industry Template Matching Enabled</span>
        </div>
        <p className="mt-1 text-teal-700">
          When emails are triggered, each lead automatically receives the template customized for their industry (e.g. <strong>Healthcare</strong>, <strong>Corporate</strong>, <strong>Manufacturing</strong>, <strong>Education</strong>, <strong>Hospitality</strong>, <strong>Industrial</strong>).
        </p>
      </div>

      {/* Campaign Status, Trigger & Scheduling Action Bar */}
      <Card className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">
              Status: <Badge className={status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>{status}</Badge>
            </span>
            <span className="text-xs text-slate-400">
              · {enrolledCount} lead{enrolledCount === 1 ? "" : "s"} enrolled
            </span>
          </div>

          {/* Active Outbound Sender Badge */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-slate-500">Outbound:</span>
            <span className="font-mono font-medium text-slate-900">{outboundSender?.fromEmail || "sales@vrindaacorp.com"}</span>
            <span className="text-[10px] text-slate-400">
              ({outboundSender?.provider === "smtp" ? "SMTP Active" : outboundSender?.provider === "ses" ? "SES Active" : "Simulated"})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status !== "ACTIVE" && (
            <>
              <Button
                className="w-full sm:w-auto"
                disabled={pending}
                onClick={() => run(() => setStatus(campaignId, "ACTIVE"), "Campaign activated.")}
              >
                Activate Campaign
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={handleOpenScheduleModal}
                className="w-full sm:w-auto"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mr-1.5 h-4 w-4 text-slate-500">
                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                </svg>
                Schedule Outreach
              </Button>
            </>
          )}

          {status === "ACTIVE" && (
            <>
              {/* Trigger Outreach Now */}
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={handleTriggerOutreachNow}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mr-1.5 h-4 w-4">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                {pending ? "Triggering Outreach…" : "Trigger Outreach Now"}
              </Button>

              {/* Schedule Outreach */}
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={handleOpenScheduleModal}
                className="w-full sm:w-auto"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mr-1.5 h-4 w-4 text-slate-500">
                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                </svg>
                Schedule Outreach
              </Button>

              <Button
                className="w-full sm:w-auto"
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => setStatus(campaignId, "PAUSED"), "Campaign paused.")}
              >
                Pause
              </Button>
            </>
          )}

          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={pending}
            onClick={() => run(async () => {
              const n = await enrollNow(campaignId);
              if (n === 0) setError("No new leads matched the segment.");
              else setSuccess(`Enrolled ${n} leads successfully.`);
            })}
          >
            Enroll matching leads
          </Button>
        </div>
      </Card>

      {/* Trigger & Schedule Outreach Modal Dialog */}
      <TriggerOutreachModal
        isOpen={isTriggerModalOpen}
        onClose={() => setIsTriggerModalOpen(false)}
        campaignId={campaignId}
        campaignName={campaignName}
        enrolledCount={enrolledCount}
        outboundSender={outboundSender}
        initialMode={modalMode}
        steps={steps}
        sampleLead={sampleLead}
        onSuccess={(msg) => setSuccess(msg)}
        onError={(msg) => setError(msg)}
      />

      {/* Individual Sequence Step Preview Dialog */}
      {previewStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setPreviewStep(null)}
          />
          <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Step {previewStep.order + 1} Email Preview
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {previewStep.templateName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewStep(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 py-4 text-xs">
              {/* Variant switcher */}
              {previewStep.subjectB && (
                <div className="flex items-center gap-1 border-b border-slate-100 pb-2.5">
                  <span className="text-slate-500 font-semibold mr-1">Subject Variant:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewVariant("A")}
                    className={`rounded px-2.5 py-1 text-xs font-bold ${
                      previewVariant === "A"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Variant A
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewVariant("B")}
                    className={`rounded px-2.5 py-1 text-xs font-bold ${
                      previewVariant === "B"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Variant B
                  </button>
                </div>
              )}

              {/* Envelope headers */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-16 text-slate-400 font-medium">From:</span>
                  <span className="font-mono text-slate-900">
                    {outboundSender?.fromEmail || "sales@vrindaacorp.com"} (VrindaaCorp Services)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-slate-400 font-medium">To:</span>
                  <span className="text-slate-900 font-medium">
                    {sampleLead?.firstName || "Rahul"} {sampleLead?.lastName || "Sharma"} &lt;
                    {sampleLead?.email || "rahul.sharma@apextowers.com"}&gt; ({sampleLead?.company || "Apex Towers"})
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-16 text-slate-400 font-medium">Subject:</span>
                  <span className="font-semibold text-slate-900">
                    {renderTokens(
                      previewVariant === "A"
                        ? previewStep.subjectA
                        : previewStep.subjectB || previewStep.subjectA
                    )}
                  </span>
                </div>
              </div>

              {/* Rendered Body */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs font-sans text-slate-800 leading-relaxed max-h-64 overflow-y-auto">
                <div
                  className="prose prose-xs max-w-none [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>li]:mb-1 [&>a]:text-brand [&>a]:underline"
                  dangerouslySetInnerHTML={{
                    __html: renderTokens(previewStep.html) || "<em>No content to preview.</em>",
                  }}
                />
              </div>

              <p className="text-[11px] text-slate-400">
                Personalized preview replaces tokens with sample lead data (e.g. {`{{firstName}}, {{company}}, {{city}}`}).
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const s = previewStep;
                  setPreviewStep(null);
                  openAiEditor(s);
                }}
                className="text-xs px-3.5 bg-purple-600 hover:bg-purple-700 text-white font-medium flex items-center gap-1.5 shadow-xs"
              >
                <span>✨</span>
                <span>Suggest Changes to Ollama AI / Edit</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPreviewStep(null)}
                className="text-xs px-4"
              >
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Template Editor & Refinement Modal */}
      {editingTemplateStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => {
              if (!isAiRefining) setEditingTemplateStep(null);
            }}
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Step {editingTemplateStep.order + 1}
                  </span>
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 border border-purple-200 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-pulse" />
                    <span>Ollama AI (llama3.2:3b on VPS)</span>
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {editingTemplateStep.templateName}
                </h3>
              </div>
              <button
                type="button"
                disabled={isAiRefining}
                onClick={() => setEditingTemplateStep(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Suggest to Ollama AI Card */}
              <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/70 via-indigo-50/40 to-white p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-white shadow-xs">
                      <span className="text-sm">✨</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                        Suggest Changes to Ollama AI
                      </h4>
                      <p className="text-[11px] text-purple-700">
                        Tell Ollama AI how to improve or tailor this auto-generated template. It aligns with your Owner Strategic Playbook.
                      </p>
                    </div>
                  </div>
                  {isAiRefining && (
                    <span className="text-xs font-medium text-purple-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-purple-600 animate-ping" />
                      Thinking on VPS...
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="e.g., Shorten to 90 words, emphasize our 24/7 supervisor audits and 15-min response time..."
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isAiRefining && aiPrompt.trim()) {
                        handleAskAi();
                      }
                    }}
                    disabled={isAiRefining}
                    className="flex-1 text-xs bg-white border-purple-200 focus:border-purple-500 focus:ring-purple-500"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isAiRefining || !aiPrompt.trim()}
                    onClick={() => handleAskAi()}
                    className="text-xs px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {isAiRefining ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>Revising Copy...</span>
                      </>
                    ) : (
                      <>
                        <span>✨ Ask AI to Revise</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Quick 1-Click Suggestions */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-900/60">
                    Quick Suggestions:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SUGGESTIONS.map((qs, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isAiRefining}
                        onClick={() => {
                          setAiPrompt(qs.prompt);
                          handleAskAi(qs.prompt);
                        }}
                        className="rounded-full bg-white/90 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 text-[11px] font-medium text-purple-800 transition shadow-2xs hover:border-purple-300 disabled:opacity-50"
                      >
                        {qs.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Changes Notification Alert */}
                {aiChangesSummary && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">✓</span>
                    <div>
                      <span className="font-semibold text-emerald-900">Ollama AI Revision Applied: </span>
                      <span>{aiChangesSummary}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tab Switcher: Edit vs Live Preview */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorTab("edit")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      editorTab === "edit"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    ✏️ Direct Code & Content Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("preview")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      editorTab === "preview"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    👁️ Live Lead Preview ({sampleLead?.company || "Sample Lead"})
                  </button>
                </div>

                {editorTab === "preview" && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500 font-medium mr-1">Variant:</span>
                    <button
                      type="button"
                      onClick={() => setEditorPreviewVariant("A")}
                      className={`rounded px-2 py-0.5 text-xs font-bold ${
                        editorPreviewVariant === "A"
                          ? "bg-purple-700 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorPreviewVariant("B")}
                      className={`rounded px-2 py-0.5 text-xs font-bold ${
                        editorPreviewVariant === "B"
                          ? "bg-purple-700 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      B
                    </button>
                  </div>
                )}
              </div>

              {/* Edit Mode Content */}
              {editorTab === "edit" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Subject Line A (Primary)</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {editorSubjectA.length} chars
                        </span>
                      </label>
                      <Input
                        value={editorSubjectA}
                        onChange={(e) => setEditorSubjectA(e.target.value)}
                        placeholder="Subject line A..."
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Subject Line B (A/B Test Variant)</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {editorSubjectB.length} chars
                        </span>
                      </label>
                      <Input
                        value={editorSubjectB}
                        onChange={(e) => setEditorSubjectB(e.target.value)}
                        placeholder="Subject line B (optional)..."
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Email Body (HTML Copy)
                      </label>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-slate-400 mr-1">Insert Tokens:</span>
                        {["firstName", "company", "city", "geography", "industryHook"].map((tok) => (
                          <button
                            key={tok}
                            type="button"
                            onClick={() => insertToken(tok)}
                            className="rounded bg-slate-100 hover:bg-purple-50 hover:text-purple-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 border border-slate-200 transition"
                            title={`Click to append {{${tok}}}`}
                          >
                            + {`{{${tok}}}`}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEditorHtml((prev) => `${prev.trim()}\n\n<p><a href="${CALENDLY_BOOKING_URL}">Book a 30-min call</a></p>`)}
                          className="rounded bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-300 transition flex items-center gap-1 ml-1"
                          title={`Insert official Calendly booking link: ${CALENDLY_BOOKING_URL}`}
                        >
                          📅 + Book a Call Link
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={editorHtml}
                      onChange={(e) => setEditorHtml(e.target.value)}
                      rows={9}
                      className="w-full rounded-xl border border-slate-200 bg-slate-900 text-slate-100 font-mono text-xs p-3 leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      placeholder="<p>Hi {{firstName}},</p>..."
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Supports standard HTML: &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;a href="..."&gt;. Double curly braces are replaced when sending.
                    </p>
                  </div>
                </div>
              ) : (
                /* Preview Mode Content */
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-slate-400 font-medium">From:</span>
                      <span className="font-mono text-slate-900">
                        {outboundSender?.fromEmail || "sales@vrindaacorp.com"} (VrindaaCorp Services)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-slate-400 font-medium">To:</span>
                      <span className="text-slate-900 font-medium">
                        {sampleLead?.firstName || "Rahul"} {sampleLead?.lastName || "Sharma"} &lt;
                        {sampleLead?.email || "rahul.sharma@apextowers.com"}&gt; ({sampleLead?.company || "Apex Towers"})
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-16 text-slate-400 font-medium">Subject:</span>
                      <span className="font-semibold text-slate-900">
                        {renderTokens(
                          editorPreviewVariant === "A"
                            ? editorSubjectA
                            : editorSubjectB || editorSubjectA
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs font-sans text-xs text-slate-800 leading-relaxed max-h-72 overflow-y-auto">
                    <div
                      className="prose prose-xs max-w-none [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>li]:mb-1 [&>a]:text-purple-600 [&>a]:underline"
                      dangerouslySetInnerHTML={{
                        __html: renderTokens(editorHtml) || "<em>No content to preview.</em>",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-3">
              <Button
                type="button"
                variant="secondary"
                disabled={isAiRefining}
                onClick={() => setEditingTemplateStep(null)}
                className="text-xs px-4"
              >
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  disabled={isAiRefining || !editorSubjectA.trim() || !editorHtml.trim()}
                  onClick={handleSaveTemplateChanges}
                  className="text-xs px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <span>💾 Save Changes to Template</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
