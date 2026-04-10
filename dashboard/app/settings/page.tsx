"use client";
import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  ArrowRight, Zap, Activity, Database, GitBranch,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PipelineRun, FallbackEvent } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRACK_A_SOURCES = ["cryptorank", "dropstab"];
const TRACK_B_SOURCES = [
  "web3career", "cryptojobslist", "cryptocurrencyjobs",
  "dragonfly", "arbitrum", "hashtagweb3", "talentweb3",
  "solana_jobs", "paradigm", "sui_jobs", "a16zcrypto",
];
const ALL_SOURCES = [...TRACK_A_SOURCES, ...TRACK_B_SOURCES];

const SERVICES: Array<{ key: string; label: string; accent: string }> = [
  { key: "exa",    label: "Exa",    accent: "violet" },
  { key: "tavily", label: "Tavily", accent: "blue"   },
  { key: "hunter", label: "Hunter", accent: "orange" },
  { key: "apollo", label: "Apollo", accent: "green"  },
  { key: "gemini", label: "Gemini", accent: "yellow" },
  { key: "brave",  label: "Brave",  accent: "red"    },
];

const ACCENT: Record<string, string> = {
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  blue:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  green:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  red:    "bg-red-500/10 text-red-400 border-red-500/20",
};

// ── Source health pill ─────────────────────────────────────────────────────────

function SourcePill({ count }: { count: number | undefined }) {
  if (count === undefined) return <span className="text-zinc-600 text-xs">—</span>;
  if (count === -1) return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><XCircle className="w-3 h-3" /> error</span>;
  if (count === 0)  return <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400"><AlertTriangle className="w-3 h-3" /> 0</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400"><CheckCircle2 className="w-3 h-3" /> {count}</span>;
}

// ── Run status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> completed
    </span>
  );
  if (status === "failed") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400">
      <XCircle className="w-3 h-3" /> failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-yellow-400">
      <Clock className="w-3 h-3" /> running
    </span>
  );
}

// ── Fallback reason label ──────────────────────────────────────────────────────

