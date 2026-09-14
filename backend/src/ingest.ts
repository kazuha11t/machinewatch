import { describeRuleHit, evaluateRules, formatDuration } from './alerts.ts';
import type { AiScoreResult, Scorer } from './ai-client.ts';
import type { Broadcaster } from './broadcast.ts';
import type { Alert, AlertInput, Device, Reading, Store } from './db.ts';
import { parseMeta, parseState, parseStatus, parseTelemetry } from './telemetry.ts';

export interface AlertNotifier {
  notify(alert: Alert, device: Device): void;
}

interface PendingReading {
  id: number;
  reading: Reading;
}

const ANOMALY_ALERT_COOLDOWN_MS = 5 * 60_000;
/** Upper bound on readings queued per device while the AI service is slow or down. */
const MAX_PENDING_BATCHES = 10;

export interface IngestOptions {
  store: Store;
  scorer: Scorer;
  broadcaster: Broadcaster;
  notifier: AlertNotifier;
  batchSize: number;
}

/** Turns raw MQTT messages into stored readings, device state, alerts and AI health scores. */
export class IngestService {
  readonly #store: Store;
  readonly #scorer: Scorer;
  readonly #broadcaster: Broadcaster;
  readonly #notifier: AlertNotifier;
  readonly #batchSize: number;
  readonly #pending = new Map<string, PendingReading[]>();
  readonly #scoring = new Map<string, Promise<void>>();

  constructor(options: IngestOptions) {
    this.#store = options.store;
    this.#scorer = options.scorer;
    this.#broadcaster = options.broadcaster;
    this.#notifier = options.notifier;
    this.#batchSize = Math.max(1, Math.floor(options.batchSize));
  }

  handleTelemetry(deviceId: string, payload: Buffer | string, now = Date.now()): Reading | null {
    const parsed = parseTelemetry(payload, now);
    if (!parsed) {
      console.warn(`[ingest] ignored malformed telemetry from ${deviceId}`);
      return null;
    }

    const { device, changed } = this.#store.touchDevice(deviceId, now);
    if (changed) this.#broadcaster.device(device);

    const id = this.#store.insertReading(deviceId, parsed);
    const reading: Reading = { ...parsed, anomalyScore: null };
    this.#broadcaster.telemetry(deviceId, reading);

    // A machine that was deliberately stopped is not "abnormal": skip rules and AI scoring.
    if (parsed.running) {
      this.#checkRules(device, reading, now);
      this.#queueForScoring(deviceId, { id, reading });
    }
    return reading;
  }

  handleStatus(deviceId: string, payload: Buffer | string, now = Date.now()): void {
    const status = parseStatus(payload);
    if (status === 'online') {
      const { device, changed } = this.#store.touchDevice(deviceId, now);
      if (changed) this.#broadcaster.device(device);
    } else if (status === 'offline') {
      const device = this.#store.getDevice(deviceId);
      if (device?.status === 'online') this.#markOffline(device, now);
    }
  }

  handleMeta(deviceId: string, payload: Buffer | string, now = Date.now()): void {
    const meta = parseMeta(payload);
    if (meta) this.#broadcaster.device(this.#store.applyMetadata(deviceId, meta, now));
  }

  handleState(deviceId: string, payload: Buffer | string): void {
    const state = parseState(payload);
    if (!state || !this.#store.getDevice(deviceId)) return;
    const device = this.#store.setRelayState(deviceId, state.relay);
    if (device) this.#broadcaster.device(device);
  }

  /** Catches devices that lost power without delivering their MQTT last-will message. */
  markStaleDevicesOffline(timeoutMs: number, now = Date.now()): void {
    for (const device of this.#store.findStaleDevices(now - timeoutMs)) this.#markOffline(device, now);
  }

  forgetDevice(deviceId: string): void {
    this.#pending.delete(deviceId);
  }

  /** Resolves once in-flight AI requests settle. Used by tests and graceful shutdown. */
  async flush(): Promise<void> {
    while (this.#scoring.size > 0) await Promise.all(this.#scoring.values());
  }

  #markOffline(device: Device, now: number): void {
    const updated = this.#store.setDeviceStatus(device.id, 'offline');
    if (!updated) return;
    this.#broadcaster.device(updated);
    this.#raise(
      { deviceId: device.id, ruleId: null, kind: 'offline', severity: 'warning', message: 'Device went offline', value: null, ts: now },
      updated,
    );
  }

  #checkRules(device: Device, reading: Reading, now: number): void {
    const rules = this.#store.activeRulesForDevice(device.id);
    const hits = evaluateRules(rules, reading, (ruleId) => this.#store.lastAlertAt(device.id, 'threshold', ruleId), now);
    for (const hit of hits) {
      this.#raise(
        {
          deviceId: device.id,
          ruleId: hit.rule.id,
          kind: 'threshold',
          severity: hit.rule.severity,
          message: describeRuleHit(hit),
          value: hit.value,
          ts: now,
        },
        device,
      );
    }
  }

