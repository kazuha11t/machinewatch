import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import type { AlertState } from '../db.ts';
import { asObject, HttpError, notFound, pathInt, queryInt, readString } from '../http.ts';

const ALERT_STATES: readonly AlertState[] = ['open', 'acknowledged', 'all'];

export function alertRoutes({ store, broadcaster }: AppDeps): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const state = (req.query.state ?? 'all') as AlertState;
    if (!ALERT_STATES.includes(state)) throw new HttpError(400, `"state" must be one of: ${ALERT_STATES.join(', ')}`);
    const limit = Math.min(Math.max(queryInt(req.query.limit, 'limit') ?? 100, 1), 500);
    const deviceId = typeof req.query.deviceId === 'string' && req.query.deviceId !== '' ? req.query.deviceId : undefined;
    res.json(store.listAlerts({ deviceId, state, limit }));
  });

  router.post('/ack-all', (req, res) => {
    const deviceId = readString(asObject(req.body ?? {}), 'deviceId');
    const acknowledged = store.acknowledgeAll(Date.now(), deviceId || undefined);
    if (acknowledged > 0) broadcaster.alertsChanged();
    res.json({ acknowledged });
  });

  router.post('/:id/ack', (req, res) => {
    const alert = store.acknowledgeAlert(pathInt(req.params.id, 'id'));
    if (!alert) throw notFound('Alert');
    broadcaster.alertUpdated(alert);
    res.json(alert);
  });

  return router;
}
