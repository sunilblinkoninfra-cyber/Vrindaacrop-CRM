"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input } from "@/components/ui";
import {
  simulateInboundRevertAction,
  simulateWhatsAppAgentReplyAction,
  manualApproveDraftAction,
  manualReviseDraftAction,
} from "../actions";

interface ProposedDraft {
  id: string;
  inboundSubject?: string | null;
  inboundBody: string;
  draftSubject: string;
  draftBody: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REVISED" | "SENT" | "REJECTED";
  agentPhone?: string | null;
  version: number;
  revisionNotes?: string | null;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ReplyDraftCardProps {
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  leadEmail: string;
  drafts: ProposedDraft[];
  defaultAgentPhone?: string | null;
}

const SAMPLE_CLIENT_REVERTS = [
  {
    title: "Pricing & Quotation Query",
    subject: "Re: Facility management inquiry - quotation needed",
    body: "Hi team, we received your outreach regarding technical facility management. Could you please share your standard pricing for a 50,000 sq.ft commercial facility in Greater Noida? Also, do you handle HVAC AMC along with electrical maintenance?",
  },
  {
    title: "Meeting / Site Inspection Request",
    subject: "Re: VrindaaCorp Services - open to a quick call",
    body: "Hello, we are currently reviewing our vendor contracts for corporate housekeeping and security services. Can your operations lead visit our office for a preliminary site inspection this Friday around 3 PM?",
  },
  {
    title: "Scope & Compliance Verification",
    subject: "Re: Statutory compliance and catering capabilities",
    body: "Thanks for reaching out. We have 450+ employees on-site. Can you provide both corporate catering and 100% statutory labor compliance under UP state regulations? Please send your company profile.",
  },
];

export function ReplyDraftCard({
  leadId,
  leadName,
  leadCompany,
  leadEmail,
  drafts,
  defaultAgentPhone,
}: ReplyDraftCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [whatsAppInput, setWhatsAppInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [showFeedbackBox, setShowFeedbackBox] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Latest active draft (or most recent)
  const activeDraft = drafts[0];

  function handleSelectSample(sample: (typeof SAMPLE_CLIENT_REVERTS)[0]) {
    setCustomSubject(sample.subject);
    setCustomBody(sample.body);
  }

  function handleTriggerRevert(e: React.FormEvent) {
    e.preventDefault();
    if (!customBody.trim()) return;

    startTransition(async () => {
      try {
        await simulateInboundRevertAction(leadId, customSubject, customBody);
        setShowSimulateModal(false);
        setCustomSubject("");
        setCustomBody("");
        setActionSuccessMsg("⚡ Client revert simulated! AI generated draft and alerted WhatsApp.");
        router.refresh();
      } catch (err: any) {
        alert(err.message || "Failed to simulate revert.");
      }
    });
  }

  function handleSendWhatsAppReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDraft || !whatsAppInput.trim()) return;

    const input = whatsAppInput.trim();
    setWhatsAppInput("");

    startTransition(async () => {
      try {
        const res = await simulateWhatsAppAgentReplyAction(activeDraft.id, input);
        if (res.action === "sent") {
          setActionSuccessMsg("✅ WhatsApp confirmation received! Email dispatched to client.");
        } else if (res.action === "revised") {
          setActionSuccessMsg(`📝 Feedback inculcated! AI produced revised draft v${res.version}.`);
        }
        router.refresh();
      } catch (err: any) {
        alert(err.message || "Failed to process WhatsApp reply.");
      }
    });
  }

  function handleManualApprove() {
    if (!activeDraft) return;

    startTransition(async () => {
      try {
        await manualApproveDraftAction(activeDraft.id);
        setActionSuccessMsg("✅ Approved directly in CRM! Email dispatched to client.");
        router.refresh();
      } catch (err: any) {
        alert(err.message || "Failed to approve draft.");
      }
    });
  }

  function handleManualRevise(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDraft || !feedbackInput.trim()) return;

    const feedback = feedbackInput.trim();
    setFeedbackInput("");
    setShowFeedbackBox(false);

