import React, { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { validateEmail } from '../../utils/validation';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/Feedback';
import { spacing, type } from '../../theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e = validateEmail(email);
    setError(e.ok ? undefined : e.error);
    if (!e.ok) return;
    setBusy(true);
    setFormError(null);
    try {
      await firebaseService.sendPasswordReset(e.value);
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Do not reveal whether an account exists.
      if (code === 'auth/user-not-found') setSent(true);
      else setFormError(describeFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Reset password" subtitle="We'll email you a link to choose a new password." back>
      {sent ? (
        <Card tone="accent">
          <Text style={type.heading}>Check your email</Text>
          <Text style={[type.body, { marginVertical: spacing.md }]}>
            If an account exists for {email.trim()}, a reset link is on its way. It can take a few minutes; check your spam folder too.
          </Text>
          <Button title="Back to sign in" onPress={() => router.back()} />
        </Card>
      ) : (
        <>
          {formError ? <ErrorBanner message={formError} /> : null}
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={error} />
          <Button title="Send reset link" onPress={submit} isLoading={busy} size="lg" />
        </>
      )}
    </Screen>
  );
}
