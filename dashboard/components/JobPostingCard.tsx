"use client";
import { format } from "date-fns";
import { ExternalLink, Globe, Linkedin } from "lucide-react";
import { useRouter } from "next/navigation";
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
  { value: "new",       label: "Not Applied", color: "text-zinc-500 dark:text-zinc-400" },
  { value: "applied",   label: "Applied",     color: "text-blue-600 dark:text-blue-400" },
  { value: "follow_up", label: "Follow Up",   color: "text-amber-600 dark:text-amber-400" },
  { value: "interview", label: "Interview",   color: "text-violet-600 dark:text-violet-400" },
  { value: "offer",     label: "Offer",       color: "text-emerald-600 dark:text-emerald-400" },
  { value: "rejected",  label: "Rejected",    color: "text-red-500 dark:text-red-400" },
  { value: "skipped",   label: "Skipped",     color: "text-zinc-400 dark:text-zinc-500" },
];

const OUTREACH_OPTIONS: { value: OutreachStatus; label: string; color: string }[] = [
  { value: "new",             label: "Not Sent",   color: "text-zinc-500 dark:text-zinc-400" },
  { value: "connection_sent", label: "Sent",       color: "text-violet-600 dark:text-violet-400" },
  { value: "connected",       label: "Connected",  color: "text-blue-600 dark:text-blue-400" },
  { value: "replied",         label: "Replied",    color: "text-emerald-600 dark:text-emerald-400" },
  { value: "conversation",    label: "Talking",    color: "text-emerald-700 dark:text-emerald-300" },
  { value: "cant_find",       label: "Can't Find", color: "text-red-500 dark:text-red-400" },
];

function getColor(options: { value: string; color: string }[], val: string) {
  return options.find(o => o.value === val)?.color ?? "text-zinc-500";
}

const selectClass = "border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500 px-2 py-1 shadow-sm";

function useRowState(job: JobPosting, onUpdate: (id: string, updates: Partial<JobPosting>) => void) {
  async function updateApp(status: AppStatus) {
    await supabase.from("job_postings").update({ application_status: status, application_last_action_at: new Date().toISOString() }).eq("id", job.id);
    onUpdate(job.id, { application_status: status });
  }

  async function updateOutreach(status: OutreachStatus) {
    await supabase.from("job_postings").update({ outreach_status: status, outreach_last_action_at: new Date().toISOString() }).eq("id", job.id);
    onUpdate(job.id, { outreach_status: status });
  }

  return { updateApp, updateOutreach };
}

// ── Mobile card ───────────────────────────────────────────────────────────────
export function JobPostingMobileCard({ job, onUpdate }: { job: JobPosting; onUpdate: (id: string, updates: Partial<JobPosting>) => void }) {
  const router = useRouter();
  const { updateApp, updateOutreach } = useRowState(job, onUpdate);
  const company    = job.companies;
  const contact    = job.contacts;
  const isFollowUp = job.follow_up_generated && job.follow_up_message;
  const websiteUrl = company?.website ? (company.website.startsWith("http") ? company.website : "https://" + company.website) : company?.domain ? "https://" + company.domain : null;

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors" onClick={() => router.push(`/jobs/${job.id}`)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{job.job_title}</span>
            {isFollowUp && <span className="text-amber-600 dark:text-amber-400 text-[10px]">Follow-up</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{company?.name || "—"}</span>
            {job.location && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">· {job.location}</span>}
            {websiteUrl && <a href={websiteUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><Globe className="w-3 h-3" /></a>}
            {company?.linkedin_url && <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-400 hover:text-blue-600"><Linkedin className="w-3 h-3" /></a>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{SOURCE_LABELS[job.source] || job.source}</span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {job.posted_at ? format(new Date(job.posted_at), "MMM d") : format(new Date(job.created_at), "MMM d") + " (fetched)"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <select value={job.application_status} onChange={e => updateApp(e.target.value as AppStatus)} className={`${selectClass} py-1.5 ${getColor(APP_OPTIONS, job.application_status)}`}>
          {APP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={job.outreach_status} onChange={e => updateOutreach(e.target.value as OutreachStatus)} className={`${selectClass} py-1.5 ${getColor(OUTREACH_OPTIONS, job.outreach_status)}`}>
          {OUTREACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

// ── Desktop table row ─────────────────────────────────────────────────────────
export default function JobPostingRow({ job, onUpdate }: { job: JobPosting; onUpdate: (id: string, updates: Partial<JobPosting>) => void }) {
  const router = useRouter();
  const { updateApp, updateOutreach } = useRowState(job, onUpdate);
  const company    = job.companies;
  const contact    = job.contacts;
  const isFollowUp = job.follow_up_generated && job.follow_up_message;
  const websiteUrl = company?.website ? (company.website.startsWith("http") ? company.website : "https://" + company.website) : company?.domain ? "https://" + company.domain : null;

  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer" onClick={() => router.push(`/jobs/${job.id}`)}>
      <td className="px-4 py-4 min-w-[180px]">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{job.job_title}</span>
        {isFollowUp && <span className="text-amber-600 dark:text-amber-400 text-[11px] ml-1.5">· Follow-up</span>}
      </td>

      <td className="px-4 py-4 whitespace-nowrap">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{SOURCE_LABELS[job.source] || job.source}</span>
      </td>

      <td className="px-4 py-4 min-w-[140px]">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{company?.name || "—"}</span>
      </td>

      <td className="px-4 py-4 whitespace-nowrap">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{job.location || "—"}</span>
      </td>

      <td className="px-4 py-4 whitespace-nowrap">
        {job.posted_at ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{format(new Date(job.posted_at), "MMM d, yyyy")}</span>
        ) : (
          <div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{format(new Date(job.created_at), "MMM d, yyyy")}</span>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">fetched</div>
          </div>
        )}
      </td>

      <td className="px-4 py-4">
        <select value={job.application_status} onChange={e => { e.stopPropagation(); updateApp(e.target.value as AppStatus); }} onClick={(e) => e.stopPropagation()} className={`${selectClass} ${getColor(APP_OPTIONS, job.application_status)}`}>
          {APP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      <td className="px-4 py-4">
        <select value={job.outreach_status} onChange={e => { e.stopPropagation(); updateOutreach(e.target.value as OutreachStatus); }} onClick={(e) => e.stopPropagation()} className={`${selectClass} ${getColor(OUTREACH_OPTIONS, job.outreach_status)}`}>
          {OUTREACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      {/* Social Links */}
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <a href={websiteUrl ?? "#"} target="_blank" rel="noopener noreferrer"
            className={websiteUrl ? "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors" : "text-zinc-200 dark:text-zinc-700 cursor-default pointer-events-none"}
            title="Company website" onClick={websiteUrl ? undefined : (e) => e.preventDefault()}>
            <Globe className="w-3.5 h-3.5" />
          </a>
          <a href={company?.linkedin_url ?? "#"} target="_blank" rel="noopener noreferrer"
            className={company?.linkedin_url ? "text-zinc-400 dark:text-zinc-500 hover:text-blue-600 transition-colors" : "text-zinc-200 dark:text-zinc-700 cursor-default pointer-events-none"}
            title="Company LinkedIn" onClick={company?.linkedin_url ? undefined : (e) => e.preventDefault()}>
            <Linkedin className="w-3.5 h-3.5" />
          </a>
        </div>
      </td>

      {/* Open */}
      <td className="px-4 py-4">
        <a href={job.job_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-xs font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap shadow-sm">
          <ExternalLink className="w-3 h-3" /> Open
        </a>
      </td>
      
    </tr>
  );
}
