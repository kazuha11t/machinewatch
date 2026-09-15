import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, SEVERITY_COLORS, timeAgo } from '../theme';
import type { Alert } from '../types';
import { SeverityPill } from './ui';

const KIND_LABELS: Record<Alert['kind'], string> = {
  threshold: 'Threshold',
  anomaly: 'AI anomaly',
  offline: 'Connectivity',
};

export function AlertItem({
  alert,
  deviceName,
  now,
  onAcknowledge,
  onPress,
}: {
  alert: Alert;
  deviceName?: string;
  now: number;
  onAcknowledge?: () => void;
  onPress?: () => void;
}) {
  const acknowledged = alert.acknowledgedAt !== null;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, acknowledged && { opacity: 0.55 }]}>
      <View style={[styles.bar, { backgroundColor: SEVERITY_COLORS[alert.severity] }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.meta}>
          <SeverityPill severity={alert.severity} />
          <Text style={styles.metaText}>{KIND_LABELS[alert.kind]}</Text>
          {deviceName ? <Text style={[styles.metaText, styles.device]}>{deviceName}</Text> : null}
        </View>
        <Text style={styles.message}>{alert.message}</Text>
        <Text style={styles.metaText}>{timeAgo(alert.ts, now)}</Text>
      </View>
      {onAcknowledge && !acknowledged ? (
        <Pressable accessibilityRole="button" onPress={onAcknowledge} hitSlop={8} style={styles.ack}>
          <Text style={styles.ackText}>Ack</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 14, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  bar: { width: 3, borderRadius: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaText: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' },
  device: { color: colors.text, fontWeight: '700' },
  message: { color: colors.text, fontSize: 14, lineHeight: 20 },
  ack: { alignSelf: 'center', borderColor: colors.line, borderWidth: 1, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 6 },
  ackText: { color: colors.textStrong, fontWeight: '700', fontSize: 13 },
});
