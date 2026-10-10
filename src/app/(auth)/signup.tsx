import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { normalizePhone, validateEmail, validateName, validatePassword } from '../../utils/validation';
import { env } from '../../config/env';
import { UserRole } from '../../types';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { RolePicker } from '../../components/Forms/RolePicker';

export default function SignupScreen() {
  const [role, setRole] = useState<UserRole>('elderly');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = validateName(fullName, 'Full name');
    const e = validateEmail(email);
    const p = normalizePhone(phone, env.defaultCountryCode);
    const pw = validatePassword(password);
    setErrors({
      fullName: n.ok ? undefined : n.error,
      email: e.ok ? undefined : e.error,
      phone: p.ok ? undefined : p.error,
      password: pw.ok ? undefined : pw.error,
    });
    if (!n.ok || !e.ok || !p.ok || !pw.ok) return;
    setBusy(true);
    setFormError(null);
    try {
      const uid = await firebaseService.signUp(e.value, pw.value);
      // If this write fails (e.g. offline) the root layout routes to "complete profile".
      await firebaseService.createProfile({ uid, email: e.value, role, fullName: n.value, phone: p.value });
    } catch (err) {
      setFormError(describeFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Create account" subtitle="Who will use this phone?" back>
        <RolePicker value={role} onChange={setRole} />
        {formError ? <ErrorBanner message={formError} /> : null}
        <Input label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" error={errors.fullName} />
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} />
        <Input
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder={env.defaultCountryCode ? undefined : '+91 98765 43210'}
          hint={env.defaultCountryCode ? `Country code +${env.defaultCountryCode} is added if you leave it out.` : 'Include your country code.'}
          error={errors.phone}
        />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="At least 8 characters with a letter and a number." error={errors.password} />
        <Button title="Create account" onPress={submit} isLoading={busy} size="lg" />
      </Screen>
    </KeyboardAvoidingView>
  );
}
