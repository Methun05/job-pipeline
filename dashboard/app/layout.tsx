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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash: apply dark class before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme');
              var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (t === 'dark' || (!t && d)) document.documentElement.classList.add('dark');
            } catch(e){}
          })();
        `}} />
      </head>
      <body className="min-h-screen bg-[#F5F5F4] dark:bg-[#0f0f10] text-zinc-900 dark:text-zinc-100 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
