import type { HealthStatus, Metric, Severity } from './types';

export const colors = {
  surface: '#0b1220',
  panel: '#111a2d',
  panelRaised: '#16223a',
  line: '#22304b',
  text: '#e2e8f0',
  textStrong: '#f8fafc',
  muted: '#8594b0',
  accent: '#38bdf8',
  ok: '#34d399',
  warn: '#fbbf24',
  bad: '#f87171',
  track: '#1e293b',
};

export const radius = { sm: 8, md: 12, lg: 16 };

export const METRIC_INFO: Record<Metric, { label: string; unit: string; color: string; digits: number }> = {
  temperature: { label: 'Temp', unit: '°C', color: '#fb923c', digits: 1 },
  vibration: { label: 'Vibration', unit: 'mm/s', color: '#38bdf8', digits: 2 },
  current: { label: 'Current', unit: 'A', color: '#a78bfa', digits: 1 },
  humidity: { label: 'Humidity', unit: '%', color: '#2dd4bf', digits: 0 },
};

export const HEALTH_COLORS: Record<HealthStatus, string> = {
  healthy: colors.ok,
  warning: colors.warn,
  critical: colors.bad,
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  warning: colors.warn,
  critical: colors.bad,
};

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
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} days`;
}
