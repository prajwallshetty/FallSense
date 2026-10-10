import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bluetooth, Watch } from 'lucide-react-native';
import { useDeviceStore } from '../../../store/deviceStore';
import { useAuthStore } from '../../../store/authStore';
import { useCaregiverStore } from '../../../store/caregiverStore';
import { bleService } from '../../../services/bleService';
import { BlePermissionResult, checkBlePermissions, requestBlePermissions } from '../../../services/permissions';
import { SIMULATED_DEVICE_ID } from '../../../ble/simulatedTransport';
import { ScannedPeripheral } from '../../../ble/transport';
import { LINK_STATUS, timeAgo } from '../../../emergency/labels';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { EmptyState, ErrorBanner, SimulatedBadge } from '../../../components/ui/Feedback';
import { LiveStatusCard } from '../../../components/Dashboard/LiveStatusCard';
import { ElderPicker } from '../../../components/Caregiver/ElderPicker';
import { colors, spacing, TOUCH_MIN, type } from '../../../theme';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ScanResult({ p, onPair, busy }: { p: ScannedPeripheral; onPair: () => void; busy: boolean }) {
  const simulated = p.id === SIMULATED_DEVICE_ID;
  return (
    <Card tone={simulated ? 'simulated' : p.looksLikeSafeFall ? 'accent' : 'default'}>
      {simulated ? <SimulatedBadge /> : null}
      <View style={[styles.row, simulated ? { marginTop: spacing.sm } : null]}>
        <Watch size={26} color={p.looksLikeSafeFall ? colors.primary : colors.textSubtle} />
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{p.name ?? 'Unnamed device'}</Text>
          <Text style={styles.meta}>{p.looksLikeSafeFall ? 'SafeFall watch' : 'Not identified as a SafeFall watch'}{p.rssi != null ? ` · signal ${p.rssi} dBm` : ''}</Text>
        </View>
      </View>
      <Button title={busy ? 'Connecting…' : 'Connect'} onPress={onPair} isLoading={busy} variant={p.looksLikeSafeFall ? 'primary' : 'outline'} style={{ marginTop: spacing.md }} />
    </Card>
  );
}

function ElderlyDevices() {
  const d = useDeviceStore();
  const [perm, setPerm] = useState<BlePermissionResult | null>(null);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const unavailable = bleService.unavailableReason;

  useEffect(() => {
    checkBlePermissions().then(setPerm).catch(() => undefined);
    return () => bleService.stopScan();
  }, []);

  const scan = async () => {
    setPairError(null);
    const p = await requestBlePermissions();
    setPerm(p);
    if (!p.granted && !bleService.simulatorEnabled) return;
    bleService.startScan();
  };

  const pair = async (p: ScannedPeripheral) => {
    setPairingId(p.id);
    setPairError(null);
    try {
      await bleService.pair(p);
    } catch (e) {
      setPairError((e as Error).message);
    } finally {
      setPairingId(null);
    }
  };

  if (d.paired) {
    return (
      <Screen title="Your watch" inTabs>
        <LiveStatusCard />
        <Card>
          <Text style={[type.heading, { marginBottom: spacing.md }]}>Details</Text>
          <Detail label="Name" value={d.paired.name} />
          <Detail label="Firmware" value={d.firmwareVersion ?? 'Unknown'} />
          <Detail label="Battery voltage" value={d.batteryMillivolts != null ? `${(d.batteryMillivolts / 1000).toFixed(2)} V (estimate)` : 'Unknown'} />
          <Detail label="Motion sensor" value={d.imuOk == null ? 'Unknown' : d.imuOk ? 'Working' : 'Error reported by watch'} />
          <Detail label="Paired" value={new Date(d.paired.pairedAt).toLocaleDateString()} />
          {d.protocolErrors > 0 ? <Detail label="Unreadable packets" value={`${d.protocolErrors} (last: ${d.lastProtocolError})`} /> : null}
        </Card>
        <Button
          title="Remove this watch"
          variant="outline"
          onPress={() =>
            Alert.alert('Remove watch?', 'This phone will stop receiving fall alerts from the watch until you pair it again.', [
              { text: 'Keep watch', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => bleService.unpair() },
            ])
          }
        />
      </Screen>
    );
  }

  const safeFall = d.scanResults.filter((r) => r.looksLikeSafeFall);
  const others = d.scanResults.filter((r) => !r.looksLikeSafeFall);

  return (
    <Screen title="Pair your watch" subtitle="Turn on your SafeFall watch and keep it close to this phone." inTabs>
      {unavailable && !bleService.simulatorEnabled ? <ErrorBanner message={unavailable} /> : null}
      {perm && !perm.granted && perm.message ? (
        <Card tone="warning">
          <Text style={type.body}>{perm.message}</Text>
          {perm.blocked ? <Button title="Open phone settings" variant="outline" onPress={() => Linking.openSettings()} style={{ marginTop: spacing.md }} /> : null}
        </Card>
      ) : null}
      {d.scanError ? <ErrorBanner message={d.scanError} onRetry={scan} /> : null}
      {pairError ? <ErrorBanner message={pairError} /> : null}

      <Button
        title={d.scanning ? 'Searching…' : 'Search for watch'}
        size="lg"
        icon={d.scanning ? <ActivityIndicator color={colors.primaryText} /> : <Bluetooth size={24} color={colors.primaryText} />}
        onPress={d.scanning ? () => bleService.stopScan() : scan}
        style={{ marginBottom: spacing.xl }}
      />

      {safeFall.map((p) => (
        <ScanResult key={p.id} p={p} busy={pairingId === p.id} onPair={() => pair(p)} />
      ))}
      {!d.scanning && d.scanResults.length > 0 && safeFall.length === 0 ? (
        <Card tone="warning">
          <Text style={type.body}>No SafeFall watch found. Make sure it is switched on and running SafeFall firmware, then search again.</Text>
        </Card>
      ) : null}
      {others.length > 0 ? (
        <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={styles.toggle}>
          <Text style={styles.toggleText}>{showAll ? 'Hide other devices' : `Show ${others.length} other nearby device${others.length === 1 ? '' : 's'}`}</Text>
        </Pressable>
      ) : null}
      {showAll ? others.map((p) => <ScanResult key={p.id} p={p} busy={pairingId === p.id} onPair={() => pair(p)} />) : null}
      {!d.scanning && d.scanResults.length === 0 ? (
        <EmptyState icon={<Watch size={44} color={colors.textSubtle} />} title="No watch found yet" body="Tap Search for watch. Pairing requires Bluetooth and the Nearby devices permission." />
      ) : null}
    </Screen>
  );
}

