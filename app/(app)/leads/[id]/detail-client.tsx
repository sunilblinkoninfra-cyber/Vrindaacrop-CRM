"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { STAGES, STAGE_LABELS } from "@/lib/constants";
import type { LeadStage } from "@prisma/client";
import {
  updateStage,
  assignOwner,
  addNote,
  addTask,
  toggleTask,
  setSuppressed,
  acknowledgeHot,
  addTag,
  removeTag,
} from "../actions";

type UserOpt = { id: string; name: string | null; email: string };

export function StageControl({ leadId, stage }: { leadId: string; stage: LeadStage }) {
  const [pending, start] = useTransition();
  return (
    <Select
      disabled={pending}
      value={stage}
      onChange={(e) => start(() => updateStage(leadId, e.target.value as LeadStage).then(() => {}))}
      className="w-44"
    >
      {STAGES.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}

export function OwnerControl({
  leadId,
  ownerId,
  users,
}: {
  leadId: string;
  ownerId: string | null;
  users: UserOpt[];
}) {
  const [pending, start] = useTransition();
  return (
    <Select
      disabled={pending}
      value={ownerId ?? ""}
      onChange={(e) => start(() => assignOwner(leadId, e.target.value || null).then(() => {}))}
      className="w-44"
    >
      <option value="">Unassigned</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name ?? u.email}
        </option>
      ))}
    </Select>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea
        rows={2}
        placeholder="Add a note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Button
        disabled={pending || !body.trim()}
        onClick={() => start(() => addNote(leadId, body).then(() => setBody("")))}
      >
        Add note
      </Button>
    </div>
  );
}

export function TaskForm({ leadId, users }: { leadId: string; users: UserOpt[] }) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignee, setAssignee] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Follow-up task…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-56"
      />
      <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-40" />
      <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-40">
        <option value="">Assignee…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name ?? u.email}
          </option>
        ))}
      </Select>
      <Button
        disabled={pending || !title.trim()}
        onClick={() =>
          start(() =>
            addTask(leadId, title, dueAt || undefined, assignee || undefined).then(() => {
              setTitle("");
              setDueAt("");
              setAssignee("");
            })
          )
        }
      >
        Add task
      </Button>
    </div>
  );
}

export function TaskToggle({ taskId, completed }: { taskId: string; completed: boolean }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      disabled={pending}
      checked={completed}
      onChange={(e) => start(() => toggleTask(taskId, e.target.checked).then(() => {}))}
    />
  );
}

export function TagEditor({
  leadId,
  tags,
}: {
  leadId: string;
  tags: { tagId: string; name: string }[];
}) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span
            key={t.tagId}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
          >
            {t.name}
            <button
              onClick={() => start(() => removeTag(leadId, t.tagId).then(() => {}))}
              className="text-slate-400 hover:text-red-500"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add tag…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-40"
        />
        <Button
          variant="secondary"
          disabled={pending || !name.trim()}
          onClick={() => start(() => addTag(leadId, name).then(() => setName("")))}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

export function LeadActions({
  leadId,
  hot,
  suppressed,
}: {
  leadId: string;
  hot: boolean;
  suppressed: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {hot && (
        <Button disabled={pending} onClick={() => start(() => acknowledgeHot(leadId).then(() => {}))}>
          Acknowledge hot lead
        </Button>
      )}
      <Button
        variant={suppressed ? "secondary" : "danger"}
        disabled={pending}
        onClick={() => start(() => setSuppressed(leadId, !suppressed).then(() => {}))}
      >
        {suppressed ? "Unsuppress" : "Suppress"}
      </Button>
    </div>
  );
}
