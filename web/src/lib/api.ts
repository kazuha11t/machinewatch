import type { Alert, AlertState, Device, Overview, Reading, Rule, RuleInput, User } from './types';

/** Empty in development (Vite proxies /api) and when the dashboard is served by the same host as the API. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? '';

const TOKEN_KEY = 'machinewatch.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Private browsing: the session simply won't survive a reload.
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  if (response.status === 401 && token) unauthorizedHandler?.();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? response.statusText);
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  return (contentType.includes('application/json') ? response.json() : response.blob()) as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const device = (id: string) => `/devices/${encodeURIComponent(id)}`;

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', json('POST', { email, password })),
  me: () => request<{ user: User }>('/auth/me'),
  overview: () => request<Overview>('/overview'),

  devices: () => request<Device[]>('/devices'),
  updateDevice: (id: string, patch: Partial<Pick<Device, 'name' | 'type' | 'location'>>) =>
    request<Device>(device(id), json('PATCH', patch)),
  deleteDevice: (id: string) => request<void>(device(id), json('DELETE')),
  telemetry: (id: string, from: number, to: number, maxPoints = 600) =>
    request<{ readings: Reading[] }>(`${device(id)}/telemetry?from=${from}&to=${to}&maxPoints=${maxPoints}`),
  exportCsv: (id: string, from: number, to: number) => request<Blob>(`${device(id)}/telemetry.csv?from=${from}&to=${to}`),
  command: (id: string, relay: boolean) => request<{ accepted: boolean }>(`${device(id)}/command`, json('POST', { relay })),
  retrain: (id: string) => request<Device>(`${device(id)}/retrain`, json('POST')),

  alerts: ({ state = 'all', deviceId, limit = 100 }: { state?: AlertState; deviceId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams({ state, limit: String(limit) });
    if (deviceId) params.set('deviceId', deviceId);
    return request<Alert[]>(`/alerts?${params}`);
  },
  acknowledgeAlert: (id: number) => request<Alert>(`/alerts/${id}/ack`, json('POST')),
  acknowledgeAll: (deviceId?: string) => request<{ acknowledged: number }>('/alerts/ack-all', json('POST', { deviceId })),

  rules: () => request<Rule[]>('/rules'),
  createRule: (input: RuleInput) => request<Rule>('/rules', json('POST', input)),
  updateRule: (id: number, patch: Partial<RuleInput>) => request<Rule>(`/rules/${id}`, json('PATCH', patch)),
  deleteRule: (id: number) => request<void>(`/rules/${id}`, json('DELETE')),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
