import React from 'react';
import { Text, View } from 'react-native';
import { FlaskConical } from 'lucide-react-native';
import { bleService } from '../../services/bleService';
import { useDeviceStore } from '../../store/deviceStore';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { colors, spacing, type } from '../../theme';

/** Only rendered when EXPO_PUBLIC_ENABLE_DEV_TOOLS=true AND the simulated watch is connected. */
export const DevToolsCard: React.FC = () => {
  const paired = useDeviceStore((s) => s.paired);
  const linkStatus = useDeviceStore((s) => s.linkStatus);
  const sim = bleService.simulator;
  if (!sim || !paired?.isSimulated) return null;
  const connected = linkStatus === 'connected';
  return (
    <Card tone="simulated">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <FlaskConical size={24} color={colors.simulated} />
        <Text style={[type.heading, { color: colors.simulated }]}>Developer simulator</Text>
      </View>
      <Text style={[type.body, { marginVertical: spacing.md }]}>
        Sends real protocol packets from a simulated watch. Simulated incidents stay on this phone and are never sent to caregivers.
      </Text>
      <View style={{ gap: spacing.sm }}>
        <Button title="Simulate fall (possible, then confirmed)" variant="secondary" disabled={!connected} onPress={() => sim.simulateFall()} />
        <Button title="Simulate cancel on watch" variant="secondary" disabled={!connected} onPress={() => sim.simulateWatchCancel()} />
        <Button title="Simulate watch SOS button" variant="secondary" disabled={!connected} onPress={() => sim.simulateSosButton()} />
        <Button title="Simulate link loss" variant="secondary" disabled={!connected} onPress={() => sim.simulateLinkLoss()} />
      </View>
    </Card>
  );
};
