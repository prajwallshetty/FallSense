import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Watch, BellRing, MapPin, Info } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { colors, spacing, type } from '../../theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const isCaregiver = profile?.role === 'caregiver';

  const points = isCaregiver
    ? [
        { icon: BellRing, title: 'Get alerted', body: 'When a fall is not cancelled, or SOS is pressed, you get a notification on this phone.' },
        { icon: MapPin, title: 'See where', body: 'Alerts include their location when their phone can provide it.' },
        { icon: Watch, title: 'Check the watch', body: 'See whether their watch is connected and its battery level.' },
      ]
    : [
        { icon: Watch, title: 'Your watch detects falls', body: 'Fall detection runs on the watch itself, even without the internet.' },
        { icon: BellRing, title: 'You can cancel', body: 'After a fall you get a countdown to cancel if you are fine. Otherwise your caregivers are alerted.' },
        { icon: MapPin, title: 'Help can find you', body: 'Your phone adds your location to the alert when it can.' },
      ];

  return (
    <Screen title={`Welcome, ${profile?.fullName.split(' ')[0] ?? ''}`} subtitle="Let's set up SafeFall in three short steps.">
      {points.map(({ icon: Icon, title, body }) => (
        <Card key={title}>
          <View style={styles.row}>
            <Icon size={30} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={type.heading}>{title}</Text>
              <Text style={[type.body, { marginTop: 4 }]}>{body}</Text>
            </View>
          </View>
        </Card>
      ))}
      <View style={styles.note}>
        <Info size={20} color={colors.warning} />
        <Text style={[type.body, { flex: 1 }]}>
          SafeFall AI is a prototype safety aid, not a medical device. In an emergency, always call your local emergency number.
        </Text>
      </View>
      <Button title="Continue" size="lg" onPress={() => router.push('/(onboarding)/permissions')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  note: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: 14, backgroundColor: colors.warningSoft, marginBottom: spacing.xl },
});
