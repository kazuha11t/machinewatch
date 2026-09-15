import { useEffect, useMemo, useState } from 'react';
import { BellRing, BrainCircuit, Cpu, PowerOff, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router';
import { AlertRow } from '../components/AlertRow';
import { FactoryFloor } from '../components/factory-floor/FactoryFloor';
import { Bracket, CountUp, EmptyState, HealthMeter, Marquee, Panel, PanelHeader, Sparkline, StatusBadge, cx, useTilt } from '../components/ui';
import { api } from '../lib/api';
import { METRIC_INFO, formatClock, formatHours, formatValue, timeAgo } from '../lib/format';
import { useLive, useNow } from '../lib/live';
import type { Alert, Device, Metric, Reading } from '../lib/types';

const CARD_METRICS: Metric[] = ['temperature', 'vibration', 'current'];
const SPARK_COLOR = '#9a9a9a';
const MotionLink = motion.create(Link);

// Stagger orchestration for the KPI row and device grid — children opt in with `variants={ITEM}`.
const STAGGER_GROUP = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const STAGGER_ITEM = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } } };

export function OverviewPage() {
  const { devices, devicesLoaded, latest, recent, overview, alertsVersion } = useLive();
  const now = useNow(1000);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    api.alerts({ state: 'open', limit: 6 }).then(setAlerts).catch(() => {});
  }, [alertsVersion]);

  const list = useMemo(() => Object.values(devices).sort((a, b) => a.name.localeCompare(b.name)), [devices]);
  const aiReady = list.filter((device) => device.aiStatus === 'ready').length;
  const criticalAlerts = useMemo(() => alerts.filter((alert) => alert.severity === 'critical'), [alerts]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="border-b border-line pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label text-[10px] text-accent">// Fleet status overview</p>
            <h1 className="font-display mt-1 text-4xl sm:text-5xl">Overview</h1>
          </div>
          <div className="text-right">
            <p className="tabular font-mono text-sm font-bold text-foreground">{formatClock(now)}</p>
            <p className="label text-[10px] text-muted">Sys time</p>
          </div>
        </div>
        <p className="label mt-3 text-[10px] text-muted">Live condition of every connected machine.</p>
      </header>

      <Marquee
        items={criticalAlerts.map((alert) => (
          <span key={alert.id}>
            CRITICAL · {devices[alert.deviceId]?.name ?? alert.deviceId} — {alert.message}
          </span>
        ))}
      />

      <FactoryFloor devices={list} latest={latest} now={now} />

      <motion.div
        variants={STAGGER_GROUP}
        initial="hidden"
        animate="show"
        className="grid gap-px border border-line bg-line lg:grid-cols-[1.4fr_1fr_1fr_1fr]"
      >
        <motion.div variants={STAGGER_ITEM} className="bg-panel p-4">
          <p className="label text-[10px] text-muted">Average health</p>
          <p className="font-display mt-1 text-6xl leading-none sm:text-7xl">
            {overview?.averageHealth == null ? '—' : <CountUp value={Math.round(overview.averageHealth)} />}
          </p>
        </motion.div>
        <Kpi icon={Cpu} label="Machines online" value={overview?.devices.online} suffix={overview ? `/${overview.devices.total}` : ''} />
        <Kpi
          icon={BellRing}
          label="Open alerts"
          value={overview?.alerts.open}
          hint={overview?.alerts.critical ? `${overview.alerts.critical} critical` : undefined}
          tone={overview?.alerts.critical ? 'bad' : undefined}
        />
        <Kpi icon={BrainCircuit} label="AI models ready" value={list.length ? aiReady : undefined} suffix={list.length ? `/${list.length}` : ''} />
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section>
          {devicesLoaded && list.length === 0 ? (
            <Panel>
              <EmptyState icon={<Cpu className="size-8" />} title="No active units">
                Start the simulator or power on an ESP32. Devices register themselves on their first MQTT message.
              </EmptyState>
            </Panel>
          ) : (
            <motion.div variants={STAGGER_GROUP} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
              {list.map((device) => (
                <MachineCard key={device.id} device={device} reading={latest[device.id]} history={recent[device.id] ?? []} now={now} />
              ))}
            </motion.div>
          )}
        </section>

        <Panel className="self-start">
          <PanelHeader title="Open alerts" action={<Link to="/alerts" className="label text-[10px] font-bold text-accent hover:text-foreground">View all</Link>} />
          {alerts.length === 0 ? (
            <EmptyState title="All clear">No open alerts right now.</EmptyState>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {alerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} deviceName={devices[alert.deviceId]?.name} now={now} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  suffix = '',
  hint,
  tone,
}: {
  icon: typeof Cpu;
  label: string;
  value: number | undefined;
  suffix?: string;
  hint?: string;
  tone?: 'bad';
}) {
  return (
    <motion.div variants={STAGGER_ITEM} className="bg-panel p-4">
      <div className="label flex items-center justify-between text-[10px] text-muted">
        {label}
        <Icon className="size-3.5" />
      </div>
      <p className="tabular mt-2 font-mono text-3xl font-bold text-foreground">
        {value === undefined ? '—' : <CountUp value={value} />}
        {value !== undefined && suffix}
      </p>
      {hint && <p className={cx('label mt-1 text-[10px]', tone === 'bad' ? 'text-accent' : 'text-muted')}>{hint}</p>}
    </motion.div>
  );
}

function MachineCard({ device, reading, history, now }: { device: Device; reading?: Reading; history: Reading[]; now: number }) {
  const vibration = history.map((point) => point.vibration).filter((value): value is number => value !== null);
  const stopped = device.relayState === false || reading?.running === false;
  const offline = device.status === 'offline';
  const critical = device.healthStatus === 'critical' && !offline;
  const tilt = useTilt(6);

  return (
    <MotionLink
      to={`/devices/${device.id}`}
      variants={STAGGER_ITEM}
      {...tilt}
      className={cx(
        'group relative block overflow-hidden border bg-panel p-4 transition-colors',
        critical ? 'pulse-critical border-accent/50 hover:border-accent' : 'border-line hover:border-foreground',
      )}
    >
      <Bracket tone={critical ? 'accent' : 'muted'} />
      <span className="scan-sweep pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground/60" aria-hidden />
      <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="label text-[10px] text-muted">Unit / {device.id}</p>
          <h3 className="font-display group-hover:text-accent mt-0.5 line-clamp-2 break-words text-lg">{device.name}</h3>
          <p className="label mt-1.5 truncate text-[10px] text-muted">{[device.location, device.type].filter(Boolean).join(' / ') || '—'}</p>
        </div>
        <HealthMeter score={offline ? null : device.healthScore} status={offline ? null : device.healthStatus} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={device.status} />
        {stopped && !offline && (
          <span className="label inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            <PowerOff className="size-3" /> Stopped
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-px border border-line bg-line">
        {CARD_METRICS.map((metric) => (
          <div key={metric} className="bg-panel px-2.5 py-2">
            <dt className="label text-[9px] text-muted">{METRIC_INFO[metric].label}</dt>
            <dd className="tabular font-mono text-sm font-bold text-foreground">
              {formatValue(metric, reading?.[metric])}
              <span className="ml-0.5 text-[9px] font-normal text-muted">{METRIC_INFO[metric].unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <Sparkline values={vibration} color={SPARK_COLOR} height={32} className="mt-3 opacity-70" />

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
        <AiSummary device={device} />
        <span className="label shrink-0 text-[10px] text-muted">{timeAgo(device.lastSeen === null ? null : Math.max(device.lastSeen, reading?.ts ?? 0), now)}</span>
      </div>
    </MotionLink>
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
