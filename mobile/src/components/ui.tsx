import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { colors, HEALTH_COLORS, radius, SEVERITY_COLORS } from '../theme';
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
  const color = online ? colors.ok : colors.muted;
  return (
    <View style={[styles.pill, { backgroundColor: online ? 'rgba(52,211,153,0.12)' : 'rgba(100,116,139,0.18)' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{online ? 'Online' : 'Offline'}</Text>
    </View>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLORS[severity];
  return (
    <View style={[styles.pill, { backgroundColor: `${color}22` }]}>
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
  const palette = {
    primary: { bg: colors.accent, fg: colors.surface, border: colors.accent },
    danger: { bg: 'rgba(248,113,113,0.12)', fg: colors.bad, border: 'rgba(248,113,113,0.4)' },
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
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  button: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyMessage: { color: colors.muted, fontSize: 14, textAlign: 'center' },
});