function ReasonBadge({ reason }: { reason: string }) {
  const styles: Record<string, string> = {
    quota:       "bg-yellow-500/10 text-yellow-400",
    daily_quota: "bg-orange-500/10 text-orange-400",
    no_results:  "bg-blue-500/10 text-blue-400",
    error:       "bg-red-500/10 text-red-400",
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${styles[reason] || "bg-zinc-700 text-zinc-400"}`}>
      {reason}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [runs, setRuns]         = useState<PipelineRun[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    const { data } = await supabase
      .from("pipeline_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    if (data) setRuns(data as PipelineRun[]);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  const latestRun    = runs[0] ?? null;
  const recentRuns   = runs.slice(0, 7);

  // Aggregate per-source counts across last 7 runs
  const sourceTrend: Record<string, number[]> = {};
  for (const src of ALL_SOURCES) {
    sourceTrend[src] = recentRuns.map(r => r.source_counts?.[src] ?? -99).reverse();
  }

  const latestFallbacks: FallbackEvent[] = latestRun?.fallback_events ?? [];
  const latestApiUsage = latestRun?.api_usage ?? {};

  // Total fallbacks per service from latest run
  const fallbackCounts: Record<string, number> = {};
  for (const ev of latestFallbacks) {
    const svc = ev.from.replace(/_key\d+$/, "");
    fallbackCounts[svc] = (fallbackCounts[svc] || 0) + 1;
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading...</div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Health & Settings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Pipeline status, source health, and API usage monitoring
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Section 1: Run History ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-200">Pipeline Runs</h2>
          <span className="text-xs text-zinc-600">Last {recentRuns.length} runs</span>
        </div>

        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Started</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Track A</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Track B</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Errors</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run, i) => {
                const durationMs = run.completed_at
                  ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
                  : null;
                const durationMin = durationMs ? Math.round(durationMs / 60000) : null;
                return (
                  <tr
                    key={run.id}
                    className={`border-b border-zinc-800/60 last:border-0 ${i === 0 ? "bg-zinc-800/30" : ""}`}
                  >
                    <td className="px-4 py-3 text-zinc-300">
                      <div>{run.completed_at
                        ? format(new Date(run.started_at), "MMM d, HH:mm")
                        : "Running..."
                      }</div>
                      {run.completed_at && (
                        <div className="text-zinc-600 text-[10px]">
                          {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {run.track_a_new > 0
                        ? <span className="text-emerald-400 font-medium">+{run.track_a_new}</span>
                        : <span className="text-zinc-600">0</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {run.track_b_new > 0
                        ? <span className="text-emerald-400 font-medium">+{run.track_b_new}</span>
                        : <span className="text-zinc-600">0</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      {run.errors?.length > 0
                        ? <span className="text-red-400 font-medium">{run.errors.length}</span>
                        : <span className="text-zinc-600">0</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {durationMin !== null ? `${durationMin}m` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 2: Source Health ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-200">Source Health</h2>
          <span className="text-xs text-zinc-600">Latest run count per source</span>
        </div>

        {/* Track A */}
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Track A — Funded Companies</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
          {TRACK_A_SOURCES.map(src => {
            const latestCount = latestRun?.source_counts?.[src];
            const trend = sourceTrend[src] ?? [];
            return (
              <div key={src} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-300 capitalize">{src}</span>
                  <SourcePill count={latestCount} />
                </div>
                {/* Mini sparkline — dots for last 7 runs */}
                <div className="flex items-end gap-0.5 h-5">
                  {trend.map((val, i) => {
                    const color = val === -99 ? "bg-zinc-800" : val === -1 ? "bg-red-500" : val === 0 ? "bg-yellow-500" : "bg-emerald-500";
                    const height = val > 0 ? Math.min(100, Math.max(20, (val / 60) * 100)) : 20;
                    return (
                      <div
                        key={i}
                        title={val === -99 ? "no data" : val === -1 ? "error" : `${val} items`}
                        className={`flex-1 rounded-sm ${color} opacity-70`}
                        style={{ height: `${height}%` }}
                      />
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">{trend.length} run history →</p>
              </div>
            );
          })}
        </div>

        {/* Track B */}
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Track B — Job Postings</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TRACK_B_SOURCES.map(src => {
            const latestCount = latestRun?.source_counts?.[src];
            const trend = sourceTrend[src] ?? [];
            return (
              <div key={src} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-300 capitalize">{src.replace(/_/g, " ")}</span>
                  <SourcePill count={latestCount} />
                </div>
                <div className="flex items-end gap-0.5 h-5">
                  {trend.map((val, i) => {
                    const color = val === -99 ? "bg-zinc-800" : val === -1 ? "bg-red-500" : val === 0 ? "bg-yellow-500" : "bg-emerald-500";
                    const height = val > 0 ? Math.min(100, Math.max(20, (val / 60) * 100)) : 20;
                    return (
                      <div
                        key={i}
                        title={val === -99 ? "no data" : val === -1 ? "error" : `${val} items`}
                        className={`flex-1 rounded-sm ${color} opacity-70`}
                        style={{ height: `${height}%` }}
                      />
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">{trend.filter(v => v !== -99).length} runs tracked</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section 3: API Usage ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-200">API Usage</h2>
          <span className="text-xs text-zinc-600">Latest run</span>
        </div>
        {latestRun?.completed_at && (
          <p className="text-[11px] text-zinc-600 mb-4 ml-6">
            Run completed {formatDistanceToNow(new Date(latestRun.completed_at))} ago
          </p>
        )}
        {!latestRun?.api_usage || Object.keys(latestRun.api_usage).length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-5 text-center">
            <p className="text-zinc-500 text-sm">No API usage data yet — will appear after next pipeline run</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SERVICES.map(({ key, label, accent }) => {
              const usage = latestApiUsage[key];
              const calls = usage?.calls ?? 0;
              const keyInUse = usage?.key_in_use;
              const fallbacks = fallbackCounts[key] ?? 0;
              return (
                <div key={key} className={`border rounded-xl px-4 py-3 ${ACCENT[accent]}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold">{label}</span>
                    {keyInUse && (
                      <span className="text-[10px] font-mono opacity-70">{keyInUse}</span>
                    )}
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{calls}</p>
                  <p className="text-[11px] opacity-60 mt-0.5">calls this run</p>
                  {fallbacks > 0 && (
                    <p className="text-[11px] mt-1.5 opacity-80">
                      ↪ {fallbacks} fallback{fallbacks > 1 ? "s" : ""} triggered
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 4: Fallback Events ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-200">Fallback Events</h2>
          <span className="text-xs text-zinc-600">Latest run — {latestFallbacks.length} event{latestFallbacks.length !== 1 ? "s" : ""}</span>
        </div>

        {latestFallbacks.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-5 text-center">
            <p className="text-zinc-500 text-sm">
              {latestRun?.api_usage
                ? "No fallbacks triggered — all primary sources succeeded"
                : "No fallback data yet — will appear after next pipeline run"
              }
            </p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60 overflow-hidden">
            {latestFallbacks.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-[10px] text-zinc-600 tabular-nums w-10 shrink-0">
                  {format(new Date(ev.timestamp), "HH:mm")}
                </span>
                <span className="text-xs font-mono text-zinc-400">{ev.from}</span>
                <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                <span className="text-xs font-mono text-zinc-300">{ev.to}</span>
                <ReasonBadge reason={ev.reason} />
                <span className="text-[10px] text-zinc-600 ml-auto truncate max-w-[140px]">{ev.context}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 5: Recent Errors ───────────────────────────────────────── */}
      {(latestRun?.errors?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-zinc-200">Errors</h2>
            <span className="text-xs text-zinc-600">Latest run</span>
          </div>
          <div className="bg-red-950/20 border border-red-900/30 rounded-xl divide-y divide-red-900/20 overflow-hidden">
            {latestRun!.errors.map((err, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-mono font-medium text-red-400">{err.source}</span>
                  <span className="text-[10px] text-zinc-600">
                    {format(new Date(err.timestamp), "HH:mm:ss")}
                  </span>
                </div>
                <p className="text-xs text-red-300/80 line-clamp-2">{err.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
