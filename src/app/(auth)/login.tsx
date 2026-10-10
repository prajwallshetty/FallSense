import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { validateEmail } from '../../utils/validation';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { colors, spacing, TOUCH_MIN, type } from '../../theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e = validateEmail(email);
    const next = { email: e.ok ? undefined : e.error, password: password ? undefined : 'Password is required.' };
    setErrors(next);
    if (!e.ok || !password) return;
    setBusy(true);
    setFormError(null);
    try {
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
  disclaimer: { ...type.caption, textAlign: 'center', marginTop: spacing.xxxl },
});
