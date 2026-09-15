import { Activity, BellRing, LayoutDashboard, LogOut, SlidersHorizontal } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/live';
import { Toasts } from './Toasts';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/alerts', label: 'Alerts', icon: BellRing, end: false },
  { to: '/rules', label: 'Alert rules', icon: SlidersHorizontal, end: false },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { connected, overview } = useLive();
  const openAlerts = overview?.alerts.open ?? 0;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 lg:px-5 lg:py-5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center border border-foreground bg-foreground text-surface">
              <Activity className="size-4" strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-display text-sm leading-none">MachineWatch</p>
              <p className="label mt-1 text-[10px] leading-none text-muted">Predictive maintenance</p>
            </div>
          </div>
          <ConnectionPill connected={connected} className="lg:hidden" />
        </div>

        <nav className="flex gap-px overflow-x-auto bg-line px-px pb-px lg:flex-col lg:px-0 lg:pb-0" aria-label="Primary">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'label flex items-center gap-3 border-l-2 bg-panel px-4 py-2.5 text-[11px] font-bold whitespace-nowrap transition-colors',
                  isActive ? 'border-l-accent bg-panel-raised text-foreground' : 'border-l-transparent text-muted hover:bg-panel-raised hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
              {to === '/alerts' && openAlerts > 0 && (
                <span className="tabular ml-auto bg-accent px-1.5 py-0.5 text-[10px] font-bold text-surface">{openAlerts}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-line p-4 lg:block">
          <ConnectionPill connected={connected} />
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">{user?.name}</p>
              <p className="label truncate text-[10px] text-muted">{user?.email}</p>
            </div>
            <button onClick={logout} className="border border-line p-2 text-muted hover:border-foreground hover:text-foreground" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}

function ConnectionPill({ connected, className }: { connected: boolean; className?: string }) {
  return (
    <span className={cx('label inline-flex items-center gap-2 text-[10px] font-bold', connected ? 'text-live' : 'text-warn', className)}>
      <span className={cx('size-1.5', connected ? 'bg-live' : 'animate-pulse bg-warn')} />
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  );
}
