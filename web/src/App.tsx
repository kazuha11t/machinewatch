import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AuthProvider, RequireAuth } from './lib/auth';
import { LiveProvider } from './lib/live';
import { AlertsPage } from './pages/AlertsPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { RulesPage } from './pages/RulesPage';

// The device page pulls in the charting library; load it only when a machine is opened.
const DevicePage = lazy(() => import('./pages/DevicePage').then((module) => ({ default: module.DevicePage })));

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <LiveProvider>
                  <Layout />
                </LiveProvider>
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route
              path="devices/:id"
              element={
                <Suspense fallback={<p className="text-sm text-muted">Loading machine…</p>}>
                  <DevicePage />
                </Suspense>
              }
            />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="rules" element={<RulesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
