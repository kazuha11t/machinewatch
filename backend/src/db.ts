import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Metric } from './metrics.ts';

export type DeviceStatus = 'online' | 'offline';
export type HealthStatus = 'healthy' | 'warning' | 'critical';
export type AiStatus = 'learning' | 'ready';
export type Severity = 'warning' | 'critical';
export type AlertKind = 'threshold' | 'anomaly' | 'offline';
export type Operator = '>' | '<';
export type AlertState = 'open' | 'acknowledged' | 'all';

export interface User {
  id: number;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
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
  aiStatus: AiStatus | null;
  aiProgress: number | null;
  hoursToLimit: number | null;
  createdAt: number;
}

export type DevicePatch = Partial<Pick<Device, 'name' | 'type' | 'location'>>;
export type HealthUpdate = Pick<Device, 'healthScore' | 'healthStatus' | 'aiStatus' | 'aiProgress' | 'hoursToLimit'>;

export interface SensorValues {
  temperature: number | null;
  vibration: number | null;
  current: number | null;
  humidity: number | null;
}

export interface Reading extends SensorValues {
  ts: number;
  running: boolean;
  anomalyScore: number | null;
}

export interface Rule {
  id: number;
  deviceId: string | null;
  metric: Metric;
  operator: Operator;
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

export type AlertInput = Omit<Alert, 'id' | 'acknowledgedAt'>;

export interface Overview {
  devices: { total: number; online: number };
  alerts: { open: number; critical: number };
  averageHealth: number | null;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'machine',
  location       TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'offline',
  last_seen      INTEGER,
  relay_state    INTEGER,
  health_score   REAL,
  health_status  TEXT,
  ai_status      TEXT,
  ai_progress    REAL,
  hours_to_limit REAL,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  ts            INTEGER NOT NULL,
  temperature   REAL,
  vibration     REAL,
  current       REAL,
  humidity      REAL,
  running       INTEGER NOT NULL DEFAULT 1,
  anomaly_score REAL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_id, ts);

CREATE TABLE IF NOT EXISTS rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    TEXT REFERENCES devices(id) ON DELETE CASCADE,
  metric       TEXT NOT NULL,
  operator     TEXT NOT NULL CHECK (operator IN ('>', '<')),
  threshold    REAL NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  cooldown_sec INTEGER NOT NULL DEFAULT 300,
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  rule_id         INTEGER REFERENCES rules(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  severity        TEXT NOT NULL,
  message         TEXT NOT NULL,
  value           REAL,
  ts              INTEGER NOT NULL,
  acknowledged_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
CREATE INDEX IF NOT EXISTS idx_alerts_lookup ON alerts(device_id, kind, rule_id, ts);

CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
`;

const DEFAULT_RULES: RuleInput[] = [
  { deviceId: null, metric: 'temperature', operator: '>', threshold: 85, severity: 'critical', cooldownSec: 300, enabled: true },
  { deviceId: null, metric: 'vibration', operator: '>', threshold: 7.1, severity: 'critical', cooldownSec: 300, enabled: true },
  { deviceId: null, metric: 'vibration', operator: '>', threshold: 4.5, severity: 'warning', cooldownSec: 600, enabled: true },
  { deviceId: null, metric: 'current', operator: '>', threshold: 25, severity: 'warning', cooldownSec: 300, enabled: true },
];

type Row = Record<string, unknown>;

const nullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function toUser(row: Row): User {
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    createdAt: Number(row.created_at),
  };
}

function toDevice(row: Row): Device {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type),
    location: String(row.location),
    status: row.status as DeviceStatus,
    lastSeen: nullableNumber(row.last_seen),
    relayState: row.relay_state === null ? null : Number(row.relay_state) === 1,
    healthScore: nullableNumber(row.health_score),
    healthStatus: (row.health_status as HealthStatus | null) ?? null,
    aiStatus: (row.ai_status as AiStatus | null) ?? null,
    aiProgress: nullableNumber(row.ai_progress),
    hoursToLimit: nullableNumber(row.hours_to_limit),
    createdAt: Number(row.created_at),
  };
}

function toReading(row: Row): Reading {
  return {
    ts: Number(row.ts),
    temperature: nullableNumber(row.temperature),
    vibration: nullableNumber(row.vibration),
    current: nullableNumber(row.current),
    humidity: nullableNumber(row.humidity),
    running: Number(row.running) === 1,
    anomalyScore: nullableNumber(row.anomaly_score),
  };
}

function toRule(row: Row): Rule {
  return {
    id: Number(row.id),
    deviceId: row.device_id === null ? null : String(row.device_id),
    metric: row.metric as Metric,
    operator: row.operator as Operator,
    threshold: Number(row.threshold),
    severity: row.severity as Severity,
    cooldownSec: Number(row.cooldown_sec),
    enabled: Number(row.enabled) === 1,
    createdAt: Number(row.created_at),
  };
}

function toAlert(row: Row): Alert {
  return {
    id: Number(row.id),
    deviceId: String(row.device_id),
    ruleId: nullableNumber(row.rule_id),
    kind: row.kind as AlertKind,
    severity: row.severity as Severity,
    message: String(row.message),
    value: nullableNumber(row.value),
    ts: Number(row.ts),
    acknowledgedAt: nullableNumber(row.acknowledged_at),
  };
}

/** Synchronous SQLite repository. All timestamps are Unix epoch milliseconds. */
export class Store {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  #get(sql: string, ...params: (string | number | null)[]): Row | undefined {
    return this.#db.prepare(sql).get(...params) as Row | undefined;
  }

  #all(sql: string, ...params: (string | number | null)[]): Row[] {
    return this.#db.prepare(sql).all(...params) as Row[];
  }

  #run(sql: string, ...params: (string | number | null)[]) {
    return this.#db.prepare(sql).run(...params);
  }

  #transaction<T>(fn: () => T): T {
    this.#db.exec('BEGIN');
    try {
      const result = fn();
      this.#db.exec('COMMIT');
      return result;
    } catch (err) {
      this.#db.exec('ROLLBACK');
      throw err;
    }
  }

  // ---- users -------------------------------------------------------------

  countUsers(): number {
    return Number(this.#get('SELECT COUNT(*) AS n FROM users')?.n ?? 0);
  }

  createUser(email: string, name: string, passwordHash: string, now = Date.now()): User {
    const { lastInsertRowid } = this.#run(
      'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
      email.toLowerCase(),
      name,
      passwordHash,
      now,
    );
    return this.findUserById(Number(lastInsertRowid))!;
  }

  findUserByEmail(email: string): User | undefined {
    const row = this.#get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
    return row && toUser(row);
  }

  findUserById(id: number): User | undefined {
    const row = this.#get('SELECT * FROM users WHERE id = ?', id);
    return row && toUser(row);
  }

  // ---- devices -----------------------------------------------------------

  listDevices(): Device[] {
    return this.#all('SELECT * FROM devices ORDER BY name COLLATE NOCASE').map(toDevice);
  }

  getDevice(id: string): Device | undefined {
    const row = this.#get('SELECT * FROM devices WHERE id = ?', id);
    return row && toDevice(row);
  }

  /** Registers unknown devices on first contact and marks the device online. */
  touchDevice(id: string, now = Date.now()): { device: Device; changed: boolean } {
    const existing = this.getDevice(id);
    if (!existing) {
      this.#run(
        "INSERT INTO devices (id, name, status, last_seen, created_at) VALUES (?, ?, 'online', ?, ?)",
        id,
        id,
        now,
        now,
      );
      return { device: this.getDevice(id)!, changed: true };
    }
    this.#run("UPDATE devices SET status = 'online', last_seen = ? WHERE id = ?", now, id);
    return { device: { ...existing, status: 'online', lastSeen: now }, changed: existing.status !== 'online' };
  }

  updateDevice(id: string, patch: DevicePatch): Device | undefined {
    const columns = (['name', 'type', 'location'] as const).filter((key) => patch[key] !== undefined);
    if (columns.length > 0) {
      const assignments = columns.map((key) => `${key} = ?`).join(', ');
      this.#run(`UPDATE devices SET ${assignments} WHERE id = ?`, ...columns.map((key) => patch[key]!), id);
    }
    return this.getDevice(id);
  }

  /** Applies device-reported metadata, filling only fields an operator has not customised. */
  applyMetadata(id: string, meta: DevicePatch, now = Date.now()): Device {
    this.#run('INSERT INTO devices (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING', id, id, now);
    const name = meta.name ?? null;
    const type = meta.type ?? null;
    const location = meta.location ?? null;
    this.#run(
      `UPDATE devices
          SET name     = CASE WHEN name = id AND ? IS NOT NULL THEN ? ELSE name END,
              type     = CASE WHEN type = 'machine' AND ? IS NOT NULL THEN ? ELSE type END,
              location = CASE WHEN location = '' AND ? IS NOT NULL THEN ? ELSE location END
        WHERE id = ?`,
      name,
      name,
      type,
      type,
      location,
      location,
      id,
    );
    return this.getDevice(id)!;
  }

  setDeviceStatus(id: string, status: DeviceStatus): Device | undefined {
    this.#run('UPDATE devices SET status = ? WHERE id = ?', status, id);
    return this.getDevice(id);
  }

  setRelayState(id: string, relayState: boolean): Device | undefined {
    this.#run('UPDATE devices SET relay_state = ? WHERE id = ?', relayState ? 1 : 0, id);
    return this.getDevice(id);
  }

  updateHealth(id: string, health: HealthUpdate): Device | undefined {
    this.#run(
      `UPDATE devices
         SET health_score = ?, health_status = ?, ai_status = ?, ai_progress = ?, hours_to_limit = ?
       WHERE id = ?`,
      health.healthScore,
      health.healthStatus,
      health.aiStatus,
      health.aiProgress,
      health.hoursToLimit,
      id,
    );
    return this.getDevice(id);
  }

  deleteDevice(id: string): boolean {
    return Number(this.#run('DELETE FROM devices WHERE id = ?', id).changes) > 0;
  }

  findStaleDevices(lastSeenBefore: number): Device[] {
    return this.#all("SELECT * FROM devices WHERE status = 'online' AND last_seen < ?", lastSeenBefore).map(toDevice);
  }

  // ---- telemetry ---------------------------------------------------------

  insertReading(deviceId: string, reading: Omit<Reading, 'anomalyScore'>): number {
    const { lastInsertRowid } = this.#run(
      `INSERT INTO telemetry (device_id, ts, temperature, vibration, current, humidity, running)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      deviceId,
      reading.ts,
      reading.temperature,
      reading.vibration,
      reading.current,
      reading.humidity,
      reading.running ? 1 : 0,
    );
    return Number(lastInsertRowid);
  }

  setAnomalyScores(points: { id: number; anomalyScore: number | null }[]): void {
    const statement = this.#db.prepare('UPDATE telemetry SET anomaly_score = ? WHERE id = ?');
    this.#transaction(() => {
      for (const point of points) statement.run(point.anomalyScore, point.id);
    });
  }

  /** Returns raw readings, or time-bucketed averages when the range holds more than `maxPoints`. */
  queryReadings(deviceId: string, from: number, to: number, maxPoints: number): Reading[] {
    const count = Number(
      this.#get('SELECT COUNT(*) AS n FROM telemetry WHERE device_id = ? AND ts BETWEEN ? AND ?', deviceId, from, to)?.n ?? 0,
    );
    if (count <= maxPoints) {
      return this.#all(
        'SELECT * FROM telemetry WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts',
        deviceId,
        from,
        to,
      ).map(toReading);
    }
    // Inlined as a validated integer: bound JS numbers can arrive as REAL and turn this into float division.
    const bucketMs = Math.max(1, Math.ceil((to - from) / maxPoints));
    return this.#all(
      `SELECT (ts / ${bucketMs}) * ${bucketMs} AS bucket_ts,
              AVG(temperature) AS temperature, AVG(vibration) AS vibration,
              AVG(current) AS current, AVG(humidity) AS humidity,
              MAX(running) AS running, MAX(anomaly_score) AS anomaly_score
         FROM telemetry
        WHERE device_id = ? AND ts BETWEEN ? AND ?
        GROUP BY bucket_ts
        ORDER BY bucket_ts`,
      deviceId,
      from,
      to,
    ).map((row) => toReading({ ...row, ts: row.bucket_ts }));
  }

  *iterateReadings(deviceId: string, from: number, to: number): Generator<Reading> {
    const rows = this.#db
      .prepare('SELECT * FROM telemetry WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts')
      .iterate(deviceId, from, to);
    for (const row of rows) yield toReading(row as Row);
  }

  pruneReadings(olderThan: number): number {
    return Number(this.#run('DELETE FROM telemetry WHERE ts < ?', olderThan).changes);
  }

  // ---- rules -------------------------------------------------------------

  listRules(): Rule[] {
    return this.#all('SELECT * FROM rules ORDER BY device_id IS NOT NULL, device_id, metric, threshold').map(toRule);
  }

  getRule(id: number): Rule | undefined {
    const row = this.#get('SELECT * FROM rules WHERE id = ?', id);
    return row && toRule(row);
  }

  activeRulesForDevice(deviceId: string): Rule[] {
    return this.#all('SELECT * FROM rules WHERE enabled = 1 AND (device_id IS NULL OR device_id = ?)', deviceId).map(toRule);
  }

  createRule(input: RuleInput, now = Date.now()): Rule {
    const { lastInsertRowid } = this.#run(
      `INSERT INTO rules (device_id, metric, operator, threshold, severity, cooldown_sec, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.deviceId,
      input.metric,
      input.operator,
      input.threshold,
      input.severity,
      input.cooldownSec,
      input.enabled ? 1 : 0,
      now,
    );
    return this.getRule(Number(lastInsertRowid))!;
  }

  updateRule(id: number, patch: Partial<RuleInput>): Rule | undefined {
    const current = this.getRule(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.#run(
      `UPDATE rules SET device_id = ?, metric = ?, operator = ?, threshold = ?, severity = ?, cooldown_sec = ?, enabled = ?
       WHERE id = ?`,
      next.deviceId,
      next.metric,
      next.operator,
      next.threshold,
      next.severity,
      next.cooldownSec,
      next.enabled ? 1 : 0,
      id,
    );
    return this.getRule(id);
  }

  deleteRule(id: number): boolean {
    return Number(this.#run('DELETE FROM rules WHERE id = ?', id).changes) > 0;
  }

  ensureDefaultRules(): void {
    if (Number(this.#get('SELECT COUNT(*) AS n FROM rules')?.n ?? 0) > 0) return;
    this.#transaction(() => {
      for (const rule of DEFAULT_RULES) this.createRule(rule);
    });
  }

  // ---- alerts ------------------------------------------------------------

  createAlert(input: AlertInput): Alert {
    const { lastInsertRowid } = this.#run(
      `INSERT INTO alerts (device_id, rule_id, kind, severity, message, value, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.deviceId,
      input.ruleId,
      input.kind,
      input.severity,
      input.message,
      input.value,
      input.ts,
    );
    return toAlert(this.#get('SELECT * FROM alerts WHERE id = ?', Number(lastInsertRowid))!);
  }

  listAlerts(filter: { deviceId?: string; state: AlertState; limit: number }): Alert[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.deviceId) {
      where.push('device_id = ?');
      params.push(filter.deviceId);
    }
    if (filter.state === 'open') where.push('acknowledged_at IS NULL');
    if (filter.state === 'acknowledged') where.push('acknowledged_at IS NOT NULL');
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    return this.#all(`SELECT * FROM alerts ${clause} ORDER BY ts DESC, id DESC LIMIT ?`, ...params, filter.limit).map(toAlert);
  }

  acknowledgeAlert(id: number, now = Date.now()): Alert | undefined {
    this.#run('UPDATE alerts SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL', now, id);
    const row = this.#get('SELECT * FROM alerts WHERE id = ?', id);
    return row && toAlert(row);
  }

  acknowledgeAll(now = Date.now(), deviceId?: string): number {
    const result = deviceId
      ? this.#run('UPDATE alerts SET acknowledged_at = ? WHERE acknowledged_at IS NULL AND device_id = ?', now, deviceId)
      : this.#run('UPDATE alerts SET acknowledged_at = ? WHERE acknowledged_at IS NULL', now);
    return Number(result.changes);
  }

  lastAlertAt(deviceId: string, kind: AlertKind, ruleId: number | null): number | undefined {
    const row = this.#get(
      'SELECT MAX(ts) AS ts FROM alerts WHERE device_id = ? AND kind = ? AND rule_id IS ?',
      deviceId,
      kind,
      ruleId,
    );
    return row?.ts === null || row?.ts === undefined ? undefined : Number(row.ts);
  }

  // ---- push tokens -------------------------------------------------------

  addPushToken(token: string, userId: number, now = Date.now()): void {
    this.#run(
      'INSERT INTO push_tokens (token, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id',
      token,
      userId,
      now,
    );
  }

  removePushToken(token: string): void {
    this.#run('DELETE FROM push_tokens WHERE token = ?', token);
  }

  listPushTokens(): string[] {
    return this.#all('SELECT token FROM push_tokens').map((row) => String(row.token));
  }

  // ---- dashboard ---------------------------------------------------------

  overview(): Overview {
    const devices = this.#get(
      "SELECT COUNT(*) AS total, SUM(status = 'online') AS online, AVG(health_score) AS health FROM devices",
    )!;
    const alerts = this.#get(
      "SELECT COUNT(*) AS open, SUM(severity = 'critical') AS critical FROM alerts WHERE acknowledged_at IS NULL",
    )!;
    return {
      devices: { total: Number(devices.total), online: Number(devices.online ?? 0) },
      alerts: { open: Number(alerts.open), critical: Number(alerts.critical ?? 0) },
      averageHealth: nullableNumber(devices.health),
    };
  }
}
