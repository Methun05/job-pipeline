"use client";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, XCircle, Zap } from "lucide-react";
import type { PipelineRun } from "@/lib/types";

// Sources that returning 0 is suspicious vs genuinely just slow boards
const EXPECTED_ACTIVE_SOURCES = [
  "web3career", "cryptojobslist", "cryptocurrencyjobs",
  "hashtagweb3", "paradigm", "a16zcrypto",
];

export default function PipelineStatus({
  lastRun,
  credits,
}: {
  lastRun: PipelineRun | null;
  credits: number | null;
}) {
  const isStale =
    !lastRun?.completed_at ||
    Date.now() - new Date(lastRun.completed_at).getTime() > 28 * 60 * 60 * 1000;

  const isFailed  = lastRun?.status === "failed";
  const creditsLow = credits !== null && credits < 30;

  // Fetcher errors (threw exception — source_counts[name] === -1)
  const fetcherErrors = (lastRun?.errors ?? []).filter(
    (e) => EXPECTED_ACTIVE_SOURCES.includes(e.source)
  );

  // Sources that returned 0 silently (no exception, but empty result)
  const silentZeros = EXPECTED_ACTIVE_SOURCES.filter((name) => {
    const count = lastRun?.source_counts?.[name];
    return count === 0 && !fetcherErrors.find((e) => e.source === name);
  });

  const hasSourceIssues = fetcherErrors.length > 0 || silentZeros.length > 0;

  if (!isStale && !isFailed && !creditsLow && !hasSourceIssues) return null;

  return (
    <div className="space-y-2 mb-4">
      {/* Pipeline didn't run / hard failed */}
      {(isStale || isFailed) && (
        <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-800/50 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="text-amber-300 font-medium">
              {isFailed ? "Last pipeline run failed" : "Pipeline hasn't run recently"}
            </p>
            {lastRun?.completed_at && (
              <p className="text-amber-500 text-xs mt-0.5">
                Last completed {formatDistanceToNow(new Date(lastRun.completed_at))} ago
              </p>
            )}
          </div>
        </div>
      )}

      {/* Source-level issues (broken fetchers or silent zeros) */}
      {hasSourceIssues && (
        <div className="flex items-start gap-3 bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="text-red-300 font-medium">
              {fetcherErrors.length + silentZeros.length} job source
              {fetcherErrors.length + silentZeros.length > 1 ? "s" : ""} may be broken
              — you could be missing jobs
            </p>
            {fetcherErrors.map((e) => (
              <p key={e.source} className="text-red-400 text-xs">
                <span className="font-mono">{e.source}</span>: fetch error — {e.message.slice(0, 80)}
              </p>
            ))}
            {silentZeros.map((name) => (
              <p key={name} className="text-red-400 text-xs">
                <span className="font-mono">{name}</span>: returned 0 jobs (may be broken)
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Apollo credits low */}
      {creditsLow && (
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
          <Zap className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <span className="font-medium">Apollo credits low:</span>{" "}
            {credits} remaining — email reveal will soon stop working
          </p>
        </div>
      )}
    </div>
  );
}