function CaregiverDevices() {
  const { activeElderlyId, relations } = useAuthStore();
  const devices = useCaregiverStore((s) => (activeElderlyId ? s.devicesByElder[activeElderlyId] ?? [] : []));
  const name = relations.find((r) => r.elderlyId === activeElderlyId)?.elderlyName ?? 'them';
  return (
    <Screen title="Their watch" subtitle={`Status reported by ${name}'s phone.`} inTabs>
      <ElderPicker />
      {devices.length === 0 ? (
        <EmptyState icon={<Watch size={44} color={colors.textSubtle} />} title="No watch status yet" body="It appears once their phone connects to their SafeFall watch." />
      ) : (
        devices.map((dev) => {
          const link = LINK_STATUS[dev.linkStatus as keyof typeof LINK_STATUS] ?? { label: dev.linkStatus, tone: 'neutral' as const };
          const old = Date.now() - dev.updatedAt > 30 * 60 * 1000;
          return (
            <Card key={dev.deviceId}>
              <Text style={type.heading}>{dev.name}</Text>
              <StatusBadge label={old ? `Last known: ${link.label}` : link.label} tone={old ? 'warning' : link.tone} style={{ marginVertical: spacing.md }} />
              <Detail label="Battery" value={dev.batteryPercent != null ? `${dev.batteryPercent}%` : 'Unknown'} />
              <Detail label="Firmware" value={dev.firmwareVersion ?? 'Unknown'} />
              <Detail label="Last data from watch" value={timeAgo(dev.lastSeenAt)} />
              <Detail label="Status updated" value={timeAgo(dev.updatedAt)} />
            </Card>
          );
        })
      )}
    </Screen>
  );
}

export default function DevicesScreen() {
  const isCaregiver = useAuthStore((s) => s.profile?.role === 'caregiver');
  return isCaregiver ? <CaregiverDevices /> : <ElderlyDevices />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { fontSize: 15, color: colors.textSubtle, marginTop: 2 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  detailLabel: { fontSize: 16, color: colors.textSubtle },
  detailValue: { fontSize: 16, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  toggle: { minHeight: TOUCH_MIN, justifyContent: 'center', alignItems: 'center' },
  toggleText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
});
