import { useCallback, useEffect, useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { AlertRow } from '../components/AlertRow';
import { Button, EmptyState, ErrorBanner, Panel, cx } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useLive, useNow } from '../lib/live';
import type { Alert, AlertState } from '../lib/types';

const TABS: { state: AlertState; label: string }[] = [
  { state: 'open', label: 'Open' },
  { state: 'acknowledged', label: 'Acknowledged' },
  { state: 'all', label: 'All' },
];

export function AlertsPage() {
  const { devices, alertsVersion } = useLive();
  const now = useNow(5000);
  const [state, setState] = useState<AlertState>('open');
  const [deviceId, setDeviceId] = useState('');
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .alerts({ state, deviceId: deviceId || undefined, limit: 200 })
      .then((result) => {
        setAlerts(result);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [state, deviceId]);

  useEffect(load, [load, alertsVersion]);

  const acknowledge = async (alert: Alert) => {
    try {
      await api.acknowledgeAlert(alert.id);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const acknowledgeAll = async () => {
    try {
      await api.acknowledgeAll(deviceId || undefined);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const hasOpen = alerts?.some((alert) => alert.acknowledgedAt === null) ?? false;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted">Threshold breaches, AI-detected anomalies and connectivity events.</p>
        </div>
        <Button onClick={acknowledgeAll} disabled={!hasOpen}>
          <CheckCheck className="size-4" /> Acknowledge all
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-line bg-panel p-1" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.state}
              role="tab"
              aria-selected={state === tab.state}
              onClick={() => setState(tab.state)}
              className={cx(
                'rounded-md px-3 py-1 text-xs font-medium',
                state === tab.state ? 'bg-sky-500/15 text-sky-300' : 'text-muted hover:text-slate-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-slate-200"
          aria-label="Filter by machine"
        >
          <option value="">All machines</option>
          {Object.values(devices).map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} />

      <Panel>
        {alerts === null ? (
          <EmptyState title="Loading alerts…" />
        ) : alerts.length === 0 ? (
          <EmptyState icon={<BellOff className="size-8" />} title={state === 'open' ? 'No open alerts' : 'No alerts found'} />
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} deviceName={devices[alert.deviceId]?.name} now={now} onAcknowledge={acknowledge} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
