import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateRules } from '../src/alerts.ts';
import type { Rule } from '../src/db.ts';
import { parseState, parseStatus, parseTelemetry } from '../src/telemetry.ts';

const NOW = 1_760_000_000_000;

describe('parseTelemetry', () => {
  it('parses numeric and string values and defaults running to true', () => {
    const reading = parseTelemetry('{"temperature":48.5,"vibration":"2.25","current":11}', NOW);
    assert.deepEqual(reading, { ts: NOW, temperature: 48.5, vibration: 2.25, current: 11, humidity: null, running: true });
  });

  it('accepts timestamps in seconds and rejects ones far from server time', () => {
    assert.equal(parseTelemetry(`{"temperature":1,"ts":${NOW / 1000 - 10}}`, NOW)?.ts, NOW - 10_000);
    assert.equal(parseTelemetry('{"temperature":1,"ts":0}', NOW)?.ts, NOW);
  });

  it('rejects payloads without any sensor value or with invalid JSON', () => {
    assert.equal(parseTelemetry('{"foo":1}', NOW), null);
    assert.equal(parseTelemetry('[1,2]', NOW), null);
    assert.equal(parseTelemetry('not json', NOW), null);
    assert.equal(parseTelemetry('{"temperature":"hot"}', NOW), null);
  });

  it('reads the running flag in several encodings', () => {
    assert.equal(parseTelemetry('{"current":0,"running":false}', NOW)?.running, false);
    assert.equal(parseTelemetry('{"current":0,"running":0}', NOW)?.running, false);
  });
});

describe('parseStatus / parseState', () => {
  it('handles plain and JSON status payloads', () => {
    assert.equal(parseStatus('online'), 'online');
    assert.equal(parseStatus('{"status":"offline"}'), 'offline');
    assert.equal(parseStatus('rebooting'), null);
  });

  it('parses relay state', () => {
    assert.deepEqual(parseState('{"relay":true}'), { relay: true });
    assert.deepEqual(parseState('{"relay":"off"}'), { relay: false });
    assert.equal(parseState('{}'), null);
  });
});

describe('evaluateRules', () => {
  const rule = (overrides: Partial<Rule>): Rule => ({
    id: 1,
    deviceId: null,
    metric: 'vibration',
    operator: '>',
    threshold: 7.1,
    severity: 'critical',
    cooldownSec: 60,
    enabled: true,
    createdAt: 0,
    ...overrides,
  });
  const values = { temperature: 20, vibration: 8, current: 0.5, humidity: null };

  it('fires breached rules and ignores disabled rules and missing metrics', () => {
    const rules = [
      rule({ id: 1 }),
      rule({ id: 2, enabled: false }),
      rule({ id: 3, metric: 'humidity' }),
      rule({ id: 4, metric: 'current', operator: '<', threshold: 1 }),
    ];
    const hits = evaluateRules(rules, values, () => undefined, NOW);
    assert.deepEqual(
      hits.map((hit) => hit.rule.id),
      [1, 4],
    );
  });

  it('respects the cooldown window', () => {
    assert.equal(evaluateRules([rule({})], values, () => NOW - 30_000, NOW).length, 0);
    assert.equal(evaluateRules([rule({})], values, () => NOW - 61_000, NOW).length, 1);
  });
});
