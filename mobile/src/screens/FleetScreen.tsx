import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api';
import { Card, EmptyState, HealthMeter, Sparkline, StatusPill } from '../components/ui';
import { useLive, useNow } from '../live';
import type { RootStackParamList, TabParamList } from '../navigation';
import { colors, formatHours, formatValue, METRIC_INFO, mono, timeAgo } from '../theme';
import type { Device, Metric, Overview, Reading } from '../types';

type Props = CompositeScreenProps<BottomTabScreenProps<TabParamList, 'Fleet'>, NativeStackScreenProps<RootStackParamList>>;

const METRICS: Metric[] = ['temperature', 'vibration', 'current'];

export function FleetScreen({ navigation }: Props) {
  const { devices, latest, recent, loaded, connected, alertsVersion, refresh } = useLive();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow(5000);

  useEffect(() => {
    api.overview().then(setOverview).catch(() => {});
  }, [alertsVersion, devices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh().catch(() => {});
    setRefreshing(false);
  }, [refresh]);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={devices}
      keyExtractor={(device) => device.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View style={styles.summary}>
          <Summary label="Online" value={overview ? `${overview.devices.online}/${overview.devices.total}` : '—'} />
          <Summary label="Open alerts" value={overview?.alerts.open ?? '—'} tone={overview?.alerts.critical ? colors.bad : undefined} />
          <Summary label="Avg health" value={overview?.averageHealth == null ? '—' : Math.round(overview.averageHealth)} />
          <View style={[styles.liveDot, { backgroundColor: connected ? colors.live : colors.warn }]} />
        </View>
      }
      ListEmptyComponent={
        loaded ? <EmptyState title="No machines yet" message="Devices appear here after their first MQTT message." /> : <EmptyState title="Loading…" />
      }
      renderItem={({ item }) => (
        <MachineCard
          device={item}
          reading={latest[item.id]}
          history={recent[item.id] ?? []}
          now={now}
          onPress={() => navigation.navigate('Device', { deviceId: item.id, name: item.name })}
        />
      )}
    />
  );
}

function Summary({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MachineCard({ device, reading, history, now, onPress }: { device: Device; reading?: Reading; history: Reading[]; now: number; onPress(): void }) {
  const [sparkWidth, setSparkWidth] = useState(0);
  const offline = device.status === 'offline';
  const vibration = history.map((point) => point.vibration).filter((value): value is number => value !== null);

  return (
    <Card onPress={onPress} style={[styles.card, device.healthStatus === 'critical' && !offline && { borderColor: 'rgba(255,42,42,0.5)' }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.unit}>UNIT / {device.id}</Text>
          <Text style={styles.name} numberOfLines={2}>
            {device.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[device.location, device.type].filter(Boolean).join(' / ') || '—'}
          </Text>
          <StatusPill status={device.status} />
        </View>
        <HealthMeter score={offline ? null : device.healthScore} status={offline ? null : device.healthStatus} />
      </View>

      <View style={styles.metrics}>
        {METRICS.map((metric) => (
          <View key={metric} style={styles.metric}>
            <Text style={styles.metricLabel}>{METRIC_INFO[metric].label}</Text>
            <Text style={styles.metricValue}>
              {formatValue(metric, reading?.[metric])}
              <Text style={styles.metricUnit}> {METRIC_INFO[metric].unit}</Text>
            </Text>
          </View>
        ))}
      </View>

      <View onLayout={(event) => setSparkWidth(event.nativeEvent.layout.width)}>
        <Sparkline values={vibration} color={METRIC_INFO.vibration.color} width={sparkWidth} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.aiLine, device.hoursToLimit !== null && { color: colors.warn, fontWeight: '700' }]}>{aiLine(device)}</Text>
        <Text style={styles.footerText}>{timeAgo(device.lastSeen, now)}</Text>
      </View>
    </Card>
  );
}

export function aiLine(device: Device): string {
  if (device.aiStatus !== 'ready') return `AI learning ${Math.round((device.aiProgress ?? 0) * 100)}%`;
  if (device.hoursToLimit === 0) return 'Vibration limit exceeded';
  if (device.hoursToLimit !== null) return `Vibration limit in ~${formatHours(device.hoursToLimit)}`;
  return 'AI monitoring';
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderRadius: 0, padding: 14, marginBottom: 4, borderColor: colors.line, borderWidth: 1 },
  summaryItem: { flex: 1 },
  summaryValue: { color: colors.textStrong, fontFamily: mono, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  summaryLabel: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  liveDot: { width: 8, height: 8, borderRadius: 0 },
  card: { gap: 12 },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  unit: { color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  name: { color: colors.textStrong, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  meta: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, paddingVertical: 8 },
  metricLabel: { color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { color: colors.textStrong, fontFamily: mono, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricUnit: { color: colors.muted, fontSize: 10, fontWeight: '400' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  aiLine: { flex: 1, color: colors.muted, fontSize: 12 },
  footerText: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },
});
