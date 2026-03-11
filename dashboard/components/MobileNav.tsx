"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Briefcase } from "lucide-react";

const TABS = [
  { href: "/funded", label: "Funded", icon: Building2 },
  { href: "/jobs",   label: "Jobs",   icon: Briefcase  },
];

export default function MobileNav() {
  const path = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-zinc-950 border-t border-zinc-800/60 flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-medium transition-colors ${
              active ? "text-indigo-400" : "text-zinc-500"
            }`}
          >
            <Icon className={`w-5 h-5 ${active ? "text-indigo-400" : "text-zinc-500"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
