"use client";
import { useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className={`min-h-screen transition-[margin] duration-200 ${collapsed ? "ml-14" : "ml-52"}`}>
        {children}
      </main>
    </>
  );
}
