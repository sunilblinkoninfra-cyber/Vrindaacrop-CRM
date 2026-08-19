"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";
import { Button, Card, Input, Select } from "@/components/ui";
import { createUser, updateUserRole } from "./actions";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin — full access, manages users",
  OWNER: "Owner — full access, all leads",
  AGENT: "Agent — assigned leads only",
};

type UserRow = { id: string; email: string; name: string | null; role: Role; leadCount: number };

export function CreateUserForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    startTransition(async () => {
      const result = await createUser({ email, name, password, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setEmail("");
      setName("");
      setPassword("");
      setRole("AGENT");
    });
  }

  return (
    <Card className="max-w-md">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">Add a team member</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Temporary password</label>
          <Input
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="mt-1 text-[11px] text-slate-400">At least 10 characters. Share it with them securely — they can change it under Account.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Access role</label>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">User created.</p>}

        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create user"}
        </Button>
      </form>
    </Card>
  );
}

export function UserRoleControl({ userId, role, isSelf }: { userId: string; role: Role; isSelf: boolean }) {
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Role;
    setValue(next);
    setError("");
    startTransition(async () => {
      const result = await updateUserRole(userId, next);
      if (!result.ok) {
        setError(result.error);
        setValue(role);
      }
    });
  }

  if (isSelf) {
    return <span className="text-sm text-slate-500">{ROLE_LABEL[role].split(" —")[0]} (you)</span>;
  }

  return (
    <div>
      <Select value={value} onChange={onChange} disabled={pending} className="max-w-[220px]">
        {Object.keys(ROLE_LABEL).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export type { UserRow };
