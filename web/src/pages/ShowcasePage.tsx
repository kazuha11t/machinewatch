import { useMemo } from 'react';
import { Activity, BellRing, BrainCircuit, Cpu, Radio, Smartphone, Waves, Wifi } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';
import { FactoryFloor } from '../components/factory-floor/FactoryFloor';
import { PipelineStory } from '../components/showcase/PipelineStory';
import { cx } from '../components/ui';
import type { Device, HealthStatus, Reading } from '../lib/types';

const primaryButtonClass =
  'label inline-flex items-center justify-center gap-2 border border-transparent bg-foreground px-4 py-2.5 text-xs font-bold text-surface transition-[background-color,transform] duration-150 hover:bg-white active:translate-y-px';

const DEMO_HEALTH: HealthStatus[] = ['healthy', 'healthy', 'warning', 'critical', 'healthy', 'healthy'];
const DEMO_NAMES = ['Air Compressor #1', 'Air Compressor #2', 'Conveyor Pump A', 'Conveyor Pump B', 'Cooling Fan Unit', 'Hydraulic Press'];

const FEATURES = [
  {
    icon: Wifi,
    title: 'End-to-end IoT pipeline',
    body: 'ESP32 firmware to MQTT to Node.js to SQLite to WebSocket, straight through to web and mobile.',
    className: 'md:col-span-2',
  },
  {
    icon: BrainCircuit,
    title: 'AI anomaly detection',
    body: 'A per-device Isolation Forest trained on that machine’s own baseline, a health score from 0 to 100, and a vibration trend forecast.',
    className: 'md:row-span-2',
  },
  { icon: BellRing, title: 'Alert engine', body: 'Threshold rules with cooldowns, AI anomaly alerts and offline detection via MQTT last-will plus a heartbeat timeout.' },
  { icon: Cpu, title: 'Remote control', body: 'Start or stop a machine through a relay, with the new state confirmed back by the device.' },
  { icon: Smartphone, title: 'Mobile app', body: 'The same fleet status and live metrics on your phone, with push notifications for critical alerts.' },
  {
    icon: Waves,
    title: 'Hardware-free demo',
    body: 'A physics-based simulator reproduces real faults (bearing wear, overheating, vibration spikes) without an ESP32 on the desk.',
    className: 'md:col-span-2',
  },
];

const SCREENSHOTS = [
  { src: '/showcase/overview.png', alt: 'Fleet overview dashboard' },
  { src: '/showcase/device-detail.png', alt: 'Machine detail with telemetry charts' },
  { src: '/showcase/alerts.png', alt: 'Alert log' },
  { src: '/showcase/rules.png', alt: 'Threshold rule configuration' },
];

export function ShowcasePage() {
  const reducedMotion = useReducedMotion();
  const now = useMemo(() => Date.now(), []);

  const { demoDevices, demoLatest } = useMemo(() => buildDemoFleet(now), [now]);

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-none">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center border border-foreground bg-foreground text-surface">
              <Activity className="size-4" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm">MachineWatch</span>
          </div>
          <Link to="/login" className={primaryButtonClass}>
            Open live demo
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="label text-[10px] text-accent">// Real-time industrial machine monitoring</p>
            <h1 className="font-display mt-2 text-5xl sm:text-6xl">
              Catch machine failures <span className="text-accent">hours before</span> they stop your line.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
              ESP32 sensor nodes stream temperature, vibration and motor current over MQTT. A Python service learns
              each machine's normal behaviour, flags anomalies, and forecasts when vibration will cross the ISO
              10816 limit, often before any fixed threshold is reached.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/login" className={primaryButtonClass}>
                Open live demo
              </Link>
              <span className="label text-[10px] text-muted">ESP32 / MQTT / Node.js / Python / React / React Native</span>
            </div>
          </motion.div>

          <div>
            <FactoryFloor devices={demoDevices} latest={demoLatest} now={now} />
            <p className="label mt-2 text-[9px] text-muted">Illustrative preview. Sign in to see your own fleet, live.</p>
          </div>
        </div>
      </section>

      <PipelineStory />

      {/* Feature bento */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="border-b border-line pb-4">
          <p className="label text-[10px] text-accent">// What you get</p>
          <h2 className="font-display mt-1 text-3xl sm:text-4xl">Built for the plant floor</h2>
        </div>
        <div className="mt-6 grid gap-px border border-line bg-line md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body, className }) => (
            <div key={title} className={cx('bg-panel p-5', className)}>
              <Icon className="size-5 text-accent" />
              <h3 className="label mt-3 text-xs font-bold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshots */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="border-b border-line pb-4">
          <p className="label text-[10px] text-accent">// See it running</p>
          <h2 className="font-display mt-1 text-3xl sm:text-4xl">The dashboard</h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {SCREENSHOTS.map((shot) => (
            <motion.figure
              key={shot.src}
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4 }}
              className="border border-line bg-panel"
            >
              <img src={shot.src} alt={shot.alt} loading="lazy" className="block w-full" />
              <figcaption className="label border-t border-line px-3 py-2 text-[10px] text-muted">{shot.alt}</figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
          <div className="mx-auto flex items-center justify-center gap-2 text-muted">
            <Radio className="size-4" />
            <span className="label text-[10px]">demo@machinewatch.io / demo1234</span>
          </div>
          <h2 className="font-display mt-3 text-4xl sm:text-5xl">See your fleet, before it breaks.</h2>
          <div className="mt-6">
            <Link to="/login" className={primaryButtonClass}>
              Open live demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-4 py-6 text-center sm:px-6">
        <p className="label text-[10px] text-muted">MachineWatch. MIT licensed.</p>
      </footer>
    </div>
  );
}

function buildDemoFleet(now: number): { demoDevices: Device[]; demoLatest: Record<string, Reading> } {
  const demoDevices: Device[] = DEMO_NAMES.map((name, index) => ({
    id: `demo-${index}`,
    name,
    type: 'Industrial machine',
    location: 'Demo floor',
    status: 'online',
    lastSeen: now,
    relayState: true,
    healthScore: DEMO_HEALTH[index] === 'critical' ? 38 : DEMO_HEALTH[index] === 'warning' ? 68 : 92,
    healthStatus: DEMO_HEALTH[index]!,
    aiStatus: 'ready',
    aiProgress: 1,
    hoursToLimit: null,
    simulated: true,
    createdAt: now,
  }));

  const demoLatest: Record<string, Reading> = Object.fromEntries(
    demoDevices.map((device, index) => [
      device.id,
      {
        ts: now,
        temperature: 45 + index * 3,
        vibration: device.healthStatus === 'critical' ? 6.8 : device.healthStatus === 'warning' ? 3.2 : 1.1,
        current: 8 + index,
        humidity: null,
        running: true,
        anomalyScore: device.healthStatus === 'critical' ? 0.82 : device.healthStatus === 'warning' ? 0.4 : 0.05,
      } satisfies Reading,
    ]),
  );

  return { demoDevices, demoLatest };
}
