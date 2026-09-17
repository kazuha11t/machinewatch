export type Metric = 'temperature' | 'vibration' | 'current' | 'humidity';
export type DeviceStatus = 'online' | 'offline';
export type HealthStatus = 'healthy' | 'warning' | 'critical';
export type Severity = 'warning' | 'critical';
export type AlertKind = 'threshold' | 'anomaly' | 'offline';
export type AlertState = 'open' | 'acknowledged' | 'all';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  location: string;
  status: DeviceStatus;
  lastSeen: number | null;
  relayState: boolean | null;
  healthScore: number | null;
  healthStatus: HealthStatus | null;
  aiStatus: 'learning' | 'ready' | null;
  aiProgress: number | null;
  hoursToLimit: number | null;
  /** Reported by simulator.py; false for physical nodes. */
  simulated: boolean;
  createdAt: number;
}

export interface Reading {
  ts: number;
  temperature: number | null;
  vibration: number | null;
  current: number | null;
  humidity: number | null;
  running: boolean;
  anomalyScore: number | null;
}

export interface Rule {
  id: number;
  deviceId: string | null;
  metric: Metric;
  operator: '>' | '<';
  threshold: number;
  severity: Severity;
  cooldownSec: number;
  enabled: boolean;
  createdAt: number;
}

export type RuleInput = Omit<Rule, 'id' | 'createdAt'>;

export interface Alert {
  id: number;
  deviceId: string;
  ruleId: number | null;
  kind: AlertKind;
  severity: Severity;
  message: string;
  value: number | null;
  ts: number;
  acknowledgedAt: number | null;
}

export interface Overview {
  devices: { total: number; online: number };
  alerts: { open: number; critical: number };
  averageHealth: number | null;
}

export interface TelemetryEvent {
  deviceId: string;
  reading: Reading;
}

export interface ScoresEvent {
  deviceId: string;
  points: { ts: number; anomalyScore: number | null }[];
}
