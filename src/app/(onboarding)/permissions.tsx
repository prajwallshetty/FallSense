import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bluetooth, MapPin, Bell, CheckCircle2, XCircle } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import { locationService } from '../../services/locationService';
import { notificationService } from '../../services/notificationService';
import { checkBlePermissions, requestBlePermissions } from '../../services/permissions';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { colors, spacing, type } from '../../theme';

type PermState = 'unknown' | 'granted' | 'denied' | 'blocked';

function Row({ icon, title, body, state, onRequest, detail }: { icon: React.ReactNode; title: string; body: string; state: PermState; onRequest: () => void; detail?: string | null }) {
  return (
    <Card tone={state === 'granted' ? 'accent' : state === 'blocked' ? 'danger' : 'default'}>
      <View style={styles.row}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>{title}</Text>
          <Text style={[type.body, { marginTop: 4 }]}>{body}</Text>
        </View>
        {state === 'granted' ? <CheckCircle2 size={30} color={colors.success} accessibilityLabel="Allowed" /> : state !== 'unknown' ? <XCircle size={30} color={colors.danger} accessibilityLabel="Not allowed" /> : null}
      </View>
      {detail ? <Text style={[type.caption, { marginTop: spacing.sm, color: colors.warning }]}>{detail}</Text> : null}
      {state === 'blocked' ? (
        <Button title="Open phone settings" variant="outline" onPress={() => Linking.openSettings()} style={{ marginTop: spacing.md }} />
      ) : state !== 'granted' ? (
        <Button title="Allow" onPress={onRequest} style={{ marginTop: spacing.md }} />
      ) : null}
    </Card>
  );
}

export default function PermissionsScreen() {
  const router = useRouter();
  const isElderly = useAuthStore((s) => s.profile?.role === 'elderly');
  const [ble, setBle] = useState<PermState>('unknown');
  const [bleDetail, setBleDetail] = useState<string | null>(null);
  const [loc, setLoc] = useState<PermState>('unknown');
  const [notif, setNotif] = useState<PermState>('unknown');

  const refresh = useCallback(async () => {
    const b = await checkBlePermissions();
    setBle(b.granted ? 'granted' : 'unknown');
    const l = await locationService.getPermission();
    setLoc(l === 'granted' ? 'granted' : l === 'blocked' ? 'blocked' : l === 'denied' ? 'denied' : 'unknown');
    const n = await notificationService.getPermission();
    setNotif(n === 'granted' ? 'granted' : n === 'denied' ? 'denied' : 'unknown');
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  return (
    <Screen title="Permissions" subtitle="SafeFall only asks for what it needs. You can change these later in phone settings." back>
      {isElderly ? (
        <Row
          icon={<Bluetooth size={30} color={colors.info} />}
          title="Nearby devices"
          body="Needed to connect to your SafeFall watch and receive its fall alerts."
          state={ble}
          detail={bleDetail}
          onRequest={async () => {
            const r = await requestBlePermissions();
            setBle(r.granted ? 'granted' : r.blocked ? 'blocked' : 'denied');
            setBleDetail(r.message);
          }}
        />
      ) : null}
      <Row
        icon={<MapPin size={30} color={colors.primary} />}
        title="Location"
        body={isElderly ? 'Adds where you are to a fall alert or SOS. Only used while the app is open.' : 'Optional. Used to share your own location if you choose to.'}
        state={loc}
        onRequest={async () => {
          const r = await locationService.requestPermission();
          setLoc(r === 'granted' ? 'granted' : r === 'blocked' ? 'blocked' : 'denied');
        }}
      />
      <Row
        icon={<Bell size={30} color={colors.warning} />}
        title="Notifications"
        body={isElderly ? 'Shows the fall alert even when the app is in the background.' : 'Required to receive alerts when someone you care for falls or presses SOS.'}
        state={notif}
        onRequest={async () => {
          const r = await notificationService.requestPermission();
          setNotif(r === 'granted' ? 'granted' : 'denied');
        }}
      />
      <Button title="Continue" size="lg" onPress={() => router.push('/(onboarding)/contact-setup')} />
      {(isElderly && (ble !== 'granted' || loc !== 'granted')) || notif !== 'granted' ? (
        <Text style={[type.caption, { textAlign: 'center', marginTop: spacing.md }]}>
          You can continue without these, but some protection will not work until you allow them.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
});
