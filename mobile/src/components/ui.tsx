import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { colors, HEALTH_COLORS, mono, radius, SEVERITY_COLORS } from '../theme';
import type { DeviceStatus, HealthStatus, Severity } from '../types';

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

export function StatusPill({ status }: { status: DeviceStatus }) {
  const online = status === 'online';
  const color = online ? colors.live : colors.muted;
  return (
    <View style={[styles.pill, { borderColor: colors.line }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
    </View>
  );
}

/** Marks units fed by simulator.py so demo data is never mistaken for a physical sensor. */
export function SimulatedPill() {
  const color = SEVERITY_COLORS.warning;
  return (
    <View style={[styles.pill, { borderColor: color, borderStyle: 'dashed' }]} accessibilityLabel="Simulated data">
      <Text style={[styles.pillText, { color }]}>SIMULATED</Text>
    </View>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLORS[severity];
  return (
    <View style={[styles.pill, { borderColor: `${color}80`, backgroundColor: `${color}1a` }]}>
      <Text style={[styles.pillText, { color, textTransform: 'uppercase' }]}>{severity}</Text>
    </View>
  );
}

export function HealthRing({ score, status, size = 56 }: { score: number | null; status: HealthStatus | null; size?: number }) {
  const stroke = size / 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = score === null ? 0 : Math.min(Math.max(score, 0), 100) / 100;
  const color = status ? HEALTH_COLORS[status] : colors.muted;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`Health ${score ?? 'unknown'}`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>
          <Text style={[styles.ringText, { fontSize: size * 0.28, color: status === 'critical' ? color : colors.textStrong }]}>
            {score === null ? '—' : Math.round(score)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function Sparkline({ values, color, width, height = 32 }: { values: number[]; color: string; width: number; height?: number }) {
  if (values.length < 2 || width <= 0) return <View style={{ height }} />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values
    .map((value, index) => `${((index / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((value - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
    </Svg>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress(): void;
  variant?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}) {
  // Red is reserved for destructive actions — primary borrows the inverted "selected terminal
  // line" convention instead of spending the accent on every non-destructive CTA.
  const palette = {
    primary: { bg: colors.textStrong, fg: colors.surface, border: colors.textStrong },
    danger: { bg: 'rgba(255,42,42,0.12)', fg: colors.bad, border: 'rgba(255,42,42,0.4)' },
    secondary: { bg: colors.panelRaised, fg: colors.text, border: colors.line },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>}
    </Pressable>
  );
}

const METER_SEGMENTS = 12;

/** Horizontal segmented bar readout — the tactical-telemetry replacement for HealthRing in lists. */
export function HealthMeter({ score, status }: { score: number | null; status: HealthStatus | null }) {
  const color = status ? HEALTH_COLORS[status] : colors.muted;
  const lit = score === null ? 0 : Math.round((Math.min(Math.max(score, 0), 100) / 100) * METER_SEGMENTS);
  return (
    <View style={styles.meterRow} accessibilityLabel={`Health ${score ?? 'unknown'}`}>
      <View style={styles.meterBars}>
        {Array.from({ length: METER_SEGMENTS }, (_, index) => (
          <View key={index} style={[styles.meterBar, { backgroundColor: index < lit ? color : colors.track }]} />
        ))}
      </View>
      <Text style={styles.meterValue}>{score === null ? '—' : Math.round(score)}</Text>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    padding: 14,
  },
  pressed: { opacity: 0.85 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 0 },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: mono, fontWeight: '700', fontVariant: ['tabular-nums'] },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterBars: { flexDirection: 'row', gap: 2 },
  meterBar: { width: 4, height: 14 },
  meterValue: { minWidth: 26, color: colors.textStrong, fontFamily: mono, fontWeight: '700', fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  button: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  emptyMessage: { color: colors.muted, fontSize: 14, textAlign: 'center' },
});
