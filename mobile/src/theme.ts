import { Platform } from 'react-native';
import type { HealthStatus, Metric, Severity } from './types';

// Deactivated-CRT palette, matching the web dashboard's Tactical Telemetry redesign.
// Red is the single structural accent, reserved for destructive actions and critical state.
// Green is reserved exclusively for the live-connection indicator — never reused elsewhere.
export const colors = {
  surface: '#0a0a0a',
  panel: '#111111',
  panelRaised: '#1a1a1a',
  line: '#2b2b2b',
  text: '#eaeaea',
  textStrong: '#ffffff',
  muted: '#7a7a7a',
  accent: '#ff2a2a',
  live: '#4af626',
  warn: '#d9a441',
  bad: '#ff2a2a',
  track: '#2b2b2b',
};

// No border-radius anywhere — corners stay square.
export const radius = { sm: 0, md: 0, lg: 0 };

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const METRIC_INFO: Record<Metric, { label: string; unit: string; color: string; digits: number }> = {
  temperature: { label: 'Temp', unit: '°C', color: '#fb923c', digits: 1 },
  vibration: { label: 'Vibration', unit: 'mm/s', color: '#38bdf8', digits: 2 },
  current: { label: 'Current', unit: 'A', color: '#a78bfa', digits: 1 },
  humidity: { label: 'Humidity', unit: '%', color: '#2dd4bf', digits: 0 },
};

// Nominal state is deliberately uncolored (HUD convention: only anomalies get flagged).
export const HEALTH_COLORS: Record<HealthStatus, string> = {
  healthy: colors.text,
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
