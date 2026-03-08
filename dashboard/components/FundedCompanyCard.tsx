"use client";
import React, { useState } from "react";
import { format } from "date-fns";
import { ExternalLink, ChevronDown, ChevronUp, Mail, Globe, Linkedin, Twitter } from "lucide-react";
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
  crunchbase:    "Crunchbase",
};

export const STATUS_OPTIONS: { value: FundedStatus; label: string }[] = [
  { value: "new",             label: "New"           },
  { value: "connection_sent", label: "LinkedIn Sent" },
  { value: "connected",       label: "Connected"     },
  { value: "replied",         label: "Replied"       },
  { value: "interview",       label: "Interview"     },
  { value: "closed",          label: "Closed"        },
  { value: "skipped",         label: "Skipped"       },
  { value: "cant_find",       label: "Can't Find"    },
];

// ── Outreach dropdown (LinkedIn connection journey) ───────────────────────────
const OUTREACH_OPTIONS = [
  { value: "new",             label: "Not Sent",   color: "text-zinc-400" },
  { value: "connection_sent", label: "Sent",       color: "text-indigo-400" },
  { value: "connected",       label: "Connected",  color: "text-blue-400" },
  { value: "cant_find",       label: "Can't Find", color: "text-red-400" },
];

// ── Response dropdown (what happened after connecting) ────────────────────────
const RESPONSE_OPTIONS = [
  { value: "",          label: "—",         color: "text-zinc-500" },
  { value: "replied",   label: "Replied",   color: "text-emerald-400" },
  { value: "interview", label: "Interview", color: "text-yellow-400" },
  { value: "closed",    label: "Closed",    color: "text-zinc-500" },
  { value: "skipped",   label: "Skipped",   color: "text-zinc-600" },
];

const RESPONSE_STATUSES = new Set(["replied", "interview", "closed", "skipped"]);

