import cors from 'cors';
import express, { type Express } from 'express';
import type { Scorer } from './ai-client.ts';
import { currentUser, requireAuth, type TokenService } from './auth.ts';
import type { Broadcaster } from './broadcast.ts';
import type { Store } from './db.ts';
import { asObject, errorHandler, HttpError, parseCorsOrigin, readString } from './http.ts';
import type { CommandPublisher } from './mqtt.ts';
import { alertRoutes } from './routes/alerts.ts';
import { authRoutes } from './routes/auth.ts';
import { deviceRoutes } from './routes/devices.ts';
import { ruleRoutes } from './routes/rules.ts';

export interface AppDeps {
  store: Store;
  tokens: TokenService;
  commands: CommandPublisher;
  scorer: Scorer;
  broadcaster: Broadcaster;
  onDeviceDeleted?: (deviceId: string) => void;
  corsOrigin: string;
}

const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: parseCorsOrigin(deps.corsOrigin) }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    res.json({ status: 'ok', mqtt: deps.commands.connected, ai: await deps.scorer.ping() });
  });

  app.use('/api/auth', authRoutes(deps));

  const auth = requireAuth(deps.tokens);
  app.use('/api/devices', auth, deviceRoutes(deps));
  app.use('/api/alerts', auth, alertRoutes(deps));
  app.use('/api/rules', auth, ruleRoutes(deps));

  app.get('/api/overview', auth, (_req, res) => {
    res.json(deps.store.overview());
  });

  app.post('/api/push-tokens', auth, (req, res) => {
    const token = readString(asObject(req.body), 'token', { required: true })!;
    if (!EXPO_PUSH_TOKEN.test(token)) throw new HttpError(400, '"token" must be an Expo push token');
    deps.store.addPushToken(token, currentUser(res).userId);
    res.status(204).end();
  });

  app.delete('/api/push-tokens/:token', auth, (req, res) => {
    deps.store.removePushToken(req.params.token as string);
    res.status(204).end();
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
