import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { normalizeLinkCode } from '../../utils/validation';
import { LinkCode } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ErrorBanner } from '../ui/Feedback';
import { colors, spacing, type } from '../../theme';

/** Elderly user: generate a one-time code to give to a caregiver. */
export const ShareCodePanel: React.FC = () => {
  const profile = useAuthStore((s) => s.profile);
  const [code, setCode] = useState<LinkCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);

  const expired = code ? code.expiresAt <= now : false;

  const create = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      setCode(await firebaseService.createLinkCode(profile));
    } catch (e) {
      setError(describeFirebaseError(e));
    } finally {
      setBusy(false);
    }
  };

  const remaining = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;

  return (
    <Card>
      <Text style={type.heading}>Add a caregiver</Text>
      <Text style={[type.body, { marginVertical: spacing.md }]}>
        Create a one-time code and give it to the person who should receive your alerts. Only share it with someone you trust.
      </Text>
      {error ? <ErrorBanner message={error} onRetry={create} /> : null}
      {code && !expired ? (
        <View style={styles.codeBox} accessible accessibilityLabel={`Code ${code.code.split('').join(' ')}`}>
          <Text style={styles.code}>{code.code.slice(0, 4)} {code.code.slice(4)}</Text>
          <Text style={styles.expiry}>
            Valid for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}, single use
          </Text>
          <Button
            title="Share code"
            variant="outline"
            onPress={() => Share.share({ message: `My SafeFall AI caregiver code is ${code.code}. It expires in 15 minutes.` }).catch(() => undefined)}
            style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
          />
          <Button
            title="Cancel code"
            variant="ghost"
            onPress={() => {
              firebaseService.revokeLinkCode(code.code).catch(() => undefined);
              setCode(null);
            }}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <Button title={expired ? 'Create a new code' : 'Create code'} onPress={create} isLoading={busy} />
      )}
    </Card>
  );
};

/** Caregiver: enter the code from the elderly user's phone. */
export const RedeemCodePanel: React.FC<{ onLinked?: () => void }> = ({ onLinked }) => {
  const profile = useAuthStore((s) => s.profile);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const c = normalizeLinkCode(value);
    setError(c.ok ? undefined : c.error);
    if (!c.ok || !profile) return;
    setBusy(true);
    try {
      const rel = await firebaseService.redeemLinkCode(profile, c.value);
      setValue('');
      Alert.alert('Linked', `You will now receive alerts for ${rel.elderlyName}.`);
      onLinked?.();
    } catch (e) {
      setError(describeFirebaseError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={type.heading}>Link to someone you care for</Text>
      <Text style={[type.body, { marginVertical: spacing.md }]}>
        On their phone, open Settings, then Caregivers, then Create code. Enter the 8-character code here.
      </Text>
      <Input label="Caregiver code" value={value} onChangeText={setValue} autoCapitalize="characters" autoCorrect={false} maxLength={9} placeholder="ABCD EFGH" error={error} style={styles.codeInput} />
      <Button title="Link account" onPress={submit} isLoading={busy} />
    </Card>
  );
};

const styles = StyleSheet.create({
  codeBox: { alignItems: 'center', padding: spacing.lg, borderRadius: 16, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.primary },
  code: { fontSize: 38, fontWeight: '800', color: colors.text, letterSpacing: 6, fontVariant: ['tabular-nums'] },
  expiry: { fontSize: 15, color: colors.textSubtle, marginTop: spacing.sm },
  codeInput: { fontSize: 24, letterSpacing: 4, fontWeight: '700' },
});
