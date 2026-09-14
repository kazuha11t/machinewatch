import type { Alert, Device, Store } from './db.ts';
import type { AlertNotifier } from './ingest.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_LIMIT = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

/** Sends critical alerts to the mobile app through the Expo push service. */
export class PushNotifier implements AlertNotifier {
  readonly #store: Store;
  readonly #enabled: boolean;

  constructor(store: Store, enabled: boolean) {
    this.#store = store;
    this.#enabled = enabled;
  }

  notify(alert: Alert, device: Device): void {
    if (!this.#enabled || alert.severity !== 'critical') return;
    const tokens = this.#store.listPushTokens();
    for (let start = 0; start < tokens.length; start += EXPO_BATCH_LIMIT) {
      void this.#send(tokens.slice(start, start + EXPO_BATCH_LIMIT), alert, device);
    }
  }

  async #send(tokens: string[], alert: Alert, device: Device): Promise<void> {
    const messages = tokens.map((to) => ({
      to,
      title: `Critical: ${device.name}`,
      body: alert.message,
      sound: 'default',
      priority: 'high',
      channelId: 'alerts',
      data: { deviceId: device.id, alertId: alert.id },
    }));
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { data } = (await response.json()) as { data?: ExpoTicket[] };
      data?.forEach((ticket, index) => {
        const token = tokens[index];
        if (token && ticket.details?.error === 'DeviceNotRegistered') this.#store.removePushToken(token);
      });
    } catch (err) {
      console.warn(`[push] failed to deliver alert ${alert.id}:`, err instanceof Error ? err.message : err);
    }
  }
}
