"use client";
import React from "react";
import { format } from "date-fns";
import { Globe, Linkedin, Twitter, ExternalLink } from "lucide-react";
import type { FundedLead, FundedStatus } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export const SOURCE_LABELS: Record<string, string> = {
  cryptorank:    "CryptoRank",
  techcrunch:    "TechCrunch",
  eu_startups:   "EU Startups",
  cointelegraph: "Cointelegraph",
  decrypt:       "Decrypt",
  blockworks:    "Blockworks",
  crunchbase:    "Crunchbase",
};

const TYPE_COLORS: Record<string, string> = {
  "Consumer App":       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "DeFi / Protocol":    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "B2B Tooling":        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  "Infrastructure":     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Exchange / Trading": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const OUTREACH_OPTIONS = [
  { value: "new",             label: "Not Sent",   color: "text-zinc-500 dark:text-zinc-400" },
  { value: "connection_sent", label: "Sent",       color: "text-violet-600 dark:text-violet-400" },
  { value: "connected",       label: "Connected",  color: "text-blue-600 dark:text-blue-400" },
  { value: "cant_find",       label: "Can't Find", color: "text-red-500 dark:text-red-400" },
  { value: "skipped",         label: "Skip",       color: "text-zinc-400 dark:text-zinc-600" },
];

const RESPONSE_OPTIONS = [
  { value: "",          label: "—",         color: "text-zinc-400 dark:text-zinc-500" },
  { value: "replied",   label: "Replied",   color: "text-emerald-600 dark:text-emerald-400" },
  { value: "interview", label: "Interview", color: "text-amber-600 dark:text-amber-400" },
  { value: "closed",    label: "Closed",    color: "text-zinc-400 dark:text-zinc-500" },
  { value: "skipped",   label: "Skipped",   color: "text-zinc-400 dark:text-zinc-500" },
];

const RESPONSE_STATUSES = new Set(["replied", "interview", "closed"]);

function getOutreachValue(status: FundedStatus): string {
  return RESPONSE_STATUSES.has(status) ? "connected" : status;
}
function getResponseValue(status: FundedStatus): string {
  return RESPONSE_STATUSES.has(status) ? status : "";
}
function getOutreachColor(status: FundedStatus): string {
  const val = getOutreachValue(status);
  return OUTREACH_OPTIONS.find(o => o.value === val)?.color ?? "text-zinc-500";
}
function getResponseColor(status: FundedStatus): string {
  const val = getResponseValue(status);
  return RESPONSE_OPTIONS.find(o => o.value === val)?.color ?? "text-zinc-400";
}

const selectClass = "border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500 px-2 py-1 shadow-sm";

