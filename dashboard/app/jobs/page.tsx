"use client";
import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { JobPosting, PipelineRun } from "@/lib/types";
import JobPostingRow from "@/components/JobPostingCard";

type SortKey = "date";
type SortDir = "asc" | "desc";

const FILTERS = [
  { value: "active",    label: "Active"      },
  { value: "all",       label: "All"          },
  { value: "new",       label: "Not Applied"  },
  { value: "applied",   label: "Applied"      },
  { value: "follow_up", label: "Follow Up"    },
  { value: "interview", label: "Interview"    },
  { value: "done",      label: "Done"         },
];

const ACTIVE_APP = ["new", "applied", "follow_up", "interview"];
const DONE_APP   = ["offer", "rejected", "skipped"];

export default function JobsPage() {
  const [jobs, setJobs]             = useState<JobPosting[]>([]);
  const [lastRun, setLastRun]       = useState<PipelineRun | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState("active");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    const [{ data: jobsData }, { data: runData }] = await Promise.all([
      supabase
        .from("job_postings")
        .select("*, companies(*), contacts(*)")
        .order("posted_at", { ascending: false })
        .limit(300),
      supabase
        .from("pipeline_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .single(),
    ]);
    if (jobsData) setJobs(jobsData as JobPosting[]);
    if (runData)  setLastRun(runData as PipelineRun);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleUpdate(id: string, updates: Partial<JobPosting>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));
  }

  const filtered = useMemo(() => {
    let rows = jobs;
    if      (filter === "active") rows = jobs.filter(j => ACTIVE_APP.includes(j.application_status));
    else if (filter === "done")   rows = jobs.filter(j => DONE_APP.includes(j.application_status));
    else if (filter !== "all")    rows = jobs.filter(j => j.application_status === filter);

    return [...rows].sort((a, b) => {
      const cmp = (a.posted_at ?? "").localeCompare(b.posted_at ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [jobs, filter, sortDir]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f10] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f10]">

      {/* ── Page header ── */}
      <div className="sticky top-0 z-10 bg-[#0f0f10]/95 backdrop-blur border-b border-zinc-800/60">
        <div className="px-6 pt-4 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-base font-semibold text-zinc-100">Job Postings</h1>
              {lastRun?.completed_at && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  Updated {formatDistanceToNow(new Date(lastRun.completed_at))} ago
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-600 mr-1">{filtered.length} jobs</span>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-700/60 transition-colors text-xs text-zinc-300 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Reload
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mx-6 px-6">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  filter === f.value
                    ? "border-indigo-500 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="px-6 pt-4 pb-8">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-600">No jobs here. Pipeline runs daily at 8 AM IST.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Remote</th>
                  <th
                    className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-300 transition-colors"
                    onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                  >
                    <span className="flex items-center">
                      Posted
                      {sortDir === "asc"
                        ? <ArrowUp className="w-3 h-3 ml-1" />
                        : <ArrowDown className="w-3 h-3 ml-1" />}
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Application</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Outreach</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Open</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {filtered.map(job => (
                  <JobPostingRow key={job.id} job={job} onUpdate={handleUpdate} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
