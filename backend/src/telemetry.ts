import type { DevicePatch, DeviceStatus, Reading } from './db.ts';

export type ParsedReading = Omit<Reading, 'anomalyScore'>;

/** Readings stamped further than this from server time are re-stamped on arrival. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

function parseJsonObject(payload: Buffer | string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(payload.toString());
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'on') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'off') return false;
  return null;
}

/**
 * Parses a telemetry payload such as `{"temperature":48.2,"vibration":2.1,"current":11.8}`.
 * `ts` is optional and may be in seconds or milliseconds; devices without NTP simply omit it.
 */
export function parseTelemetry(payload: Buffer | string, now = Date.now()): ParsedReading | null {
  const data = parseJsonObject(payload);
  if (!data) return null;

  const values = {
    temperature: toNumber(data.temperature),
    vibration: toNumber(data.vibration),
    current: toNumber(data.current),
    humidity: toNumber(data.humidity),
  };
  if (Object.values(values).every((value) => value === null)) return null;

  let ts = toNumber(data.ts);
  if (ts !== null && ts < 1e12) ts *= 1000;
  if (ts === null || Math.abs(ts - now) > MAX_CLOCK_SKEW_MS) ts = now;

  return { ts: Math.round(ts), ...values, running: toBoolean(data.running) ?? true };
}

/** Accepts a bare `online`/`offline` string (typical for MQTT last-will messages) or `{"status":"online"}`. */
export function parseStatus(payload: Buffer | string): DeviceStatus | null {
  const text = payload.toString().trim();
  const status = text.startsWith('{') ? parseJsonObject(text)?.status : text;
  return status === 'online' || status === 'offline' ? status : null;
}

/** Parses the retained self-description a device publishes on connect, e.g. `{"name":"Air Compressor #1"}`. */
export function parseMeta(payload: Buffer | string): DevicePatch | null {
  const data = parseJsonObject(payload);
  if (!data) return null;
  const pick = (key: string, maxLength: number) => {
    const value = data[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, maxLength) : undefined;
  };
  const meta = { name: pick('name', 80), type: pick('type', 40), location: pick('location', 120) };
  return Object.values(meta).some((value) => value !== undefined) ? meta : null;
}

/** Parses the state a device reports back after executing a command, e.g. `{"relay":true}`. */
export function parseState(payload: Buffer | string): { relay: boolean } | null {
  const relay = toBoolean(parseJsonObject(payload)?.relay);
  return relay === null ? null : { relay };
}
