import type { AiStatus, HealthStatus, SensorValues } from './db.ts';

export interface AiScoreResult {
  status: AiStatus;
  /** Share of the baseline collected, 0..1. Reaches 1 once the model is trained. */
  progress: number;
  /** Anomaly score per submitted reading, 0 (normal) .. 1 (highly abnormal). Null while learning. */
  scores: (number | null)[];
  anomalies: boolean[];
  healthScore: number | null;
  healthStatus: HealthStatus | null;
  hoursToLimit: number | null;
}

export interface Scorer {
  score(deviceId: string, readings: (SensorValues & { ts: number })[]): Promise<AiScoreResult | null>;
  resetModel(deviceId: string): Promise<boolean>;
  ping(): Promise<boolean>;
}

interface RawScoreResponse {
  status: AiStatus;
  progress: number;
  scores: (number | null)[];
  anomalies: boolean[];
  health_score: number | null;
  health_status: HealthStatus | null;
  hours_to_limit: number | null;
}

/** HTTP client for the Python AI service. Failures return null so ingestion keeps running without AI. */
export class AiClient implements Scorer {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  #reachable = true;

  constructor(baseUrl: string, timeoutMs = 5000) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = timeoutMs;
  }

  async score(deviceId: string, readings: (SensorValues & { ts: number })[]): Promise<AiScoreResult | null> {
    const data = (await this.#request('POST', '/score', {
      device_id: deviceId,
      readings: readings.map(({ ts, temperature, vibration, current }) => ({ ts, temperature, vibration, current })),
    })) as RawScoreResponse | null;
    if (!data) return null;
    return {
      status: data.status,
      progress: data.progress,
      scores: data.scores,
      anomalies: data.anomalies,
      healthScore: data.health_score,
      healthStatus: data.health_status,
      hoursToLimit: data.hours_to_limit,
    };
  }

  async resetModel(deviceId: string): Promise<boolean> {
    return (await this.#request('DELETE', `/models/${encodeURIComponent(deviceId)}`)) !== null;
  }

  async ping(): Promise<boolean> {
    return (await this.#request('GET', '/health')) !== null;
  }

  async #request(method: string, path: string, body?: unknown): Promise<unknown> {
    try {
      const response = await fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json: unknown = await response.json();
      if (!this.#reachable) {
        console.info('[ai] service is reachable again, scoring resumed');
        this.#reachable = true;
      }
      return json;
    } catch (err) {
      if (this.#reachable) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[ai] ${method} ${path} failed (${reason}); readings are stored without AI scores until it recovers`);
        this.#reachable = false;
      }
      return null;
    }
  }
}
