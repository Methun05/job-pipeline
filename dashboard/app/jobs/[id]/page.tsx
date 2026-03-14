"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, Globe, Linkedin, Mail, Twitter, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { JobPosting, AppStatus, OutreachStatus } from "@/lib/types";
import { Button, Textarea } from "@/components/ui";
import CopyButton from "@/components/CopyButton";

const APP_OPTIONS: { value: AppStatus; label: string; color: string }[] = [
  { value: "new",       label: "Not Applied", color: "text-zinc-500" },
  { value: "applied",   label: "Applied",     color: "text-blue-600" },
  { value: "follow_up", label: "Follow Up",   color: "text-amber-600" },
  { value: "interview", label: "Interview",   color: "text-violet-600" },
  { value: "offer",     label: "Offer",       color: "text-emerald-600" },
  { value: "rejected",  label: "Rejected",    color: "text-red-500" },
  { value: "skipped",   label: "Skipped",     color: "text-zinc-400" },
];

const OUTREACH_OPTIONS: { value: OutreachStatus; label: string; color: string }[] = [
  { value: "new",             label: "Not Sent",   color: "text-zinc-500" },
  { value: "connection_sent", label: "Sent",       color: "text-violet-600" },
  { value: "connected",       label: "Connected",  color: "text-blue-600" },
  { value: "replied",         label: "Replied",    color: "text-emerald-600" },
  { value: "conversation",    label: "Talking",    color: "text-emerald-700" },
  { value: "cant_find",       label: "Can't Find", color: "text-red-500" },
];

function getColor(options: { value: string; color: string }[], val: string) {
  return options.find(o => o.value === val)?.color ?? "text-zinc-500";
}

