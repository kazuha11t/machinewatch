import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router';
import { SEVERITY_STYLES } from '../lib/format';
import { useLive } from '../lib/live';
import type { Alert, Severity } from '../lib/types';
import { cx } from './ui';

const TOAST_DURATION_MS = 7000;
const EDGE: Record<Severity, string> = { warning: 'border-l-warn', critical: 'border-l-accent' };

export function Toasts() {
  const { toasts, devices, dismissToast } = useLive();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((alert) => (
        <Toast key={alert.id} alert={alert} deviceName={devices[alert.deviceId]?.name ?? alert.deviceId} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function Toast({ alert, deviceName, onDismiss }: { alert: Alert; deviceName: string; onDismiss(id: number): void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(alert.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [alert.id, onDismiss]);

  const style = SEVERITY_STYLES[alert.severity];
  return (
    <div className={cx('pointer-events-auto flex gap-3 border border-line bg-panel p-3 border-l-4', EDGE[alert.severity])}>
      <AlertTriangle className={cx('mt-0.5 size-5 shrink-0', style.text)} />
      <Link to={`/devices/${alert.deviceId}`} className="min-w-0 flex-1" onClick={() => onDismiss(alert.id)}>
        <p className="label text-xs font-bold text-foreground">{deviceName}</p>
        <p className="mt-0.5 text-sm text-foreground/90">{alert.message}</p>
      </Link>
      <button onClick={() => onDismiss(alert.id)} className="self-start p-1 text-muted hover:text-foreground" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}