function getOutreachValue(status: FundedStatus): string {
  return RESPONSE_STATUSES.has(status) ? "connected" : status;
}
function getResponseValue(status: FundedStatus): string {
  return RESPONSE_STATUSES.has(status) ? status : "";
}
function getOutreachColor(status: FundedStatus): string {
  const val = getOutreachValue(status);
  return OUTREACH_OPTIONS.find(o => o.value === val)?.color ?? "text-zinc-400";
}
function getResponseColor(status: FundedStatus): string {
  const val = getResponseValue(status);
  return RESPONSE_OPTIONS.find(o => o.value === val)?.color ?? "text-zinc-500";
}

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

  const funding = lead.funding_amount
    ? `$${(lead.funding_amount / 1_000_000).toFixed(1)}M`
    : "—";

  const websiteUrl = company?.website
    ? (company.website.startsWith("http") ? company.website : "https://" + company.website)
    : company?.domain ? "https://" + company.domain : null;

  const companyPageUrl = websiteUrl
    || (lead.source === "cryptorank" && lead.raw_data?.key
      ? `https://cryptorank.io/ico/${lead.raw_data.key}`
      : null);

  async function setStatus(status: FundedStatus) {
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apollo_person_id: contact.apollo_person_id, contact_id: contact.id }),
      });
      const data = await res.json();
      if (data.email) setEmailResult(data.email);
      else setEmailError(data.error || "Could not retrieve email.");
    } catch {
      setEmailError("Request failed.");
    }
    setEmailLoading(false);
    setCreditsConfirm(false);
  }

  return (
    <>
      {/* ── Main row ── */}
      <tr className="hover:bg-zinc-800/20 transition-colors group">

        {/* Company */}
        <td className="px-4 py-3 min-w-[170px]">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-zinc-100 leading-snug">
              {company?.name || "—"}
            </span>
            {companyPageUrl && (
              <a href={companyPageUrl} target="_blank" rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0" title="Website">
                <Globe className="w-3 h-3" />
              </a>
            )}
            {company?.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="text-zinc-600 hover:text-blue-400 transition-colors shrink-0" title="Company LinkedIn">
                <Linkedin className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="text-[11px] text-zinc-600 mt-0.5">
            {SOURCE_LABELS[lead.source] || lead.source}
            {isFollowUp && <span className="text-amber-500 ml-1">· Follow-up</span>}
          </div>
        </td>

        {/* Funding */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="text-sm font-semibold text-emerald-400">{funding}</div>
          <div className="text-[11px] text-zinc-600">{lead.round_type}</div>
        </td>

        {/* Date */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs text-zinc-400">
            {lead.announced_date
              ? format(new Date(lead.announced_date + "T00:00:00"), "MMM d, yyyy")
              : "—"}
          </span>
        </td>

        {/* Contact */}
        <td className="px-4 py-3 min-w-[160px]">
          {contact ? (
            <div className="flex items-center gap-1.5">
              <div className="min-w-0">
                <div className="text-sm text-zinc-200 truncate max-w-[140px]">{contact.name}</div>
                <div className="text-[11px] text-zinc-600 truncate max-w-[140px]">{contact.title}</div>
              </div>
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-300 transition-colors shrink-0" title="LinkedIn">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {contact.twitter_url && (
                <a href={contact.twitter_url} target="_blank" rel="noopener noreferrer"
                  className="text-zinc-600 hover:text-zinc-200 transition-colors shrink-0" title="X (Twitter)">
                  <Twitter className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-zinc-700 italic">No contact</span>
          )}
        </td>

        {/* Outreach dropdown */}
        <td className="px-4 py-3">
          <select
            value={getOutreachValue(lead.status)}
            onChange={e => setStatus(e.target.value as FundedStatus)}
            className={`bg-transparent border-0 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-600 rounded px-1 py-0.5 ${getOutreachColor(lead.status)}`}
          >
            {OUTREACH_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">{o.label}</option>
            ))}
          </select>
        </td>

        {/* Response dropdown */}
        <td className="px-4 py-3">
          <select
            value={getResponseValue(lead.status)}
            onChange={e => { if (e.target.value) setStatus(e.target.value as FundedStatus); }}
            className={`bg-transparent border-0 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-600 rounded px-1 py-0.5 ${getResponseColor(lead.status)}`}
          >
            {RESPONSE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">{o.label}</option>
            ))}
          </select>
        </td>

        {/* Expand */}
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </td>
      </tr>

      {/* ── Expanded detail row ── */}
      {expanded && (
        <tr className="bg-zinc-900/30 border-b border-zinc-800/40">
          <td colSpan={7} className="px-6 py-4">
            <div className="space-y-4 max-w-xl">

              {/* Message */}
              {message && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {isFollowUp ? "Follow-up Message" : "LinkedIn Message"}
                    </p>
                    <CopyButton text={message} label="Copy" />
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {message}
                  </div>
                </div>
              )}

              {/* Email draft */}
              {lead.email_draft && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Email Draft</p>
                    <CopyButton text={lead.email_draft} label="Copy" />
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {lead.email_draft}
                  </div>
                </div>
              )}

              {/* Find Email */}
              {contact?.apollo_person_id && !emailResult && (
                <div>
                  {!creditsConfirm ? (
                    <Button variant="ghost" onClick={() => setCreditsConfirm(true)}>
                      <Mail className="w-3.5 h-3.5" /> Find Email
                    </Button>
                  ) : (
                    <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3">
                      <p className="text-xs text-amber-300 mb-2">Uses <strong>1 Apollo credit</strong>. Proceed?</p>
                      <div className="flex gap-2">
                        <Button variant="danger" onClick={handleRevealEmail} disabled={emailLoading}>
                          {emailLoading ? "Loading..." : "Yes, reveal"}
                        </Button>
                        <Button variant="ghost" onClick={() => setCreditsConfirm(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  {emailError && <p className="text-xs text-red-400 mt-1">{emailError}</p>}
                </div>
              )}
              {emailResult && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-sm text-emerald-300 font-medium">{emailResult}</span>
                  <CopyButton text={emailResult} label="Copy" />
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Notes</p>
                <Textarea value={notes} onChange={setNotes} placeholder="Add notes..." rows={2} />
                <Button variant="ghost" size="sm" onClick={saveNotes} disabled={saveState !== "idle"} className="mt-1.5">
                  {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved ✓" : "Save"}
                </Button>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}