  #raise(input: AlertInput, device: Device): void {
    const alert = this.#store.createAlert(input);
    this.#broadcaster.alert(alert);
    this.#notifier.notify(alert, device);
  }

  #queueForScoring(deviceId: string, item: PendingReading): void {
    const queue = this.#pending.get(deviceId) ?? [];
    queue.push(item);
    const max = this.#batchSize * MAX_PENDING_BATCHES;
    if (queue.length > max) queue.splice(0, queue.length - max);
    this.#pending.set(deviceId, queue);
    this.#scheduleScoring(deviceId);
  }

  #scheduleScoring(deviceId: string): void {
    const queue = this.#pending.get(deviceId);
    if (!queue || queue.length < this.#batchSize || this.#scoring.has(deviceId)) return;
    const batch = queue.splice(0, queue.length);
    const task = this.#score(deviceId, batch).finally(() => {
      this.#scoring.delete(deviceId);
      this.#scheduleScoring(deviceId);
    });
    this.#scoring.set(deviceId, task);
  }

  async #score(deviceId: string, batch: PendingReading[]): Promise<void> {
    const result = await this.#scorer.score(
      deviceId,
      batch.map((item) => item.reading),
    );
    if (!result) return;
    try {
      this.#applyScores(deviceId, batch, result);
    } catch (err) {
      // The device may have been deleted while the request was in flight.
      console.error(`[ingest] failed to apply AI scores for ${deviceId}:`, err);
    }
  }

  #applyScores(deviceId: string, batch: PendingReading[], result: AiScoreResult): void {
    if (!this.#store.getDevice(deviceId)) return;

    const points = batch.map((item, index) => ({
      id: item.id,
      ts: item.reading.ts,
      anomalyScore: result.scores[index] ?? null,
    }));
    this.#store.setAnomalyScores(points);
    const device = this.#store.updateHealth(deviceId, {
      healthScore: result.healthScore,
      healthStatus: result.healthStatus,
      aiStatus: result.status,
      aiProgress: result.progress,
      hoursToLimit: result.hoursToLimit,
    });
    if (!device) return;

    this.#broadcaster.scores(
      deviceId,
      points.map(({ ts, anomalyScore }) => ({ ts, anomalyScore })),
    );
    this.#broadcaster.device(device);

    // Alert only when most of the batch is abnormal AND the smoothed health has actually degraded,
    // so brief noise on an otherwise healthy machine does not page anyone.
    const anomalous = result.anomalies.filter(Boolean).length;
    const degraded = result.healthStatus === 'warning' || result.healthStatus === 'critical';
    if (result.status !== 'ready' || !degraded || anomalous * 2 < batch.length) return;

    const now = Date.now();
    const last = this.#store.lastAlertAt(deviceId, 'anomaly', null);
    if (last !== undefined && now - last < ANOMALY_ALERT_COOLDOWN_MS) return;

    let message = `AI detected abnormal behaviour: health ${Math.round(result.healthScore ?? 0)}/100`;
    if (result.hoursToLimit === 0) message += ', vibration limit exceeded';
    else if (result.hoursToLimit !== null) message += `, vibration limit expected in ~${formatDuration(result.hoursToLimit)}`;
    this.#raise(
      {
        deviceId,
        ruleId: null,
        kind: 'anomaly',
        severity: result.healthStatus === 'critical' ? 'critical' : 'warning',
        message,
        value: result.healthScore,
        ts: now,
      },
      device,
    );
  }
}
