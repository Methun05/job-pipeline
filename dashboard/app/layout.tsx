import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Methun's job search dashboard",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F5F5F4] text-zinc-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