// ── Mobile card ───────────────────────────────────────────────────────────────
export function FundedCompanyMobileCard({ lead, onStatusChange }: { lead: FundedLead; onStatusChange: (id: string, status: FundedStatus) => void }) {
  const router  = useRouter();
  const company = lead.companies;
  const contact = lead.contacts;
  const funding = lead.funding_amount ? `$${(lead.funding_amount / 1_000_000).toFixed(1)}M` : "—";
  const twitterConf = lead.contacts?.twitter_confidence ?? null;

  const websiteUrl = company?.website
    ? (company.website.startsWith("http") ? company.website : "https://" + company.website)
    : company?.domain ? "https://" + company.domain : null;

  async function setStatus(status: FundedStatus) {
    await supabase.from("funded_leads").update({ status, last_action_at: new Date().toISOString() }).eq("id", lead.id);
    onStatusChange(lead.id, status);
  }

  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-300 dark:border-zinc-800 shadow-sm p-4 cursor-pointer hover:border-violet-400 transition-colors"
      onClick={() => router.push(`/funded/${lead.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{company?.name || "—"}</span>
            {lead.raw_data?.company_type && (() => { const ct = typeof lead.raw_data.company_type === "string" ? lead.raw_data.company_type : (lead.raw_data.company_type as any)?.name; return ct ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${TYPE_COLORS[ct] ?? "bg-zinc-100 text-zinc-500"}`}>{ct}</span> : null; })()}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{funding}</span>
            {lead.round_type && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{lead.round_type}</span>}
            {lead.announced_date && (
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {format(new Date(lead.announced_date + "T00:00:00"), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {contact && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{contact.name}</span>
              {contact.title && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{contact.title}</span>}
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-500 shrink-0"><ExternalLink className="w-3 h-3" /></a>
              )}
              {contact.twitter_url && (
                <a href={contact.twitter_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className={`shrink-0 ${twitterConf === "high" ? "text-blue-500" : "text-yellow-600 dark:text-yellow-400"}`}>
                  <Twitter className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          {websiteUrl && <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><Globe className="w-4 h-4" /></a>}
          {company?.linkedin_url && <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-blue-600"><Linkedin className="w-4 h-4" /></a>}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={e => e.stopPropagation()}>
        <select value={getOutreachValue(lead.status)} onChange={e => setStatus(e.target.value as FundedStatus)}
          className={`${selectClass} ${getOutreachColor(lead.status)}`}>
          {OUTREACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={getResponseValue(lead.status)} onChange={e => { if (e.target.value) setStatus(e.target.value as FundedStatus); }}
          className={`${selectClass} ${getResponseColor(lead.status)}`}>
          {RESPONSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

// ── Desktop table row ─────────────────────────────────────────────────────────
export default function FundedCompanyRow({ lead, onStatusChange }: { lead: FundedLead; onStatusChange: (id: string, status: FundedStatus) => void }) {
  const router     = useRouter();
  const company    = lead.companies;
  const contact    = lead.contacts;
  const twitterConf = lead.contacts?.twitter_confidence ?? null;
  const funding    = lead.funding_amount ? `$${(lead.funding_amount / 1_000_000).toFixed(1)}M` : "—";

  const websiteUrl = company?.website
    ? (company.website.startsWith("http") ? company.website : "https://" + company.website)
    : company?.domain ? "https://" + company.domain : null;
  const companyPageUrl = websiteUrl || (lead.source === "cryptorank" && lead.raw_data?.key
    ? `https://cryptorank.io/ico/${lead.raw_data.key}` : null);

  async function setStatus(status: FundedStatus) {
    await supabase.from("funded_leads").update({ status, last_action_at: new Date().toISOString() }).eq("id", lead.id);
    onStatusChange(lead.id, status);
  }

  return (
    <tr
      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
      onClick={() => router.push(`/funded/${lead.id}`)}
    >
      {/* Company */}
      <td className="px-4 py-4 min-w-[200px] max-w-[280px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{company?.name || "—"}</span>
          {lead.raw_data?.company_type && (() => { const ct = typeof lead.raw_data.company_type === "string" ? lead.raw_data.company_type : (lead.raw_data.company_type as any)?.name; return ct ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${TYPE_COLORS[ct] ?? "bg-zinc-100 text-zinc-500"}`}>{ct}</span> : null; })()}
        </div>
        <div className="text-[11px] text-zinc-300 dark:text-zinc-600 mt-0.5">{SOURCE_LABELS[lead.source] || lead.source}</div>
      </td>

      {/* Funding */}
      <td className="px-4 py-4 whitespace-nowrap">
        <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{funding}</div>
        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{lead.round_type}</div>
      </td>

      {/* Date */}
      <td className="px-4 py-4 whitespace-nowrap">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {lead.announced_date ? format(new Date(lead.announced_date + "T00:00:00"), "MMM d, yyyy") : "—"}
        </span>
      </td>

      {/* Social links */}
      <td className="px-4 py-4 whitespace-nowrap" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          {companyPageUrl
            ? <a href={companyPageUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"><Globe className="w-4 h-4" /></a>
            : <Globe className="w-4 h-4 text-zinc-200 dark:text-zinc-700" />}
          {company?.linkedin_url
            ? <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-blue-600 transition-colors"><Linkedin className="w-4 h-4" /></a>
            : <Linkedin className="w-4 h-4 text-zinc-200 dark:text-zinc-700" />}
        </div>
      </td>

      {/* Contact */}
      <td className="px-4 py-4 min-w-[160px]">
        {contact ? (
          <div className="flex items-center gap-1.5">
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">{contact.name}</div>
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">{contact.title}</div>
            </div>
            {contact.linkedin_url && (
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700 transition-colors shrink-0"><ExternalLink className="w-3 h-3" /></a>
            )}
            {contact.twitter_url && (
              <a href={contact.twitter_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className={`transition-colors shrink-0 ${twitterConf === "high" ? "text-blue-500 hover:text-blue-700" : "text-yellow-600 dark:text-yellow-400 hover:text-yellow-700"}`}>
                <Twitter className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-zinc-300 dark:text-zinc-600 italic">No contact</span>
        )}
      </td>

      {/* Outreach */}
      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
        <select value={getOutreachValue(lead.status)} onChange={e => setStatus(e.target.value as FundedStatus)}
          className={`${selectClass} ${getOutreachColor(lead.status)}`}>
          {OUTREACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      {/* Response */}
      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
        <select value={getResponseValue(lead.status)} onChange={e => { if (e.target.value) setStatus(e.target.value as FundedStatus); }}
          className={`${selectClass} ${getResponseColor(lead.status)}`}>
          {RESPONSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    </tr>
  );
}
