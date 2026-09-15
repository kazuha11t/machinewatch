import { useState, type FormEvent } from 'react';
import { Activity, BrainCircuit, Cpu, RadioTower } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Bracket, Button, cx, ErrorBanner, Field, inputClass } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

const HIGHLIGHTS = [
  { icon: RadioTower, title: 'Live telemetry', text: 'ESP32 sensors stream temperature, vibration and current over MQTT.' },
  { icon: BrainCircuit, title: 'AI anomaly detection', text: 'Learns each machine’s normal behaviour and flags drift before limits are hit.' },
  { icon: Cpu, title: 'Remote control', text: 'Start or stop machines and get critical alerts on your phone.' },
];

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('demo@machinewatch.io');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
  if (token) return <Navigate to={redirectTo} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[3fr_2fr]">
      <div
        className="relative hidden overflow-hidden border-r border-line bg-panel p-12 lg:flex lg:flex-col"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, var(--color-line) 0px, var(--color-line) 1px, transparent 1px, transparent 64px), repeating-linear-gradient(90deg, var(--color-line) 0px, var(--color-line) 1px, transparent 1px, transparent 64px)',
          backgroundPosition: '-1px -1px',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center border border-foreground bg-foreground text-surface">
            <Activity className="size-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg">MachineWatch</span>
          <span className="label ml-auto text-[10px] text-muted">UNIT-CTRL/01</span>
        </div>
        <div className="relative my-auto max-w-lg bg-panel/80 py-2">
          <div className="relative border border-line p-6">
            <Bracket tone="accent" />
            <h1 className="font-display text-4xl sm:text-5xl">
              Catch machine failures <span className="text-accent">hours before</span> they stop your line.
            </h1>
          </div>
          <ul className="mt-10 space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="rise-in flex items-start gap-3" style={{ animationDelay: `${index * 150}ms` }}>
                <span className={cx('mt-1.5 size-1.5 shrink-0', index === 0 && 'pulse-critical bg-live', index !== 0 && 'bg-muted')} />
                <div className="min-w-0 flex-1">
                  <div className="label flex items-baseline gap-2 text-[10px] font-bold text-foreground">
                    <Icon className="size-3.5 shrink-0 text-accent" />
                    <span className="shrink-0">{title}</span>
                    <span className="min-w-0 flex-1 overflow-hidden text-muted" aria-hidden>
                      {'.'.repeat(40)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="label relative text-[10px] text-muted">ESP32 / MQTT / Node.js / Python / React / React Native — REV 2.6</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="font-display text-3xl">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use the demo account below to explore the dashboard.</p>
          </div>
          <ErrorBanner message={error} />
          <Field label="Email">
            <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="border border-line bg-panel px-3 py-2 font-mono text-xs text-muted">
            Demo account: <span className="text-foreground">demo@machinewatch.io</span> / <span className="text-foreground">demo1234</span>
          </p>
        </form>
      </div>
    </div>
  );
}
