"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { deleteCampaign, triggerCampaignOutreach } from "./actions";

type CampaignItem = {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  _count: {
    steps: number;
    enrollments: number;
  };
};

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
};

export function CampaignsList({ campaigns }: { campaigns: CampaignItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleDelete(id: string, name: string) {
    if (
      !window.confirm(
        `Are you sure you want to delete "${name}"? This will permanently remove all sequence steps and enrolled lead progress.`
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setPendingId(id);
    startTransition(async () => {
      try {
        await deleteCampaign(id);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to delete campaign.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleTrigger(id: string) {
    setError("");
    setSuccess("");
    setPendingId(id);
    startTransition(async () => {
      try {
        const res = await triggerCampaignOutreach(id);
        if (res.sent > 0) {
          setSuccess(`⚡ Outreach triggered: ${res.sent} email(s) sent with industry-matched templates!`);
        } else {
          setSuccess(`Outreach triggered: ${res.attempted} processed (${res.sent} sent, ${res.skipped} skipped).`);
        }
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to trigger outreach.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {campaigns.map((c) => {
          const isDeleting = isPending && pendingId === c.id;
          const isTriggering = isPending && pendingId === c.id;

          return (
            <li
              key={c.id}
              className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="block truncate font-medium text-brand hover:underline"
                  >
                    {c.name}
                  </Link>
                  <Badge className={`shrink-0 ${statusTone[c.status] || "bg-slate-100 text-slate-600"}`}>
                    {c.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {c._count.steps} step{c._count.steps === 1 ? "" : "s"} · {c._count.enrollments} enrolled
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {c.status === "ACTIVE" && (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isPending}
                    onClick={() => handleTrigger(c.id)}
                    className="h-8 min-h-0 px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="mr-1 h-3.5 w-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{isTriggering ? "Sending…" : "Trigger Now"}</span>
                  </Button>
                )}

                <Link href={`/campaigns/${c.id}`}>
                  <Button variant="secondary" className="h-8 min-h-0 px-3 py-1 text-xs">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                    </svg>
                    <span>Edit</span>
                  </Button>
                </Link>

                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDelete(c.id, c.name)}
                  className="h-8 min-h-0 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
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
                  <span>{isDeleting ? "Deleting…" : "Delete"}</span>
                </Button>
              </div>
            </li>
          );
        })}

        {campaigns.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-400">
            No campaigns yet. Click "+ New campaign" to create your first outreach campaign.
          </li>
        )}
      </ul>
    </div>
  );
}

