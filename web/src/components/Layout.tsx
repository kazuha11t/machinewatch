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
      <aside className="flex shrink-0 flex-col border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-sky-500 text-slate-950">
              <Activity className="size-5" strokeWidth={2.5} />
            </div>
            <div>
              <p className="leading-tight font-semibold">MachineWatch</p>
              <p className="text-[11px] leading-tight text-muted">Predictive maintenance</p>
            </div>
          </div>
          <ConnectionPill connected={connected} className="lg:hidden" />
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                  isActive ? 'bg-sky-500/10 font-medium text-sky-300' : 'text-muted hover:bg-panel-raised hover:text-slate-100',
                )
              }
            >
              <Icon className="size-4" />
              {label}
              {to === '/alerts' && openAlerts > 0 && (
                <span className="tabular ml-auto rounded-full bg-bad/15 px-1.5 text-xs font-semibold text-bad">{openAlerts}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-line p-4 lg:block">
          <ConnectionPill connected={connected} />
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <button onClick={logout} className="rounded-md p-2 text-muted hover:bg-panel-raised hover:text-slate-100" aria-label="Sign out" title="Sign out">
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
    <span className={cx('inline-flex items-center gap-2 text-xs', connected ? 'text-ok' : 'text-warn', className)}>
      <span className={cx('size-2 rounded-full', connected ? 'bg-ok' : 'animate-pulse bg-warn')} />
      {connected ? 'Live' : 'Reconnecting…'}
    </span>
  );
}
