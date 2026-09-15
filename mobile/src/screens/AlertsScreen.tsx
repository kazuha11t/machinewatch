import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api';
import { AlertItem } from '../components/AlertItem';
import { EmptyState } from '../components/ui';
import { useLive, useNow } from '../live';
import type { RootStackParamList, TabParamList } from '../navigation';
import { colors } from '../theme';
import type { Alert } from '../types';

type Props = CompositeScreenProps<BottomTabScreenProps<TabParamList, 'Alerts'>, NativeStackScreenProps<RootStackParamList>>;

export function AlertsScreen({ navigation }: Props) {
  const { devices, alertsVersion } = useLive();
  const [state, setState] = useState<'open' | 'all'>('open');
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow(10_000);

  const names = useMemo(() => Object.fromEntries(devices.map((device) => [device.id, device.name])), [devices]);

  const load = useCallback(async () => {
    setAlerts(await api.alerts(state).catch(() => []));
  }, [state]);

  useEffect(() => {
    void load();
  }, [load, alertsVersion]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.segment}>
        {(['open', 'all'] as const).map((option) => (
          <Pressable key={option} onPress={() => setState(option)} style={[styles.segmentItem, state === option && styles.segmentActive]}>
            <Text style={[styles.segmentText, state === option && styles.segmentTextActive]}>{option === 'open' ? 'Open' : 'All'}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={alerts ?? []}
        keyExtractor={(alert) => String(alert.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={alerts === null ? <EmptyState title="Loading…" /> : <EmptyState title={state === 'open' ? 'All clear' : 'No alerts'} message="New alerts appear here in real time." />}
        renderItem={({ item }) => (
          <AlertItem
            alert={item}
            deviceName={names[item.deviceId] ?? item.deviceId}
            now={now}
            onPress={() => navigation.navigate('Device', { deviceId: item.deviceId, name: names[item.deviceId] })}
            onAcknowledge={() => api.acknowledgeAlert(item.id).then(load).catch(() => {})}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  segment: { flexDirection: 'row', margin: 16, marginBottom: 8, backgroundColor: colors.panel, borderRadius: 0, borderColor: colors.line, borderWidth: 1 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 0, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  segmentActive: { borderBottomColor: colors.accent },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  segmentTextActive: { color: colors.textStrong },
});
