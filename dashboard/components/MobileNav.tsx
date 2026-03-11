"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Briefcase, Sun, Moon } from "lucide-react";

const TABS = [
  { href: "/funded", label: "Funded", icon: Building2 },
  { href: "/jobs",   label: "Jobs",   icon: Briefcase  },
];

export default function MobileNav({
  isDark,
  onThemeToggle,
}: {
  isDark: boolean;
  onThemeToggle: () => void;
}) {
  const path = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-medium transition-colors ${
              active
                ? "text-violet-600 dark:text-violet-400"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            <Icon className={`w-5 h-5`} />
            {label}
          </Link>
        );
      })}

      {/* Theme toggle */}
      <button
        onClick={onThemeToggle}
        className="flex flex-col items-center justify-center gap-1 py-3 px-4 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 transition-colors"
      >
        {isDark
          ? <Sun className="w-5 h-5" />
          : <Moon className="w-5 h-5" />
        }
        {isDark ? "Light" : "Dark"}
      </button>
    </nav>
  );
}
