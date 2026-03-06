"use client";
import Link from "next/link";
import { Building2, Briefcase } from "lucide-react";
import { cn } from "./ui";

export default function Navigation({ active }: { active: "funded" | "jobs" }) {
  const items = [
    { href: "/funded", label: "Funded",    icon: Building2, key: "funded" },
    { href: "/jobs",   label: "Job Posts", icon: Briefcase, key: "jobs"   },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-zinc-900/95 backdrop-blur border-t border-zinc-800">
      <div className="flex max-w-lg mx-auto">
        {items.map(({ href, label, icon: Icon, key }) => {
          const isActive = active === key;
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 transition-colors",
                isActive ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
      {/* iOS safe area */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  );
}
