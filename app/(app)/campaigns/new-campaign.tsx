"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createCampaign } from "./actions";

export function NewCampaign() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <Input
        placeholder="New campaign name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full sm:w-64"
      />
      <Button
        className="w-full sm:w-auto"
        disabled={pending || !name.trim()}
        onClick={() => start(async () => {
          const id = await createCampaign(name);
          router.push(`/campaigns/${id}`);
        })}
      >
        Create
      </Button>
    </div>
  );
}
