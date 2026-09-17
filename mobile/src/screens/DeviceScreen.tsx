import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert as NativeAlert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api';
import { AlertItem } from '../components/AlertItem';
import { Button, Card, EmptyState, HealthRing, SimulatedPill, Sparkline, StatusPill } from '../components/ui';
import { useLive, useNow } from '../live';
import type { RootStackParamList } from '../navigation';
import { colors, formatValue, HEALTH_COLORS, METRIC_INFO, mono, timeAgo } from '../theme';
import type { Alert, Metric, Reading } from '../types';
import { aiLine } from './FleetScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Device'>;

const HISTORY_MS = 10 * 60_000;
const MAX_POINTS = 120;
const METRICS: Metric[] = ['vibration', 'temperature', 'current', 'humidity'];

export function DeviceScreen({ route, navigation }: Props) {
  const { deviceId } = route.params;
  const { devices, latest, alertsVersion } = useLive();
  const device = devices.find((item) => item.id === deviceId);
  const reading = latest[deviceId];
  const now = useNow(2000);

  const [history, setHistory] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [chartWidth, setChartWidth] = useState(0);
  const [sending, setSending] = useState(false);

  useLayoutEffect(() => {
    if (device) navigation.setOptions({ title: device.name });
  }, [device?.name, navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const end = Date.now();
    api
      .telemetry(deviceId, end - HISTORY_MS, end, MAX_POINTS)
      .then((result) => setHistory(result.readings))
      .catch(() => {});
  }, [deviceId]);

  // Append live readings, keeping roughly one point every five seconds.
  useEffect(() => {
    if (!reading) return;
    setHistory((current) => {
      const last = current.at(-1);
      if (last && reading.ts - last.ts < HISTORY_MS / MAX_POINTS) return current;
      return [...current, reading].filter((point) => point.ts >= reading.ts - HISTORY_MS);
    });
  }, [reading]);

  const loadAlerts = useCallback(() => {
    api.alerts('all', deviceId).then((result) => setAlerts(result.slice(0, 10))).catch(() => {});
  }, [deviceId]);
  useEffect(loadAlerts, [loadAlerts, alertsVersion]);

  if (!device) return <EmptyState title="Machine not found" />;

  const running = device.relayState ?? reading?.running ?? true;

  const sendCommand = (relay: boolean) => {
    setSending(true);
    api
      .command(device.id, relay)
      .catch((err) => NativeAlert.alert('Command failed', errorMessage(err)))
      .finally(() => setSending(false));
  };

  const toggleRelay = () => {
    if (!running) return sendCommand(true);
    NativeAlert.alert('Stop machine?', `A relay OFF command will be sent to ${device.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => sendCommand(false) },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.healthCard}>
        <HealthRing score={device.healthScore} status={device.healthStatus} size={84} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <StatusPill status={device.status} />
            {device.simulated && <SimulatedPill />}
          </View>
          <Text style={[styles.healthLabel, device.healthStatus && { color: HEALTH_COLORS[device.healthStatus] }]}>
            {device.healthStatus ? device.healthStatus.toUpperCase() : 'NO SCORE YET'}
          </Text>
          <Text style={styles.muted}>{aiLine(device)}</Text>
          <Text style={styles.muted}>Last seen {timeAgo(device.lastSeen, now)}</Text>
        </View>
      </Card>

      <Button
        title={running ? 'Stop machine' : 'Start machine'}
        variant={running ? 'danger' : 'primary'}
        onPress={toggleRelay}
        loading={sending}
        disabled={device.status === 'offline'}
      />

      <View onLayout={(event) => setChartWidth(event.nativeEvent.layout.width - 28)} style={{ gap: 12 }}>
        {METRICS.map((metric) => {
          const values = history.map((point) => point[metric]).filter((value): value is number => value !== null);
          if (values.length === 0 && reading?.[metric] == null) return null;
          const info = METRIC_INFO[metric];
          return (
            <Card key={metric} style={{ gap: 8 }}>
              <View style={styles.metricHeader}>
                <Text style={styles.metricTitle}>{info.label}</Text>
                <Text style={[styles.metricValue, { color: info.color }]}>
                  {formatValue(metric, reading?.[metric] ?? values.at(-1))}
                  <Text style={styles.metricUnit}> {info.unit}</Text>
                </Text>
              </View>
              <Sparkline values={values} color={info.color} width={chartWidth} height={56} />
              <Text style={styles.muted}>Last 10 minutes</Text>
            </Card>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>[ Recent alerts ]</Text>
      <Card style={{ padding: 0 }}>
        {alerts.length === 0 ? (
          <EmptyState title="No alerts for this machine" />
        ) : (
          alerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              now={now}
              onAcknowledge={() => api.acknowledgeAlert(alert.id).then(loadAlerts).catch(() => {})}
            />
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  healthCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  healthLabel: { color: colors.muted, fontWeight: '700', fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  muted: { color: colors.muted, fontSize: 12 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  metricTitle: { color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontFamily: mono, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricUnit: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  sectionTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
});
