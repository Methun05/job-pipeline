"use client";
import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Filter } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { JobPosting, PipelineRun, RemoteScope } from "@/lib/types";
import StatsBar from "@/components/StatsBar";
import PipelineStatus from "@/components/PipelineStatus";
import JobPostingCard from "@/components/JobPostingCard";
import Navigation from "@/components/Navigation";

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{title}</h2>
      <span className="ml-auto bg-zinc-800 text-zinc-500 text-xs px-2 py-0.5 rounded-full">{count}</span>
    </div>
  );
}

const DONE_APP = ["applied", "interview", "offer", "rejected", "skipped"];
const DONE_OUT = ["connected", "replied", "conversation", "cant_find"];

export default function JobsPage() {
  const [jobs, setJobs]         = useState<JobPosting[]>([]);
  const [lastRun, setLastRun]   = useState<PipelineRun | null>(null);
  const [credits, setCredits]   = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<RemoteScope | "all">("all");

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    const [{ data: jobsData }, { data: runData }, { data: settingsData }] = await Promise.all([
      supabase
        .from("job_postings")
        .select(`*, companies(*), contacts(*)`)
        .not("application_status", "in", '("rejected","skipped")')
        .order("posted_at", { ascending: false })
        .limit(200),
      supabase
        .from("pipeline_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .single(),
      supabase.from("settings").select("key, value"),
    ]);

    if (jobsData) setJobs(jobsData as JobPosting[]);
    if (runData)  setLastRun(runData as PipelineRun);
    if (settingsData) {
      const c = settingsData.find((s: { key: string }) => s.key === "apollo_credits_remaining");
      if (c) setCredits(parseInt(c.value));
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleUpdate(id: string, updates: Partial<JobPosting>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));
  }

  const filtered = scopeFilter === "all" ? jobs : jobs.filter(j => j.remote_scope === scopeFilter);

  const pending  = filtered.filter(j =>
    j.application_status === "new" && j.outreach_status === "new" && !j.follow_up_generated
  );
  const followUp = filtered.filter(j => j.follow_up_generated &&
    !DONE_APP.includes(j.application_status)
  );
  const done     = filtered.filter(j =>
    DONE_APP.includes(j.application_status) || DONE_OUT.includes(j.outreach_status)
  );
  const inProgress = filtered.filter(j =>
    !pending.includes(j) && !followUp.includes(j) && !done.includes(j)
  );

  const stats = {
    newToday: jobs.filter(j => {
      const d = new Date(j.created_at);
      return d.toDateString() === new Date().toDateString();
    }).length,
    totalContacted: jobs.filter(j => j.outreach_status !== "new").length,
    totalReplies:   jobs.filter(j => ["replied", "conversation"].includes(j.outreach_status)).length,
    totalApplied:   jobs.filter(j => j.application_status !== "new").length,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#0f0f10]/90 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-base font-bold text-zinc-100">Job Postings</h1>
            {lastRun?.completed_at && (
              <p className="text-xs text-zinc-600">
                Updated {formatDistanceToNow(new Date(lastRun.completed_at))} ago
              </p>
            )}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-2 rounded-xl hover:bg-zinc-800 transition-colors text-zinc-500"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Scope filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {(["all", "global", "us_only", "unclear"] as const).map(s => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                scopeFilter === s
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {s === "all" ? "All" : s === "global" ? "🌍 Global" : s === "us_only" ? "🇺🇸 US Only" : "❓ Unclear"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <PipelineStatus lastRun={lastRun} credits={credits} />
        <StatsBar stats={stats} />

        {/* Pending */}
        <section>
          <SectionHeader title="New — Action Needed" count={pending.length} color="bg-blue-500" />
          {pending.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-8">
              No new jobs. Pipeline runs daily at 8 AM IST.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map(job => (
                <JobPostingCard key={job.id} job={job} onUpdate={handleUpdate} />
              ))}
            </div>
          )}
        </section>

        {/* In Progress */}
        {inProgress.length > 0 && (
          <section>
            <SectionHeader title="In Progress" count={inProgress.length} color="bg-indigo-500" />
            <div className="space-y-3">
              {inProgress.map(job => (
                <JobPostingCard key={job.id} job={job} onUpdate={handleUpdate} />
              ))}
            </div>
          </section>
        )}

        {/* Follow Up */}
        {followUp.length > 0 && (
          <section>
            <SectionHeader title="Follow Up Needed" count={followUp.length} color="bg-amber-500" />
            <div className="space-y-3">
              {followUp.map(job => (
                <JobPostingCard key={job.id} job={job} onUpdate={handleUpdate} />
              ))}
            </div>
          </section>
        )}

        {/* Done */}
        {done.length > 0 && (
          <section>
            <SectionHeader title="Done" count={done.length} color="bg-zinc-600" />
            <div className="space-y-3">
              {done.map(job => (
                <JobPostingCard key={job.id} job={job} onUpdate={handleUpdate} />
              ))}
            </div>
          </section>
        )}
      </div>

      <Navigation active="jobs" />
    </div>
  );
}
