"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Briefcase, Twitter, ChevronLeft, ChevronRight, Sun, Moon } from "lucide-react";

const NAV = [
  { href: "/funded",  label: "Funded Companies", icon: Building2 },
  { href: "/jobs",    label: "Job Postings",      icon: Briefcase },
  { href: "/twitter", label: "Twitter Leads",     icon: Twitter   },
];

export default function Sidebar({
  collapsed,
  onToggle,
  isDark,
  onThemeToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  isDark: boolean;
  onThemeToggle: () => void;
}) {
  const path = usePathname();

  return (
    <aside className={`hidden md:flex fixed top-0 left-0 h-screen ${collapsed ? "w-14" : "w-52"} bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col z-20 transition-[width] duration-200 overflow-hidden`}>

      {/* Logo */}
      <div className="px-3 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">M</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">methun.design</p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Job Pipeline</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {!collapsed && (
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider px-2 mb-2">Pipeline</p>
        )}
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle + Collapse */}
      <div className="px-2 pb-4 pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-0.5">
        {/* Dark mode toggle */}
        <button
          onClick={onThemeToggle}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-2"} px-2.5 py-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors`}
        >
          {isDark
            ? <Sun className="w-3.5 h-3.5 shrink-0" />
            : <Moon className="w-3.5 h-3.5 shrink-0" />
          }
          {!collapsed && (
            <span className="text-xs">{isDark ? "Light mode" : "Dark mode"}</span>
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-2"} px-2.5 py-2 rounded-lg text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors`}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="text-xs">Collapse</span>
              </>
            )
          }
        </button>
      </div>
    </aside>
  );
}
