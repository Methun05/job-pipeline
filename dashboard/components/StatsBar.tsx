"use client";
import { TrendingUp, Send, MessageSquare, Briefcase } from "lucide-react";

interface Stats {
  newToday:        number;
  totalContacted:  number;
  totalReplies:    number;
  totalApplied:    number;
}

export default function StatsBar({ stats }: { stats: Stats }) {
  const items = [
    { label: "New today",  value: stats.newToday,       icon: TrendingUp,     color: "text-indigo-400" },
    { label: "Contacted",  value: stats.totalContacted, icon: Send,           color: "text-blue-400"   },
    { label: "Replies",    value: stats.totalReplies,   icon: MessageSquare,  color: "text-emerald-400"},
    { label: "Applied",    value: stats.totalApplied,   icon: Briefcase,      color: "text-amber-400"  },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
          <p className="text-xl font-bold text-zinc-100">{value}</p>
          <p className="text-[10px] text-zinc-500 leading-tight">{label}</p>
        </div>
      ))}
    </div>
  );
}
