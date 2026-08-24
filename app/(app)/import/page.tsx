"use client";

import { useState } from "react";
import { Button, Card, PageHeader, Select } from "@/components/ui";
import { TARGET_FIELDS } from "@/lib/import/parse";

type UploadResp = {
  batchId: string;
  columns: string[];
  mapping: Record<string, string>;
  totalRows: number;
  preview: Record<string, string>[];
};

type ProcessResp = { total: number; imported: number; duplicates: number; invalid: number };

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResp | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ProcessResp | null>(null);

  async function onUpload() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import/upload", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Upload failed");
    setUpload(data);
    setMapping(data.mapping ?? {});
  }

  async function onProcess() {
    if (!upload) return;
    setBusy(true);
    setError("");
    // Save mapping first
    await fetch(`/api/import/${upload.batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping }),
    });
    const res = await fetch(`/api/import/${upload.batchId}/process`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Processing failed");
    setResult(data);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import & Cleanup"
        subtitle="Upload a CSV/Excel lead list. Rows are deduplicated, normalized and email-validated before import."
      />

      <Card className="space-y-3">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand sm:text-sm"
        />
        <Button className="w-full sm:w-auto" onClick={onUpload} disabled={!file || busy}>
          {busy && !upload ? "Uploading…" : "Upload & preview"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>

      {upload && (
        <Card className="space-y-4">
          <div className="text-sm text-slate-600">
            <strong>{upload.totalRows}</strong> rows found in <em>{upload.columns.length}</em> columns.
            Map your columns to lead fields:
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {TARGET_FIELDS.map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {field}
                  {field === "email" && <span className="text-red-500"> *</span>}
                </label>
                <Select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                >
                  <option value="">—</option>
                  {upload.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="min-w-[36rem] text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  {upload.columns.map((c) => (
                    <th key={c} className="px-2 py-1">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upload.preview.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {upload.columns.map((c) => (
                      <td key={c} className="px-2 py-1 text-slate-600">
                        {row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button className="w-full sm:w-auto" onClick={onProcess} disabled={busy || !mapping.email}>
            {busy ? "Processing…" : "Deduplicate, validate & import"}
          </Button>
          {!mapping.email && <p className="text-xs text-amber-600">Map the email column to continue.</p>}
        </Card>
      )}

      {result && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Import summary</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <Summary label="Total rows" value={result.total} />
            <Summary label="Imported" value={result.imported} tone="text-green-600" />
            <Summary label="Duplicates skipped" value={result.duplicates} tone="text-amber-600" />
            <Summary label="Invalid skipped" value={result.invalid} tone="text-red-600" />
          </div>
        </Card>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className={`text-2xl font-semibold ${tone ?? "text-slate-800"}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
