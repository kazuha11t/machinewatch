import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, ErrorBanner, Field, FramedPanel, Modal, SeverityBadge, cx, inputClass } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { METRICS, METRIC_INFO } from '../lib/format';
import { useLive } from '../lib/live';
import type { Metric, Rule, RuleInput, Severity } from '../lib/types';

export function RulesPage() {
  const { devices } = useLive();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .rules()
      .then(setRules)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const mutate = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="label text-[10px] text-accent">// Threshold configuration</p>
          <h1 className="font-display mt-1 text-4xl">Alert rules</h1>
          <p className="label mt-2 text-[10px] text-muted">
            Fixed thresholds complement the AI model: they catch hard limits, the AI catches subtle drift.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {rules && (
            <p className="label text-right text-[10px] text-muted">
              RULES ACTIVE: <span className="tabular font-bold text-foreground">{rules.filter((rule) => rule.enabled).length}</span>
              {'  '}ALL: <span className="tabular font-bold text-foreground">{rules.length}</span>
            </p>
          )}
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New rule
          </Button>
        </div>
      </header>

      <ErrorBanner message={error} />

      <FramedPanel>
        {rules === null ? (
          <EmptyState title="Loading rules…" />
        ) : rules.length === 0 ? (
          <EmptyState title="No rules yet">Create a rule to alert when a sensor crosses a threshold.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="label border-b border-line text-left text-[10px] text-muted">
                <tr>
                  <th className="px-4 py-3 font-bold">Condition</th>
                  <th className="px-4 py-3 font-bold">Applies to</th>
                  <th className="px-4 py-3 font-bold">Severity</th>
                  <th className="px-4 py-3 font-bold">Cooldown</th>
                  <th className="px-4 py-3 font-bold">Enabled</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rules.map((rule) => (
                  <tr key={rule.id} className={cx(!rule.enabled && 'opacity-50')}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {METRIC_INFO[rule.metric].label} {rule.operator === '>' ? 'above' : 'below'}{' '}
                      <span className="tabular font-mono">
                        {rule.threshold} {METRIC_INFO[rule.metric].unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{rule.deviceId ? (devices[rule.deviceId]?.name ?? rule.deviceId) : 'All machines'}</td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={rule.severity} />
                    </td>
                    <td className="tabular px-4 py-3 text-muted">{Math.round(rule.cooldownSec / 60)} min</td>
                    <td className="px-4 py-3">
                      <Toggle checked={rule.enabled} onChange={(enabled) => mutate(() => api.updateRule(rule.id, { enabled }))} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        className="px-2 py-1"
                        aria-label="Delete rule"
                        onClick={() => window.confirm('Delete this rule?') && mutate(() => api.deleteRule(rule.id))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FramedPanel>

      <CreateRuleModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (input) => {
          await api.createRule(input);
          setCreating(false);
          load();
        }}
      />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange(value: boolean): void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        checked ? 'border-foreground bg-foreground' : 'border-line bg-transparent',
      )}
    >
      <span className={cx('absolute top-0.5 size-3.5 transition-all', checked ? 'left-4.5 bg-surface' : 'left-0.5 bg-muted')} />
    </button>
  );
}

function CreateRuleModal({ open, onClose, onCreate }: { open: boolean; onClose(): void; onCreate(input: RuleInput): Promise<void> }) {
  const { devices } = useLive();
  const [metric, setMetric] = useState<Metric>('temperature');
  const [operator, setOperator] = useState<'>' | '<'>('>');
  const [threshold, setThreshold] = useState('80');
  const [severity, setSeverity] = useState<Severity>('warning');
  const [deviceId, setDeviceId] = useState('');
  const [cooldownMin, setCooldownMin] = useState('5');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        metric,
        operator,
        threshold: Number(threshold),
        severity,
        deviceId: deviceId || null,
        cooldownSec: Math.round(Number(cooldownMin) * 60),
        enabled: true,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New alert rule" open={open} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label="Sensor">
            <select className={inputClass} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_INFO[m].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="When">
            <select className={inputClass} value={operator} onChange={(e) => setOperator(e.target.value as '>' | '<')}>
              <option value=">">above</option>
              <option value="<">below</option>
            </select>
          </Field>
          <Field label={`Threshold (${METRIC_INFO[metric].unit})`}>
            <input className={inputClass} type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
          </Field>
        </div>
        <Field label="Applies to">
          <select className={inputClass} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">All machines</option>
            {Object.values(devices).map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Severity">
            <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
              <option value="warning">Warning</option>
              <option value="critical">Critical (push notification)</option>
            </select>
          </Field>
          <Field label="Cooldown (minutes)">
            <input className={inputClass} type="number" min={0} max={1440} value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} required />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create rule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
