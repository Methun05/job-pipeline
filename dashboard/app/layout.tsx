import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Methun's job search dashboard",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0f0f10] text-zinc-100 antialiased">
        <Sidebar />
        <main className="ml-52 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
