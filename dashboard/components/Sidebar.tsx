"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Briefcase } from "lucide-react";

const NAV = [
  { href: "/funded", label: "Funded Companies", icon: Building2 },
  { href: "/jobs",   label: "Job Postings",     icon: Briefcase  },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen w-52 bg-zinc-950 border-r border-zinc-800/60 flex flex-col z-20">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">M</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-100 truncate">methun.design</p>
            <p className="text-[10px] text-zinc-600">Job Pipeline</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-2 mb-2">Pipeline</p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? "bg-indigo-600/20 text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
