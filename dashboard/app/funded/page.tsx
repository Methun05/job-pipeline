"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, SlidersHorizontal, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FundedLead, FundedStatus, PipelineRun } from "@/lib/types";
import FundedCompanyRow from "@/components/FundedCompanyCard";

type SortKey = "funding" | "date";
type SortDir = "asc" | "desc";

const FILTERS = [
  { value: "active",          label: "Active"      },
  { value: "all",             label: "All"          },
  { value: "new",             label: "Not Sent"     },
  { value: "connection_sent", label: "Sent"         },
  { value: "connected",       label: "Connected"    },
  { value: "replied",         label: "Replied"      },
  { value: "interview",       label: "Interview"    },
  { value: "closed",          label: "Closed"       },
  { value: "skipped",         label: "Skipped"      },
  { value: "cant_find",       label: "Can't Find"   },
  { value: "done",            label: "Done"         },
];

const ACTIVE_STATUSES: FundedStatus[] = ["new", "connection_sent"];
const DONE_STATUSES:   FundedStatus[] = ["closed", "skipped", "cant_find"];

export default function FundedPage() {
  const [leads, setLeads]           = useState<FundedLead[]>([]);
  const [lastRun, setLastRun]       = useState<PipelineRun | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState("active");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey]       = useState<SortKey>("date");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const filterRef                   = useRef<HTMLDivElement>(null);

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    const [{ data: leadsData }, { data: runData }] = await Promise.all([
      supabase
        .from("funded_leads")
        .select("*, companies(*), contacts(*)")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("pipeline_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .single(),
    ]);
    if (leadsData) setLeads(leadsData as FundedLead[]);
    if (runData)   setLastRun(runData as PipelineRun);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleStatusChange(id: string, status: FundedStatus) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const activeLabel = FILTERS.find(f => f.value === filter)?.label ?? "Filter";

  const filtered = useMemo(() => {
    let rows = leads;
    if      (filter === "active") rows = leads.filter(l => ACTIVE_STATUSES.includes(l.status));
    else if (filter === "done")   rows = leads.filter(l => DONE_STATUSES.includes(l.status));
    else if (filter !== "all")    rows = leads.filter(l => l.status === filter);

    return [...rows].sort((a, b) => {
      const cmp = sortKey === "funding"
        ? (a.funding_amount ?? 0) - (b.funding_amount ?? 0)
        : (a.announced_date ?? "").localeCompare(b.announced_date ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [leads, filter, sortKey, sortDir]);

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
    <div className="min-h-screen bg-[#0f0f10]">

      {/* ── Page header ── */}
      <div className="sticky top-0 z-10 bg-[#0f0f10]/95 backdrop-blur border-b border-zinc-800/60">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-zinc-100">Funded Companies</h1>
              {lastRun?.completed_at && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  Updated {formatDistanceToNow(new Date(lastRun.completed_at))} ago
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-600">{filtered.length} companies</span>

              {/* Filter dropdown */}
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium ${
                    filterOpen
                      ? "border-indigo-500/60 bg-indigo-600/10 text-indigo-300"
                      : "border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {activeLabel}
                </button>

                {filterOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-xl overflow-hidden z-50">
                    {FILTERS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => { setFilter(f.value); setFilterOpen(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800 transition-colors text-left"
                      >
                        <span className={filter === f.value ? "text-indigo-300 font-medium" : "text-zinc-300"}>
                          {f.label}
                        </span>
                        {filter === f.value && <Check className="w-3 h-3 text-indigo-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
        </div>
      </div>

      {/* ── Table ── */}
      <div className="px-6 pt-4 pb-8">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-600">No companies here. Pipeline runs daily at 8 AM IST.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Company</th>
                  <th
                    className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-300 transition-colors"
                    onClick={() => toggleSort("funding")}
                  >
                    <span className="flex items-center">Funding <SortIcon col="funding" /></span>
                  </th>
                  <th
                    className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-300 transition-colors"
                    onClick={() => toggleSort("date")}
                  >
                    <span className="flex items-center">Date <SortIcon col="date" /></span>
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Social Links</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Outreach</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Response</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {filtered.map(lead => (
                  <FundedCompanyRow key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
