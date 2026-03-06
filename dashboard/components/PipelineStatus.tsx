"use client";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, Zap } from "lucide-react";
import type { PipelineRun } from "@/lib/types";

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

  const isFailed = lastRun?.status === "failed";
  const creditsLow = credits !== null && credits < 30;

  if (!isStale && !isFailed && !creditsLow) return null;

  return (
    <div className="space-y-2 mb-4">
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
            {isFailed && lastRun?.errors?.length > 0 && (
              <p className="text-amber-500 text-xs mt-0.5">
                {lastRun.errors.length} error(s) — check GitHub Actions logs
              </p>
            )}
          </div>
        </div>
      )}
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