const selectClass = "border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-sm font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500 px-3 py-1.5 shadow-sm";

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "cover_letter" | "email" | "linkedin" | "chat">("summary");
  
  // State for AI generation
  const [genLoading, setGenLoading] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // Email reveal
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError]     = useState<string | null>(null);

  // Notes
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    async function fetchJob() {
      const { data } = await supabase
        .from("job_postings")
        .select("*, companies(*), contacts(*)")
        .eq("id", id)
        .single();
        
      if (data) {
        setJob(data as JobPosting);
        setNotes(data.notes || "");
        // Auto-generate requirements if not already done
        if (!data.description_summary && data.description_raw) {
          generateContent("generate_summary", data as JobPosting);
        }
      }
      setLoading(false);
    }
    if (id) fetchJob();
  }, [id]);

  async function updateApp(status: AppStatus) {
    if (!job) return;
    await supabase.from("job_postings").update({ application_status: status, application_last_action_at: new Date().toISOString() }).eq("id", job.id);
    setJob({ ...job, application_status: status });
  }

  async function updateOutreach(status: OutreachStatus) {
    if (!job) return;
    await supabase.from("job_postings").update({ outreach_status: status, outreach_last_action_at: new Date().toISOString() }).eq("id", job.id);
    setJob({ ...job, outreach_status: status });
  }

  async function saveNotes() {
    if (!job) return;
    setSaveState("saving");
    await supabase.from("job_postings").update({ notes }).eq("id", job.id);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function generateContent(action: "generate_cover_letter" | "generate_email" | "generate_linkedin" | "generate_summary", jobOverride?: JobPosting) {
    const target = jobOverride || job;
    if (!target) return;
    setGenLoading(action);
    setGenError(null);

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          jobTitle: target.job_title,
          companyName: target.companies?.name || "the company",
          description: target.description_raw,
          contactName: target.contacts?.name,
          contactTitle: target.contacts?.title,
          requirements: target.description_summary,
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      let updates: Partial<JobPosting> = {};
      if (action === "generate_cover_letter") updates = { cover_letter: data.text };
      else if (action === "generate_linkedin")  updates = { linkedin_note: data.text };
      else if (action === "generate_email")     updates = { email_draft: `Subject: ${data.subject}\n\n${data.body}` };
      else if (action === "generate_summary")   updates = { description_summary: JSON.stringify(data) };

      await supabase.from("job_postings").update(updates).eq("id", target.id);
      setJob(prev => prev ? { ...prev, ...updates } : prev);

    } catch (e: any) {
      setGenError(e.message || "Generation failed");
    } finally {
      setGenLoading(null);
    }
  }

  async function findEmail() {
    if (!job?.contacts) return;
    setEmailLoading(true);
    setEmailError(null);
    const c = job.contacts;
    const domain = job.companies?.domain || job.companies?.website || null;
    try {
      const res = await fetch("/api/reveal-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          apollo_person_id:    c.apollo_person_id,
          contact_id:          c.id,
          contact_name:        c.name,
          contact_domain:      domain,
          company_name:        job.companies?.name,
          contact_linkedin_url: c.linkedin_url,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setJob(prev => prev ? { ...prev, contacts: { ...prev.contacts!, email: data.email } } : prev);
    } catch (e: any) {
      setEmailError(e.message || "Failed to find email");
    } finally {
      setEmailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F4] dark:bg-[#0f0f10] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) {
    return <div className="p-8 text-center text-zinc-500">Job not found</div>;
  }

  const company = job.companies;
  const contact = job.contacts;
  const websiteUrl = company?.website ? (company.website.startsWith("http") ? company.website : "https://" + company.website) : company?.domain ? "https://" + company.domain : null;

  return (
    <div className="min-h-screen bg-[#F5F5F4] dark:bg-[#0f0f10] p-4 md:p-8">
      {/* ── Header ── */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-6 group">
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to Jobs
      </button>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{job.job_title}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-200">{company?.name || "Unknown Company"}</span>
            {job.location && <span>&bull; {job.location}</span>}
            <span>&bull; {format(new Date(job.posted_at || job.created_at), "MMM d, yyyy")}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <select value={job.application_status} onChange={e => updateApp(e.target.value as AppStatus)} className={`${selectClass} ${getColor(APP_OPTIONS, job.application_status)}`}>
            {APP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={job.outreach_status} onChange={e => updateOutreach(e.target.value as OutreachStatus)} className={`${selectClass} ${getColor(OUTREACH_OPTIONS, job.outreach_status)}`}>
            {OUTREACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-md font-medium text-sm hover:opacity-90 transition-opacity whitespace-nowrap">
            <ExternalLink className="w-4 h-4" /> View Job
          </a>
        </div>
      </div>

      {/* ── Two Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Context */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Company + Founder Card */}
          {(company || contact) && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">

              {/* Company section */}
              {company && (
                <div className={`px-5 py-4 ${contact ? "border-b border-zinc-100 dark:border-zinc-800" : ""}`}>
                  <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Company</p>
                  <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{company.name}</p>
                  {(company.domain || company.website) && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {company.domain || company.website?.replace(/^https?:\/\//, "")}
                    </p>
                  )}
                  {(websiteUrl || company.linkedin_url) && (
                    <div className="flex gap-2 mt-3">
                      {websiteUrl && (
                        <a href={websiteUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                          <Globe className="w-3.5 h-3.5" /> Website
                        </a>
                      )}
                      {company.linkedin_url && (
                        <a href={company.linkedin_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                          <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Founder / Contact section */}
              {contact && (
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Founder / Contact</p>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 font-semibold text-sm shrink-0">
                      {contact.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{contact.name}</p>
                      {contact.title && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{contact.title}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {contact.linkedin_url && (
                      <a href={contact.linkedin_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                        <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                      </a>
                    )}
                    {contact.twitter_url && (
                      <a href={contact.twitter_url} target="_blank" rel="noreferrer"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          contact.twitter_confidence === "high"
                            ? "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            : "border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        }`}>
                        <Twitter className="w-3.5 h-3.5" />
                        {contact.twitter_confidence !== "high" && <span className="text-[10px]">unverified</span>}
                      </a>
                    )}
                  </div>

                  {/* Email section */}
                  <div className="mt-3">
                    {contact.email ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">{contact.email}</span>
                        <CopyButton text={contact.email} label="" />
                      </div>
                    ) : (
                      <button onClick={findEmail} disabled={emailLoading}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors disabled:opacity-50">
                        <Mail className="w-3.5 h-3.5" />
                        {emailLoading ? "Finding email…" : "Find Email"}
                      </button>
                    )}
                    {emailError && (
                      <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">{emailError}</p>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Notes */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
             <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Your Notes</h3>
             <Textarea value={notes} onChange={setNotes} placeholder="Add research notes here..." className="mb-3 min-h-[120px]" />
             <Button variant="ghost" size="sm" onClick={saveNotes} disabled={saveState !== "idle"} className="w-full justify-center">
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved ✓" : "Save Notes"}
            </Button>
          </div>

        </div>

        {/* Right Column: AI Workspace */}
        <div className="lg:col-span-8">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden h-full flex flex-col min-h-[600px]">
            
            {/* Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto hide-scrollbar bg-zinc-50/50 dark:bg-zinc-900/50">
              {[
                { id: "summary", label: "Requirements" },
                { id: "cover_letter", label: "Cover Letter" },
                { id: "email", label: "Email Draft" },
                { id: "linkedin", label: "LinkedIn Note" },
                { id: "chat", label: "💬 Chat" },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id 
                    ? "border-violet-500 text-violet-600 dark:text-violet-400 bg-white dark:bg-zinc-800/50 shadow-sm" 
                    : "border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6 flex-1 overflow-y-auto">

              {/* Inline error */}
              {genError && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 flex items-center justify-between">
                  <span>{genError}</span>
                  <button onClick={() => setGenError(null)} className="ml-3 text-red-400 hover:text-red-600">✕</button>
                </div>
              )}

              {/* Requirements Tab */}
              {activeTab === "summary" && (() => {
                let parsed: { location?: string | null; salary?: string | null; requirements?: string[] } | null = null;
                if (job.description_summary) {
                  try { parsed = JSON.parse(job.description_summary); } catch { parsed = null; }
                }
                return parsed ? (
                  <div className="space-y-5">
                    {(parsed.location || parsed.salary) && (
                      <div className="grid grid-cols-2 gap-4">
                        {parsed.location && (
                          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-100 dark:border-zinc-700">
                            <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Location</p>
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{parsed.location}</p>
                          </div>
                        )}
                        {parsed.salary && (
                          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-100 dark:border-zinc-700">
                            <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Salary</p>
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{parsed.salary}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {parsed.requirements && parsed.requirements.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Key Requirements</p>
                        <ul className="space-y-2.5">
                          {parsed.requirements.map((r, i) => (
                            <li key={i} className="flex gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                              <span className="text-violet-500 mt-0.5 shrink-0 font-bold">›</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyGenerationState
                    loading={genLoading === "generate_summary"}
                    onClick={() => generateContent("generate_summary")}
                    label="Analyze Job Posting"
                  />
                );
              })()}

              {/* Cover Letter Tab */}
              {activeTab === "cover_letter" && (
                job.cover_letter ? (
                  <ContentDisplay content={job.cover_letter} onRegenerate={() => generateContent("generate_cover_letter")} regenerating={genLoading === "generate_cover_letter"} />
                ) : (
                  <EmptyGenerationState loading={genLoading === "generate_cover_letter"} onClick={() => generateContent("generate_cover_letter")} label="Draft Cover Letter" />
                )
              )}

              {/* Email Tab */}
              {activeTab === "email" && (
                job.email_draft ? (
                  <ContentDisplay content={job.email_draft} onRegenerate={() => generateContent("generate_email")} regenerating={genLoading === "generate_email"} />
                ) : (
                  <EmptyGenerationState loading={genLoading === "generate_email"} onClick={() => generateContent("generate_email")} label="Draft Cold Email" />
                )
              )}

              {/* LinkedIn Tab */}
              {activeTab === "linkedin" && (
                job.linkedin_note ? (
                  <ContentDisplay content={job.linkedin_note} onRegenerate={() => generateContent("generate_linkedin")} regenerating={genLoading === "generate_linkedin"} />
                ) : (
                  <EmptyGenerationState loading={genLoading === "generate_linkedin"} onClick={() => generateContent("generate_linkedin")} label="Draft LinkedIn Note" />
                )
              )}

              {/* Chat Tab (Placeholder) */}
              {activeTab === "chat" && (
                <div className="flex flex-col h-full items-center justify-center text-center space-y-4 text-zinc-500">
                  <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-500 mb-2">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">Interactive Chat</h3>
                  <p className="text-sm max-w-sm">Chat with Gemini about this specific job. Coming soon!</p>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function EmptyGenerationState({ loading, onClick, label }: { loading: boolean, onClick: () => void, label: string }) {
  return (
    <div className="flex flex-col h-full min-h-[400px] items-center justify-center text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-500 mb-2">
        <Sparkles className="w-8 h-8" />
      </div>
      <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">No content generated yet</h3>
      <p className="text-sm text-zinc-500 mb-4 max-w-sm">Use AI to instantly draft an personalized artifact based on your career profile and the raw job description.</p>
      <Button onClick={onClick} disabled={loading} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white min-w-[200px] justify-center">
        {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? "Generating..." : `✨ ${label}`}
      </Button>
    </div>
  );
}

function ContentDisplay({ content, onRegenerate, regenerating }: { content: string; onRegenerate: () => void; regenerating: boolean }) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onRegenerate} disabled={regenerating}
          className="text-xs text-zinc-400 hover:text-violet-600 transition-colors disabled:opacity-50">
          {regenerating ? "Regenerating..." : "↺ Regenerate"}
        </button>
        <CopyButton text={content} label="Copy" />
      </div>
      <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap font-serif">
        {content}
      </div>
    </div>
  );
}
