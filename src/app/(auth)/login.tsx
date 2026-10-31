import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { FlaskConical, Shield } from 'lucide-react-native';
import { env } from '../../config/env';
import { apiClient } from '../../services/apiClient';
import { CloudRole } from '../../services/authService';
import { DEMO_ACCOUNTS, DemoAccount } from '../../services/demoAuth';
import { useAuthStore } from '../../store/authStore';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { Segmented } from '../../components/ui/Segmented';
import { colors, spacing, type } from '../../theme';

const ROLES: { value: CloudRole; label: string }[] = [
  { value: 'user', label: 'I wear the watch' },
  { value: 'caretaker', label: 'I am a caretaker' },
];

function DemoPanel() {
  const signInDemo = useAuthStore((s) => s.signInDemo);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: string, p: string) => {
    setError(null);
    setBusy(true);
    const result = await signInDemo(e, p);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };
  const quick = (a: DemoAccount) => {
    setEmail(a.email);
    setPassword(a.password);
    signIn(a.email, a.password);
  };

  return (
    <Card tone="accent">
      <View style={styles.badge}>
        <FlaskConical size={16} color={colors.primary} />
        <Text style={styles.badgeText}>DEMO MODE</Text>
      </View>
      <Text style={[type.body, { marginTop: spacing.sm, marginBottom: spacing.md }]}>
        Local accounts for demonstrations only. Nothing is sent to the cloud and no caretaker is notified.
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
      <Input label="Demo email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Demo password" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title="Sign in to demo" variant="secondary" isLoading={busy} onPress={() => signIn(email, password)} />
      {DEMO_ACCOUNTS.map((a) => (
        <View key={a.email} style={styles.account}>
          <Text style={type.bodyStrong}>{a.label}</Text>
          <Text style={styles.creds}>{a.email} · {a.password}</Text>
          <Button title={`Sign in as ${a.label}`} variant="outline" disabled={busy} onPress={() => quick(a)} style={{ marginTop: spacing.sm }} />
        </View>
      ))}
    </Card>
  );
}

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signInWithAccessCode);
  const storeError = useAuthStore((s) => s.error);
  const [role, setRole] = useState<CloudRole>('user');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (code.trim().length < 4) {
      setCodeError('Enter the access code you were given.');
      return;
    }
    setCodeError(undefined);
    setFormError(null);
    setBusy(true);
    const result = await signIn(code, role);
    setBusy(false);
    if (!result.ok) setFormError(result.error);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Shield size={36} color={colors.primary} />
          </View>
          <Text style={type.display}>SafeFall AI</Text>
          <Text style={[type.body, { textAlign: 'center', marginTop: spacing.sm }]}>Fall alerts from your watch to the people who care for you.</Text>
        </View>

        {apiClient.configured ? (
          <>
            {formError || storeError ? <ErrorBanner message={(formError ?? storeError)!} /> : null}
            <Segmented value={role} options={ROLES} onChange={setRole} accessibilityLabel="Who is signing in" />
            <Input
              label={role === 'user' ? 'User access code' : 'Caretaker access code'}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              error={codeError}
              hint="You will get this from your SafeFall administrator."
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            <Button title="Sign in" onPress={submit} isLoading={busy} size="lg" />
          </>
        ) : (
          <Card tone="warning">
            <Text style={type.bodyStrong}>Not connected to a SafeFall server</Text>
            <Text style={[type.body, { marginTop: spacing.xs }]}>This build has no server address, so access codes cannot be checked.</Text>
          </Card>
        )}

        {env.demoModeEnabled ? <View style={{ marginTop: spacing.xl }}><DemoPanel /></View> : null}

        <Text style={styles.disclaimer}>
          SafeFall AI is a safety aid prototype, not a certified medical device, and does not replace emergency services.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxl },
  logo: { width: 76, height: 76, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
  badgeText: { color: colors.primary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  account: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  creds: { ...type.caption, color: colors.text, marginTop: 2 },
  disclaimer: { ...type.caption, textAlign: 'center', marginTop: spacing.xxxl },
});
