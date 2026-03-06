"use client";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDown, ChevronUp, ExternalLink,
  Mail, Clock, AlertCircle, Briefcase
} from "lucide-react";
import { Badge, Button, Divider, Textarea, cn } from "./ui";
import CopyButton from "./CopyButton";
import type { JobPosting, AppStatus, OutreachStatus } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const SOURCE_LABELS: Record<string, string> = {
  remoteok:    "RemoteOK",
  remotive:    "Remotive",
  wwr:         "We Work Remotely",
  justjoinit:  "JustJoinIT",
  mycareers_sg:"MyCareersFuture",
};

const REMOTE_LABELS = {
  global:  { label: "🌍 Global Remote", variant: "green"  as const },
  us_only: { label: "🇺🇸 US Only",       variant: "yellow" as const },
  unclear: { label: "❓ Unclear",        variant: "gray"   as const },
};

const MATCH_LABELS = {
  strong:  { label: "✅ Strong Match", variant: "green"  as const },
  stretch: { label: "🟡 Stretch",      variant: "yellow" as const },
};

const APP_STATUS_CONFIG: Record<AppStatus, { label: string; color: string }> = {
  new:        { label: "Not Applied",  color: "blue"   },
  applied:    { label: "Applied",      color: "green"  },
  follow_up:  { label: "Follow Up",    color: "yellow" },
  interview:  { label: "Interview",    color: "purple" },
  offer:      { label: "Offer",        color: "green"  },
  rejected:   { label: "Rejected",     color: "red"    },
  skipped:    { label: "Skipped",      color: "gray"   },
};

const OUT_STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string }> = {
  new:             { label: "Not Sent",         color: "blue"   },
  connection_sent: { label: "Connection Sent",  color: "purple" },
  connected:       { label: "Connected",        color: "green"  },
  replied:         { label: "Replied",          color: "green"  },
  conversation:    { label: "Conversation",     color: "green"  },
  cant_find:       { label: "Can't Find",       color: "red"    },
};

