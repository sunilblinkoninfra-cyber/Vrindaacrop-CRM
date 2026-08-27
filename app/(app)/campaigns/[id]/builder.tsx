"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { SECTORS, GEOGRAPHIES } from "@/lib/constants";
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
} from "../actions";
import type { CampaignStatus } from "@prisma/client";

type Step = {
  id: string;
  order: number;
  delayDays: number;
  templateId: string;
  templateName: string;
};

type TemplateOpt = { id: string; name: string };

type OutboundSenderInfo = {
  provider: "smtp" | "ses" | "simulated";
  fromEmail: string;
  fromName: string;
  host?: string;
  isConfigured: boolean;
};

export function CampaignBuilder({
  campaignId,
  campaignName,
  status,
  segment,
  steps,
  templates,
  enrolledCount,
  outboundSender,
}: {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  segment: Record<string, string>;
  steps: Step[];
  templates: TemplateOpt[];
  enrolledCount: number;
  outboundSender?: OutboundSenderInfo;
}) {
  const router = useRouter();
  const [seg, setSeg] = useState<Record<string, string>>(segment);
  const [count, setCount] = useState<number | null>(null);
  const [tpl, setTpl] = useState("");
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

  // Schedule Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 30, 0, 0);
    return tomorrow.toISOString().slice(0, 16);
  });

  function run(fn: () => Promise<unknown>, successMsg?: string) {
    setError("");
    setSuccess("");
    start(async () => {
      try {
        await fn();
        if (successMsg) setSuccess(successMsg);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
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
    if (status !== "ACTIVE") {
      setError("Please activate the campaign before triggering outreach.");
      return;
    }
    run(async () => {
      const res = await triggerCampaignOutreach(campaignId);
      if (res.sent > 0) {
        setSuccess(`⚡ Outreach triggered: ${res.sent} email(s) sent successfully!`);
      } else if (res.capReached) {
        setSuccess(`Sending cap reached for today. Remaining emails are queued.`);
      } else {
        setSuccess(`Outreach triggered: ${res.attempted} processed (${res.sent} sent, ${res.skipped} skipped).`);
      }
    });
  }

  function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledDateTime) {
      setError("Please select a valid schedule date and time.");
      return;
    }
    run(async () => {
      const res = await scheduleCampaignOutreach(campaignId, scheduledDateTime);
      setIsScheduleModalOpen(false);
      setSuccess(`📅 Outreach scheduled for ${new Date(res.scheduledAt).toLocaleString()} (${res.count} leads updated).`);
    });
  }

  function setQuickSchedule(offsetHours: number, targetHour?: number) {
    const d = new Date();
    if (targetHour !== undefined) {
      d.setDate(d.getDate() + (offsetHours >= 24 ? 1 : 0));
      d.setHours(targetHour, 30, 0, 0);
    } else {
      d.setHours(d.getHours() + offsetHours);
    }
    setScheduledDateTime(d.toISOString().slice(0, 16));
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
          <Select value={seg.validation ?? ""} onChange={(e) => setSeg({ ...seg, validation: e.target.value })}>
            <option value="">Any validation</option>
            <option value="VALID">Valid only</option>
            <option value="UNKNOWN">Unknown</option>
            <option value="RISKY">Risky</option>
          </Select>
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
              setCount(await segmentCount(seg));
            })}
          >
            Preview count
          </Button>
          {count !== null && (
            <span className="text-sm text-slate-600">{count} leads match (excludes suppressed)</span>
          )}
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => run(() => updateSegment(campaignId, seg), "Target segment saved.")}
          >
            Save segment
          </Button>
        </div>
      </Card>

      {/* Sequence Steps Card */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Sequence steps</h2>
          <div className="flex items-center gap-1.5 text-xs text-brand">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span className="font-medium">Automatic Industry Matching Active</span>
          </div>
        </div>
        <ol className="space-y-2">
          {steps.map((s) => {
            const isEditingThis = editingStepId === s.id;

            return (
              <li
                key={s.id}
                className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-sm"
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
                          <option value="">Select template…</option>
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
                          disabled={pending || !editStepTemplateId}
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
                    <div>
                      <strong>Step {s.order + 1}</strong> — {s.templateName}{" "}
                      <span className="text-slate-400">
                        ({s.order === 0 ? "sent immediately" : `+${s.delayDays} days after prev`})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-center">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => startEditingStep(s)}
                        className="h-8 min-h-0 px-2.5 py-1 text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => removeStep(s.id, campaignId), "Step removed.")}
                        className="h-8 min-h-0 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {steps.length === 0 && <li className="text-sm text-slate-400">No steps yet. Add your first step below.</li>}
        </ol>

        {/* Add Step Form */}
        <div className="flex flex-col items-stretch gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:w-56">
            <label className="mb-1 block text-xs text-slate-500">Add Next Step Template</label>
            <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="">Choose template…</option>
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
            disabled={pending || !tpl}
            onClick={() => run(async () => {
              await addStep(campaignId, tpl, parseInt(delay, 10) || 0);
              setTpl("");
            }, "Step added to sequence.")}
          >
            Add step
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
            <Button
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={() => run(() => setStatus(campaignId, "ACTIVE"), "Campaign activated.")}
            >
              Activate Campaign
            </Button>
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
                onClick={() => setIsScheduleModalOpen(true)}
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

      {/* Schedule Outreach Modal Dialog */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !pending && setIsScheduleModalOpen(false)}
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Schedule Campaign Outreach</h3>
                <p className="text-xs text-slate-500">Set the target date and time to start sending emails.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="mt-4 space-y-4">
              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Quick Presets</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setQuickSchedule(1)}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-left hover:bg-slate-100 hover:border-slate-300"
                  >
                    <div className="font-medium text-slate-800">In 1 Hour</div>
                    <div className="text-[10px] text-slate-400">Quick dispatch</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickSchedule(24, 9)}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-left hover:bg-slate-100 hover:border-slate-300"
                  >
                    <div className="font-medium text-slate-800">Tomorrow 09:30 AM</div>
                    <div className="text-[10px] text-slate-400">Morning business slot</div>
                  </button>
                </div>
              </div>

              {/* Custom Date Time Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Custom Date &amp; Time</label>
                <Input
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  className="mt-1 font-mono text-xs"
                  required
                />
              </div>

              <div className="rounded-lg bg-teal-50 p-3 text-xs text-teal-800">
                <span>💡 Leads will be automatically matched to their industry templates upon dispatch.</span>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsScheduleModalOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? "Saving Schedule…" : "Save Schedule"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
