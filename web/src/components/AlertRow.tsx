import { BrainCircuit, Check, Gauge, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { SEVERITY_STYLES, formatDateTime, timeAgo } from '../lib/format';
import type { Alert, AlertKind } from '../lib/types';
import { Button, cx } from './ui';

const KIND_ICONS: Record<AlertKind, typeof Gauge> = {
  threshold: Gauge,
  anomaly: BrainCircuit,
  offline: WifiOff,
};

const KIND_LABELS: Record<AlertKind, string> = {
  threshold: 'Threshold',
  anomaly: 'AI anomaly',
  offline: 'Connectivity',
};

export function AlertRow({
  alert,
  deviceName,
  now,
  onAcknowledge,
  showDevice = true,
}: {
  alert: Alert;
  deviceName?: string;
  now: number;
  onAcknowledge?: (alert: Alert) => void;
  showDevice?: boolean;
}) {
  const Icon = KIND_ICONS[alert.kind];
  const style = SEVERITY_STYLES[alert.severity];
  const acknowledged = alert.acknowledgedAt !== null;

  return (
    <li className={cx('flex items-start gap-3 px-4 py-3', acknowledged && 'opacity-60')}>
      <div className={cx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', style.bg, style.text)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className={cx('font-semibold uppercase tracking-wide', style.text)}>{alert.severity}</span>
          <span>·</span>
          <span>{KIND_LABELS[alert.kind]}</span>
          {showDevice && (
            <>
              <span>·</span>
              <Link to={`/devices/${alert.deviceId}`} className="font-medium text-slate-300 hover:text-sky-300">
                {deviceName ?? alert.deviceId}
              </Link>
            </>
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-200">{alert.message}</p>
        <p className="mt-0.5 text-xs text-muted" title={formatDateTime(alert.ts)}>
          {timeAgo(alert.ts, now)}
          {acknowledged && ` · acknowledged ${timeAgo(alert.acknowledgedAt, now)}`}
        </p>
      </div>
      {onAcknowledge && !acknowledged && (
        <Button variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={() => onAcknowledge(alert)}>
          <Check className="size-3.5" />
          Ack
        </Button>
      )}
    </li>
  );
}