    startTransition(async () => {
      try {
        const res = await manualReviseDraftAction(activeDraft.id, feedback);
        setActionSuccessMsg(`📝 Revision complete! AI generated draft v${res.version}.`);
        router.refresh();
      } catch (err: any) {
        alert(err.message || "Failed to revise draft.");
      }
    });
  }

  return (
    <Card className="overflow-hidden border-teal-100/80 shadow-sm ring-1 ring-teal-500/10">
      {/* Header */}
      <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50/70 via-emerald-50/40 to-slate-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3.505 2.365A41.369 41.369 0 019 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 00-.577-.069 43.141 43.141 0 00-4.706 0C9.229 4.696 7.025 5.727 5.34 7.412A11.758 11.758 0 003.505 2.365z" />
                <path d="M9 6c1.328 0 2.615.116 3.862.339.464.083.896.347 1.22.748a10.25 10.25 0 011.83 3.992c.162.775-.246 1.545-1.02 1.748A41.52 41.52 0 019 14c-2.025 0-3.985-.145-5.892-.421-.774-.112-1.309-.806-1.196-1.58.204-1.393.753-2.678 1.583-3.758C4.78 6.947 6.786 6 9 6z" />
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-5a1 1 0 112 0 1 1 0 01-2 0z" />
              </svg>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  AI WhatsApp Revert & Reply Intelligence
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Human-in-the-Loop
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Inbound reverts trigger instant AI drafting and WhatsApp verification before emailing clients.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowSimulateModal(true)}
            disabled={isPending}
            className="text-xs font-medium border-teal-200 bg-white hover:bg-teal-50 text-teal-800"
          >
            ⚡ Test Client Revert
          </Button>
        </div>

        {actionSuccessMsg && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
            <span>{actionSuccessMsg}</span>
            <button
              onClick={() => setActionSuccessMsg(null)}
              className="text-emerald-600 hover:text-emerald-900 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Card Content */}
      <div className="p-4 space-y-4">
        {!activeDraft ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h4 className="mt-2 text-xs font-semibold text-slate-800">Awaiting Inbound Client Revert</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              When <span className="font-semibold text-slate-700">{leadName}</span> replies via email, the VrindaaCorp AI engine will immediately read the revert, draft a response, and message your WhatsApp for confirmation.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                variant="primary"
                onClick={() => setShowSimulateModal(true)}
                className="text-xs bg-teal-700 hover:bg-teal-800 text-white"
              >
                Simulate Client Email Revert Now
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status & Version Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Status:</span>
                {activeDraft.status === "SENT" ? (
                  <Badge className="bg-emerald-100 text-emerald-800 font-semibold">
                    ✅ Approved & Dispatched
                  </Badge>
                ) : activeDraft.status === "REVISED" ? (
                  <Badge className="bg-blue-100 text-blue-800 font-semibold">
                    📝 Revised Draft (v{activeDraft.version})
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 font-semibold">
                    ⏳ Awaiting WhatsApp Confirmation (v{activeDraft.version})
                  </Badge>
                )}
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 font-mono">
                  Target WhatsApp: {activeDraft.agentPhone || defaultAgentPhone || "+919999999999"}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Last updated: {new Date(activeDraft.updatedAt).toLocaleTimeString()}
              </div>
            </div>

            {/* Inbound Client Query */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Client Revert from {leadName}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">{leadEmail}</span>
              </div>
              <p className="text-xs font-medium text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                "{activeDraft.inboundBody}"
              </p>
            </div>

            {/* AI Proposed Reply Draft */}
            <div className="rounded-xl border border-teal-200/70 bg-gradient-to-br from-teal-50/30 to-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                    v{activeDraft.version}
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    AI Proposed Email Draft
                  </span>
                </div>
                {activeDraft.revisionNotes && (
                  <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-medium">
                    Incorporated: "{activeDraft.revisionNotes.slice(0, 35)}..."
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-xs">
                  <span className="text-slate-500 font-medium">Subject: </span>
                  <span className="font-semibold text-slate-800">{activeDraft.draftSubject}</span>
                </div>
                <div
                  className="rounded-lg border border-slate-100 bg-white p-3.5 text-xs text-slate-700 leading-relaxed shadow-inner"
                  dangerouslySetInnerHTML={{ __html: activeDraft.draftBody }}
                />
              </div>

              {/* Direct CRM Approval / Revision Actions */}
              {activeDraft.status !== "SENT" && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleManualApprove}
                      disabled={isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      {isPending ? "Sending..." : "✓ Approve & Send to Client"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowFeedbackBox(!showFeedbackBox)}
                      disabled={isPending}
                      className="text-xs"
                    >
                      ✏️ Request Changes
                    </Button>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Or reply directly from your phone on WhatsApp
                  </span>
                </div>
              )}

              {/* Inline Feedback Box for Changes */}
              {showFeedbackBox && (
                <form onSubmit={handleManualRevise} className="pt-2 space-y-2">
                  <Input
                    type="text"
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                    placeholder="E.g., Offer 15% discount and propose a call for Thursday 4 PM..."
                    className="text-xs"
                    required
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowFeedbackBox(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isPending || !feedbackInput.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    >
                      Re-generate Draft with Changes
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Interactive WhatsApp Chat Simulator */}
            {activeDraft.status !== "SENT" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-900">
                      📱 Interactive WhatsApp Response Simulator
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-mono">
                    Meta Cloud API Webhook Ready
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Simulate what happens when the assigned sales agent texts from their phone. Type <span className="font-bold">"YES"</span> or <span className="font-bold">"SEND"</span> to approve, or type any revision suggestion (e.g. <span className="italic">"Mention HVAC AMC & offer 10% off"</span>).
                </p>

                <form onSubmit={handleSendWhatsAppReply} className="flex gap-2">
                  <Input
                    type="text"
                    value={whatsAppInput}
                    onChange={(e) => setWhatsAppInput(e.target.value)}
                    placeholder="Type 'YES' to send or your change suggestions..."
                    className="text-xs bg-white"
                    disabled={isPending}
                    required
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isPending || !whatsAppInput.trim()}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs px-4"
                  >
                    Send as WhatsApp
                  </Button>
                </form>

                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                  <span className="font-medium">Quick responses:</span>
                  <button
                    type="button"
                    onClick={() => setWhatsAppInput("YES")}
                    className="rounded bg-white px-2 py-0.5 font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
                  >
                    "YES" (Approve & Dispatch)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setWhatsAppInput(
                        "Please offer 15% discount for the first quarter and suggest a site visit on Thursday at 3 PM."
                      )
                    }
                    className="rounded bg-white px-2 py-0.5 text-blue-700 border border-blue-200 hover:bg-blue-50"
                  >
                    "Offer 15% discount & Thursday visit"
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Simulate Client Email Revert */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Simulate Inbound Client Email Revert
                </h3>
                <p className="text-xs text-slate-500">
                  Simulates a client sending an email reply to test the AI draft generation and WhatsApp prompt.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSimulateModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Quick Sample Presets */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Choose a Sample Client Scenario
              </label>
              <div className="mt-1.5 space-y-1.5">
                {SAMPLE_CLIENT_REVERTS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSample(sample)}
                    className="w-full text-left rounded-lg border border-slate-200 p-2.5 hover:border-teal-500 hover:bg-teal-50/50 transition-colors text-xs"
                  >
                    <div className="font-semibold text-slate-800">{sample.title}</div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{sample.body}</div>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleTriggerRevert} className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-xs font-semibold text-slate-700">Subject</label>
                <Input
                  type="text"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="Re: Facility Management Support..."
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Email Body / Client Revert Text</label>
                <textarea
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  rows={4}
                  placeholder="Type or paste the client's email reply..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 font-sans"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowSimulateModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isPending || !customBody.trim()}
                  className="bg-teal-700 hover:bg-teal-800 text-white text-xs"
                >
                  {isPending ? "Generating Draft..." : "Simulate Revert & Generate AI Draft"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
