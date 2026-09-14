import type { AiScoreResult, Scorer } from '../src/ai-client.ts';
import type { Broadcaster } from '../src/broadcast.ts';
import type { Alert, Device, Reading } from '../src/db.ts';
import type { AlertNotifier } from '../src/ingest.ts';
import type { CommandPublisher, DeviceCommand } from '../src/mqtt.ts';

export class RecordingBroadcaster implements Broadcaster {
  readonly events: { type: string; payload: unknown }[] = [];

  telemetry(deviceId: string, reading: Reading) {
    this.events.push({ type: 'telemetry', payload: { deviceId, reading } });
  }
  scores(deviceId: string, points: { ts: number; anomalyScore: number | null }[]) {
    this.events.push({ type: 'scores', payload: { deviceId, points } });
  }
  device(device: Device) {
    this.events.push({ type: 'device', payload: device });
  }
  deviceRemoved(deviceId: string) {
    this.events.push({ type: 'device:removed', payload: deviceId });
  }
  alert(alert: Alert) {
    this.events.push({ type: 'alert', payload: alert });
  }
  alertUpdated(alert: Alert) {
    this.events.push({ type: 'alert:updated', payload: alert });
  }
  alertsChanged() {
    this.events.push({ type: 'alerts:changed', payload: null });
  }

  ofType(type: string) {
    return this.events.filter((event) => event.type === type).map((event) => event.payload);
  }
}

export class RecordingNotifier implements AlertNotifier {
  readonly sent: Alert[] = [];
  notify(alert: Alert) {
    this.sent.push(alert);
  }
}

export class FakeScorer implements Scorer {
  readonly calls: { deviceId: string; count: number }[] = [];
  readonly resets: string[] = [];
  result: (count: number) => AiScoreResult | null = () => null;

  async score(deviceId: string, readings: unknown[]) {
    this.calls.push({ deviceId, count: readings.length });
    return this.result(readings.length);
  }
  async resetModel(deviceId: string) {
    this.resets.push(deviceId);
    return true;
  }
  async ping() {
    return true;
  }
}

export class FakeCommands implements CommandPublisher {
  connected = true;
  readonly published: { deviceId: string; command: DeviceCommand }[] = [];
  async publishCommand(deviceId: string, command: DeviceCommand) {
    this.published.push({ deviceId, command });
  }
}

export const telemetry = (values: Record<string, unknown>) => Buffer.from(JSON.stringify(values));
