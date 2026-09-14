import { useState, type FormEvent } from 'react';
import { Activity, BrainCircuit, Cpu, RadioTower } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button, ErrorBanner, Field, inputClass } from '../components/ui';
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-line bg-panel p-12 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -left-40 size-[32rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-sky-500 text-slate-950">
            <Activity className="size-5" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold">MachineWatch</span>
        </div>
        <div className="relative my-auto max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Catch machine failures <span className="text-sky-400">hours before</span> they stop your line.
          </h1>
          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-panel-raised text-sky-300">
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted">ESP32 · MQTT · Node.js · Python · React · React Native</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">Sign in</h2>
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
          <p className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-muted">
            Demo account: <span className="font-mono text-slate-300">demo@machinewatch.io</span> /{' '}
            <span className="font-mono text-slate-300">demo1234</span>
          </p>
        </form>
      </div>
    </div>
  );
}
