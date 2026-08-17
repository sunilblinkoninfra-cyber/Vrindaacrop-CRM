"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select } from "@/components/ui";
import { confirmContract, setContract } from "../actions";
import type { ContractStatus } from "@prisma/client";

type Props = {
  leadId: string;
  status: ContractStatus;
  vendor: string | null;
  expiry: string | null; // yyyy-mm-dd
  confidence: string | null;
  source: string | null;
  checked: boolean;
  confirmed: boolean;
};

const statusLabel: Record<ContractStatus, string> = {
  UNKNOWN: "Unknown",
  NONE: "No current vendor",
  ACTIVE: "Has a vendor",
};

export function ContractCard(props: Props) {
  const [edit, setEdit] = useState(false);
  const [status, setStatus] = useState<ContractStatus>(props.status);
  const [vendor, setVendor] = useState(props.vendor ?? "");
  const [expiry, setExpiry] = useState(props.expiry ?? "");
  const [pending, start] = useTransition();

  if (edit) {
    return (
      <div className="space-y-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}>
          <option value="UNKNOWN">Unknown</option>
          <option value="ACTIVE">Has a current vendor</option>
          <option value="NONE">No current vendor</option>
        </Select>
        <Input placeholder="Incumbent vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <div>
          <label className="mb-1 block text-xs text-slate-500">Contract expiry</label>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setContract(props.leadId, { status, vendor, expiry: expiry || undefined });
                setEdit(false);
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={() => setEdit(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-xs text-slate-500">
      <div>
        Status: <span className="text-slate-700">{statusLabel[props.status]}</span>
      </div>
      <div>
        Vendor: <span className="text-slate-700">{props.vendor ?? "—"}</span>
      </div>
      <div>
        Expiry: <span className="text-slate-700">{props.expiry ?? "—"}</span>
      </div>
      <div>
        Source:{" "}
        <span className="text-slate-700">
          {props.source ?? (props.checked ? "—" : "pending")}
          {props.confidence ? ` · ${props.confidence} confidence` : ""}
          {props.source === "ai" && !props.confirmed ? " · unconfirmed" : ""}
          {props.confirmed ? " · confirmed" : ""}
        </span>
      </div>
      <div className="flex gap-2 pt-1">
        {props.source === "ai" && !props.confirmed && props.status !== "UNKNOWN" && (
          <Button
            disabled={pending}
            onClick={() => start(() => confirmContract(props.leadId).then(() => {}))}
          >
            Confirm
          </Button>
        )}
        <Button variant="secondary" onClick={() => setEdit(true)}>
          {props.source ? "Edit" : "Add manually"}
        </Button>
      </div>
    </div>
  );
}
