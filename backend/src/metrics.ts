export const METRICS = ['temperature', 'vibration', 'current', 'humidity'] as const;

export type Metric = (typeof METRICS)[number];

export const METRIC_INFO: Record<Metric, { label: string; unit: string }> = {
  temperature: { label: 'Temperature', unit: '°C' },
  vibration: { label: 'Vibration', unit: 'mm/s' },
  current: { label: 'Current', unit: 'A' },
  humidity: { label: 'Humidity', unit: '%' },
};

/** ISO 10816-3 zone C/D boundary for medium machines on rigid foundations. */
export const VIBRATION_LIMIT_MM_S = 7.1;

export function formatMetric(metric: Metric, value: number): string {
  return `${value.toFixed(1)} ${METRIC_INFO[metric].unit}`;
}
