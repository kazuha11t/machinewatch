import { lazy, Suspense, useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { Link } from 'react-router';
import { HEALTH_STYLES } from '../../lib/format';
import { timeAgo } from '../../lib/format';
import type { Device, Reading } from '../../lib/types';
import { cx, EmptyState, Panel, PanelHeader } from '../ui';

// The three.js + fiber + drei chunk is only fetched once a WebGL-capable, motion-enabled client
// actually needs it — it never touches the main bundle.
const FactoryFloorScene = lazy(() => import('./FactoryFloorScene'));

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

export function FactoryFloor({ devices, latest, now }: { devices: Device[]; latest: Record<string, Reading>; now: number }) {
  const [mountScene, setMountScene] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);

  useEffect(() => {
    setWebglOk(supportsWebGL());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Defer the 3D chunk one tick past first paint so it never competes with the initial render.
  useEffect(() => {
    const id = window.setTimeout(() => setMountScene(true), 150);
    return () => window.clearTimeout(id);
  }, []);

  const use3D = webglOk && !reducedMotion && devices.length > 0;

  return (
    <Panel>
      <PanelHeader
        title="Factory floor"
        subtitle={
          use3D
            ? 'Drag to orbit / click a unit to open it'
            : reducedMotion
              ? '3D view disabled — reduced motion preferred'
              : !webglOk
                ? 'WebGL unavailable — flat view'
                : undefined
        }
      />
      {devices.length === 0 ? (
        <EmptyState icon={<Boxes className="size-8" />} title="No active units" />
      ) : use3D ? (
        <div className="relative h-[300px] bg-surface sm:h-[360px]">
          {mountScene ? (
            <Suspense fallback={<FloorSkeleton />}>
              <FactoryFloorScene devices={devices} latest={latest} reducedMotion={reducedMotion} active={tabVisible} />
            </Suspense>
          ) : (
            <FloorSkeleton />
          )}
        </div>
      ) : (
        <FactoryFloor2D devices={devices} latest={latest} now={now} />
      )}
    </Panel>
  );
}

function FloorSkeleton() {
  return (
    <div className="grid h-full place-items-center">
      <p className="label animate-pulse text-[10px] text-muted">Loading factory floor…</p>
    </div>
  );
}

function FactoryFloor2D({ devices, latest, now }: { devices: Device[]; latest: Record<string, Reading>; now: number }) {
  return (
    <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4 lg:grid-cols-6">
      {devices.map((device) => {
        const reading = latest[device.id];
        const offline = device.status === 'offline';
        const stopped = !offline && (device.relayState === false || reading?.running === false);
        const style = device.healthStatus && !offline ? HEALTH_STYLES[device.healthStatus] : null;
        return (
          <Link key={device.id} to={`/devices/${device.id}`} className="flex flex-col gap-1.5 bg-panel px-2.5 py-3 hover:bg-panel-raised">
            <span className={cx('size-2', offline || stopped ? 'bg-line' : '')} style={{ background: offline || stopped ? undefined : (style?.stroke ?? '#7a7a7a') }} />
            <span className="label truncate text-[10px] text-foreground">{device.name}</span>
            <span className="label text-[9px] text-muted">{offline ? 'offline' : timeAgo(device.lastSeen, now)}</span>
          </Link>
        );
      })}
    </div>
  );
}
