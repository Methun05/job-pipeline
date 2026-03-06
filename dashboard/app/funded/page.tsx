"use client";
import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, TrendingUp, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FundedLead, FundedStatus, PipelineRun } from "@/lib/types";
import StatsBar from "@/components/StatsBar";
import PipelineStatus from "@/components/PipelineStatus";
import ActivityChart from "@/components/ActivityChart";
import FundedCompanyCard from "@/components/FundedCompanyCard";
import Navigation from "@/components/Navigation";

type Section = "pending" | "followup" | "done";

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 mb-3`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{title}</h2>
      <span className="ml-auto bg-zinc-800 text-zinc-500 text-xs px-2 py-0.5 rounded-full">{count}</span>
    </div>
  );
}

const DONE_STATUSES: FundedStatus[] = ["connected", "replied", "interview", "closed", "skipped", "cant_find"];
const ACTIVE_STATUSES: FundedStatus[] = ["new", "connection_sent"];

export default function FundedPage() {
  const [leads, setLeads]         = useState<FundedLead[]>([]);
  const [lastRun, setLastRun]     = useState<PipelineRun | null>(null);
  const [credits, setCredits]     = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    const [{ data: leadsData }, { data: runData }, { data: settingsData }] = await Promise.all([
      supabase
        .from("funded_leads")
        .select(`*, companies(*), contacts(*)`)
        .not("status", "in", '("closed","skipped")')
        .order("created_at", { ascending: false })
        .limit(200),
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

  const pending  = leads.filter(l => ACTIVE_STATUSES.includes(l.status) && !l.follow_up_generated);
  const followUp = leads.filter(l => l.follow_up_generated && ACTIVE_STATUSES.includes(l.status));
  const done     = leads.filter(l => DONE_STATUSES.includes(l.status));

  const stats = {
    newToday:       leads.filter(l => {
      const d = new Date(l.created_at);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length,
    totalContacted: leads.filter(l => l.status !== "new").length,
    totalReplies:   leads.filter(l => ["replied", "interview"].includes(l.status)).length,
    totalApplied:   0,
  };

  // Chart data — last 7 days
  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    return days.map(date => ({
      date: date.slice(5),
      funded: leads.filter(l => l.created_at.slice(0, 10) === date).length,
      jobs:   0,
    }));
  }, [leads]);

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

        {/* Pending */}
        <section>
          <SectionHeader title="Pending Action" count={pending.length} color="bg-blue-500" />
          {pending.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-8">
              No pending companies. Pipeline runs daily at 8 AM IST.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map(lead => (
                <FundedCompanyCard key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}
        </section>

        {/* Follow Up Needed */}
        {followUp.length > 0 && (
          <section>
            <SectionHeader title="Follow Up Needed" count={followUp.length} color="bg-amber-500" />
            <div className="space-y-3">
              {followUp.map(lead => (
                <FundedCompanyCard key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </section>
        )}

        {/* Done */}
        {done.length > 0 && (
          <section>
            <SectionHeader title="Done" count={done.length} color="bg-zinc-600" />
            <div className="space-y-3">
              {done.map(lead => (
                <FundedCompanyCard key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </section>
        )}
      </div>

      <Navigation active="funded" />
    </div>
  );
}
