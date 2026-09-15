import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatClock, formatDateTime } from '../lib/format';
import type { Reading } from '../lib/types';
import { Panel } from './ui';

export interface ChartReference {
  value: number;
  label: string;
  color: string;
}

interface TelemetryChartProps {
  title: string;
  unit: string;
  color: string;
  dataKey: keyof Reading;
  data: Reading[];
  from: number;
  to: number;
  digits?: number;
  references?: ChartReference[];
  domain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMax'];
  latest?: number | null;
}

export function TelemetryChart({ title, unit, color, dataKey, data, from, to, digits = 1, references = [], domain, latest }: TelemetryChartProps) {
  const spanMs = to - from;
  const tickFormatter = (ts: number) =>
    spanMs > 6 * 3_600_000
      ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : formatClock(ts).slice(0, spanMs > 20 * 60_000 ? 5 : 8);

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="label text-[11px] font-bold text-foreground">{title}</h3>
        <p className="tabular font-mono text-lg font-bold" style={{ color }}>
          {latest === null || latest === undefined ? '—' : latest.toFixed(digits)}
          <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
        </p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#2b2b2b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={[from, to]}
              tickFormatter={tickFormatter}
              stroke="#7a7a7a"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis stroke="#7a7a7a" tickLine={false} axisLine={false} width={48} domain={domain ?? ['auto', 'auto']} allowDecimals />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: '#4a4a4a' }}
              content={({ active, payload }) => {
                const point = payload?.[0];
                if (!active || !point || typeof point.value !== 'number') return null;
                return (
                  <div className="label border border-line bg-panel-raised px-3 py-2 text-[10px]">
                    <p className="text-muted">{formatDateTime((point.payload as Reading).ts)}</p>
                    <p className="tabular mt-0.5 font-mono text-xs font-bold" style={{ color }}>
                      {point.value.toFixed(digits)} {unit}
                    </p>
                  </div>
                );
              }}
            />
            {references.map((reference) => (
              <ReferenceLine
                key={reference.label}
                y={reference.value}
                stroke={reference.color}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: reference.label, position: 'insideTopRight', fill: reference.color, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              />
            ))}
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.75}
              fill={color}
              fillOpacity={0.12}
              isAnimationActive={false}
              dot={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
