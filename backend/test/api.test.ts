import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { hashPassword, TokenService } from '../src/auth.ts';
import { Store } from '../src/db.ts';
import { FakeCommands, FakeScorer, RecordingBroadcaster } from './helpers.ts';

describe('HTTP API', () => {
  const store = new Store(':memory:');
  const commands = new FakeCommands();
  const scorer = new FakeScorer();
  const broadcaster = new RecordingBroadcaster();
  let server: Server;
  let baseUrl: string;
  let token: string;

  const api = async (path: string, init: RequestInit & { json?: unknown; auth?: boolean } = {}) => {
    const headers = new Headers(init.headers);
    if (init.auth !== false) headers.set('Authorization', `Bearer ${token}`);
    if (init.json !== undefined) headers.set('Content-Type', 'application/json');
    const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
    return fetch(`${baseUrl}${path}`, { ...init, headers, body });
  };

  before(async () => {
    store.createUser('Demo@Example.com', 'Demo', await hashPassword('secret-pass'));
    store.ensureDefaultRules();
    const now = Date.now();
    store.touchDevice('compressor-01', now);
    for (let i = 0; i < 20; i++) {
      store.insertReading('compressor-01', { ts: now - (20 - i) * 1000, temperature: 40 + i, vibration: 2, current: 10, humidity: null, running: true });
    }
    const app = createApp({ store, tokens: new TokenService('test-secret', '1h'), commands, scorer, broadcaster, corsOrigin: '*' });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
    store.close();
  });

  it('rejects bad credentials and issues a token for valid ones', async () => {
    const bad = await api('/api/auth/login', { method: 'POST', json: { email: 'demo@example.com', password: 'nope' }, auth: false });
    assert.equal(bad.status, 401);

    const res = await api('/api/auth/login', { method: 'POST', json: { email: 'demo@example.com', password: 'secret-pass' }, auth: false });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { token: string; user: { email: string } };
    assert.equal(body.user.email, 'demo@example.com');
    token = body.token;

    const me = await api('/api/auth/me');
    assert.equal(me.status, 200);
  });

  it('requires authentication for protected routes', async () => {
    assert.equal((await api('/api/devices', { auth: false })).status, 401);
  });

  it('lists devices and returns telemetry, downsampled when requested', async () => {
    const devices = (await (await api('/api/devices')).json()) as { id: string }[];
    assert.deepEqual(
      devices.map((device) => device.id),
      ['compressor-01'],
    );

    const from = Date.now() - 60_000;
    const raw = (await (await api(`/api/devices/compressor-01/telemetry?from=${from}`)).json()) as { readings: unknown[] };
    assert.equal(raw.readings.length, 20);

    const sampled = (await (await api(`/api/devices/compressor-01/telemetry?from=${from}&maxPoints=10`)).json()) as { readings: unknown[] };
    assert.ok(sampled.readings.length <= 11 && sampled.readings.length > 0);
  });

  it('exports CSV', async () => {
    const res = await api(`/api/devices/compressor-01/telemetry.csv?from=${Date.now() - 60_000}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/csv/);
    const lines = (await res.text()).trim().split('\n');
    assert.equal(lines.length, 21);
    assert.match(lines[0]!, /^timestamp,temperature_c/);
  });

  it('renames a device and validates input', async () => {
    const res = await api('/api/devices/compressor-01', { method: 'PATCH', json: { name: 'Air Compressor #1', location: 'Line A' } });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { name: string }).name, 'Air Compressor #1');
    assert.equal((await api('/api/devices/compressor-01', { method: 'PATCH', json: { name: '  ' } })).status, 400);
    assert.equal((await api('/api/devices/missing')).status, 404);
  });

  it('publishes relay commands and reports a disconnected broker', async () => {
    const res = await api('/api/devices/compressor-01/command', { method: 'POST', json: { relay: false } });
    assert.equal(res.status, 202);
    assert.deepEqual(commands.published.at(-1), { deviceId: 'compressor-01', command: { relay: false } });

    assert.equal((await api('/api/devices/compressor-01/command', { method: 'POST', json: { relay: 'yes' } })).status, 400);

    commands.connected = false;
    assert.equal((await api('/api/devices/compressor-01/command', { method: 'POST', json: { relay: true } })).status, 503);
    commands.connected = true;
  });

  it('creates, updates and deletes rules', async () => {
    const created = await api('/api/rules', {
      method: 'POST',
      json: { deviceId: 'compressor-01', metric: 'temperature', operator: '>', threshold: 70, severity: 'warning' },
    });
    assert.equal(created.status, 201);
    const rule = (await created.json()) as { id: number; cooldownSec: number; enabled: boolean };
    assert.equal(rule.cooldownSec, 300);

    const patched = await api(`/api/rules/${rule.id}`, { method: 'PATCH', json: { enabled: false } });
    assert.equal(((await patched.json()) as { enabled: boolean }).enabled, false);

    assert.equal((await api('/api/rules', { method: 'POST', json: { metric: 'pressure', operator: '>', threshold: 1, severity: 'warning' } })).status, 400);
    assert.equal((await api('/api/rules', { method: 'POST', json: { deviceId: 'ghost', metric: 'current', operator: '>', threshold: 1, severity: 'warning' } })).status, 400);

    assert.equal((await api(`/api/rules/${rule.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await api(`/api/rules/${rule.id}`, { method: 'DELETE' })).status, 404);
  });

  it('lists and acknowledges alerts', async () => {
    const alert = store.createAlert({ deviceId: 'compressor-01', ruleId: null, kind: 'anomaly', severity: 'critical', message: 'test', value: 30, ts: Date.now() });
    const open = (await (await api('/api/alerts?state=open')).json()) as { id: number }[];
    assert.ok(open.some((item) => item.id === alert.id));

    const acked = await api(`/api/alerts/${alert.id}/ack`, { method: 'POST' });
    assert.ok(((await acked.json()) as { acknowledgedAt: number | null }).acknowledgedAt);
    assert.equal(broadcaster.ofType('alert:updated').length, 1);

    const overview = (await (await api('/api/overview')).json()) as { alerts: { open: number } };
    assert.equal(overview.alerts.open, 0);
  });

  it('registers Expo push tokens', async () => {
    assert.equal((await api('/api/push-tokens', { method: 'POST', json: { token: 'ExponentPushToken[abc123]' } })).status, 204);
    assert.equal((await api('/api/push-tokens', { method: 'POST', json: { token: 'random' } })).status, 400);
    assert.deepEqual(store.listPushTokens(), ['ExponentPushToken[abc123]']);
  });

  it('retrains and deletes a device', async () => {
    const retrained = await api('/api/devices/compressor-01/retrain', { method: 'POST' });
    assert.equal(((await retrained.json()) as { aiStatus: string }).aiStatus, 'learning');

    assert.equal((await api('/api/devices/compressor-01', { method: 'DELETE' })).status, 204);
    assert.equal(store.getDevice('compressor-01'), undefined);
    assert.deepEqual(scorer.resets, ['compressor-01', 'compressor-01']);
  });
});
