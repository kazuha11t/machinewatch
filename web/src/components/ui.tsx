import { useEffect, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { HEALTH_STYLES, SEVERITY_STYLES } from '../lib/format';
import type { DeviceStatus, HealthStatus, Severity } from '../lib/types';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('border border-line bg-panel', className)}>{children}</section>;
}

/** Corner-bracket framing device — HUD-style depth cue without shadows or radius. */
export function Bracket({ tone = 'muted' }: { tone?: 'muted' | 'accent' }) {
  const color = tone === 'accent' ? 'border-accent' : 'border-line';
  return (
    <>
      <span className={cx('pointer-events-none absolute -top-px -left-px size-2.5 border-t-2 border-l-2', color)} />
      <span className={cx('pointer-events-none absolute -top-px -right-px size-2.5 border-t-2 border-r-2', color)} />
      <span className={cx('pointer-events-none absolute -bottom-px -left-px size-2.5 border-b-2 border-l-2', color)} />
      <span className={cx('pointer-events-none absolute -bottom-px -right-px size-2.5 border-b-2 border-r-2', color)} />
    </>
  );
}

/** Panel + corner brackets, for the primary "hero" panels on each page. */
export function FramedPanel({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'muted' | 'accent' }) {
  return (
    <section className={cx('relative border border-line bg-panel', className)}>
      <Bracket tone={tone} />
      {children}
    </section>
  );
}

/** Animated numeral readout for realtime KPIs — springs toward its new value instead of snapping. */
export function CountUp({ value, decimals = 0 }: { value: number | null; decimals?: number }) {
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(value ?? 0);
  const spring = useSpring(motionValue, reduced ? { stiffness: 1000, damping: 100 } : { stiffness: 140, damping: 20, mass: 0.4 });
  const display = useTransform(spring, (latest) => latest.toFixed(decimals));

  useEffect(() => {
    if (value !== null) motionValue.set(value);
  }, [value, motionValue]);

  if (value === null) return <>—</>;
  return <motion.span>{display}</motion.span>;
}

/**
 * Pointer-following 3D tilt, capped at `maxDeg`. Disabled under reduced motion and on coarse
 * (touch) pointers, where the concept doesn't apply — spread the handlers onto the target element.
 */
export function useTilt(maxDeg = 6) {
  const reduced = useReducedMotion();
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const enabled = !reduced && !coarse;

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 220, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 220, damping: 22 });

  if (!enabled) return {};

  return {
    style: { rotateX: springX, rotateY: springY, transformPerspective: 800 },
    onMouseMove: (event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      rotateY.set(px * maxDeg * 2);
      rotateX.set(py * -maxDeg * 2);
    },
    onMouseLeave: () => {
      rotateX.set(0);
      rotateY.set(0);
    },
  };
}

/** Single-line scrolling ticker for critical events — capped to one per page per the design system. */
export function Marquee({ items }: { items: ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden border-b border-accent/40 bg-accent/10">
      <div className="marquee-track flex w-max items-center gap-10 py-1.5 whitespace-nowrap">
        {[...items, ...items].map((item, index) => (
          <span key={index} className="label flex items-center gap-2 text-[10px] font-bold text-accent">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PanelHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="label flex items-center gap-2 text-xs font-bold text-foreground">
          <span className="text-accent">[</span>
          <span className="truncate">{title}</span>
          <span className="text-accent">]</span>
        </h2>
        {subtitle && <p className="label mt-1 text-[10px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

// Red is reserved for destructive/critical actions only — every primary CTA reusing it would
// flatten the signal. Primary borrows the "selected terminal line" convention instead: an
// inverted, full-contrast block.
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-foreground text-surface hover:bg-white',
  secondary: 'border border-line bg-transparent text-foreground hover:border-foreground',
  danger: 'border border-accent/60 bg-accent/10 text-accent hover:bg-accent/20',
  ghost: 'text-muted hover:bg-panel-raised hover:text-foreground',
};

export function Button({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={cx(
        'label inline-flex items-center justify-center gap-2 border border-transparent px-3 py-2 text-xs font-bold transition-[color,background-color,border-color,transform] duration-150',
        'active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: DeviceStatus }) {
  const online = status === 'online';
  return (
    <span className="label inline-flex items-center gap-1.5 border border-line px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
      <span className={cx('size-1.5', online ? 'animate-pulse bg-live' : 'bg-muted')} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span className={cx('label inline-flex items-center border px-1.5 py-0.5 text-[10px] font-bold', style.bg, style.text, style.border)}>
      {severity}
    </span>
  );
}

export function HealthBadge({ status }: { status: HealthStatus | null }) {
  if (!status) return <span className="label text-[10px] text-muted">No score yet</span>;
  const style = HEALTH_STYLES[status];
  return <span className={cx('label inline-flex items-center border px-1.5 py-0.5 text-[10px] font-bold', style.bg, style.text, style.border)}>{style.label}</span>;
}

/** Circular progress readout, kept for pages not yet migrated to the segmented HealthMeter. */
export function HealthRing({ score, status, size = 64 }: { score: number | null; status: HealthStatus | null; size?: number }) {
  const stroke = size / 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = score === null ? 0 : Math.min(Math.max(score, 0), 100) / 100;
  const color = status ? HEALTH_STYLES[status].stroke : '#7a7a7a';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Health ${score ?? 'unknown'}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#2b2b2b" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 600ms ease, stroke 600ms ease' }}
        />
      </svg>
      <span
        className="tabular absolute inset-0 grid place-items-center font-mono font-bold"
        style={{ fontSize: size * 0.26, color: status === 'critical' ? color : '#eaeaea' }}
      >
        {score === null ? '—' : Math.round(score)}
      </span>
    </div>
  );
}

const METER_SEGMENTS = 12;

/** Horizontal segmented bar readout — the tactical-telemetry replacement for HealthRing. */
export function HealthMeter({ score, status }: { score: number | null; status: HealthStatus | null }) {
  const style = status ? HEALTH_STYLES[status] : null;
  const lit = score === null ? 0 : Math.round((Math.min(Math.max(score, 0), 100) / 100) * METER_SEGMENTS);
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-0.5" role="img" aria-label={`Health ${score ?? 'unknown'}`}>
        {Array.from({ length: METER_SEGMENTS }, (_, index) => (
          <span
            key={index}
            className="h-3.5 w-1.5"
            style={{ background: index < lit ? (style?.stroke ?? '#eaeaea') : 'var(--color-line)' }}
          />
        ))}
      </div>
      <span className="tabular w-7 shrink-0 text-right font-mono text-sm font-bold text-foreground">{score === null ? '—' : Math.round(score)}</span>
    </div>
  );
}

export function Sparkline({ values, color, height = 40, className }: { values: number[]; color: string; height?: number; className?: string }) {
  const width = 200;
  if (values.length < 2) return <div className={className} style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cx('w-full', className)} style={{ height }} aria-hidden>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="label font-bold text-foreground">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-surface/90 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md border-2 border-line bg-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="label text-xs font-bold text-foreground">{title}</h2>
          <Button variant="ghost" className="px-2 py-1" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="label text-[10px] text-muted">{label}</span>
      {children}
    </label>
  );
}

// focus-visible carries its own outline (not just a border shift) so keyboard/low-vision users
// keep a strong indicator — the previous focus:outline-none had nothing else backing it up.
export const inputClass =
  'w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="border border-accent/50 border-l-4 border-l-accent bg-accent/10 px-3 py-2 font-mono text-xs text-accent">{message}</div>;
}
