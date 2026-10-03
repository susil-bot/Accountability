'use client';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '@/lib/format';
import { BAND_CSS_VAR } from '@/lib/bands';
import type { DaySummary } from '@/lib/types';

/** Recharts (~100 kB) is loaded only on the Insights page via next/dynamic. */
export default function DailyScoreChart({ days }: { days: DaySummary[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={days.map((d) => ({ day: formatDate(d.date, { weekday: 'short' }), score: d.isFuture ? 0 : d.dailyScore }))} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
        <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }} />
        <Bar dataKey="score" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {days.map((d) => (
            <Cell key={d.date} fill={BAND_CSS_VAR[d.band]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
