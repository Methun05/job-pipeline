import { Suspense } from "react";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen md:h-screen overflow-hidden flex flex-col">
      <Suspense>
        {children}
      </Suspense>
    </div>
  );
}
