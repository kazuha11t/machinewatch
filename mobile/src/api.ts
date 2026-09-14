import { API_URL } from './config';
import type { Alert, Device, Overview, Reading, User } from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (init.body) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API_URL}`);
  }
  if (response.status === 401 && authToken) unauthorizedHandler?.();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? `Request failed (${response.status})`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const device = (id: string) => `/devices/${encodeURIComponent(id)}`;

export const api = {
  login: (email: string, password: string) => request<{ token: string; user: User }>('/auth/login', post({ email, password })),
  me: () => request<{ user: User }>('/auth/me'),
  overview: () => request<Overview>('/overview'),
  devices: () => request<Device[]>('/devices'),
  telemetry: (id: string, from: number, to: number, maxPoints = 120) =>
    request<{ readings: Reading[] }>(`${device(id)}/telemetry?from=${from}&to=${to}&maxPoints=${maxPoints}`),
  command: (id: string, relay: boolean) => request<{ accepted: boolean }>(`${device(id)}/command`, post({ relay })),
  alerts: (state: 'open' | 'all' = 'open', deviceId?: string) =>
    request<Alert[]>(`/alerts?state=${state}&limit=100${deviceId ? `&deviceId=${encodeURIComponent(deviceId)}` : ''}`),
  acknowledgeAlert: (id: number) => request<Alert>(`/alerts/${id}/ack`, post()),
  registerPushToken: (token: string) => request<void>('/push-tokens', post({ token })),
  unregisterPushToken: (token: string) => request<void>(`/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' }),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
