"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "./ui";

export default function CopyButton({
  text,
  label = "Copy Message",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className={cn(
        "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all active:scale-95",
        copied
          ? "bg-emerald-900/60 text-emerald-400 border border-emerald-700"
          : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700",
        className
      )}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied!" : label}
    </button>
  );
}
