import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, BrainCircuit, Download, Pencil, Power, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { AlertRow } from '../components/AlertRow';
import { TelemetryChart } from '../components/TelemetryChart';
import { Button, EmptyState, ErrorBanner, Field, FramedPanel, HealthBadge, HealthRing, Modal, Panel, PanelHeader, StatusBadge, cx, inputClass } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { METRIC_INFO, VIBRATION_LIMIT, VIBRATION_WARNING, formatHours, timeAgo } from '../lib/format';
import { useLive, useNow } from '../lib/live';
import type { Alert, Device, Reading } from '../lib/types';
import { AiSummary } from './OverviewPage';

const RANGES = [
  { label: '15 min', ms: 15 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '6 hours', ms: 6 * 60 * 60_000 },
  { label: '24 hours', ms: 24 * 60 * 60_000 },
];
const MAX_POINTS = 600;

export function DevicePage() {
  const { id = '' } = useParams();
  const { devices, devicesLoaded, subscribe, alertsVersion } = useLive();
  const device = devices[id];
  const now = useNow(1000);

  const [rangeMs, setRangeMs] = useState(RANGES[0]!.ms);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [windowEnd, setWindowEnd] = useState(() => Date.now());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'relay' | 'retrain' | 'export' | null>(null);
  const [editing, setEditing] = useState(false);

  // Historical window for the selected range.
  useEffect(() => {
    let cancelled = false;
    const end = Date.now();
    api
      .telemetry(id, end - rangeMs, end, MAX_POINTS)
      .then((result) => {
        if (cancelled) return;
        setReadings(result.readings);
        setWindowEnd(end);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [id, rangeMs]);

  // Live updates: append new readings (thinned to the chart resolution) and patch in AI scores.
  useEffect(() => {
    const incoming: Reading[] = [];
    const scores = new Map<number, number | null>();
    const minSpacing = rangeMs / MAX_POINTS;
    const offTelemetry = subscribe('telemetry', (event) => event.deviceId === id && incoming.push(event.reading));
    const offScores = subscribe('scores', (event) => {
      if (event.deviceId === id) for (const point of event.points) scores.set(point.ts, point.anomalyScore);
    });

    const timer = setInterval(() => {
      const end = Date.now();
      const added = incoming.splice(0);
      const scoreUpdates = new Map(scores);
      scores.clear();
      setReadings((current) => {
        let next = current;
        for (const reading of added) {
          const last = next.at(-1);
          if (last && reading.ts - last.ts < minSpacing) continue;
          next = next === current ? [...current, reading] : (next.push(reading), next);
        }
        if (scoreUpdates.size > 0) {
          next = next.map((reading) => (scoreUpdates.has(reading.ts) ? { ...reading, anomalyScore: scoreUpdates.get(reading.ts)! } : reading));
        }
        const firstInWindow = next.findIndex((reading) => reading.ts >= end - rangeMs);
        return firstInWindow > 0 ? next.slice(firstInWindow) : next;
      });
      setWindowEnd(end);
    }, 1000);

    return () => {
      offTelemetry();
      offScores();
      clearInterval(timer);
    };
  }, [id, rangeMs, subscribe]);

  const loadAlerts = useCallback(() => {
    api.alerts({ deviceId: id, limit: 20 }).then(setAlerts).catch(() => {});
  }, [id]);
  useEffect(loadAlerts, [loadAlerts, alertsVersion]);

  if (!device) {
    return (
      <Panel className="mx-auto max-w-xl">
        {devicesLoaded ? (
          <EmptyState title="Device not found">
            <Link to="/" className="text-accent hover:text-foreground">
              Back to overview
            </Link>
          </EmptyState>
        ) : (
          <EmptyState title="Loading device…" />
        )}
      </Panel>
    );
  }

  const latest = readings.at(-1);
  const from = windowEnd - rangeMs;
  const running = device.relayState ?? latest?.running ?? true;
  const hasHumidity = readings.some((reading) => reading.humidity !== null);

  const run = async (action: 'relay' | 'retrain' | 'export', task: () => Promise<unknown>) => {
    setBusy(action);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleRelay = () => {
    if (running && !window.confirm(`Stop ${device.name}? A relay OFF command will be sent to the machine.`)) return;
    void run('relay', () => api.command(device.id, !running));
  };

  const retrain = () => {
    if (!window.confirm('Discard the learned baseline and retrain the AI model from new readings?')) return;
    void run('retrain', () => api.retrain(device.id));
  };

  const exportCsv = () =>
    run('export', async () => {
      const blob = await api.exportCsv(device.id, from, windowEnd);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${device.id}-${new Date(from).toISOString().slice(0, 16).replace(':', '')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });

  const acknowledge = async (alert: Alert) => {
    await api.acknowledgeAlert(alert.id).catch((err) => setError(errorMessage(err)));
    loadAlerts();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="border-b border-line pb-4">
        <Link to="/" className="label inline-flex items-center gap-1.5 text-[10px] text-muted hover:text-foreground">
          <ArrowLeft className="size-4" /> Overview
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl sm:text-4xl">{device.name}</h1>
              <StatusBadge status={device.status} />
            </div>
            <p className="label mt-2 text-[10px] text-muted">
              {[device.location, device.type, device.id].filter(Boolean).join(' / ')} / last seen {timeAgo(device.lastSeen, now)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button onClick={exportCsv} disabled={busy !== null}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button onClick={retrain} disabled={busy !== null}>
              <RefreshCw className={cx('size-4', busy === 'retrain' && 'animate-spin')} /> Retrain AI
            </Button>
            <Button
              variant={running ? 'danger' : 'primary'}
              onClick={toggleRelay}
              disabled={busy !== null || device.status === 'offline'}
              title={device.status === 'offline' ? 'Device is offline' : undefined}
            >
              <Power className="size-4" /> {running ? 'Stop machine' : 'Start machine'}
            </Button>
          </div>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr] lg:items-start">
        <FramedPanel className="flex flex-col items-center gap-3 p-5 text-center lg:sticky lg:top-6">
          <HealthRing score={device.healthScore} status={device.healthStatus} size={104} />
          <div className="min-w-0 space-y-1.5">
            <p className="label text-[10px] text-muted">Machine health</p>
            <HealthBadge status={device.healthStatus} />
            <div className="text-xs">
              <AiSummary device={device} />
            </div>
          </div>
        </FramedPanel>

        <div className="min-w-0 space-y-4">
          <Panel className="p-5">
            <div className="label flex items-center gap-2 text-[11px] font-bold text-foreground">
              <BrainCircuit className="size-4 text-accent" /> AI insight
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{describeInsight(device)}</p>
            {device.aiStatus === 'learning' && (
              <div className="mt-3 h-1.5 overflow-hidden bg-line">
                <div className="h-full bg-foreground transition-all" style={{ width: `${Math.round((device.aiProgress ?? 0) * 100)}%` }} />
              </div>
            )}
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <h2 className="label flex items-center gap-2 text-xs font-bold text-foreground">
              [ Telemetry ]
              {running && device.status === 'online' && (
                <span className="label inline-flex items-center gap-1 text-[10px] font-bold text-accent">
                  <span className="pulse-critical size-1.5 bg-accent" /> REC
                </span>
              )}
            </h2>
            <div className="flex gap-px bg-line" role="tablist" aria-label="Time range">
              {RANGES.map((range) => (
                <button
                  key={range.ms}
                  role="tab"
                  aria-selected={rangeMs === range.ms}
                  onClick={() => setRangeMs(range.ms)}
                  className={cx(
                    'label border-b-2 bg-panel px-3 py-1.5 text-[11px] font-bold transition-colors',
                    rangeMs === range.ms ? 'border-b-accent text-foreground' : 'border-b-transparent text-muted hover:text-foreground',
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <TelemetryChart
                title="Vibration (RMS)"
                unit="mm/s"
                color={METRIC_INFO.vibration.color}
                dataKey="vibration"
                data={readings}
                from={from}
                to={windowEnd}
                digits={2}
                latest={latest?.vibration}
                domain={[0, 'auto']}
                tall
                references={[
                  { value: VIBRATION_WARNING, label: 'ISO warning 4.5', color: '#d9a441' },
                  { value: VIBRATION_LIMIT, label: 'ISO limit 7.1', color: '#ff2a2a' },
                ]}
              />
            </div>
            <TelemetryChart
              title="Temperature"
              unit="°C"
              color={METRIC_INFO.temperature.color}
              dataKey="temperature"
              data={readings}
              from={from}
              to={windowEnd}
              latest={latest?.temperature}
              references={[{ value: 85, label: 'Limit 85', color: '#ff2a2a' }]}
            />
            <TelemetryChart
              title="Motor current"
              unit="A"
              color={METRIC_INFO.current.color}
              dataKey="current"
              data={readings}
              from={from}
              to={windowEnd}
              latest={latest?.current}
              domain={[0, 'auto']}
            />
            <TelemetryChart
              title="AI anomaly score"
              unit=""
              color="#f472b6"
              dataKey="anomalyScore"
              data={readings}
              from={from}
              to={windowEnd}
              digits={2}
              latest={readings.findLast((reading) => reading.anomalyScore !== null)?.anomalyScore}
              domain={[0, 1]}
              references={[{ value: 0.5, label: 'Anomaly threshold', color: '#ff2a2a' }]}
            />
            {hasHumidity && (
              <TelemetryChart
                title="Ambient humidity"
                unit="%"
                color={METRIC_INFO.humidity.color}
                dataKey="humidity"
                data={readings}
                from={from}
                to={windowEnd}
                digits={0}
                latest={latest?.humidity}
              />
            )}
          </div>

          <Panel>
            <PanelHeader title="Alert history" subtitle="Latest 20 alerts for this machine" />
            {alerts.length === 0 ? (
              <EmptyState title="No alerts recorded" />
            ) : (
              <ul>
                {alerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} now={now} showDevice={false} onAcknowledge={acknowledge} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <EditDeviceModal device={device} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function describeInsight(device: Device): string {
  if (device.aiStatus !== 'ready') {
    return 'The model is learning this machine’s normal operating envelope from its first readings. Scoring starts automatically once the baseline is complete. Keep the machine running under normal load until then.';
  }
  const health = device.healthScore === null ? 'unknown' : `${Math.round(device.healthScore)}/100`;
  if (device.hoursToLimit === 0) {
    return `Vibration has passed the ISO 10816 limit. Health is ${health}. Inspect bearings, alignment and mounting before continuing operation.`;
  }
  if (device.hoursToLimit !== null) {
    return `Vibration is trending upward and is projected to reach the 7.1 mm/s limit in about ${formatHours(device.hoursToLimit)}. Health is ${health}. Schedule maintenance before then to avoid an unplanned stop.`;
  }
  if (device.healthStatus === 'critical' || device.healthStatus === 'warning') {
    return `Recent readings deviate from this machine’s learned behaviour (health ${health}), although no steady trend toward a hard limit is visible yet. Compare the charts below with recent operating changes.`;
  }
  return `Readings match the learned baseline (health ${health}). No abnormal patterns detected.`;
}

function EditDeviceModal({ device, open, onClose }: { device: Device; open: boolean; onClose(): void }) {
  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location);
  const [type, setType] = useState(device.type);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(device.name);
    setLocation(device.location);
    setType(device.type);
    setError(null);
    // Only reset when the dialog opens, not on every live device update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateDevice(device.id, { name, location, type });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit machine" open={open} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorBanner message={error} />
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </Field>
        <Field label="Location">
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Type">
          <input className={inputClass} value={type} onChange={(e) => setType(e.target.value)} maxLength={40} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
