import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Wifi } from 'lucide-react-native';
import { connectionService, TestResult } from '../../../services/connectionService';
import { watchApiService } from '../../../services/watchApiService';
import { useCloudStore } from '../../../store/cloudStore';
import { DEFAULT_WATCH_SETTINGS, SETTING_LIMITS, useWatchStore } from '../../../store/watchStore';
import { timeAgo } from '../../../emergency/labels';
import { validateWatchHost, watchDataUrl } from '../../../watch/protocol';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useWatchBadge } from '../../../components/Watch/StatusRows';
import { colors, spacing, type } from '../../../theme';

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontWeight: '700', color: colors.primary }}>{n}</Text>
      </View>
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Diag({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: spacing.md }}>
      <Text style={{ fontSize: 15, color: colors.textSubtle, flexShrink: 1 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const numberIn = (raw: string, [lo, hi]: readonly [number, number]) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

export default function WatchScreen() {
  const badge = useWatchBadge();
  const s = useWatchStore();
  const cloudStatus = useCloudStore((c) => c.status);
  const [host, setHost] = useState(s.settings.host);
  const [timeoutMs, setTimeoutMs] = useState(String(s.settings.timeoutMs));
  const [intervalMs, setIntervalMs] = useState(String(s.settings.pollIntervalMs));
  const [errors, setErrors] = useState<{ host?: string; timeout?: string; interval?: string }>({});
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    const diagnostics = await watchApiService.diagnostics();
    useWatchStore.getState().patch({ diagnostics });
  }, []);

  useEffect(() => {
    refreshDiagnostics();
    const t = setInterval(refreshDiagnostics, 5000);
    return () => clearInterval(t);
  }, [refreshDiagnostics]);

  const save = () => {
    const h = validateWatchHost(host);
    const t = numberIn(timeoutMs, SETTING_LIMITS.timeoutMs);
    const i = numberIn(intervalMs, SETTING_LIMITS.pollIntervalMs);
    setErrors({
      host: h.ok ? undefined : h.error,
      timeout: t === null ? `Enter ${SETTING_LIMITS.timeoutMs[0]} to ${SETTING_LIMITS.timeoutMs[1]} milliseconds.` : undefined,
      interval: i === null ? `Enter ${SETTING_LIMITS.pollIntervalMs[0]} to ${SETTING_LIMITS.pollIntervalMs[1]} milliseconds.` : undefined,
    });
    if (!h.ok || t === null || i === null) return false;
    s.setSettings({ host: h.host, timeoutMs: t, pollIntervalMs: i });
    return true;
  };

  const runTest = async () => {
    if (!save()) return;
    setTesting(true);
    setTest(await connectionService.testConnection());
    setTesting(false);
    refreshDiagnostics();
  };

  const startOrReconnect = () => {
    if (save()) connectionService.retry();
  };

  const running = s.connection !== 'idle';
  const d = s.diagnostics;
  // Only an actual failed cloud attempt counts as a problem here, not the mere absence of a route.
  const cloudBlocked = s.connection === 'connected' && cloudStatus === 'offline';

  return (
    <Screen title="Your watch" back>
      <Card>
        <StatusBadge label={badge.label} tone={badge.tone} />
        <Text style={[type.body, { marginTop: spacing.sm }]}>Last successful sync: {timeAgo(s.lastSampleAt)}</Text>
        {s.message ? <Text style={[type.body, { marginTop: spacing.xs }]}>{s.message}</Text> : null}
        {!s.backgroundCapable && running ? (
          <Text style={[type.caption, { marginTop: spacing.sm }]}>On this device, monitoring only runs while the app is open.</Text>
        ) : null}
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title={running ? 'Reconnect' : 'Start monitoring'} size="lg" onPress={startOrReconnect} />
          <Button title="Test Connection" variant="outline" isLoading={testing} onPress={runTest} />
          {running ? <Button title="Stop monitoring" variant="ghost" onPress={() => connectionService.stop()} /> : null}
        </View>
        {test ? (
          <View style={{ marginTop: spacing.md }} accessibilityLiveRegion="polite">
            <StatusBadge label={test.ok ? 'Test passed' : 'Test failed'} tone={test.ok ? 'success' : 'danger'} />
            <Text style={[type.body, { marginTop: spacing.xs }]}>{test.message}</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Wifi size={22} color={colors.primary} />
          <Text style={type.heading}>Connecting</Text>
        </View>
        <Step n={1} text="Turn on your SafeFall watch." />
        <Step n={2} text="Open Wi-Fi settings and join the watch's network." />
        <Step n={3} text="If your phone warns there is no internet, choose to stay connected." />
        <Step n={4} text="Come back here and press Test Connection." />
        {Platform.OS === 'android' ? (
          <Button title="Open Wi-Fi settings" variant="outline" onPress={() => Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => Linking.openSettings())} style={{ marginTop: spacing.lg }} />
        ) : null}
      </Card>

      {cloudBlocked ? (
        <Card tone="warning">
          <Text style={type.bodyStrong}>Your watch is connected, but the cloud is not</Text>
          <Text style={[type.body, { marginTop: spacing.xs }]}>
            The watch network has no internet. Turn on mobile data so alerts can reach your caretaker. Monitoring continues on this phone, and alerts are saved and sent as soon as the internet returns.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text style={type.heading}>Connection settings</Text>
        <Input label="Watch IP address" value={host} onChangeText={setHost} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" error={errors.host} containerStyle={{ marginTop: spacing.md }} />
        <Input label="Request timeout (ms)" value={timeoutMs} onChangeText={setTimeoutMs} keyboardType="number-pad" error={errors.timeout} />
        <Input label="Polling interval (ms)" value={intervalMs} onChangeText={setIntervalMs} keyboardType="number-pad" error={errors.interval} />
        <Button
          title="Reset to defaults"
          variant="ghost"
          onPress={() => {
            setHost(DEFAULT_WATCH_SETTINGS.host);
            setTimeoutMs(String(DEFAULT_WATCH_SETTINGS.timeoutMs));
            setIntervalMs(String(DEFAULT_WATCH_SETTINGS.pollIntervalMs));
          }}
        />
      </Card>

      <Card>
        <Text style={[type.heading, { marginBottom: spacing.sm }]}>Diagnostics</Text>
        <Diag label="Endpoint" value={watchDataUrl(s.settings.host)} />
        <Diag label="Response time" value={s.latencyMs !== null ? `${Math.round(s.latencyMs)} ms` : '--'} />
        <Diag label="Route" value={s.via === 'wifi' ? 'Wi-Fi network' : s.via === 'default' ? 'Default network' : '--'} />
        <Diag label="Failed requests in a row" value={String(s.consecutiveFailures)} />
        <Diag label="Readings accepted" value={String(s.stats.accepted)} />
        <Diag label="Duplicate readings" value={String(s.stats.duplicates)} />
        <Diag label="Out-of-order readings" value={String(s.stats.outOfOrder)} />
        <Diag label="Missing readings (estimated)" value={String(s.stats.missing)} />
        <Diag label="Invalid responses" value={String(s.invalidResponses)} />
        <Diag label="Watch clock" value={s.clock === 'ok' ? 'OK' : s.clock === 'skewed' ? 'Different from phone' : s.clock === 'unset' ? 'Not set' : '--'} />
        {d ? (
          <>
            <Diag label="Wi-Fi held for the watch" value={d.wifiNetworkHeld ? 'Yes' : 'No'} />
            <Diag label="Internet on Wi-Fi" value={d.wifiHasInternet ? 'Yes' : 'No'} />
            <Diag label="Phone's main network" value={d.defaultTransport} />
            <Diag label="Internet on main network" value={d.defaultHasInternet ? 'Yes' : 'No'} />
            <Diag label="Background restricted" value={d.ignoringBatteryOptimizations ? 'No' : 'Yes'} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
