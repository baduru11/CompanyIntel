import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  CartesianGrid,
} from "recharts";
import { useMemo } from "react";

function formatCount(value) {
  if (value == null) return "N/A";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] p-3.5 text-xs shadow-xl">
      <p className="font-semibold text-[hsl(var(--foreground))]">{data.date}</p>
      <p className="mt-1.5 text-emerald-400 font-semibold text-sm">
        {formatCount(data.count)} employees
      </p>
      {data.source && (
        <p className="mt-1 text-[hsl(var(--muted-foreground))] leading-relaxed">
          {data.source}
        </p>
      )}
    </div>
  );
}

export default function EmployeeChart({ history = [] }) {
  const chartData = useMemo(() => {
    if (!history.length) return [];
    return [...history]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((entry) => ({
        date: entry.date,
        count: typeof entry.count === "number" ? entry.count : parseInt(entry.count, 10) || 0,
        source: entry.source || "",
      }));
  }, [history]);

  if (history.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        No employee data available.
      </p>
    );
  }

  return (
    <div className="animate-init animate-fade-in-up h-64 w-full rounded-lg bg-[hsl(var(--background))]/50 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="employeeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(217 33% 14%)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(217 33% 14%)" }}
          />
          <YAxis
            tickFormatter={formatCount}
            tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }}
            tickLine={false}
            axisLine={false}
            width={55}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="transparent"
            fill="url(#employeeGradient)"
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
