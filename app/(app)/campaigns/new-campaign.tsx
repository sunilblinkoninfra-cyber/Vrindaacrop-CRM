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
    <div className="flex gap-2">
      <Input
        placeholder="New campaign name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-64"
      />
      <Button
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
