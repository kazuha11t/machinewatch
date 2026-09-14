import { createServer } from 'node:http';
import { AiClient } from './ai-client.ts';
import { createApp } from './app.ts';
import { hashPassword, TokenService } from './auth.ts';
import { BroadcastHub } from './broadcast.ts';
import { startEmbeddedBroker, type EmbeddedBroker } from './broker.ts';
import { config } from './config.ts';
import { Store } from './db.ts';
import { IngestService } from './ingest.ts';
import { MqttGateway } from './mqtt.ts';
import { PushNotifier } from './notifier.ts';
import { SocketBroadcaster } from './realtime.ts';

const DAY_MS = 86_400_000;

async function main(): Promise<void> {
  const store = new Store(config.dbPath);
  if (store.countUsers() === 0) {
    store.createUser(config.seedEmail, 'Demo Operator', await hashPassword(config.seedPassword));
    console.info(`[seed] created user ${config.seedEmail}`);
  }
  store.ensureDefaultRules();

  let broker: EmbeddedBroker | undefined;
  if (config.embeddedBroker) broker = await startEmbeddedBroker(config.embeddedBrokerPort);

  const tokens = new TokenService(config.jwtSecret, config.jwtExpiresIn);
  const scorer = new AiClient(config.aiServiceUrl);
  const broadcaster = new BroadcastHub();
  const gateway = new MqttGateway({
    url: config.mqttUrl,
    topicPrefix: config.topicPrefix,
    username: config.mqttUsername,
    password: config.mqttPassword,
  });
  const ingest = new IngestService({
    store,
    scorer,
    broadcaster,
    notifier: new PushNotifier(store, config.pushNotifications),
    batchSize: config.aiBatchSize,
  });

  const app = createApp({
    store,
    tokens,
    commands: gateway,
    scorer,
    broadcaster,
    corsOrigin: config.corsOrigin,
    onDeviceDeleted: (id) => ingest.forgetDevice(id),
  });
  const httpServer = createServer(app);
  const sockets = new SocketBroadcaster(httpServer, tokens, config.corsOrigin);
  broadcaster.add(sockets);

  gateway.start({
    telemetry: (id, payload) => ingest.handleTelemetry(id, payload),
    status: (id, payload) => ingest.handleStatus(id, payload),
    state: (id, payload) => ingest.handleState(id, payload),
    meta: (id, payload) => ingest.handleMeta(id, payload),
  });

  const timers = [
    setInterval(() => ingest.markStaleDevicesOffline(config.offlineTimeoutSec * 1000), 5000),
    setInterval(() => {
      const removed = store.pruneReadings(Date.now() - config.retentionDays * DAY_MS);
      if (removed > 0) console.info(`[retention] removed ${removed} readings older than ${config.retentionDays} days`);
    }, 3_600_000),
  ];

  httpServer.listen(config.port, () => {
    console.info(`[http] MachineWatch API listening on http://localhost:${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[server] ${signal} received, shutting down`);
    timers.forEach(clearInterval);
    await gateway.close();
    await ingest.flush();
    await sockets.close();
    await broker?.close();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
