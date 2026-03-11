"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <MobileNav />
      <main className={`min-h-screen transition-[margin] duration-200 pb-16 md:pb-0 ${collapsed ? "md:ml-14" : "md:ml-52"}`}>
        {children}
      </main>
    </>
  );
}
