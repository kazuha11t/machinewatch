import type { HealthStatus, Metric, Severity } from './types';

export const METRIC_INFO: Record<Metric, { label: string; unit: string; color: string; digits: number }> = {
  temperature: { label: 'Temperature', unit: '°C', color: '#fb923c', digits: 1 },
  vibration: { label: 'Vibration', unit: 'mm/s', color: '#38bdf8', digits: 2 },
  current: { label: 'Current', unit: 'A', color: '#a78bfa', digits: 1 },
  humidity: { label: 'Humidity', unit: '%', color: '#2dd4bf', digits: 0 },
};

export const METRICS = Object.keys(METRIC_INFO) as Metric[];

/** ISO 10816-3 zone boundaries for medium machines (mm/s RMS). */
export const VIBRATION_WARNING = 4.5;
export const VIBRATION_LIMIT = 7.1;

export function formatValue(metric: Metric, value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(METRIC_INFO[metric].digits);
}

export function timeAgo(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'never';
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} days`;
}

export const HEALTH_STYLES: Record<HealthStatus, { label: string; text: string; bg: string; stroke: string }> = {
  healthy: { label: 'Healthy', text: 'text-ok', bg: 'bg-ok/10', stroke: '#34d399' },
  warning: { label: 'Warning', text: 'text-warn', bg: 'bg-warn/10', stroke: '#fbbf24' },
  critical: { label: 'Critical', text: 'text-bad', bg: 'bg-bad/10', stroke: '#f87171' },
};

export const SEVERITY_STYLES: Record<Severity, { text: string; bg: string; ring: string }> = {
  warning: { text: 'text-warn', bg: 'bg-warn/10', ring: 'ring-warn/30' },
  critical: { text: 'text-bad', bg: 'bg-bad/10', ring: 'ring-bad/30' },
};
