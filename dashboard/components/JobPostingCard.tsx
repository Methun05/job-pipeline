"use client";
import { useState } from "react";
import { format } from "date-fns";
import { ExternalLink, ChevronDown, ChevronUp, Mail, Globe, Linkedin, Twitter } from "lucide-react";
import { Button, Textarea } from "./ui";
import CopyButton from "./CopyButton";
import type { JobPosting, AppStatus, OutreachStatus } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const SOURCE_LABELS: Record<string, string> = {
  web3career:         "Web3.career",
  cryptojobslist:     "CryptoJobsList",
  cryptocurrencyjobs: "CryptocurrencyJobs",
  dragonfly:          "Dragonfly",
  arbitrum:           "Arbitrum",
  hashtagweb3:        "#Web3",
  talentweb3:         "TalentWeb3",
};

const APP_OPTIONS: { value: AppStatus; label: string; color: string }[] = [
  { value: "new",       label: "Not Applied", color: "text-zinc-400"    },
  { value: "applied",   label: "Applied",     color: "text-blue-400"    },
  { value: "follow_up", label: "Follow Up",   color: "text-amber-400"   },
  { value: "interview", label: "Interview",   color: "text-yellow-400"  },
  { value: "offer",     label: "Offer",       color: "text-emerald-400" },
  { value: "rejected",  label: "Rejected",    color: "text-red-400"     },
  { value: "skipped",   label: "Skipped",     color: "text-zinc-600"    },
];

const OUTREACH_OPTIONS: { value: OutreachStatus; label: string; color: string }[] = [
  { value: "new",             label: "Not Sent",   color: "text-zinc-400"   },
  { value: "connection_sent", label: "Sent",       color: "text-indigo-400" },
  { value: "connected",       label: "Connected",  color: "text-blue-400"   },
  { value: "replied",         label: "Replied",    color: "text-emerald-400"},
  { value: "conversation",    label: "Talking",    color: "text-emerald-300"},
  { value: "cant_find",       label: "Can't Find", color: "text-red-400"    },
];

function getColor(options: { value: string; color: string }[], val: string) {
  return options.find(o => o.value === val)?.color ?? "text-zinc-400";
}

