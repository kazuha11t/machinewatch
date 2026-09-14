import { resolve } from 'node:path';

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

const DEV_JWT_SECRET = 'dev-secret-change-me';

export const config = {
  port: readNumber('PORT', 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  mqttUrl: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
  mqttUsername: process.env.MQTT_USERNAME || undefined,
  mqttPassword: process.env.MQTT_PASSWORD || undefined,
  topicPrefix: process.env.TOPIC_PREFIX ?? 'machinewatch',
  /** Run an in-process MQTT broker so local development needs no Mosquitto install. */
  embeddedBroker: readBoolean('EMBEDDED_BROKER', false),
  embeddedBrokerPort: readNumber('EMBEDDED_BROKER_PORT', 1883),

  dbPath: process.env.DB_PATH === ':memory:' ? ':memory:' : resolve(process.env.DB_PATH ?? './data/machinewatch.db'),
  retentionDays: readNumber('RETENTION_DAYS', 7),

  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  seedEmail: process.env.SEED_EMAIL ?? 'demo@machinewatch.io',
  seedPassword: process.env.SEED_PASSWORD ?? 'demo1234',

  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
  aiBatchSize: readNumber('AI_BATCH_SIZE', 5),

  offlineTimeoutSec: readNumber('OFFLINE_TIMEOUT_SEC', 30),
  pushNotifications: readBoolean('PUSH_NOTIFICATIONS', true),

  isProduction: process.env.NODE_ENV === 'production',
};

if (config.isProduction && config.jwtSecret === DEV_JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