export default function JobPostingCard({
  job,
  onUpdate,
}: {
  job: JobPosting;
  onUpdate: (id: string, updates: Partial<JobPosting>) => void;
}) {
  const [expanded, setExpanded]         = useState(false);
  const [showCoverLetter, setShowCL]    = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult]   = useState<string | null>(job.contacts?.email || null);
  const [creditsConfirm, setCreditsConfirm] = useState(false);
  const [notes, setNotes]               = useState(job.notes || "");
  const [saving, setSaving]             = useState(false);

  const company   = job.companies;
  const contact   = job.contacts;
  const remote    = REMOTE_LABELS[job.remote_scope];
  const match     = MATCH_LABELS[job.experience_match];
  const appCfg    = APP_STATUS_CONFIG[job.application_status];
  const outCfg    = OUT_STATUS_CONFIG[job.outreach_status];
  const isFollowUp = job.follow_up_generated && job.follow_up_message;

  const salary = (() => {
    if (!job.salary_min && !job.salary_max) return null;
    const cur = job.salary_currency || "USD";
    if (job.salary_min && job.salary_max) {
      return `${cur} ${(job.salary_min / 1000).toFixed(0)}k–${(job.salary_max / 1000).toFixed(0)}k`;
    }
    return `${cur} ${((job.salary_min || job.salary_max)! / 1000).toFixed(0)}k+`;
  })();

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
    setSaving(true);
    await supabase.from("job_postings").update({ notes }).eq("id", job.id);
    setSaving(false);
  }

  async function handleRevealEmail() {
    if (!contact?.apollo_person_id) return;
    setEmailLoading(true);
    try {
      const res = await fetch("/api/reveal-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apollo_person_id: contact.apollo_person_id,
          contact_id:       contact.id,
        }),
      });
      const data = await res.json();
      if (data.email) {
        setEmailResult(data.email);
      } else {
        alert(data.error || "Could not retrieve email.");
      }
    } catch {
      alert("Request failed.");
    }
    setEmailLoading(false);
    setCreditsConfirm(false);
  }

  const messageToShow = isFollowUp ? job.follow_up_message! : job.linkedin_note || "";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <Badge variant={appCfg.color as "blue" | "green" | "yellow" | "purple" | "red" | "gray"}>
                App: {appCfg.label}
              </Badge>
              <Badge variant={outCfg.color as "blue" | "purple" | "green" | "yellow" | "red" | "gray"}>
                Out: {outCfg.label}
              </Badge>
              {isFollowUp && (
                <Badge variant="yellow">
                  <Clock className="w-3 h-3 mr-1" />Follow Up
                </Badge>
              )}
            </div>
            <h3 className="text-base font-bold text-zinc-100">{job.job_title}</h3>
            <p className="text-sm text-zinc-400">{company?.name}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge variant={remote.variant}>{remote.label}</Badge>
          <Badge variant={match.variant}>{match.label}</Badge>
          {salary && <Badge variant="gray">{salary}</Badge>}
          <Badge variant="gray">{SOURCE_LABELS[job.source] || job.source}</Badge>
        </div>

        {/* Posted time */}
        {job.posted_at && (
          <p className="text-xs text-zinc-600 mt-2">
            Posted {formatDistanceToNow(new Date(job.posted_at))} ago
          </p>
        )}

        {/* Key requirements */}
        {job.description_summary && (
          <ul className="mt-3 space-y-1">
            {job.description_summary.split("\n").filter(Boolean).map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-400">
                <span className="text-indigo-500 mt-0.5 shrink-0">›</span>
                {b.replace(/^[-•]\s*/, "")}
              </li>
            ))}
          </ul>
        )}

        {/* Apply button */}
        <a
          href={job.job_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-2 w-full justify-center bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          <Briefcase className="w-4 h-4" />
          Open Job Posting
          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
        </a>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-sm text-zinc-400 border-t border-zinc-800"
      >
        <span>Cover Letter, Outreach &amp; Actions</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-4 border-t border-zinc-800">
          {/* Cover letter */}
          {job.cover_letter && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Cover Letter</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCL(!showCoverLetter)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showCoverLetter ? "Collapse" : "Expand"}
                  </button>
                  <CopyButton text={job.cover_letter} label="Copy" />
                </div>
              </div>
              {showCoverLetter && (
                <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                  {job.cover_letter}
                </div>
              )}
            </div>
          )}

          {/* Contact */}
          {contact && (
            <div className="flex items-center justify-between gap-2 bg-zinc-800 rounded-xl p-3">
              <div>
                <p className="text-sm font-medium text-zinc-200">{contact.name}</p>
                <p className="text-xs text-zinc-500">{contact.title}</p>
              </div>
              {contact.linkedin_url && (
                <a
                  href={contact.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 border border-blue-800/50 rounded-lg text-xs font-medium transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />LinkedIn
                </a>
              )}
            </div>
          )}

          {/* LinkedIn message */}
          {messageToShow && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  {isFollowUp ? "Follow-up Message" : "LinkedIn Message"}
                </p>
                <CopyButton text={messageToShow} label="Copy" />
              </div>
              <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {messageToShow}
              </div>
            </div>
          )}

          {/* Email draft */}
          {job.email_draft && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Email Draft</p>
              <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {job.email_draft}
              </div>
              <CopyButton text={job.email_draft} label="Copy Email" className="mt-2" />
            </div>
          )}

          {/* Find Email */}
          {contact?.apollo_person_id && !emailResult && (
            <div>
              {!creditsConfirm ? (
                <Button variant="ghost" onClick={() => setCreditsConfirm(true)}>
                  <Mail className="w-4 h-4" />Find Email
                </Button>
              ) : (
                <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-3">
                  <p className="text-sm text-amber-300 mb-3">
                    Uses <strong>1 Apollo credit</strong>. Proceed?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" onClick={handleRevealEmail} disabled={emailLoading}>
                      {emailLoading ? "Loading..." : "Yes, reveal"}
                    </Button>
                    <Button variant="ghost" onClick={() => setCreditsConfirm(false)}>Cancel</Button>
                  </div>
                </div>
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
            <Button variant="ghost" size="sm" onClick={saveNotes} disabled={saving} className="mt-2">
              {saving ? "Saving..." : "Save notes"}
            </Button>
          </div>

          {/* Status actions */}
          <Divider />
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Application</p>
              <div className="flex flex-wrap gap-2">
                {job.application_status === "new" && (
                  <>
                    <Button variant="success" onClick={() => updateApp("applied")}>✅ Applied</Button>
                    <Button variant="ghost" onClick={() => updateApp("skipped")}>⏭ Skip</Button>
                  </>
                )}
                {job.application_status === "applied" && (
                  <Button variant="success" onClick={() => updateApp("interview")}>📅 Interview</Button>
                )}
                {job.application_status === "interview" && (
                  <>
                    <Button variant="success" onClick={() => updateApp("offer")}>🎉 Offer</Button>
                    <Button variant="danger" onClick={() => updateApp("rejected")}>❌ Rejected</Button>
                  </>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Outreach</p>
              <div className="flex flex-wrap gap-2">
                {job.outreach_status === "new" && (
                  <>
                    <Button variant="success" onClick={() => updateOutreach("connection_sent")}>
                      ✅ Connection Sent
                    </Button>
                    <Button variant="ghost" onClick={() => updateOutreach("cant_find")}>
                      ❌ Can't Find
                    </Button>
                  </>
                )}
                {job.outreach_status === "connection_sent" && (
                  <Button variant="success" onClick={() => updateOutreach("connected")}>
                    ✅ Connected
                  </Button>
                )}
                {job.outreach_status === "connected" && (
                  <Button variant="success" onClick={() => updateOutreach("replied")}>
                    💬 Replied
                  </Button>
                )}
                {job.outreach_status === "replied" && (
                  <Button variant="success" onClick={() => updateOutreach("conversation")}>
                    🗨 In Conversation
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
