import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { api, API_URL } from './api';
import { useAuth } from './auth';
import type { Alert, Device, Overview, Reading, ScoresEvent, TelemetryEvent } from './types';

const SPARKLINE_POINTS = 90;
const FLUSH_INTERVAL_MS = 500;

interface LiveEvents {
  telemetry: TelemetryEvent;
  scores: ScoresEvent;
}

type Listener<T> = (payload: T) => void;

interface LiveContextValue {
  connected: boolean;
  devicesLoaded: boolean;
  devices: Record<string, Device>;
  latest: Record<string, Reading>;
  recent: Record<string, Reading[]>;
  overview: Overview | null;
  /** Increments whenever alerts change, so views can refetch. */
  alertsVersion: number;
  toasts: Alert[];
  dismissToast(id: number): void;
  subscribe<K extends keyof LiveEvents>(event: K, listener: Listener<LiveEvents[K]>): () => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

/**
 * Holds the realtime view of the fleet. Telemetry arrives many times per second, so
 * readings are buffered and committed to React state in small batches.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [latest, setLatest] = useState<Record<string, Reading>>({});
  const [recent, setRecent] = useState<Record<string, Reading[]>>({});
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alertsVersion, setAlertsVersion] = useState(0);
  const [toasts, setToasts] = useState<Alert[]>([]);

  const pending = useRef<TelemetryEvent[]>([]);
  const listeners = useRef({
    telemetry: new Set<Listener<TelemetryEvent>>(),
    scores: new Set<Listener<ScoresEvent>>(),
  });

  const loadDevices = useCallback(async () => {
    const list = await api.devices();
    setDevices(Object.fromEntries(list.map((device) => [device.id, device])));
    setDevicesLoaded(true);

    // Seed sparklines with the last few minutes so cards are not empty on first paint.
    const now = Date.now();
    const histories = await Promise.all(
      list.map((device) =>
        api
          .telemetry(device.id, now - 3 * 60_000, now, SPARKLINE_POINTS)
          .then((result): [string, Reading[]] => [device.id, result.readings])
          .catch((): [string, Reading[]] => [device.id, []]),
      ),
    );
    setRecent((current) => {
      const next = { ...current };
      for (const [id, readings] of histories) if (!next[id]?.length) next[id] = readings;
      return next;
    });
    setLatest((current) => {
      const next = { ...current };
      for (const [id, readings] of histories) {
        const last = readings.at(-1);
        if (last && !next[id]) next[id] = last;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token } });

    socket.on('connect', () => {
      setConnected(true);
      loadDevices().catch(() => setDevicesLoaded(true));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('telemetry', (event: TelemetryEvent) => {
      pending.current.push(event);
      listeners.current.telemetry.forEach((listener) => listener(event));
    });
    socket.on('scores', (event: ScoresEvent) => listeners.current.scores.forEach((listener) => listener(event)));
    socket.on('device', (device: Device) => setDevices((current) => ({ ...current, [device.id]: device })));
    socket.on('device:removed', ({ deviceId }: { deviceId: string }) =>
      setDevices(({ [deviceId]: _removed, ...rest }) => rest),
    );
    socket.on('alert', (alert: Alert) => {
      setAlertsVersion((version) => version + 1);
      setToasts((current) => [alert, ...current].slice(0, 4));
    });
    socket.on('alert:updated', () => setAlertsVersion((version) => version + 1));
    socket.on('alerts:changed', () => setAlertsVersion((version) => version + 1));

    const flush = setInterval(() => {
      const batch = pending.current.splice(0);
      if (batch.length === 0) return;
      setLatest((current) => {
        const next = { ...current };
        for (const { deviceId, reading } of batch) next[deviceId] = reading;
        return next;
      });
      setRecent((current) => {
        const next = { ...current };
        for (const { deviceId, reading } of batch) {
          next[deviceId] = [...(next[deviceId] ?? []), reading].slice(-SPARKLINE_POINTS);
        }
        return next;
      });
    }, FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(flush);
      socket.disconnect();
    };
  }, [token, loadDevices]);

  // Overview counters change with alerts and device health; a slow poll keeps them honest.
  useEffect(() => {
    if (!token) return;
    const load = () => api.overview().then(setOverview).catch(() => {});
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [token, alertsVersion]);

  const subscribe = useCallback(<K extends keyof LiveEvents>(event: K, listener: Listener<LiveEvents[K]>) => {
    const set = listeners.current[event] as Set<Listener<LiveEvents[K]>>;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(
    () => ({ connected, devicesLoaded, devices, latest, recent, overview, alertsVersion, toasts, dismissToast, subscribe }),
    [connected, devicesLoaded, devices, latest, recent, overview, alertsVersion, toasts, dismissToast, subscribe],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const context = useContext(LiveContext);
  if (!context) throw new Error('useLive must be used inside <LiveProvider>');
  return context;
}

/** Re-renders on an interval so relative times ("5s ago") stay current. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
