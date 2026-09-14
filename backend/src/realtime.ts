import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { TokenService } from './auth.ts';
import type { Broadcaster } from './broadcast.ts';
import type { Alert, Device, Reading } from './db.ts';
import { parseCorsOrigin } from './http.ts';

/** Pushes live updates to authenticated web and mobile clients over Socket.IO. */
export class SocketBroadcaster implements Broadcaster {
  readonly #io: Server;

  constructor(httpServer: HttpServer, tokens: TokenService, corsOrigin: string) {
    this.#io = new Server(httpServer, { cors: { origin: parseCorsOrigin(corsOrigin) } });
    this.#io.use(async (socket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      const user = typeof token === 'string' ? await tokens.verify(token) : null;
      if (!user) {
        next(new Error('Authentication required'));
        return;
      }
      socket.data.user = user;
      next();
    });
  }

  telemetry(deviceId: string, reading: Reading): void {
    this.#io.emit('telemetry', { deviceId, reading });
  }

  scores(deviceId: string, points: { ts: number; anomalyScore: number | null }[]): void {
    this.#io.emit('scores', { deviceId, points });
  }

  device(device: Device): void {
    this.#io.emit('device', device);
  }

  deviceRemoved(deviceId: string): void {
    this.#io.emit('device:removed', { deviceId });
  }

  alert(alert: Alert): void {
    this.#io.emit('alert', alert);
  }

  alertUpdated(alert: Alert): void {
    this.#io.emit('alert:updated', alert);
  }

  alertsChanged(): void {
    this.#io.emit('alerts:changed');
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.#io.close(() => resolve()));
  }
}
