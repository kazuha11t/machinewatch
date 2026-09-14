import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { api } from './api';
import { useAuth } from './auth';
import { API_URL } from './config';
import { showLocalNotification } from './notifications';
import type { Alert, Device, Reading, TelemetryEvent } from './types';

const SPARKLINE_POINTS = 60;
const FLUSH_INTERVAL_MS = 1000;

interface LiveContextValue {
  connected: boolean;
  loaded: boolean;
  devices: Device[];
  latest: Record<string, Reading>;
  recent: Record<string, Reading[]>;
  alertsVersion: number;
  lastAlert: Alert | null;
  refresh(): Promise<void>;
}

const LiveContext = createContext<LiveContextValue | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { token, remotePush } = useAuth();
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [latest, setLatest] = useState<Record<string, Reading>>({});
  const [recent, setRecent] = useState<Record<string, Reading[]>>({});
  const [alertsVersion, setAlertsVersion] = useState(0);
  const [lastAlert, setLastAlert] = useState<Alert | null>(null);

  const pending = useRef<TelemetryEvent[]>([]);
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const remotePushRef = useRef(remotePush);
  remotePushRef.current = remotePush;

  const refresh = useCallback(async () => {
    const list = await api.devices();
    setDevices(Object.fromEntries(list.map((device) => [device.id, device])));
    setLoaded(true);
    setAlertsVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token }, transports: ['websocket'] });

    socket.on('connect', () => {
      setConnected(true);
      refresh().catch(() => setLoaded(true));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('telemetry', (event: TelemetryEvent) => pending.current.push(event));
    socket.on('device', (device: Device) => setDevices((current) => ({ ...current, [device.id]: device })));
    socket.on('device:removed', ({ deviceId }: { deviceId: string }) =>
      setDevices(({ [deviceId]: _removed, ...rest }) => rest),
    );
    socket.on('alert', (alert: Alert) => {
      setAlertsVersion((version) => version + 1);
      setLastAlert(alert);
      // Remote push already covers critical alerts on registered devices; otherwise notify locally.
      if (alert.severity === 'critical' && !remotePushRef.current && AppState.currentState !== 'active') {
        const name = devicesRef.current[alert.deviceId]?.name ?? alert.deviceId;
        void showLocalNotification(`Critical: ${name}`, alert.message, { deviceId: alert.deviceId, alertId: alert.id });
      }
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
  }, [token, refresh]);

  const sortedDevices = useMemo(() => Object.values(devices).sort((a, b) => a.name.localeCompare(b.name)), [devices]);

  const value = useMemo(
    () => ({ connected, loaded, devices: sortedDevices, latest, recent, alertsVersion, lastAlert, refresh }),
    [connected, loaded, sortedDevices, latest, recent, alertsVersion, lastAlert, refresh],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const context = useContext(LiveContext);
  if (!context) throw new Error('useLive must be used inside <LiveProvider>');
  return context;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
