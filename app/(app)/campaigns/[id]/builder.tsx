"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { SECTORS, GEOGRAPHIES } from "@/lib/constants";
import {
  updateSegment,
  addStep,
  removeStep,
  setStatus,
  enrollNow,
  segmentCount,
} from "../actions";
import type { CampaignStatus } from "@prisma/client";

type Step = { id: string; order: number; delayDays: number; templateName: string };
type TemplateOpt = { id: string; name: string };

export function CampaignBuilder({
  campaignId,
  status,
  segment,
  steps,
  templates,
  enrolledCount,
}: {
  campaignId: string;
  status: CampaignStatus;
  segment: Record<string, string>;
  steps: Step[];
  templates: TemplateOpt[];
  enrolledCount: number;
}) {
  const [seg, setSeg] = useState<Record<string, string>>(segment);
  const [count, setCount] = useState<number | null>(null);
  const [tpl, setTpl] = useState("");
  const [delay, setDelay] = useState("3");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function run(fn: () => Promise<unknown>) {
    setError("");
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}

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
          <Button className="w-full sm:w-auto" disabled={pending} onClick={() => run(() => updateSegment(campaignId, seg))}>
            Save segment
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Sequence steps</h2>
        <ol className="space-y-2">
          {steps.map((s) => (
            <li key={s.id} className="flex flex-col items-start gap-2 rounded bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>
                <strong>Step {s.order + 1}</strong> — {s.templateName}{" "}
                <span className="text-slate-400">
                  ({s.order === 0 ? "sent immediately" : `+${s.delayDays} days`})
                </span>
              </span>
              <Button className="w-full sm:w-auto" variant="ghost" disabled={pending} onClick={() => run(() => removeStep(s.id, campaignId))}>
                Remove
              </Button>
            </li>
          ))}
          {steps.length === 0 && <li className="text-sm text-slate-400">No steps yet.</li>}
        </ol>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <Select value={tpl} onChange={(e) => setTpl(e.target.value)} className="w-full sm:w-56">
            <option value="">Choose template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Delay (days after prev)</label>
            <Input type="number" min={0} value={delay} onChange={(e) => setDelay(e.target.value)} className="w-full sm:w-28" />
          </div>
          <Button
            className="w-full sm:w-auto"
            disabled={pending || !tpl}
            onClick={() => run(async () => {
              await addStep(campaignId, tpl, parseInt(delay, 10) || 0);
              setTpl("");
            })}
          >
            Add step
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="text-sm text-slate-600">
          Status: <strong>{status}</strong> · {enrolledCount} enrolled
        </span>
        {status !== "ACTIVE" && (
          <Button className="w-full sm:w-auto" disabled={pending} onClick={() => run(() => setStatus(campaignId, "ACTIVE"))}>
            Activate
          </Button>
        )}
        {status === "ACTIVE" && (
          <Button className="w-full sm:w-auto" variant="secondary" disabled={pending} onClick={() => run(() => setStatus(campaignId, "PAUSED"))}>
            Pause
          </Button>
        )}
        <Button
          className="w-full sm:w-auto"
          variant="secondary"
          disabled={pending}
          onClick={() => run(async () => {
            const n = await enrollNow(campaignId);
            setError(n === 0 ? "No new leads matched the segment." : `Enrolled ${n} leads.`);
          })}
        >
          Enroll matching leads
        </Button>
      </Card>
    </div>
  );
}
