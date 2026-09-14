import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from '../api';
import { useAuth } from '../auth';
import { Button } from '../components/ui';
import { API_URL } from '../config';
import { colors, radius } from '../theme';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('demo@machinewatch.io');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>MW</Text>
          </View>
          <Text style={styles.title}>MachineWatch</Text>
          <Text style={styles.subtitle}>Machine health and alerts in your pocket.</Text>
        </View>

        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            onSubmitEditing={submit}
            placeholderTextColor={colors.muted}
          />
          <View style={{ marginTop: 8 }}>
            <Button title="Sign in" onPress={submit} loading={submitting} />
          </View>
          <Text style={styles.hint}>Server: {API_URL}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 32 },
  brand: { alignItems: 'center', gap: 8 },
  logo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.surface, fontWeight: '800', fontSize: 20 },
  title: { color: colors.textStrong, fontSize: 26, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 14 },
  form: { gap: 8 },
  label: { color: colors.muted, fontSize: 13, marginTop: 6 },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.sm,
    color: colors.textStrong,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { color: colors.bad, backgroundColor: 'rgba(248,113,113,0.1)', padding: 10, borderRadius: radius.sm },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
