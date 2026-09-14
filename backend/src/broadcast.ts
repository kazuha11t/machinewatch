import type { Alert, Device, Reading } from './db.ts';

/** Live events pushed to connected dashboards and mobile apps. */
export interface Broadcaster {
  telemetry(deviceId: string, reading: Reading): void;
  scores(deviceId: string, points: { ts: number; anomalyScore: number | null }[]): void;
  device(device: Device): void;
  deviceRemoved(deviceId: string): void;
  alert(alert: Alert): void;
  alertUpdated(alert: Alert): void;
  alertsChanged(): void;
}

/**
 * Fans events out to any number of transports. Lets the HTTP app and ingestion
 * pipeline be wired up before the Socket.IO server (which needs the HTTP server) exists.
 */
export class BroadcastHub implements Broadcaster {
  readonly #targets: Broadcaster[] = [];

  add(target: Broadcaster): void {
    this.#targets.push(target);
  }

  telemetry(deviceId: string, reading: Reading): void {
    for (const target of this.#targets) target.telemetry(deviceId, reading);
  }

  scores(deviceId: string, points: { ts: number; anomalyScore: number | null }[]): void {
    for (const target of this.#targets) target.scores(deviceId, points);
  }

  device(device: Device): void {
    for (const target of this.#targets) target.device(device);
  }

  deviceRemoved(deviceId: string): void {
    for (const target of this.#targets) target.deviceRemoved(deviceId);
  }

  alert(alert: Alert): void {
    for (const target of this.#targets) target.alert(alert);
  }

  alertUpdated(alert: Alert): void {
    for (const target of this.#targets) target.alertUpdated(alert);
  }

  alertsChanged(): void {
    for (const target of this.#targets) target.alertsChanged();
  }
}
