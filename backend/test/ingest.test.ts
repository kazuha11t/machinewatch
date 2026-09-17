import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { Alert, Device } from '../src/db.ts';
import { Store } from '../src/db.ts';
import { IngestService } from '../src/ingest.ts';
import { FakeScorer, RecordingBroadcaster, RecordingNotifier, telemetry } from './helpers.ts';

const NOW = Date.now();

describe('IngestService', () => {
  let store: Store;
  let scorer: FakeScorer;
  let broadcaster: RecordingBroadcaster;
  let notifier: RecordingNotifier;
  let ingest: IngestService;

  beforeEach(() => {
    store = new Store(':memory:');
    store.ensureDefaultRules();
    scorer = new FakeScorer();
    broadcaster = new RecordingBroadcaster();
    notifier = new RecordingNotifier();
    ingest = new IngestService({ store, scorer, broadcaster, notifier, batchSize: 5 });
  });

  it('auto-registers a device, stores the reading and broadcasts it', () => {
    ingest.handleTelemetry('press-01', telemetry({ temperature: 40, vibration: 1.2, current: 10 }), NOW);

    const device = store.getDevice('press-01');
    assert.equal(device?.status, 'online');
    assert.equal(device?.lastSeen, NOW);
    assert.equal(store.queryReadings('press-01', NOW - 1, NOW + 1, 100).length, 1);
    assert.equal(broadcaster.ofType('telemetry').length, 1);
    assert.equal(broadcaster.ofType('device').length, 1);
  });

  it('raises a threshold alert once per cooldown and pushes critical alerts', () => {
    ingest.handleTelemetry('press-01', telemetry({ temperature: 40, vibration: 9, current: 10 }), NOW);
    ingest.handleTelemetry('press-01', telemetry({ temperature: 40, vibration: 9.5, current: 10 }), NOW + 1000);

    const alerts = store.listAlerts({ state: 'open', limit: 10 });
    // One critical (> 7.1) and one warning (> 4.5), each suppressed on the second reading by its cooldown.
    assert.deepEqual(alerts.map((alert) => alert.severity).sort(), ['critical', 'warning']);
    assert.equal(notifier.sent.length, 2);
    assert.match(alerts.find((alert) => alert.severity === 'critical')!.message, /Vibration 9\.0 mm\/s is above the 7\.1 mm\/s limit/);
  });

  it('does not evaluate rules or score readings while the machine is stopped', async () => {
    for (let i = 0; i < 5; i++) {
      ingest.handleTelemetry('press-01', telemetry({ temperature: 90, vibration: 0, current: 0, running: false }), NOW + i);
    }
    await ingest.flush();
    assert.equal(store.listAlerts({ state: 'all', limit: 10 }).length, 0);
    assert.equal(scorer.calls.length, 0);
  });

  it('marks devices offline from last-will messages and from missed heartbeats', () => {
    ingest.handleTelemetry('a', telemetry({ current: 1 }), NOW);
    ingest.handleTelemetry('b', telemetry({ current: 1 }), NOW);

    ingest.handleStatus('a', Buffer.from('offline'), NOW + 1000);
    ingest.markStaleDevicesOffline(30_000, NOW + 31_000);

    assert.equal(store.getDevice('a')?.status, 'offline');
    assert.equal(store.getDevice('b')?.status, 'offline');
    const offlineAlerts = store.listAlerts({ state: 'open', limit: 10 }).filter((alert) => alert.kind === 'offline');
    assert.equal(offlineAlerts.length, 2);
  });

  it('applies device metadata without overwriting operator edits', () => {
    ingest.handleMeta('cmp-9', Buffer.from('{"name":"Compressor 9","location":"Line C"}'), NOW);
    assert.equal(store.getDevice('cmp-9')?.name, 'Compressor 9');
    assert.equal(store.getDevice('cmp-9')?.status, 'offline');

    store.updateDevice('cmp-9', { name: 'Renamed by operator' });
    ingest.handleMeta('cmp-9', Buffer.from('{"name":"Compressor 9","type":"compressor"}'), NOW);
    const device = store.getDevice('cmp-9');
    assert.equal(device?.name, 'Renamed by operator');
    assert.equal(device?.type, 'compressor');
  });

  it('flags simulated devices from metadata and clears the flag when real hardware takes over the id', () => {
    ingest.handleTelemetry('press-01', telemetry({ current: 1 }), NOW);
    assert.equal(store.getDevice('press-01')?.simulated, false);

    ingest.handleMeta('cmp-9', Buffer.from('{"name":"Compressor 9","simulated":true}'), NOW);
    assert.equal(store.getDevice('cmp-9')?.simulated, true);

    ingest.handleMeta('cmp-9', Buffer.from('{"name":"Compressor 9"}'), NOW);
    assert.equal(store.getDevice('cmp-9')?.simulated, false);
  });

  it('updates relay state reported by the device', () => {
    ingest.handleTelemetry('pump-01', telemetry({ current: 5 }), NOW);
    ingest.handleState('pump-01', Buffer.from('{"relay":false}'));
    assert.equal(store.getDevice('pump-01')?.relayState, false);
  });

  it('scores readings in batches and raises an AI anomaly alert', async () => {
    scorer.result = (count) => ({
      status: 'ready',
      progress: 1,
      scores: Array(count).fill(0.92),
      anomalies: Array(count).fill(true),
      healthScore: 34,
      healthStatus: 'critical',
      hoursToLimit: 3.5,
    });

    for (let i = 0; i < 4; i++) ingest.handleTelemetry('fan-01', telemetry({ temperature: 50, vibration: 3, current: 12 }), NOW + i);
    assert.equal(scorer.calls.length, 0, 'waits for a full batch');
    ingest.handleTelemetry('fan-01', telemetry({ temperature: 50, vibration: 3, current: 12 }), NOW + 4);
    await ingest.flush();

    assert.deepEqual(scorer.calls, [{ deviceId: 'fan-01', count: 5 }]);
    const device = store.getDevice('fan-01') as Device;
    assert.equal(device.healthScore, 34);
    assert.equal(device.healthStatus, 'critical');
    assert.equal(device.hoursToLimit, 3.5);
    assert.ok(store.queryReadings('fan-01', NOW - 1, NOW + 10, 100).every((reading) => reading.anomalyScore === 0.92));

    const anomaly = store.listAlerts({ state: 'open', limit: 10 }).find((alert) => alert.kind === 'anomaly') as Alert;
    assert.equal(anomaly.severity, 'critical');
    assert.match(anomaly.message, /health 34\/100, vibration limit expected in ~3\.5 h/);
  });

  it('does not alert on anomalous samples while smoothed health is still good', async () => {
    scorer.result = (count) => ({
      status: 'ready',
      progress: 1,
      scores: Array(count).fill(0.7),
      anomalies: Array(count).fill(true),
      healthScore: 91,
      healthStatus: 'healthy',
      hoursToLimit: null,
    });
    for (let i = 0; i < 5; i++) ingest.handleTelemetry('pump-01', telemetry({ vibration: 3.5 }), NOW + i);
    await ingest.flush();
    assert.equal(store.listAlerts({ state: 'all', limit: 10 }).filter((alert) => alert.kind === 'anomaly').length, 0);
  });

  it('reports an exceeded limit rather than a countdown', async () => {
    scorer.result = (count) => ({
      status: 'ready',
      progress: 1,
      scores: Array(count).fill(1),
      anomalies: Array(count).fill(true),
      healthScore: 0,
      healthStatus: 'critical',
      hoursToLimit: 0,
    });
    for (let i = 0; i < 5; i++) ingest.handleTelemetry('cmp-2', telemetry({ vibration: 3 }), NOW + i);
    await ingest.flush();
    const anomaly = store.listAlerts({ state: 'all', limit: 10 }).find((alert) => alert.kind === 'anomaly');
    assert.equal(anomaly?.message, 'AI detected abnormal behaviour: health 0/100, vibration limit exceeded');
  });

  it('keeps ingesting when the AI service is unavailable', async () => {
    scorer.result = () => null;
    for (let i = 0; i < 10; i++) ingest.handleTelemetry('fan-01', telemetry({ vibration: 2 }), NOW + i);
    await ingest.flush();
    assert.equal(store.queryReadings('fan-01', NOW - 1, NOW + 20, 100).length, 10);
    assert.equal(store.getDevice('fan-01')?.healthScore, null);
  });
});
