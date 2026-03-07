"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

interface DayData {
  date:   string;
  funded: number;
  jobs?:  number;
}

export default function ActivityChart({ data }: { data: DayData[] }) {
  const hasJobs = data.some(d => (d.jobs ?? 0) > 0);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
      <p className="text-sm font-semibold text-zinc-300 mb-4">Weekly Activity</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid vertical={false} stroke="#27272a" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={20}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border:     "1px solid #27272a",
              borderRadius: "12px",
              color:      "#fafafa",
              fontSize:   12,
            }}
            cursor={{ fill: "#27272a" }}
          />
          <Bar dataKey="funded" name="Funded"    fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={24} />
          {hasJobs && <Bar dataKey="jobs" name="Job Posts" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={24} />}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-center">
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Funded companies
        </span>
        {hasJobs && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Job postings
          </span>
        )}
      </div>
    </div>
  );
}
