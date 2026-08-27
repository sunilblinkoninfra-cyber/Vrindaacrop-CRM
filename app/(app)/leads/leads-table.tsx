"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Select } from "@/components/ui";
import { fullName } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import { deleteLead, bulkDelete, bulkAssign } from "./actions";

type UserOption = {
  id: string;
  name: string | null;
  email: string;
};

type LeadItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string;
  phone: string | null;
  sector: string | null;
  city: string | null;
  geography: string | null;
  stage: string;
  validationStatus: string;
  validationReason: string | null;
  hot: boolean;
  isSuppressed: boolean;
  owner: { name: string | null; email: string } | null;
  tags?: { tag: { name: string } }[];
};

export function LeadsTable({
  leads,
  canManage,
  users = [],
}: {
  leads: LeadItem[];
  canManage: boolean;
  users?: UserOption[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("");

  const allSelected = leads.length > 0 && selectedIds.length === leads.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < leads.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l) => l.id));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function handleDeleteSingle(leadId: string, name: string) {
    if (
      !window.confirm(
        `Are you sure you want to delete ${name}? This will permanently remove the lead, activity history, and campaign data.`
      )
    ) {
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await deleteLead(leadId);
        setSelectedIds((prev) => prev.filter((id) => id !== leadId));
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to delete lead.");
      }
    });
  }

  function handleBulkDelete() {
    if (!selectedIds.length) return;
    if (
      !window.confirm(
        `Are you sure you want to permanently delete all ${selectedIds.length} selected leads? This cannot be undone.`
      )
    ) {
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await bulkDelete(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to delete selected leads.");
      }
    });
  }

  function handleBulkAssign(ownerId: string | null) {
    if (!selectedIds.length) return;
    setError("");
    startTransition(async () => {
      try {
        await bulkAssign(selectedIds, ownerId);
        setSelectedIds([]);
        setSelectedOwner("");
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to assign leads.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Error alert if any operation failed */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Floating / Top Bulk Action Toolbar */}
      {canManage && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/20 bg-brand/5 p-3 text-sm text-slate-800 animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <span className="inline-flex h-6 items-center justify-center rounded-full bg-brand px-2.5 text-xs font-semibold text-white">
              {selectedIds.length}
            </span>
            <span>lead{selectedIds.length > 1 ? "s" : ""} selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {users.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Select
                  value={selectedOwner}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedOwner(val);
                    if (val === "UNASSIGN") handleBulkAssign(null);
                    else if (val) handleBulkAssign(val);
                  }}
                  disabled={pending}
                  className="h-8 min-h-0 py-1 text-xs"
                >
                  <option value="">Assign to owner...</option>
                  <option value="UNASSIGN">Unassign</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={handleBulkDelete}
              className="h-8 min-h-0 px-3 py-1 text-xs"
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
              <span>{pending ? "Deleting…" : `Delete Selected (${selectedIds.length})`}</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setSelectedIds([])}
              className="h-8 min-h-0 px-2.5 py-1 text-xs"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="data-table">
          <thead>
            <tr>
              {canManage && (
                <th className="w-10 text-center">
                  <input
                    type="checkbox"
                    aria-label="Select all leads on this page"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                </th>
              )}
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Sector</th>
              <th>City</th>
              <th>Region</th>
              <th>Stage</th>
              <th>Validation</th>
              <th>Owner</th>
              {canManage && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const name = fullName(l.firstName, l.lastName) || l.email;
              const isSelected = selectedIds.includes(l.id);

              return (
                <tr key={l.id} className={isSelected ? "bg-brand/5" : ""}>
                  {canManage && (
                    <td className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select lead ${name}`}
                        checked={isSelected}
                        onChange={() => toggleSelectOne(l.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                      />
                    </td>
                  )}
                  <td>
                    <Link
                      href={`/leads/${l.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {fullName(l.firstName, l.lastName) || "—"}
                    </Link>
                    {l.hot && (
                      <Badge className="ml-2 bg-red-100 text-red-700">Hot</Badge>
                    )}
                  </td>
                  <td className="text-slate-600">{l.company || "—"}</td>
                  <td className="text-slate-600">{l.email}</td>
                  <td className="text-slate-600">{l.sector || "—"}</td>
                  <td className="text-slate-600">{l.city || "—"}</td>
                  <td className="text-slate-600">{l.geography || "—"}</td>
                  <td>
                    <Badge tone={l.stage}>
                      {STAGE_LABELS[l.stage as keyof typeof STAGE_LABELS] || l.stage}
                    </Badge>
                  </td>
                  <td title={l.validationReason ?? undefined}>
                    <Badge tone={l.validationStatus}>{l.validationStatus}</Badge>
                  </td>
                  <td className="text-slate-600">{l.owner?.name ?? "—"}</td>
                  {canManage && (
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(l.id, name)}
                        disabled={pending}
                        title="Delete lead"
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
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
                        <span>Delete</span>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td
                  colSpan={canManage ? 11 : 9}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No leads found. Click "+ Add Lead" to create one or import a list from Import &amp; Cleanup.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="divide-y divide-slate-100 lg:hidden">
        {leads.map((l) => {
          const name = fullName(l.firstName, l.lastName) || l.email;
          const isSelected = selectedIds.includes(l.id);

          return (
            <article
              key={l.id}
              className={`space-y-3 p-4 ${isSelected ? "bg-brand/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {canManage && (
                    <input
                      type="checkbox"
                      aria-label={`Select lead ${name}`}
                      checked={isSelected}
                      onChange={() => toggleSelectOne(l.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/leads/${l.id}`}
                      className="block truncate font-semibold text-brand hover:underline"
                    >
                      {name}
                    </Link>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {l.company || "No company"}
                    </div>
                  </div>
                </div>
                {l.hot && (
                  <Badge className="shrink-0 bg-red-100 text-red-700">Hot</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="col-span-2 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Email
                  </div>
                  <div className="break-all text-slate-600">{l.email}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Stage
                  </div>
                  <Badge tone={l.stage}>
                    {STAGE_LABELS[l.stage as keyof typeof STAGE_LABELS] || l.stage}
                  </Badge>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Validation
                  </div>
                  <span title={l.validationReason ?? undefined}>
                    <Badge tone={l.validationStatus}>{l.validationStatus}</Badge>
                  </span>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Sector
                  </div>
                  <div className="truncate text-slate-600">{l.sector || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Location
                  </div>
                  <div className="truncate text-slate-600">
                    {[l.city, l.geography].filter(Boolean).join(", ") || "—"}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Owner
                  </div>
                  <div className="truncate text-slate-600">
                    {l.owner?.name ?? "—"}
                  </div>
                </div>
              </div>

              {canManage && (
                <div className="flex justify-end border-t border-slate-50 pt-2">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending}
                    onClick={() => handleDeleteSingle(l.id, name)}
                    className="h-8 min-h-0 px-3 py-1 text-xs"
                  >
                    Delete Lead
                  </Button>
                </div>
              )}
            </article>
          );
        })}
        {leads.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No leads found. Click "+ Add Lead" to create one or import a list from Import &amp; Cleanup.
          </div>
        )}
      </div>
    </div>
  );
}
