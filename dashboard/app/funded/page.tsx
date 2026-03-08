"use client";
import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FundedLead, FundedStatus, PipelineRun } from "@/lib/types";
import StatsBar from "@/components/StatsBar";
import PipelineStatus from "@/components/PipelineStatus";
import ActivityChart from "@/components/ActivityChart";
import FundedCompanyRow, { STATUS_OPTIONS } from "@/components/FundedCompanyCard";
import Navigation from "@/components/Navigation";

// Outside component — not recreated on every render
const ACTIVE_STATUSES: FundedStatus[] = ["new", "connection_sent"];

type SortKey = "funding" | "date";
type SortDir = "asc" | "desc";

export default function FundedPage() {
  const [leads, setLeads]               = useState<FundedLead[]>([]);
  const [lastRun, setLastRun]           = useState<PipelineRun | null>(null);
  const [credits, setCredits]           = useState<number | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [sortKey, setSortKey]           = useState<SortKey>("date");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    const [{ data: leadsData }, { data: runData }, { data: settingsData }] = await Promise.all([
      supabase
        .from("funded_leads")
        .select(`*, companies(*), contacts(*)`)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("pipeline_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .single(),
      supabase.from("settings").select("key, value"),
    ]);

    if (leadsData) setLeads(leadsData as FundedLead[]);
    if (runData)   setLastRun(runData as PipelineRun);
    if (settingsData) {
      const c = settingsData.find((s: { key: string }) => s.key === "apollo_credits_remaining");
      if (c) setCredits(parseInt(c.value));
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleStatusChange(id: string, status: FundedStatus) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    let rows = leads;
    if (statusFilter === "active") rows = leads.filter(l => ACTIVE_STATUSES.includes(l.status));
    else if (statusFilter !== "all") rows = leads.filter(l => l.status === statusFilter);

    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "funding") {
        cmp = (a.funding_amount ?? 0) - (b.funding_amount ?? 0);
      } else {
        cmp = (a.announced_date ?? "").localeCompare(b.announced_date ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [leads, statusFilter, sortKey, sortDir]);

  const stats = {
    newToday: leads.filter(l => {
      return new Date(l.created_at).toDateString() === new Date().toDateString();
    }).length,
    totalContacted: leads.filter(l => l.status !== "new").length,
    totalReplies:   leads.filter(l => ["replied", "interview"].includes(l.status)).length,
    totalApplied:   0,
  };

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    return days.map(date => ({
      date:   date.slice(5),
      funded: leads.filter(l => l.created_at.slice(0, 10) === date).length,
    }));
  }, [leads]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1 text-zinc-300" />
      : <ArrowDown className="w-3 h-3 ml-1 text-zinc-300" />;
  }

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-zinc-100">Funded Companies</h1>
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
      </div>

      <div className="px-4 pt-4 space-y-4">
        <PipelineStatus lastRun={lastRun} credits={credits} />
        <StatsBar stats={stats} />
        <ActivityChart data={chartData} />

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { value: "active", label: "Active" },
            { value: "all",    label: "All" },
            ...STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })),
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-zinc-500">{filtered.length} companies</span>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-600 text-center py-12">
            No companies in this filter. Pipeline runs daily at 8 AM IST.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Company
                  </th>
                  <th
                    className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-200 transition-colors"
                    onClick={() => toggleSort("funding")}
                  >
                    <span className="flex items-center">Funding <SortIcon col="funding" /></span>
                  </th>
                  <th
                    className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-200 transition-colors"
                    onClick={() => toggleSort("date")}
                  >
                    <span className="flex items-center">Date <SortIcon col="date" /></span>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Outreach
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Response
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <FundedCompanyRow key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Navigation active="funded" />
    </div>
  );
}
