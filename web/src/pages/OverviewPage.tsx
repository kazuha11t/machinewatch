import { useEffect, useMemo, useState } from 'react';
import { BellRing, BrainCircuit, Cpu, HeartPulse, PowerOff, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { AlertRow } from '../components/AlertRow';
import { EmptyState, HealthRing, Panel, PanelHeader, Sparkline, StatusBadge, cx } from '../components/ui';
import { api } from '../lib/api';
import { METRIC_INFO, formatHours, formatValue, timeAgo } from '../lib/format';
import { useLive, useNow } from '../lib/live';
import type { Alert, Device, Metric, Reading } from '../lib/types';

const CARD_METRICS: Metric[] = ['temperature', 'vibration', 'current'];

export function OverviewPage() {
  const { devices, devicesLoaded, latest, recent, overview, alertsVersion } = useLive();
  const now = useNow(2000);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    api.alerts({ state: 'open', limit: 6 }).then(setAlerts).catch(() => {});
  }, [alertsVersion]);

  const list = useMemo(() => Object.values(devices).sort((a, b) => a.name.localeCompare(b.name)), [devices]);
  const aiReady = list.filter((device) => device.aiStatus === 'ready').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet overview</h1>
        <p className="text-sm text-muted">Live condition of every connected machine.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Cpu} label="Machines online" value={overview ? `${overview.devices.online}/${overview.devices.total}` : '—'} />
        <Kpi
          icon={BellRing}
          label="Open alerts"
          value={overview?.alerts.open ?? '—'}
          hint={overview?.alerts.critical ? `${overview.alerts.critical} critical` : undefined}
          tone={overview?.alerts.critical ? 'bad' : undefined}
        />
        <Kpi icon={HeartPulse} label="Average health" value={overview?.averageHealth == null ? '—' : Math.round(overview.averageHealth)} />
        <Kpi icon={BrainCircuit} label="AI models ready" value={list.length ? `${aiReady}/${list.length}` : '—'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section>
          {devicesLoaded && list.length === 0 ? (
            <Panel>
              <EmptyState icon={<Cpu className="size-8" />} title="No machines connected yet">
                Start the simulator or power on an ESP32. Devices register themselves on their first MQTT message.
              </EmptyState>
            </Panel>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {list.map((device) => (
                <MachineCard key={device.id} device={device} reading={latest[device.id]} history={recent[device.id] ?? []} now={now} />
              ))}
            </div>
          )}
        </section>

        <Panel className="self-start">
          <PanelHeader title="Open alerts" action={<Link to="/alerts" className="text-xs text-sky-300 hover:text-sky-200">View all</Link>} />
          {alerts.length === 0 ? (
            <EmptyState title="All clear">No open alerts right now.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} deviceName={devices[alert.deviceId]?.name} now={now} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: typeof Cpu; label: string; value: string | number; hint?: string; tone?: 'bad' }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="tabular mt-2 font-mono text-2xl font-semibold">{value}</p>
      {hint && <p className={cx('text-xs', tone === 'bad' ? 'text-bad' : 'text-muted')}>{hint}</p>}
    </Panel>
  );
}

function MachineCard({ device, reading, history, now }: { device: Device; reading?: Reading; history: Reading[]; now: number }) {
  const vibration = history.map((point) => point.vibration).filter((value): value is number => value !== null);
  const stopped = device.relayState === false || reading?.running === false;
  const offline = device.status === 'offline';

  return (
    <Link
      to={`/devices/${device.id}`}
      className={cx(
        'group block rounded-xl border bg-panel p-4 transition-colors hover:border-sky-500/50',
        device.healthStatus === 'critical' && !offline ? 'border-bad/40' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold group-hover:text-sky-300">{device.name}</h3>
          </div>
          <p className="truncate text-xs text-muted">
            {[device.location, device.type].filter(Boolean).join(' · ') || device.id}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={device.status} />
            {stopped && !offline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-300">
                <PowerOff className="size-3" /> Stopped
              </span>
            )}
          </div>
        </div>
        <HealthRing score={offline ? null : device.healthScore} status={offline ? null : device.healthStatus} size={58} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {CARD_METRICS.map((metric) => (
          <div key={metric} className="rounded-lg bg-surface/60 px-2.5 py-2">
            <dt className="text-[11px] text-muted">{METRIC_INFO[metric].label}</dt>
            <dd className="tabular font-mono text-sm font-semibold text-slate-100">
              {formatValue(metric, reading?.[metric])}
              <span className="ml-0.5 text-[10px] font-normal text-muted">{METRIC_INFO[metric].unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <Sparkline values={vibration} color={METRIC_INFO.vibration.color} height={36} className="mt-3 opacity-80" />

      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <AiSummary device={device} />
        <span className="shrink-0 text-muted">{timeAgo(device.lastSeen === null ? null : Math.max(device.lastSeen, reading?.ts ?? 0), now)}</span>
      </div>
    </Link>
  );
}

export function AiSummary({ device }: { device: Device }) {
  if (device.aiStatus === 'learning' || device.aiStatus === null) {
    const progress = Math.round((device.aiProgress ?? 0) * 100);
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <BrainCircuit className="size-3.5" /> Learning baseline {progress}%
      </span>
    );
  }
  if (device.hoursToLimit !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-warn">
        <TrendingUp className="size-3.5" />
        {device.hoursToLimit === 0 ? 'Vibration limit exceeded' : `Vibration limit in ~${formatHours(device.hoursToLimit)}`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <BrainCircuit className="size-3.5" /> AI monitoring
    </span>
  );
}
