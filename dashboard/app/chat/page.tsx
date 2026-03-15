"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ChatPanel, { type JobContext } from "@/components/ChatPanel";

export default function ChatPage() {
  const searchParams = useSearchParams();
  const jobId        = searchParams.get("jobId");

  const [jobContext, setJobContext] = useState<JobContext | null>(null);

  useEffect(() => {
    if (!jobId) return;
    supabase
      .from("job_postings")
      .select("job_title, description_raw, companies(name)")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data) {
          setJobContext({
            title:       data.job_title,
            company:     (data.companies as any)?.name ?? "",
            description: data.description_raw ?? undefined,
          });
        }
      });
  }, [jobId]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 px-4 pb-4 pt-3">

      {/* Job context banner */}
      {jobContext && (
        <div className="flex items-center gap-2 px-4 py-2 mb-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-xl text-xs text-violet-700 dark:text-violet-300 shrink-0">
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium truncate">Context: {jobContext.title} at {jobContext.company}</span>
          <button onClick={() => setJobContext(null)} className="ml-auto text-violet-400 hover:text-violet-600 dark:hover:text-violet-200 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Empty state when no job context */}
      {!jobContext && !jobId && (
        <div className="flex items-center gap-2 px-4 py-2 mb-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-500 shrink-0">
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span>No job context — open chat from a job card for tailored answers, or just ask anything.</span>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ChatPanel jobContext={jobContext ?? undefined} />
      </div>
    </div>
  );
}
