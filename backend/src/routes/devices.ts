import { Router, type Request } from 'express';
import type { AppDeps } from '../app.ts';
import type { Device, Store } from '../db.ts';
import { asObject, HttpError, notFound, queryInt, readBoolean, readString } from '../http.ts';

const HOUR_MS = 3_600_000;
const MAX_RANGE_MS = 31 * 24 * HOUR_MS;

function findDevice(store: Store, id: string | undefined): Device {
  const device = id ? store.getDevice(id) : undefined;
  if (!device) throw notFound('Device');
  return device;
}

function parseRange(query: Request['query']): { from: number; to: number } {
  const to = queryInt(query.to, 'to') ?? Date.now();
  const from = queryInt(query.from, 'from') ?? to - HOUR_MS;
  if (from >= to) throw new HttpError(400, '"from" must be earlier than "to"');
  if (to - from > MAX_RANGE_MS) throw new HttpError(400, 'Time range cannot exceed 31 days');
  return { from, to };
}

const csvValue = (value: number | null) => (value === null ? '' : String(value));

export function deviceRoutes({ store, commands, scorer, broadcaster, onDeviceDeleted }: AppDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(store.listDevices());
  });

  router.get('/:id', (req, res) => {
    res.json(findDevice(store, req.params.id));
  });

  router.patch('/:id', (req, res) => {
    const { id } = findDevice(store, req.params.id);
    const body = asObject(req.body);
    const name = readString(body, 'name', { maxLength: 80 });
    if (name === '') throw new HttpError(400, '"name" cannot be empty');
    const device = store.updateDevice(id, {
      name,
      type: readString(body, 'type', { maxLength: 40 }),
      location: readString(body, 'location', { maxLength: 120 }),
    })!;
    broadcaster.device(device);
    res.json(device);
  });

  router.delete('/:id', (req, res) => {
    const { id } = findDevice(store, req.params.id);
    store.deleteDevice(id);
    onDeviceDeleted?.(id);
    broadcaster.deviceRemoved(id);
    void scorer.resetModel(id);
    res.status(204).end();
  });

  router.get('/:id/telemetry', (req, res) => {
    const { id } = findDevice(store, req.params.id);
    const { from, to } = parseRange(req.query);
    const maxPoints = Math.min(Math.max(queryInt(req.query.maxPoints, 'maxPoints') ?? 600, 10), 5000);
    res.json({ from, to, readings: store.queryReadings(id, from, to, maxPoints) });
  });

  router.get('/:id/telemetry.csv', (req, res) => {
    const { id } = findDevice(store, req.params.id);
    const { from, to } = parseRange(req.query);
    const day = new Date(from).toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-${day}.csv"`);
    res.write('timestamp,temperature_c,vibration_mm_s,current_a,humidity_pct,running,anomaly_score\n');
    for (const r of store.iterateReadings(id, from, to)) {
      res.write(
        `${new Date(r.ts).toISOString()},${csvValue(r.temperature)},${csvValue(r.vibration)},${csvValue(r.current)},` +
          `${csvValue(r.humidity)},${r.running ? 1 : 0},${csvValue(r.anomalyScore)}\n`,
      );
    }
    res.end();
  });

  router.post('/:id/command', async (req, res) => {
    const { id } = findDevice(store, req.params.id);
    const relay = readBoolean(asObject(req.body), 'relay', { required: true })!;
    if (!commands.connected) throw new HttpError(503, 'MQTT broker is not connected');
    await commands.publishCommand(id, { relay });
    // The relay state is updated when the device confirms on its state topic.
    res.status(202).json({ accepted: true });
  });

  router.post('/:id/retrain', async (req, res) => {
    const { id } = findDevice(store, req.params.id);
    if (!(await scorer.resetModel(id))) throw new HttpError(503, 'AI service is unavailable');
    const device = store.updateHealth(id, {
      healthScore: null,
      healthStatus: null,
      aiStatus: 'learning',
      aiProgress: 0,
      hoursToLimit: null,
    })!;
    broadcaster.device(device);
    res.json(device);
  });

  return router;
}
