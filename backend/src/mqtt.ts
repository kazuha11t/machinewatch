import { randomUUID } from 'node:crypto';
import { connect, type MqttClient } from 'mqtt';

export interface DeviceCommand {
  relay: boolean;
}

export interface CommandPublisher {
  readonly connected: boolean;
  publishCommand(deviceId: string, command: DeviceCommand): Promise<void>;
}

export interface GatewayHandlers {
  telemetry(deviceId: string, payload: Buffer): void;
  status(deviceId: string, payload: Buffer): void;
  state(deviceId: string, payload: Buffer): void;
  meta(deviceId: string, payload: Buffer): void;
}

export interface GatewayOptions {
  url: string;
  topicPrefix: string;
  username?: string;
  password?: string;
}

export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Topic layout (one level per device):
 *   {prefix}/{deviceId}/telemetry  device -> cloud  sensor readings (JSON)
 *   {prefix}/{deviceId}/status     device -> cloud  "online" | "offline" (retained, used as last will)
 *   {prefix}/{deviceId}/state      device -> cloud  actuator state after a command, e.g. {"relay":true}
 *   {prefix}/{deviceId}/meta       device -> cloud  retained self-description, e.g. {"name":"Pump 1","location":"Line A"}
 *   {prefix}/{deviceId}/cmd        cloud -> device  commands, e.g. {"relay":false}
 */
export class MqttGateway implements CommandPublisher {
  readonly #options: GatewayOptions;
  #client: MqttClient | undefined;

  constructor(options: GatewayOptions) {
    this.#options = options;
  }

  get connected(): boolean {
    return this.#client?.connected ?? false;
  }

  start(handlers: GatewayHandlers): void {
    const { url, topicPrefix, username, password } = this.#options;
    const client = connect(url, {
      clientId: `machinewatch-backend-${randomUUID().slice(0, 8)}`,
      username,
      password,
      reconnectPeriod: 2000,
    });
    this.#client = client;
    let wasConnected = false;

    client.on('connect', () => {
      wasConnected = true;
      console.info(`[mqtt] connected to ${url}`);
      const channels = ['telemetry', 'status', 'state', 'meta'];
      client.subscribe(
        channels.map((channel) => `${topicPrefix}/+/${channel}`),
        { qos: 1 },
      );
    });
    client.on('offline', () => {
      if (wasConnected) console.warn('[mqtt] connection lost, reconnecting...');
      wasConnected = false;
    });
    client.on('error', (err) => console.error(`[mqtt] ${err.message}`));
    client.on('message', (topic, payload) => this.#route(topic, payload, handlers));
  }

  async publishCommand(deviceId: string, command: DeviceCommand): Promise<void> {
    if (!this.#client) throw new Error('MQTT gateway has not been started');
    await this.#client.publishAsync(`${this.#options.topicPrefix}/${deviceId}/cmd`, JSON.stringify(command), { qos: 1 });
  }

  async close(): Promise<void> {
    await this.#client?.endAsync();
  }

  #route(topic: string, payload: Buffer, handlers: GatewayHandlers): void {
    const [prefix, deviceId, channel, ...rest] = topic.split('/');
    if (prefix !== this.#options.topicPrefix || rest.length > 0 || !deviceId || !DEVICE_ID_PATTERN.test(deviceId)) return;
    try {
      if (channel === 'telemetry') handlers.telemetry(deviceId, payload);
      else if (channel === 'status') handlers.status(deviceId, payload);
      else if (channel === 'state') handlers.state(deviceId, payload);
      else if (channel === 'meta') handlers.meta(deviceId, payload);
    } catch (err) {
      console.error(`[mqtt] failed to handle message on ${topic}:`, err);
    }
  }
}
