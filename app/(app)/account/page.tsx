"use client";

import { useState } from "react";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { changePassword } from "./actions";

export default function AccountPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }

    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Account" subtitle="Manage your own login credentials." />

      <Card className="max-w-md">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Change password</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Current password</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">New password</label>
            <Input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <p className="mt-1 text-[11px] text-slate-400">At least 10 characters.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Confirm new password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">Password updated.</p>}

          <Button type="submit" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
