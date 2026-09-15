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

// Nominal state is deliberately uncolored (HUD convention: only anomalies get flagged).
// Warning is the sole amber use; critical reuses the one structural accent (red) rather than
// adding a second "alert" hue.
export const HEALTH_STYLES: Record<HealthStatus, { label: string; text: string; bg: string; border: string; stroke: string }> = {
  healthy: { label: 'NOMINAL', text: 'text-foreground', bg: 'bg-transparent', border: 'border-line', stroke: '#eaeaea' },
  warning: { label: 'WARNING', text: 'text-warn', bg: 'bg-warn/10', border: 'border-warn/50', stroke: '#d9a441' },
  critical: { label: 'CRITICAL', text: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/50', stroke: '#ff2a2a' },
};

export const SEVERITY_STYLES: Record<Severity, { text: string; bg: string; border: string }> = {
  warning: { text: 'text-warn', bg: 'bg-warn/10', border: 'border-warn/50' },
  critical: { text: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/50' },
};
