"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { simulateTestLead } from "./actions";

type InboundLogItem = {
  id: string;
  createdAt: Date;
  channel: string;
  status: string;
  payload: any;
  leadId: string | null;
  note: string | null;
};

type ConfigInfo = {
  appUrl: string;
  googleLeadKey: string;
  metaVerifyToken: string;
  metaAppSecretConfigured: boolean;
  metaPageTokenConfigured: boolean;
  formSecret: string;
};

const channelLabel: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads (FB/IG)",
  website_form: "Website Form",
};

const statusTone: Record<string, string> = {
  created: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  duplicate: "bg-amber-50 text-amber-700 ring-amber-200",
  invalid: "bg-red-50 text-red-700 ring-red-200",
  error: "bg-red-50 text-red-700 ring-red-200",
  received: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function SourcesClient({
  config,
  counts,
  logs,
}: {
  config: ConfigInfo;
  counts: Record<string, number>;
  logs: InboundLogItem[];
}) {
  const [activeTab, setActiveTab] = useState<"google" | "meta" | "form" | "logs">("google");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filter state for logs table
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Test Simulator State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testChannel, setTestChannel] = useState<"google_ads" | "meta_ads" | "website_form">("google_ads");
  const [testPending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<{ status: string; leadId?: string; note?: string } | null>(null);
  const [testError, setTestError] = useState("");

  const [testFormData, setTestFormData] = useState({
    firstName: "Amit",
    lastName: "Verma",
    company: "Apex Infra Ltd",
    email: "amit.verma@apexinfra.example",
    phone: "+91 98765 43210",
    city: "Gurgaon",
    sector: "Manufacturing",
    sourceDetail: "Q3_Search_Campaign_AdGroup_1",
  });

  const base = config.appUrl.replace(/\/$/, "");
  const googleWebhookUrl = `${base}/api/inbound/google`;
  const metaWebhookUrl = `${base}/api/inbound/meta`;
  const formWebhookUrl = `${base}/api/inbound/form`;

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function openTestModal(channel: "google_ads" | "meta_ads" | "website_form") {
    setTestChannel(channel);
    setTestResult(null);
    setTestError("");
    setTestFormData((prev) => ({
      ...prev,
      email: `test.${channel}.${Date.now().toString().slice(-4)}@vrindaacorp.example`,
    }));
    setIsTestModalOpen(true);
  }

  function handleSendTestLead(e: React.FormEvent) {
    e.preventDefault();
    if (!testFormData.email.trim()) {
      setTestError("Email is required for test lead.");
      return;
    }
    setTestError("");
    setTestResult(null);

    startTransition(async () => {
      try {
        const res = await simulateTestLead(testChannel, testFormData);
        setTestResult(res);
      } catch (err: any) {
        setTestError(err.message || "Failed to simulate test lead.");
      }
    });
  }

  // Filtered logs
  const filteredLogs = logs.filter((log) => {
    if (channelFilter !== "ALL" && log.channel !== channelFilter) return false;
    if (statusFilter !== "ALL" && log.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Google Ads Leads</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {(counts.google_ads ?? 0).toLocaleString()}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold text-sm">
              G
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">Webhook active</span>
            <button
              type="button"
              onClick={() => openTestModal("google_ads")}
              className="font-medium text-brand hover:underline"
            >
              Send Test Lead &rarr;
            </button>
          </div>
        </Card>

        <Card className="p-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Meta Ads (FB/IG) Leads</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {(counts.meta_ads ?? 0).toLocaleString()}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold text-sm">
              M
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">Graph API ready</span>
            <button
              type="button"
              onClick={() => openTestModal("meta_ads")}
              className="font-medium text-brand hover:underline"
            >
              Send Test Lead &rarr;
            </button>
          </div>
        </Card>

        <Card className="p-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Website Form Leads</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {(counts.website_form ?? 0).toLocaleString()}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 font-bold text-sm">
              🌐
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">Direct endpoint</span>
            <button
              type="button"
              onClick={() => openTestModal("website_form")}
              className="font-medium text-brand hover:underline"
            >
              Send Test Lead &rarr;
            </button>
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("google")}
            className={`border-b-2 py-3 transition-colors ${
              activeTab === "google"
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            Google Ads Integration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("meta")}
            className={`border-b-2 py-3 transition-colors ${
              activeTab === "meta"
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            Meta Ads (FB/IG) Integration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`border-b-2 py-3 transition-colors ${
              activeTab === "form"
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            Website Lead Form Embed
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`border-b-2 py-3 transition-colors ${
              activeTab === "logs"
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            Inbound Activity Log ({logs.length})
          </button>
        </nav>
      </div>

      {/* Tab 1: Google Ads Configuration */}
      {activeTab === "google" && (
        <div className="space-y-6">
          <Card className="space-y-4 p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Google Ads Webhook Credentials</h3>
                <p className="text-xs text-slate-500">
                  Configure Google Ads Lead Form assets to push leads directly to VrindaaCorp CRM.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openTestModal("google_ads")}
                className="text-xs"
              >
                Send Test Google Lead
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Webhook URL</label>
                <div className="flex items-center gap-2">
                  <Input value={googleWebhookUrl} readOnly className="bg-slate-50 font-mono text-xs text-brand" />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => copyToClipboard(googleWebhookUrl, "google_url")}
                    className="shrink-0 text-xs"
                  >
                    {copiedKey === "google_url" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Google Key (Webhook Secret)</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={config.googleLeadKey || "(Not set in .env: GOOGLE_LEAD_KEY)"}
                    readOnly
                    className="bg-slate-50 font-mono text-xs"
                  />
                  {config.googleLeadKey && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => copyToClipboard(config.googleLeadKey, "google_key")}
                      className="shrink-0 text-xs"
                    >
                      {copiedKey === "google_key" ? "Copied!" : "Copy"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Step-by-Step Guide */}
          <Card className="space-y-4 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">How to Setup in Google Ads Manager</h3>
            <ol className="list-decimal space-y-3 pl-4 text-xs text-slate-600">
              <li>
                In your Google Ads dashboard, go to <strong>Campaigns &rarr; Assets &rarr; Lead form</strong>.
              </li>
              <li>
                Create or edit a Lead Form extension with your required fields (Name, Email, Phone, Company, City).
              </li>
              <li>
                Scroll down to <strong>Lead delivery options</strong> and expand <strong>Manage your leads with a webhook</strong>.
              </li>
              <li>
                Paste the <strong>Webhook URL</strong> and <strong>Key</strong> provided above.
              </li>
              <li>
                Click <strong>Send test data</strong> in Google Ads. You will instantly see the captured lead in the CRM!
              </li>
            </ol>
          </Card>
        </div>
      )}

      {/* Tab 2: Meta Ads Configuration */}
      {activeTab === "meta" && (
        <div className="space-y-6">
          <Card className="space-y-4 p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Meta Ads (Facebook &amp; Instagram) Webhook</h3>
                <p className="text-xs text-slate-500">
                  Real-time lead capture from Facebook Lead Ads and Instagram Instant Forms.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openTestModal("meta_ads")}
                className="text-xs"
              >
                Send Test Meta Lead
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Callback URL</label>
                <div className="flex items-center gap-2">
                  <Input value={metaWebhookUrl} readOnly className="bg-slate-50 font-mono text-xs text-brand" />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => copyToClipboard(metaWebhookUrl, "meta_url")}
                    className="shrink-0 text-xs"
                  >
                    {copiedKey === "meta_url" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Verify Token (META_VERIFY_TOKEN)</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={config.metaVerifyToken || "(Not set in .env: META_VERIFY_TOKEN)"}
                    readOnly
                    className="bg-slate-50 font-mono text-xs"
                  />
                  {config.metaVerifyToken && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => copyToClipboard(config.metaVerifyToken, "meta_token")}
                      className="shrink-0 text-xs"
                    >
                      {copiedKey === "meta_token" ? "Copied!" : "Copy"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                <span className="text-slate-600 font-medium">Meta App Secret (Signature Verification):</span>
                <Badge className={config.metaAppSecretConfigured ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                  {config.metaAppSecretConfigured ? "Configured" : "Not Set"}
                </Badge>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                <span className="text-slate-600 font-medium">Meta Page Access Token (Graph API Lead Fetch):</span>
                <Badge className={config.metaPageTokenConfigured ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                  {config.metaPageTokenConfigured ? "Configured" : "Not Set"}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Setup Guide */}
          <Card className="space-y-4 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">How to Setup in Meta for Developers &amp; Business Suite</h3>
            <ol className="list-decimal space-y-3 pl-4 text-xs text-slate-600">
              <li>
                In <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-brand hover:underline font-medium">Meta for Developers</a>, open your App and add the <strong>Webhooks</strong> product.
              </li>
              <li>
                Select <strong>Page</strong> from the dropdown and click <strong>Subscribe to this object</strong>.
              </li>
              <li>
                Enter the <strong>Callback URL</strong> and <strong>Verify Token</strong> shown above and click <strong>Verify and save</strong>.
              </li>
              <li>
                Subscribe to the <strong>leadgen</strong> field for your Facebook Page.
              </li>
              <li>
                Test with the official <a href="https://developers.facebook.com/tools/lead-ads-testing" target="_blank" rel="noreferrer" className="text-brand hover:underline font-medium">Meta Lead Ads Testing Tool</a> or using our built-in simulator.
              </li>
            </ol>
          </Card>
        </div>
      )}

      {/* Tab 3: Website Form Embed */}
      {activeTab === "form" && (
        <div className="space-y-6">
          <Card className="space-y-4 p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Website Contact &amp; Inquiry Form Endpoint</h3>
                <p className="text-xs text-slate-500">
                  Embed lead capture directly on your company landing page or marketing site.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openTestModal("website_form")}
                className="text-xs"
              >
                Send Test Form Lead
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">POST Endpoint URL</label>
                <div className="flex items-center gap-2">
                  <Input value={formWebhookUrl} readOnly className="bg-slate-50 font-mono text-xs text-brand" />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => copyToClipboard(formWebhookUrl, "form_url")}
                    className="shrink-0 text-xs"
                  >
                    {copiedKey === "form_url" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Shared Secret Header (X-Form-Secret)</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={config.formSecret || "change-me"}
                    readOnly
                    className="bg-slate-50 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => copyToClipboard(config.formSecret, "form_secret")}
                    className="shrink-0 text-xs"
                  >
                    {copiedKey === "form_secret" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Code Snippet Example */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-slate-700">JavaScript Integration Code</label>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-emerald-400">
{`async function submitLead(formData) {
  const response = await fetch("${formWebhookUrl}", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Form-Secret": "${config.formSecret || "change-me"}"
    },
    body: JSON.stringify({
      email: formData.email,
      firstName: formData.firstName,
      lastName: formData.lastName,
      company: formData.company,
      phone: formData.phone,
      sector: formData.sector,
      city: formData.city
    })
  });
  return response.json();
}`}
              </pre>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Inbound Activity Log */}
      {activeTab === "logs" && (
        <Card className="overflow-hidden p-0 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-3.5">
            <h3 className="text-sm font-semibold text-slate-900">Inbound Capture Events</h3>

            <div className="flex items-center gap-2">
              <Select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="h-8 min-h-0 text-xs"
              >
                <option value="ALL">All Channels</option>
                <option value="google_ads">Google Ads</option>
                <option value="meta_ads">Meta Ads</option>
                <option value="website_form">Website Form</option>
              </Select>

              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 min-h-0 text-xs"
              >
                <option value="ALL">All Statuses</option>
                <option value="created">Created</option>
                <option value="duplicate">Duplicate</option>
                <option value="invalid">Invalid</option>
                <option value="error">Error</option>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Details / Note</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr>
                        <td className="whitespace-nowrap text-xs text-slate-500">
                          {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss")}
                        </td>
                        <td>
                          <Badge className="bg-slate-100 text-slate-800 text-[11px]">
                            {channelLabel[log.channel] ?? log.channel}
                          </Badge>
                        </td>
                        <td>
                          <Badge className={statusTone[log.status] ?? statusTone.received}>
                            {log.status}
                          </Badge>
                        </td>
                        <td className="text-xs text-slate-600">
                          {log.note || (log.leadId ? `Lead captured` : "—")}
                        </td>
                        <td className="text-right text-xs">
                          <div className="flex items-center justify-end gap-2">
                            {log.leadId && (
                              <Link
                                href={`/leads/${log.leadId}`}
                                className="font-semibold text-brand hover:underline"
                              >
                                View Lead &rarr;
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              {isExpanded ? "Hide Payload" : "View JSON"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-slate-900 p-3 text-xs text-emerald-400">
                            <div className="font-mono whitespace-pre-wrap">
                              {JSON.stringify(log.payload, null, 2)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                      No inbound events matching selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Test Lead Simulator Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !testPending && setIsTestModalOpen(false)}
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Simulate {channelLabel[testChannel]} Lead Capture
                </h3>
                <p className="text-xs text-slate-500">
                  Sends a test payload through the {channelLabel[testChannel]} webhook pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            {testError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {testError}
              </div>
            )}

            {testResult && (
              <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm text-emerald-900">
                  <span>✓ Test Lead Successfully Processed!</span>
                </div>
                <p>
                  Status: <strong>{testResult.status}</strong>
                </p>
                {testResult.leadId && (
                  <Link
                    href={`/leads/${testResult.leadId}`}
                    className="inline-block font-semibold text-brand hover:underline"
                  >
                    Open Created Lead Profile &rarr;
                  </Link>
                )}
              </div>
            )}

            <form onSubmit={handleSendTestLead} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">First Name</label>
                  <Input
                    value={testFormData.firstName}
                    onChange={(e) => setTestFormData({ ...testFormData, firstName: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Last Name</label>
                  <Input
                    value={testFormData.lastName}
                    onChange={(e) => setTestFormData({ ...testFormData, lastName: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Email <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  required
                  value={testFormData.email}
                  onChange={(e) => setTestFormData({ ...testFormData, email: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Company</label>
                  <Input
                    value={testFormData.company}
                    onChange={(e) => setTestFormData({ ...testFormData, company: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Phone</label>
                  <Input
                    value={testFormData.phone}
                    onChange={(e) => setTestFormData({ ...testFormData, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">City / Location</label>
                  <Input
                    value={testFormData.city}
                    onChange={(e) => setTestFormData({ ...testFormData, city: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Sector</label>
                  <Input
                    value={testFormData.sector}
                    onChange={(e) => setTestFormData({ ...testFormData, sector: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Campaign Identifier / Ad Tag
                </label>
                <Input
                  value={testFormData.sourceDetail}
                  onChange={(e) => setTestFormData({ ...testFormData, sourceDetail: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsTestModalOpen(false)}
                  disabled={testPending}
                >
                  Close
                </Button>
                <Button type="submit" variant="primary" disabled={testPending}>
                  {testPending ? "Simulating Lead Capture…" : "Send Test Lead Payload"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
