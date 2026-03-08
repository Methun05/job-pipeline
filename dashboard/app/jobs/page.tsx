"use client";
import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { JobPosting, PipelineRun } from "@/lib/types";
import JobPostingRow from "@/components/JobPostingCard";
import Navigation from "@/components/Navigation";

type SortKey = "date" | "salary";
type SortDir = "asc" | "desc";

const FILTERS = [
  { value: "active",           label: "Active"      },
  { value: "all",              label: "All"          },
  { value: "new",              label: "Not Applied"  },
  { value: "applied",          label: "Applied"      },
  { value: "interview",        label: "Interview"    },
  { value: "follow_up",        label: "Follow Up"    },
  { value: "done",             label: "Done"         },
];

const ACTIVE_APP = ["new", "applied", "follow_up", "interview"];
const DONE_APP   = ["offer", "rejected", "skipped"];

export default function JobsPage() {
  const [jobs, setJobs]             = useState<JobPosting[]>([]);
  const [lastRun, setLastRun]       = useState<PipelineRun | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState("active");
  const [sortKey, setSortKey]       = useState<SortKey>("date");
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    let rows = jobs;
    if      (filter === "active") rows = jobs.filter(j => ACTIVE_APP.includes(j.application_status));
    else if (filter === "done")   rows = jobs.filter(j => DONE_APP.includes(j.application_status));
    else if (filter !== "all")    rows = jobs.filter(j => j.application_status === filter);

    return [...rows].sort((a, b) => {
      const cmp = sortKey === "salary"
        ? (a.salary_min ?? 0) - (b.salary_min ?? 0)
        : (a.posted_at ?? "").localeCompare(b.posted_at ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [jobs, filter, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1" />
      : <ArrowDown className="w-3 h-3 ml-1" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f10] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f10] pb-24">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-[#0f0f10]/95 backdrop-blur border-b border-zinc-800/60">
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-sm font-semibold text-zinc-100 tracking-tight">Job Postings</h1>
              {lastRun?.completed_at && (
                <p className="text-xs text-zinc-600 mt-0.5">
                  Updated {formatDistanceToNow(new Date(lastRun.completed_at))} ago
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-600">{filtered.length} jobs</span>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mx-4 px-4">
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
      <div className="px-4 pt-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-600">No jobs here. Pipeline runs daily at 8 AM IST.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Remote
                  </th>
                  <th
                    className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-300 transition-colors"
                    onClick={() => toggleSort("salary")}
                  >
                    <span className="flex items-center">Salary <SortIcon col="salary" /></span>
                  </th>
                  <th
                    className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-300 transition-colors"
                    onClick={() => toggleSort("date")}
                  >
                    <span className="flex items-center">Posted <SortIcon col="date" /></span>
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Application
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Outreach
                  </th>
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

      <Navigation active="jobs" />
    </div>
  );
}
