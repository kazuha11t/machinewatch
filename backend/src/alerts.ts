import type { Rule, SensorValues } from './db.ts';
import { formatMetric, METRIC_INFO } from './metrics.ts';

export interface RuleHit {
  rule: Rule;
  value: number;
}

/**
 * Returns the rules breached by a reading, skipping rules that already fired
 * within their cooldown window so a sustained breach does not flood the alert feed.
 */
export function evaluateRules(
  rules: readonly Rule[],
  values: SensorValues,
  lastFiredAt: (ruleId: number) => number | undefined,
  now: number,
): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const value = values[rule.metric];
    if (value === null) continue;
    const breached = rule.operator === '>' ? value > rule.threshold : value < rule.threshold;
    if (!breached) continue;
    const last = lastFiredAt(rule.id);
    if (last !== undefined && now - last < rule.cooldownSec * 1000) continue;
    hits.push({ rule, value });
  }
  return hits;
}

export function describeRuleHit({ rule, value }: RuleHit): string {
  const verb = rule.operator === '>' ? 'above' : 'below';
  return `${METRIC_INFO[rule.metric].label} ${formatMetric(rule.metric, value)} is ${verb} the ${formatMetric(rule.metric, rule.threshold)} limit`;
}

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} days`;
}
