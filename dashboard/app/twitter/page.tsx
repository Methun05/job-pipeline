"use client";
import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, ExternalLink, Twitter } from "lucide-react";
import { supabase } from "@/lib/supabase";

type TwitterLead = {
  id: string;
  tweet_url: string;
  tweet_text: string | null;
  posted_at: string | null;
  poster_handle: string | null;
  poster_name: string | null;
  poster_followers: number | null;
  poster_type: "founder" | "company" | "unknown" | null;
  company_name: string | null;
  role_mentioned: string | null;
  gemini_confidence: number | null;
  status: "new" | "messaged" | "replied" | "skipped";
  notes: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["new", "messaged", "replied", "skipped"] as const;

const STATUS_STYLES: Record<string, string> = {
  new:      "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  messaged: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  replied:  "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  skipped:  "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
};

const FILTER_TABS = [
  { value: "all",      label: "All"      },
  { value: "new",      label: "New"      },
  { value: "messaged", label: "Messaged" },
  { value: "replied",  label: "Replied"  },
  { value: "skipped",  label: "Skipped"  },
];

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color =
    pct >= 90 ? "text-emerald-600 dark:text-emerald-400" :
    pct >= 75 ? "text-amber-600 dark:text-amber-400" :
                "text-zinc-400";
  return (
    <span className={`text-[11px] font-medium tabular-nums ${color}`}>
      {pct}%
    </span>
  );
}

function PosterTypeBadge({ type }: { type: string | null }) {
  if (!type || type === "unknown") return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
      type === "founder"
        ? "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 border-violet-200 dark:border-violet-800"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
    }`}>
      {type}
    </span>
  );
}

function StatusDropdown({
  leadId,
  current,
  onChange,
}: {
  leadId: string;
  current: TwitterLead["status"];
  onChange: (id: string, status: TwitterLead["status"]) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TwitterLead["status"];
    setSaving(true);
    await supabase.from("twitter_leads").update({ status: next }).eq("id", leadId);
    onChange(leadId, next);
    setSaving(false);
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      disabled={saving}
      className={`text-[11px] font-medium px-2 py-1 rounded-lg border cursor-pointer transition-colors disabled:opacity-50 ${STATUS_STYLES[current]}`}
    >
      {STATUS_OPTIONS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function LeadCard({
  lead,
  onUpdate,
}: {
  lead: TwitterLead;
  onUpdate: (id: string, status: TwitterLead["status"]) => void;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              @{lead.poster_handle || "unknown"}
            </span>
            <PosterTypeBadge type={lead.poster_type} />
            {lead.poster_followers != null && (
              <span className="text-[11px] text-zinc-400">
                {lead.poster_followers.toLocaleString()} followers
              </span>
            )}
          </div>
          {lead.poster_name && lead.poster_name !== lead.poster_handle && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{lead.poster_name}</p>
          )}
        </div>
        <a
          href={lead.tweet_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Tweet
        </a>
      </div>

      {/* Role + company badges */}
      {(lead.role_mentioned || lead.company_name) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {lead.role_mentioned && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-800 font-medium">
              {lead.role_mentioned}
            </span>
          )}
          {lead.company_name && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
              {lead.company_name}
            </span>
          )}
        </div>
      )}

      {/* Tweet text */}
      {lead.tweet_text && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-4 whitespace-pre-wrap">
          {lead.tweet_text}
        </p>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <StatusDropdown leadId={lead.id} current={lead.status} onChange={onUpdate} />
          <ConfidenceBadge value={lead.gemini_confidence} />
        </div>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
          {lead.posted_at
            ? formatDistanceToNow(new Date(lead.posted_at), { addSuffix: true })
            : formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

export default function TwitterPage() {
  const [leads, setLeads]         = useState<TwitterLead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState("all");

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    const { data } = await supabase
      .from("twitter_leads")
      .select("*")
      .order("posted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setLeads(data as TwitterLead[]);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleUpdate(id: string, status: TwitterLead["status"]) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
  }

  const filtered = useMemo(() => {
    if (filter === "all") return leads;
    return leads.filter(l => l.status === filter);
  }, [leads, filter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F4] dark:bg-[#0f0f10] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F4] dark:bg-[#0f0f10]">

      {/* Page header */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Twitter className="w-4 h-4 text-violet-500" />
                Twitter Leads
              </h1>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                Direct founder hiring signals from X/Twitter
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-zinc-400 dark:text-zinc-500 hidden sm:inline">
                {filtered.length} leads
              </span>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-xs text-zinc-600 dark:text-zinc-300 shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Reload</span>
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto pb-px">
            {FILTER_TABS.map(tab => {
              const count = tab.value === "all"
                ? leads.length
                : leads.filter(l => l.status === tab.value).length;
              return (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === tab.value
                      ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    filter === tab.value
                      ? "bg-violet-100 dark:bg-violet-800/40 text-violet-600 dark:text-violet-400"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <Twitter className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            {leads.length === 0
              ? "No leads yet. Trigger the Twitter pipeline from GitHub Actions."
              : "No leads in this filter."}
          </p>
        </div>
      ) : (
        <div className="px-4 md:px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(lead => (
              <LeadCard key={lead.id} lead={lead} onUpdate={handleUpdate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
