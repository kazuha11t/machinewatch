import { lazy, Suspense, useEffect, useState } from 'react';
import type { HealthStatus } from '../../lib/types';
import { HealthRing } from '../ui';

const MachineScene = lazy(() => import('./MachineScene'));

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

export function MachineVisual({
  temperature,
  vibration,
  running,
  healthScore,
  healthStatus,
}: {
  temperature: number | null | undefined;
  vibration: number | null | undefined;
  running: boolean;
  healthScore: number | null;
  healthStatus: HealthStatus | null;
}) {
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

  useEffect(() => {
    const id = window.setTimeout(() => setMountScene(true), 150);
    return () => window.clearTimeout(id);
  }, []);

  if (!webglOk || reducedMotion) {
    return (
      <div className="grid h-56 place-items-center sm:h-64">
        <HealthRing score={healthScore} status={healthStatus} size={104} />
      </div>
    );
  }

  return (
    <div className="relative h-56 bg-surface sm:h-64">
      {mountScene ? (
        <Suspense fallback={<SceneSkeleton />}>
          <MachineScene
            temperature={temperature}
            vibration={vibration}
            running={running}
            healthScore={healthScore}
            healthStatus={healthStatus}
            active={tabVisible}
          />
        </Suspense>
      ) : (
        <SceneSkeleton />
      )}
    </div>
  );
}

function SceneSkeleton() {
  return (
    <div className="grid h-full place-items-center">
      <p className="label animate-pulse text-[10px] text-muted">Loading machine model…</p>
    </div>
  );
}
