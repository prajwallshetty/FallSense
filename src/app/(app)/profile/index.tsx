import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { firebaseService } from '../../../services/firebase';
import { describeFirebaseError } from '../../../services/firebaseApp';
import { normalizePhone, validateName } from '../../../utils/validation';
import { env } from '../../../config/env';
import { Screen } from '../../../components/ui/Screen';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner } from '../../../components/ui/Feedback';
import { spacing, type } from '../../../theme';

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile)!;
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone);
  const [medicalNotes, setMedicalNotes] = useState(profile.medicalNotes ?? '');
  const [bloodType, setBloodType] = useState(profile.bloodType ?? '');
  const [birthYear, setBirthYear] = useState(profile.birthYear ? String(profile.birthYear) : '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isElderly = profile.role === 'elderly';

  const save = async () => {
    const n = validateName(fullName, 'Full name');
    const p = normalizePhone(phone, env.defaultCountryCode);
    const year = birthYear.trim() ? Number.parseInt(birthYear, 10) : null;
    const yearOk = year === null || (Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear());
    const next = {
      fullName: n.ok ? undefined : n.error,
      phone: p.ok ? undefined : p.error,
      medicalNotes: medicalNotes.length > 500 ? 'Keep this under 500 characters.' : undefined,
      bloodType: bloodType.length > 10 ? 'Too long.' : undefined,
      birthYear: yearOk ? undefined : 'Enter a 4-digit year.',
    };
    setErrors(next);
    if (!n.ok || !p.ok || Object.values(next).some(Boolean)) return;
    setBusy(true);
    setFormError(null);
    try {
      await firebaseService.updateProfile(profile.userId, {
        fullName: n.value,
        phone: p.value,
        ...(isElderly ? { medicalNotes: medicalNotes.trim(), bloodType: bloodType.trim(), birthYear: year } : {}),
      });
      router.back();
    } catch (e) {
      setFormError(describeFirebaseError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Your profile" back>
        {formError ? <ErrorBanner message={formError} /> : null}
        <Input label="Full name" value={fullName} onChangeText={setFullName} error={errors.fullName} />
        <Input label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
        {isElderly ? (
          <>
            <Text style={[type.caption, { marginBottom: spacing.md }]}>Optional. Visible to your linked caregivers only.</Text>
            <Input label="Medical notes" value={medicalNotes} onChangeText={setMedicalNotes} multiline style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }} error={errors.medicalNotes} />
            <Input label="Blood type" value={bloodType} onChangeText={setBloodType} autoCapitalize="characters" error={errors.bloodType} />
            <Input label="Year of birth" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} error={errors.birthYear} />
          </>
        ) : null}
        <Button title="Save" size="lg" onPress={save} isLoading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
