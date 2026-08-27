"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, PageHeader, Select } from "@/components/ui";
import { TARGET_FIELDS } from "@/lib/import/parse";

type UploadResp = {
  batchId: string;
  columns: string[];
  mapping: Record<string, string>;
  totalRows: number;
  preview: Record<string, string>[];
};

type ProcessResp = {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  disposable: number;
  validCount: number;
  riskyCount: number;
  corporateCount: number;
  webmailCount: number;
  typoFixedCount: number;
};

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResp | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  
  // Independent button loading & animation states
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<"idle" | "processing" | "done">("idle");
  
  const [error, setError] = useState("");
  const [result, setResult] = useState<ProcessResp | null>(null);

  // Validation options
  const [autoFixTypo, setAutoFixTypo] = useState(true);
  const [skipDisposable, setSkipDisposable] = useState(false);

  async function onUpload() {
    if (!file) return;
    setIsUploading(true);
    setError("");
    setResult(null);
    setProcessStatus("idle");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/upload", { method: "POST", body: fd });
      const data = await res.json();
      setIsUploading(false);
      if (!res.ok) return setError(data.error ?? "Upload failed");
      setUpload(data);
      setMapping(data.mapping ?? {});
    } catch (err: any) {
      setIsUploading(false);
      setError(err?.message || "Upload network error");
    }
  }

  async function onProcess() {
    if (!upload) return;
    setIsProcessing(true);
    setProcessStatus("processing");
    setError("");

    try {
      // Save mapping first
      await fetch(`/api/import/${upload.batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });

      const res = await fetch(`/api/import/${upload.batchId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFixTypo, skipDisposable }),
      });
      const data = await res.json();
      setIsProcessing(false);

      if (!res.ok) {
        setProcessStatus("idle");
        return setError(data.error ?? "Processing failed");
      }

      setResult(data);
      setProcessStatus("done");

      // Seamlessly invalidate and revalidate server components across the CRM
      router.refresh();
    } catch (err: any) {
      setIsProcessing(false);
      setProcessStatus("idle");
      setError(err?.message || "Processing network error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import, Cleansing & Lead Validation"
        subtitle="Upload your CSV or Excel lead list. Automatically cleanses data, verifies DNS MX servers, identifies B2B corporate domains, and assigns validation tags with zero external service fees."
      />

      {/* In-House Engine Capability Badges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="font-semibold text-slate-800">1. RFC 5322 Syntax</div>
          <div className="mt-1 text-slate-500">Deep structure &amp; length validation</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="font-semibold text-slate-800">2. 3,500+ Burner DB</div>
          <div className="mt-1 text-slate-500">Offline disposable domain blocklist</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="font-semibold text-slate-800">3. Role-Based Check</div>
          <div className="mt-1 text-slate-500">Flags info@, support@, admin@</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="font-semibold text-slate-800">4. Domain Typo Fix</div>
          <div className="mt-1 text-slate-500">Levenshtein auto-fix (gamil &rarr; gmail)</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="font-semibold text-slate-800">5. Native DNS MX</div>
          <div className="mt-1 text-slate-500">Verifies live mail servers exist</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="font-semibold text-slate-800">6. B2B / Cleanse</div>
          <div className="mt-1 text-slate-500">Corporate tags + E.164 phone &amp; sector</div>
        </div>
      </div>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold text-slate-800">Upload Lead Spreadsheet</h3>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setProcessStatus("idle");
            setResult(null);
          }}
          className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-4 file:py-2.5 file:text-xs file:font-semibold file:text-brand sm:text-sm"
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={onUpload}
            disabled={!file || isUploading}
          >
            {isUploading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Uploading &amp; Staging…</span>
              </span>
            ) : (
              "Upload & Map Columns"
            )}
          </Button>
          {file && <span className="text-xs text-slate-500">Selected: {file.name}</span>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>

      {upload && (
        <Card className="space-y-5 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Map Columns to Lead Fields</h3>
              <p className="text-xs text-slate-500">
                Found <strong>{upload.totalRows}</strong> rows in <em>{upload.columns.length}</em> columns.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {TARGET_FIELDS.map((field) => (
              <div key={field} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <label className="mb-1 block text-xs font-semibold text-slate-600 capitalize">
                  {field}
                  {field === "email" && <span className="text-red-500 font-bold"> * (Required)</span>}
                </label>
                <Select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                >
                  <option value="">— Unmapped —</option>
                  {upload.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          {/* Validation & Cleansing Toggles */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
            <h4 className="text-xs font-semibold text-teal-900 mb-2">Automated In-House Engine Options</h4>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFixTypo}
                  onChange={(e) => setAutoFixTypo(e.target.checked)}
                  className="rounded border-slate-300 text-brand focus:ring-brand"
                />
                <span>Auto-fix common domain typos (e.g. <code>gamil.com</code> &rarr; <code>gmail.com</code>)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDisposable}
                  onChange={(e) => setSkipDisposable(e.target.checked)}
                  className="rounded border-slate-300 text-brand focus:ring-brand"
                />
                <span>Skip disposable / temp-mail domains</span>
              </label>
            </div>
          </div>

          {/* Data Preview */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[36rem] text-xs">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500 font-medium">
                  {upload.columns.map((c) => (
                    <th key={c} className="px-3 py-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upload.preview.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                    {upload.columns.map((c) => (
                      <td key={c} className="px-3 py-1.5 text-slate-600">
                        {row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onProcess}
              disabled={isProcessing || !mapping.email}
              className={`relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-all ${
                processStatus === "done"
                  ? "bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400 ring-offset-2 scale-[1.02]"
                  : isProcessing
                  ? "bg-brand/90 cursor-not-allowed opacity-90 animate-pulse"
                  : "bg-brand hover:bg-brand/90 active:scale-95"
              } ${!mapping.email ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isProcessing ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Cleansing, Validating &amp; Importing Leads…</span>
                </>
              ) : processStatus === "done" ? (
                <>
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Done! Leads Added to CRM</span>
                </>
              ) : (
                <>
                  <span>⚡ Cleanse, Validate &amp; Import Leads</span>
                </>
              )}
            </button>

            {!mapping.email && (
              <span className="text-xs font-medium text-amber-600">Map the email column to continue.</span>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card className="space-y-5 p-5 border-emerald-200 bg-white">
          {/* Animated Done Banner with Live Auto-Populated Link */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-900">Done! Leads Populated in CRM</h3>
                <p className="text-xs text-emerald-700">
                  {result.imported} leads were cleaned, validated, and saved. The Leads section is automatically up to date.
                </p>
              </div>
            </div>
            <Link
              href="/leads"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all shrink-0"
            >
              <span>View Leads in CRM ({result.imported}) &rarr;</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <Summary label="Total Rows Staged" value={result.total} />
            <Summary label="Successfully Imported" value={result.imported} tone="text-emerald-600" />
            <Summary label="Duplicates Excluded" value={result.duplicates} tone="text-amber-600" />
            <Summary label="Invalid / No MX Excluded" value={result.invalid} tone="text-red-600" />
          </div>

          {/* Detailed Tagging & Classification Breakdown */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <h4 className="text-xs font-semibold text-slate-700 mb-3">Validation &amp; Intelligence Tags Assigned</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                <span className="text-slate-500">Valid Mailboxes:</span>
                <span className="ml-1.5 font-bold text-emerald-600">{result.validCount}</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                <span className="text-slate-500">B2B Corporate:</span>
                <span className="ml-1.5 font-bold text-teal-700">{result.corporateCount}</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                <span className="text-slate-500">Free Consumer Webmail:</span>
                <span className="ml-1.5 font-bold text-sky-600">{result.webmailCount}</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                <span className="text-slate-500">Role-Based (Risky):</span>
                <span className="ml-1.5 font-bold text-amber-600">{result.riskyCount}</span>
              </div>
            </div>
            {result.typoFixedCount > 0 && (
              <div className="mt-3 text-xs text-indigo-700 bg-indigo-50/70 rounded-lg p-2 font-medium">
                💡 Auto-fixed <strong>{result.typoFixedCount}</strong> domain typos during import (e.g. gamil.com &rarr; gmail.com).
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
      <div className={`text-2xl font-bold ${tone ?? "text-slate-900"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