// ── Shared row state + logic ──────────────────────────────────────────────────
function useRowState(job: JobPosting, onUpdate: (id: string, updates: Partial<JobPosting>) => void) {
  const [expanded, setExpanded]         = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult]   = useState<string | null>(job.contacts?.email || null);
  const [emailError, setEmailError]     = useState<string | null>(null);
  const [creditsConfirm, setCreditsConfirm] = useState(false);
  const [notes, setNotes]               = useState(job.notes || "");
  const [saveState, setSaveState]       = useState<"idle" | "saving" | "saved">("idle");

  async function updateApp(status: AppStatus) {
    await supabase.from("job_postings").update({
      application_status: status,
      application_last_action_at: new Date().toISOString(),
    }).eq("id", job.id);
    onUpdate(job.id, { application_status: status });
  }

  async function updateOutreach(status: OutreachStatus) {
    await supabase.from("job_postings").update({
      outreach_status: status,
      outreach_last_action_at: new Date().toISOString(),
    }).eq("id", job.id);
    onUpdate(job.id, { outreach_status: status });
  }

  async function saveNotes() {
    setSaveState("saving");
    await supabase.from("job_postings").update({ notes }).eq("id", job.id);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function handleRevealEmail() {
    const contact = job.contacts;
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

  return {
    expanded, setExpanded,
    emailLoading, emailResult, emailError,
    notes, setNotes,
    saveState, saveNotes,
    creditsConfirm, setCreditsConfirm,
    updateApp, updateOutreach, handleRevealEmail,
  };
}

// ── Shared expanded detail content ────────────────────────────────────────────
function ExpandedContent({
  job, state,
}: {
  job: JobPosting;
  state: ReturnType<typeof useRowState>;
}) {
  const { emailLoading, emailResult, emailError, notes, setNotes, saveState, saveNotes,
          creditsConfirm, setCreditsConfirm, handleRevealEmail } = state;

  const contact    = job.contacts;
  const isFollowUp = job.follow_up_generated && job.follow_up_message;
  const message    = isFollowUp ? job.follow_up_message! : job.linkedin_note || "";

  return (
    <div className="space-y-4">
      {job.description_summary && (
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Summary</p>
          <ul className="space-y-1">
            {job.description_summary.split("\n").filter(Boolean).map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-400">
                <span className="text-indigo-500 mt-0.5 shrink-0">›</span>
                {b.replace(/^[-•]\s*/, "")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.cover_letter && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Cover Letter</p>
            <CopyButton text={job.cover_letter} label="Copy" />
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
            {job.cover_letter}
          </div>
        </div>
      )}

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

      {job.email_draft && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Email Draft</p>
            <CopyButton text={job.email_draft} label="Copy" />
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
            {job.email_draft}
          </div>
        </div>
      )}

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

      <div>
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Notes</p>
        <Textarea value={notes} onChange={setNotes} placeholder="Add notes..." rows={2} />
        <Button variant="ghost" size="sm" onClick={saveNotes} disabled={saveState !== "idle"} className="mt-1.5">
          {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved ✓" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
export function JobPostingMobileCard({
  job,
  onUpdate,
}: {
  job: JobPosting;
  onUpdate: (id: string, updates: Partial<JobPosting>) => void;
}) {
  const state = useRowState(job, onUpdate);
  const { expanded, setExpanded, updateApp, updateOutreach } = state;

  const company    = job.companies;
  const contact    = job.contacts;
  const isFollowUp = job.follow_up_generated && job.follow_up_message;

  const websiteUrl = company?.website
    ? (company.website.startsWith("http") ? company.website : "https://" + company.website)
    : company?.domain ? "https://" + company.domain : null;

  return (
    <div className="border-b border-zinc-800/40 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100 leading-snug">{job.job_title}</span>
            {isFollowUp && <span className="text-amber-500 text-[10px]">Follow-up</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-zinc-400">{company?.name || "—"}</span>
            {job.location && <span className="text-[11px] text-zinc-600">· {job.location}</span>}
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-400"><Globe className="w-3 h-3" /></a>
            )}
            {company?.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="text-zinc-600 hover:text-blue-400"><Linkedin className="w-3 h-3" /></a>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-zinc-600">{SOURCE_LABELS[job.source] || job.source}</span>
            <span className="text-[11px] text-zinc-600">
              {job.posted_at
                ? format(new Date(job.posted_at), "MMM d")
                : format(new Date(job.created_at), "MMM d") + " (fetched)"}
            </span>
          </div>
          {contact && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-xs text-zinc-400">{contact.name}</span>
              {contact.title && <span className="text-[10px] text-zinc-600">{contact.title}</span>}
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-500"><ExternalLink className="w-3 h-3" /></a>
              )}
              {contact.twitter_url && (
                <a href={contact.twitter_url} target="_blank" rel="noopener noreferrer"
                  className={contact.twitter_confidence === "high" ? "text-blue-400" : "text-yellow-500"}>
                  <Twitter className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-700/60 bg-zinc-800/60 text-xs text-zinc-300 whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
          <button onClick={() => setExpanded(!expanded)} className="text-zinc-500 hover:text-zinc-300">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <select
          value={job.application_status}
          onChange={e => updateApp(e.target.value as AppStatus)}
          className={`border border-zinc-700/60 rounded-md bg-zinc-800/80 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 px-2 py-1.5 ${getColor(APP_OPTIONS, job.application_status)}`}
        >
          {APP_OPTIONS.map(o => (
            <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">{o.label}</option>
          ))}
        </select>
        <select
          value={job.outreach_status}
          onChange={e => updateOutreach(e.target.value as OutreachStatus)}
          className={`border border-zinc-700/60 rounded-md bg-zinc-800/80 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 px-2 py-1.5 ${getColor(OUTREACH_OPTIONS, job.outreach_status)}`}
        >
          {OUTREACH_OPTIONS.map(o => (
            <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">{o.label}</option>
          ))}
        </select>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-800/40">
          <ExpandedContent job={job} state={state} />
        </div>
      )}
    </div>
  );
}

// ── Desktop table row ─────────────────────────────────────────────────────────
export default function JobPostingRow({
  job,
  onUpdate,
}: {
  job: JobPosting;
  onUpdate: (id: string, updates: Partial<JobPosting>) => void;
}) {
  const state = useRowState(job, onUpdate);
  const { expanded, setExpanded, updateApp, updateOutreach } = state;

  const company    = job.companies;
  const contact    = job.contacts;
  const isFollowUp = job.follow_up_generated && job.follow_up_message;

  const websiteUrl = company?.website
    ? (company.website.startsWith("http") ? company.website : "https://" + company.website)
    : company?.domain ? "https://" + company.domain : null;

  return (
    <>
      <tr className="hover:bg-zinc-800/20 transition-colors group">

        {/* Role */}
        <td className="px-4 py-4 min-w-[180px]">
          <span className="text-sm font-medium text-zinc-100 leading-snug">
            {job.job_title}
          </span>
          {isFollowUp && <span className="text-amber-500 text-[11px] ml-1.5">· Follow-up</span>}
        </td>

        {/* Source */}
        <td className="px-4 py-4 whitespace-nowrap">
          <span className="text-xs text-zinc-500">{SOURCE_LABELS[job.source] || job.source}</span>
        </td>

        {/* Company */}
        <td className="px-4 py-4 min-w-[140px]">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-zinc-300">{company?.name || "—"}</span>
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                className="text-zinc-700 hover:text-zinc-400 transition-colors shrink-0">
                <Globe className="w-3 h-3" />
              </a>
            )}
            {company?.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="text-zinc-700 hover:text-blue-400 transition-colors shrink-0">
                <Linkedin className="w-3 h-3" />
              </a>
            )}
          </div>
        </td>

        {/* Location */}
        <td className="px-4 py-4 whitespace-nowrap">
          <span className="text-xs text-zinc-400">{job.location || "—"}</span>
        </td>

        {/* Date */}
        <td className="px-4 py-4 whitespace-nowrap">
          {job.posted_at ? (
            <span className="text-xs text-zinc-400">{format(new Date(job.posted_at), "MMM d, yyyy")}</span>
          ) : (
            <div>
              <span className="text-xs text-zinc-400">{format(new Date(job.created_at), "MMM d, yyyy")}</span>
              <div className="text-[10px] text-zinc-600 mt-0.5">fetched</div>
            </div>
          )}
        </td>

        {/* Contact */}
        <td className="px-4 py-4 min-w-[140px]">
          {contact ? (
            <div className="flex items-center gap-1.5">
              <div className="min-w-0">
                <div className="text-sm text-zinc-200 truncate max-w-[120px]">{contact.name}</div>
                <div className="text-[11px] text-zinc-600 truncate max-w-[120px]">{contact.title}</div>
              </div>
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-300 transition-colors shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {contact.twitter_url && (
                <a href={contact.twitter_url} target="_blank" rel="noopener noreferrer"
                  className={`transition-colors shrink-0 ${
                    contact.twitter_confidence === "high"
                      ? "text-blue-400 hover:text-blue-300"
                      : "text-yellow-500 hover:text-yellow-300"
                  }`}>
                  <Twitter className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-zinc-700 italic">No contact</span>
          )}
        </td>

        {/* Application dropdown */}
        <td className="px-4 py-4">
          <select
            value={job.application_status}
            onChange={e => updateApp(e.target.value as AppStatus)}
            className={`border border-zinc-700/60 rounded-md bg-zinc-800/80 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 px-2 py-1 ${getColor(APP_OPTIONS, job.application_status)}`}
          >
            {APP_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">{o.label}</option>
            ))}
          </select>
        </td>

        {/* Outreach dropdown */}
        <td className="px-4 py-4">
          <select
            value={job.outreach_status}
            onChange={e => updateOutreach(e.target.value as OutreachStatus)}
            className={`border border-zinc-700/60 rounded-md bg-zinc-800/80 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 px-2 py-1 ${getColor(OUTREACH_OPTIONS, job.outreach_status)}`}
          >
            {OUTREACH_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">{o.label}</option>
            ))}
          </select>
        </td>

        {/* Open button */}
        <td className="px-4 py-4">
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-700/60 hover:border-zinc-600 transition-colors text-xs font-medium text-zinc-300 whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        </td>

        {/* Expand */}
        <td className="px-4 py-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-zinc-900/30 border-b border-zinc-800/40">
          <td colSpan={10} className="px-6 py-4">
            <ExpandedContent job={job} state={state} />
          </td>
        </tr>
      )}
    </>
  );
}
