"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteLead } from "./actions";

/** Owner/Admin-only permanent delete, used on both the leads list and lead detail page. */
export function DeleteLeadButton({
  leadId,
  label,
  redirectTo,
  className,
}: {
  leadId: string;
  label: string;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function onClick() {
    if (!window.confirm(`Delete ${label}? This permanently removes the lead, its notes, tasks, and email history. This can't be undone.`)) {
      return;
    }
    setError("");
    start(async () => {
      try {
        await deleteLead(leadId);
        if (redirectTo) router.push(redirectTo);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className={className}>
      <Button type="button" variant="danger" disabled={pending} onClick={onClick}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
