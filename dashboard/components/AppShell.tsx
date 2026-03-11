"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark]       = useState(false);
  const pathname = usePathname();

  // Sync state with whatever the flash-prevention script already set
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        isDark={isDark}
        onThemeToggle={toggleTheme}
      />
      <MobileNav isDark={isDark} onThemeToggle={toggleTheme} />
      <main className={`min-h-screen transition-[margin] duration-200 pb-16 md:pb-0 ${collapsed ? "md:ml-14" : "md:ml-52"}`}>
        {children}
      </main>
    </>
  );
}
