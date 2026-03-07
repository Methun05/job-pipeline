"use client";
import React, { useState } from "react";
import { format } from "date-fns";
import { ExternalLink, ChevronDown, ChevronUp, Mail, Globe } from "lucide-react";
import { Button, Textarea } from "./ui";
import CopyButton from "./CopyButton";
import type { FundedLead, FundedStatus } from "@/lib/types";
import { supabase } from "@/lib/supabase";

export const SOURCE_LABELS: Record<string, string> = {
  cryptorank:    "CryptoRank",
  techcrunch:    "TechCrunch",
  eu_startups:   "EU Startups",
  cointelegraph: "Cointelegraph",
  decrypt:       "Decrypt",
  blockworks:    "Blockworks",
};

export const STATUS_OPTIONS: { value: FundedStatus; label: string }[] = [
  { value: "new",             label: "New" },
  { value: "connection_sent", label: "LinkedIn Sent" },
  { value: "connected",       label: "Connected" },
  { value: "replied",         label: "Replied" },
  { value: "interview",       label: "Interview" },
  { value: "closed",          label: "Closed" },
  { value: "skipped",         label: "Skipped" },
  { value: "cant_find",       label: "Can't Find" },
];

const STATUS_COLORS: Record<FundedStatus, string> = {
  new:             "text-blue-400",
  connection_sent: "text-purple-400",
  connected:       "text-green-400",
  replied:         "text-emerald-400",
  interview:       "text-yellow-400",
  closed:          "text-zinc-500",
  skipped:         "text-zinc-500",
  cant_find:       "text-red-400",
};

export default function FundedCompanyRow({
  lead,
  onStatusChange,
}: {
  lead: FundedLead;
  onStatusChange: (id: string, status: FundedStatus) => void;
}) {
  const [expanded, setExpanded]             = useState(false);
  const [emailLoading, setEmailLoading]     = useState(false);
  const [emailResult, setEmailResult]       = useState<string | null>(lead.contacts?.email || null);
  const [emailError, setEmailError]         = useState<string | null>(null);
  const [notes, setNotes]                   = useState(lead.notes || "");
  const [saveState, setSaveState]           = useState<"idle" | "saving" | "saved">("idle");
  const [creditsConfirm, setCreditsConfirm] = useState(false);

  const company    = lead.companies;
  const contact    = lead.contacts;
  const isFollowUp = lead.follow_up_generated && lead.follow_up_message;
  const message    = isFollowUp ? lead.follow_up_message! : lead.linkedin_note || "";
  const funding    = lead.funding_amount
    ? `$${(lead.funding_amount / 1_000_000).toFixed(1)}M`
    : "—";

  const websiteUrl = company?.website
    ? (company.website.startsWith("http") ? company.website : "https://" + company.website)
    : company?.domain
    ? "https://" + company.domain
    : null;

  async function updateStatus(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as FundedStatus;
    await supabase
      .from("funded_leads")
      .update({ status, last_action_at: new Date().toISOString() })
      .eq("id", lead.id);
    onStatusChange(lead.id, status);
  }

  async function saveNotes() {
    setSaveState("saving");
    await supabase.from("funded_leads").update({ notes }).eq("id", lead.id);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function handleRevealEmail() {
    if (!contact?.apollo_person_id) return;
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res  = await fetch("/api/reveal-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ apollo_person_id: contact.apollo_person_id, contact_id: contact.id }),
      });
      const data = await res.json();
      if (data.email) setEmailResult(data.email);
      else setEmailError(data.error || "Could not retrieve email.");
    } catch {
      setEmailError("Request failed. Try again.");
    }
    setEmailLoading(false);
    setCreditsConfirm(false);
  }

  return (
    <>
      <tr className="border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors">
        {/* Company */}
        <td className="px-4 py-3 min-w-[160px]">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-zinc-100">{company?.name || "—"}</span>
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-300 shrink-0"
                title="Company website"
              >
                <Globe className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
            {SOURCE_LABELS[lead.source] || lead.source}
            {isFollowUp && <span className="text-amber-400">· Follow-up</span>}
          </div>
        </td>

        {/* Funding */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="text-sm font-semibold text-emerald-400">{funding}</div>
          <div className="text-xs text-zinc-500">{lead.round_type}</div>
        </td>

        {/* Date */}
        <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
          {lead.announced_date
            ? format(new Date(lead.announced_date + "T00:00:00"), "MMM d, yyyy")
            : "—"}
        </td>

        {/* Contact */}
        <td className="px-4 py-3 min-w-[160px]">
          {contact ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0">
                <div
                  className="text-sm text-zinc-200 truncate max-w-[160px]"
                  title={contact.name}
                >
                  {contact.name}
                </div>
                <div
                  className="text-xs text-zinc-500 truncate max-w-[160px]"
                  title={contact.title || ""}
                >
                  {contact.title}
                </div>
              </div>
              {contact.linkedin_url && (
                <a
                  href={contact.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 shrink-0"
                  title="Open LinkedIn"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ) : (
            <span className="text-xs text-zinc-600 italic">No contact</span>
          )}
        </td>

        {/* Status dropdown */}
        <td className="px-4 py-3">
          <select
            value={lead.status}
            onChange={updateStatus}
            className={`bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-medium cursor-pointer focus:outline-none focus:border-zinc-500 transition-colors ${STATUS_COLORS[lead.status]}`}
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} className="text-zinc-200 bg-zinc-800">
                {opt.label}
              </option>
            ))}
          </select>
        </td>

        {/* Expand toggle */}
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Show details"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="border-b border-zinc-800 bg-zinc-900/60">
          <td colSpan={6} className="px-6 py-4">
            <div className="space-y-4 max-w-2xl">

              {/* LinkedIn / follow-up message */}
              {message && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                    {isFollowUp ? "Follow-up Message" : "LinkedIn Message"}
                  </p>
                  <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {message}
                  </div>
                  <CopyButton text={message} label="Copy" className="mt-2" />
                </div>
              )}

              {/* Email draft */}
              {lead.email_draft && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Email Draft</p>
                  <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {lead.email_draft}
                  </div>
                  <CopyButton text={lead.email_draft} label="Copy Email" className="mt-2" />
                </div>
              )}

              {/* Find Email */}
              {contact?.apollo_person_id && !emailResult && (
                <div>
                  {!creditsConfirm ? (
                    <Button variant="ghost" onClick={() => setCreditsConfirm(true)}>
                      <Mail className="w-4 h-4" /> Find Email
                    </Button>
                  ) : (
                    <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-3">
                      <p className="text-sm text-amber-300 mb-3">
                        This uses <strong>1 Apollo credit</strong>. Proceed?
                      </p>
                      <div className="flex gap-2">
                        <Button variant="danger" onClick={handleRevealEmail} disabled={emailLoading}>
                          {emailLoading ? "Loading..." : "Yes, reveal email"}
                        </Button>
                        <Button variant="ghost" onClick={() => setCreditsConfirm(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  {emailError && (
                    <p className="text-xs text-red-400 mt-2">{emailError}</p>
                  )}
                </div>
              )}
              {emailResult && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-300 font-medium">{emailResult}</span>
                  <CopyButton text={emailResult} label="Copy" />
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Notes</p>
                <Textarea value={notes} onChange={setNotes} placeholder="Add notes..." rows={2} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={saveNotes}
                  disabled={saveState !== "idle"}
                  className="mt-2"
                >
                  {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved ✓" : "Save notes"}
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
