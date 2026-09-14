import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import type { Operator, RuleInput, Severity, Store } from '../db.ts';
import { asObject, HttpError, notFound, pathInt, readBoolean, readEnum, readNumber } from '../http.ts';
import { METRICS } from '../metrics.ts';

const OPERATORS: readonly Operator[] = ['>', '<'];
const SEVERITIES: readonly Severity[] = ['warning', 'critical'];

function parseRuleInput(raw: unknown, store: Store, partial: boolean): Partial<RuleInput> {
  const body = asObject(raw);
  const required = !partial;
  const input: Partial<RuleInput> = {
    metric: readEnum(body, 'metric', METRICS, { required }),
    operator: readEnum(body, 'operator', OPERATORS, { required }),
    threshold: readNumber(body, 'threshold', { required }),
    severity: readEnum(body, 'severity', SEVERITIES, { required }),
    cooldownSec: readNumber(body, 'cooldownSec', { min: 0, max: 86_400, integer: true }),
    enabled: readBoolean(body, 'enabled'),
  };

  if (body.deviceId === null) {
    input.deviceId = null;
  } else if (body.deviceId !== undefined) {
    if (typeof body.deviceId !== 'string' || !store.getDevice(body.deviceId)) {
      throw new HttpError(400, '"deviceId" must reference an existing device, or be null to apply to all devices');
    }
    input.deviceId = body.deviceId;
  }

  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export function ruleRoutes({ store }: AppDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(store.listRules());
  });

  router.post('/', (req, res) => {
    const input = parseRuleInput(req.body, store, false);
    const rule = store.createRule({ deviceId: null, cooldownSec: 300, enabled: true, ...input } as RuleInput);
    res.status(201).json(rule);
  });

  router.patch('/:id', (req, res) => {
    const rule = store.updateRule(pathInt(req.params.id, 'id'), parseRuleInput(req.body, store, true));
    if (!rule) throw notFound('Rule');
    res.json(rule);
  });

  router.delete('/:id', (req, res) => {
    if (!store.deleteRule(pathInt(req.params.id, 'id'))) throw notFound('Rule');
    res.status(204).end();
  });

  return router;
}
