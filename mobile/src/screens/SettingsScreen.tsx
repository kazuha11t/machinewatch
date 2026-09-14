import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { Button, Card } from '../components/ui';
import { API_URL } from '../config';
import { useLive } from '../live';
import { supportsRemotePush } from '../notifications';
import { colors } from '../theme';

export function SettingsScreen() {
  const { user, logout, remotePush } = useAuth();
  const { connected } = useLive();

  const notificationMode =
    Platform.OS === 'web'
      ? 'Not available on web'
      : remotePush
        ? 'Push notifications (critical alerts)'
        : supportsRemotePush()
          ? 'Push registration pending (check permissions)'
          : 'Local notifications while the app is running (use a development build for remote push)';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.group}>
        <Row label="Signed in as" value={user ? `${user.name}\n${user.email}` : '—'} />
        <Row label="Server" value={API_URL} />
        <Row label="Live connection" value={connected ? 'Connected' : 'Reconnecting…'} valueColor={connected ? colors.ok : colors.warn} />
        <Row label="Alerts" value={notificationMode} last />
      </Card>
      <Button title="Sign out" variant="secondary" onPress={() => void logout()} />
      <Text style={styles.footer}>MachineWatch 1.0.0</Text>
    </ScrollView>
  );
}

function Row({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  group: { padding: 0 },
  row: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  rowBorder: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { color: colors.muted, fontSize: 12 },
  value: { color: colors.text, fontSize: 15 },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
