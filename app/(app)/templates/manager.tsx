"use client";

import { useState, useTransition } from "react";
import DOMPurify from "isomorphic-dompurify";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { applyTokens } from "@/lib/email/render";
import { upsertTemplate, deleteTemplate } from "./actions";

// Whitelist safe email-HTML tags/attrs; strips <script>, event handlers, javascript: URLs.
const sanitize = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "span", "div"],
    ALLOWED_ATTR: ["href", "style", "title", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  });

type Template = {
  id: string;
  name: string;
  subjectA: string;
  subjectB: string | null;
  html: string;
  aiEnabled: boolean;
  aiBrief: string | null;
};

const SAMPLE_LEAD = {
  id: "preview",
  firstName: "Rahul",
  lastName: "Sharma",
  company: "Apex Towers",
  sector: "Corporate",
  email: "rahul@example.com",
};

const BLANK = { name: "", subjectA: "", subjectB: "", html: "", aiEnabled: false, aiBrief: "" };

export function TemplateManager({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<typeof BLANK & { id?: string }>(BLANK);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [aiPreview, setAiPreview] = useState<{ subject: string; html: string; generated: boolean } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function generateAiPreview() {
    setPreviewing(true);
    setAiPreview(null);
    try {
      const res = await fetch("/api/ai/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: editing.aiBrief, ...SAMPLE_LEAD }),
      });
      const data = await res.json();
      if (res.ok) setAiPreview(data);
      else setError(data.error ?? "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  function save() {
    setError("");
    start(async () => {
      try {
        await upsertTemplate(editing);
        setEditing(BLANK);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {editing.id ? "Edit template" : "New template"}
        </h2>
        <Input
          placeholder="Template name"
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
        />
        <Input
          placeholder="Subject A"
          value={editing.subjectA}
          onChange={(e) => setEditing({ ...editing, subjectA: e.target.value })}
        />
        <Input
          placeholder="Subject B (A/B variant, optional)"
          value={editing.subjectB}
          onChange={(e) => setEditing({ ...editing, subjectB: e.target.value })}
        />
        <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={editing.aiEnabled}
            onChange={(e) => setEditing({ ...editing, aiEnabled: e.target.checked })}
          />
          <span className="font-medium text-slate-700">AI-generate a personalized email per lead</span>
        </label>

        {editing.aiEnabled ? (
          <div className="space-y-2">
            <Textarea
              rows={5}
              placeholder="Brief / offer for the AI. e.g. 'Introduce our facility-management services and ask for a 15-min call. Emphasize housekeeping + security for their sector.'"
              value={editing.aiBrief}
              onChange={(e) => setEditing({ ...editing, aiBrief: e.target.value })}
            />
            <p className="text-xs text-slate-400">
              The AI writes each email using the lead&apos;s name, company and sector plus this brief. The
              subject/HTML below are used as a fallback if AI is unavailable.
            </p>
            <Button
              variant="secondary"
              onClick={generateAiPreview}
              disabled={previewing || !editing.aiBrief.trim()}
            >
              {previewing ? "Generating…" : "Generate AI preview"}
            </Button>
          </div>
        ) : null}

        <Textarea
          rows={editing.aiEnabled ? 5 : 10}
          placeholder="HTML body. Tokens: {{firstName}} {{company}} {{sector}} {{unsubscribe}}"
          value={editing.html}
          onChange={(e) => setEditing({ ...editing, html: e.target.value })}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-400">
          Available tokens: {"{{firstName}}"}, {"{{lastName}}"}, {"{{company}}"}, {"{{sector}}"},
          {" "}
          {"{{unsubscribe}}"}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={save} disabled={pending || !editing.name || !editing.subjectA}>
            {editing.id ? "Update" : "Create"}
          </Button>
          {editing.id && (
            <Button variant="ghost" onClick={() => setEditing(BLANK)}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        {aiPreview && (
          <Card className="border-brand/30">
              <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="min-w-0 text-xs font-semibold text-brand sm:text-sm">AI preview (sample lead: Rahul @ Apex Towers)</h2>
              {!aiPreview.generated && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                  fallback (no API key)
                </span>
              )}
            </div>
            <div className="mb-2 text-xs text-slate-500">Subject: {aiPreview.subject}</div>
            <div
              className="prose prose-sm max-w-none overflow-x-auto rounded border border-slate-100 p-3 text-sm"
              dangerouslySetInnerHTML={{ __html: sanitize(aiPreview.html) }}
            />
          </Card>
        )}

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Live preview (fallback HTML)</h2>
          <div className="mb-2 text-xs text-slate-400">
            Subject: {applyTokens(editing.subjectA || "—", SAMPLE_LEAD)}
          </div>
          <div
            className="prose prose-sm max-w-none overflow-x-auto rounded border border-slate-100 p-3 text-sm"
            dangerouslySetInnerHTML={{
              __html: sanitize(applyTokens(editing.html || "<em>Nothing to preview yet.</em>", SAMPLE_LEAD)),
            }}
          />
        </Card>

        <Card className="p-0">
          <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-700">
            Saved templates ({templates.length})
          </div>
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                    {t.name}
                    {t.aiEnabled && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                        AI
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-slate-400">{t.aiEnabled ? t.aiBrief : t.subjectA}</div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setEditing({
                        id: t.id,
                        name: t.name,
                        subjectA: t.subjectA,
                        subjectB: t.subjectB ?? "",
                        html: t.html,
                        aiEnabled: t.aiEnabled,
                        aiBrief: t.aiBrief ?? "",
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      start(async () => {
                        setError("");
                        try {
                          await deleteTemplate(t.id);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
            {templates.length === 0 && (
              <li className="p-4 text-center text-sm text-slate-400">No templates yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
