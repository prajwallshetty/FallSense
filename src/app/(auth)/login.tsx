import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlaskConical, Shield } from 'lucide-react-native';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { DEMO_ACCOUNTS, DemoAccount, isDemoEmail } from '../../services/demoAuth';
import { useAuthStore } from '../../store/authStore';
import { validateEmail } from '../../utils/validation';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { colors, spacing, TOUCH_MIN, type } from '../../theme';

export default function LoginScreen() {
  const router = useRouter();
  const signInDemo = useAuthStore((s) => s.signInDemo);
  const firebaseAvailable = useAuthStore((s) => s.firebaseAvailable);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Signs straight in as a demo account, so a demo needs no typing. */
  const signInAsDemo = async (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await signInDemo(account.email, account.password);
      // The root layout redirects to the role's dashboard.
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const e = validateEmail(email);
    const next = { email: e.ok ? undefined : e.error, password: password ? undefined : 'Password is required.' };
    setErrors(next);
    if (!e.ok || !password) return;
    setBusy(true);
    setFormError(null);
    try {
      // Demo credentials are checked locally first, so a successful demo sign-in never
      // touches Firebase and never surfaces a Firebase error.
      const demo = await signInDemo(e.value, password);
      if (demo.ok) return;

      // A demo email with the wrong password stops here rather than retrying against
      // Firebase, where the account does not exist.
      if (isDemoEmail(e.value)) {
        setFormError('That demo password is incorrect. Check the demo accounts below.');
        return;
      }
      if (!firebaseAvailable) {
        setFormError('Firebase sign-in is not configured in this build. Use a demo account below.');
        return;
      }
      await firebaseService.signIn(e.value, password);
      // The root layout redirects once the profile loads.
    } catch (err) {
      setFormError(describeFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Shield size={40} color={colors.primary} />
          </View>
          <Text style={type.display}>SafeFall AI</Text>
          <Text style={[type.body, { textAlign: 'center', marginTop: spacing.sm }]}>Fall alerts from your watch to the people who care for you.</Text>
        </View>

        <Card tone="accent" style={styles.demoCard}>
          <View style={styles.demoHeader}>
            <View style={styles.demoBadge}>
              <FlaskConical size={16} color={colors.primary} />
              <Text style={styles.demoBadgeText}>DEMO MODE</Text>
            </View>
          </View>
          <Text style={[type.body, { marginTop: spacing.sm }]}>
            Sign in locally with one of the two demo accounts below. No internet or Firebase account needed.
          </Text>
          {DEMO_ACCOUNTS.map((account) => (
            <View key={account.email} style={styles.demoAccount}>
              <Text style={type.bodyStrong}>{account.label}</Text>
              <Text style={styles.demoCreds}>
                {account.email} · {account.password}
              </Text>
              <Text style={styles.demoBlurb}>{account.blurb}</Text>
              <Button
                title={`Sign in as ${account.label}`}
                variant="outline"
                onPress={() => signInAsDemo(account)}
                disabled={busy}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ))}
        </Card>

        {formError ? <ErrorBanner message={formError} /> : null}
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={errors.email} />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" error={errors.password} onSubmitEditing={submit} />
        <Button title="Sign in" onPress={submit} isLoading={busy} size="lg" />

        <Pressable onPress={() => router.push('/(auth)/forgot-password')} accessibilityRole="link" style={styles.link}>
          <Text style={styles.linkText}>Forgot password?</Text>
        </Pressable>
        <View style={styles.divider} />
        <Text style={[type.body, { textAlign: 'center' }]}>New to SafeFall?</Text>
        <Button title="Create an account" variant="outline" onPress={() => router.push('/(auth)/signup')} style={{ marginTop: spacing.md }} />

        <Text style={styles.disclaimer}>
          SafeFall AI is a safety aid prototype, not a certified medical device, and does not replace emergency services.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxxl },
  logo: { width: 84, height: 84, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  link: { minHeight: TOUCH_MIN, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  linkText: { color: colors.primary, fontSize: 17, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xl },
  demoCard: { marginBottom: spacing.xl },
  demoHeader: { flexDirection: 'row' },
  demoBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
  demoBadgeText: { color: colors.primary, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  demoAccount: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  demoCreds: { ...type.caption, color: colors.text, marginTop: 2 },
  demoBlurb: { ...type.caption, marginTop: 2 },
  disclaimer: { ...type.caption, textAlign: 'center', marginTop: spacing.xxxl },
});
