import { BrainCircuit, Check, Gauge, WifiOff } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
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
  className,
}: {
  alert: Alert;
  deviceName?: string;
  now: number;
  onAcknowledge?: (alert: Alert) => void;
  showDevice?: boolean;
  className?: string;
}) {
  const Icon = KIND_ICONS[alert.kind];
  const style = SEVERITY_STYLES[alert.severity];
  const acknowledged = alert.acknowledgedAt !== null;
  const reduced = useReducedMotion();

  return (
    <motion.li
      layout
      initial={reduced ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? undefined : { opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cx('flex items-start gap-3 overflow-hidden border-b border-line px-4 py-3 last:border-b-0', acknowledged && 'opacity-50', className)}
    >
      <div className={cx('mt-0.5 grid size-8 shrink-0 place-items-center border', style.bg, style.text, style.border)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="label flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted">
          <span className={cx('font-bold', style.text)}>{alert.severity}</span>
          <span>/</span>
          <span>{KIND_LABELS[alert.kind]}</span>
          {showDevice && (
            <>
              <span>/</span>
              <Link to={`/devices/${alert.deviceId}`} className="font-bold text-foreground hover:text-accent">
                {deviceName ?? alert.deviceId}
              </Link>
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-foreground">{alert.message}</p>
        <p className="label mt-1 text-[10px] text-muted" title={formatDateTime(alert.ts)}>
          {timeAgo(alert.ts, now)}
          {acknowledged && ` / ack ${timeAgo(alert.acknowledgedAt, now)}`}
        </p>
      </div>
      {onAcknowledge && !acknowledged && (
        <Button variant="ghost" className="shrink-0 px-2 py-1" onClick={() => onAcknowledge(alert)}>
          <Check className="size-3.5" />
          Ack
        </Button>
      )}
    </motion.li>
  );
}
