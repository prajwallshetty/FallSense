import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, History, MapPin, Watch, Settings } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useDeviceStore } from '../../../store/deviceStore';
import { colors } from '../../../theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const isCaregiver = useAuthStore((s) => s.profile?.role === 'caregiver');
  // Wearer's phone: flag the Watch tab whenever a paired watch cannot deliver alerts.
  const watchDown = useDeviceStore((s) => !!s.paired && (s.linkStatus !== 'connected' || s.isStale));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 68 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={26} color={color} /> }} />
      <Tabs.Screen name="health" options={{ title: 'History', tabBarIcon: ({ color }) => <History size={26} color={color} /> }} />
      <Tabs.Screen name="location" options={{ title: 'Location', tabBarIcon: ({ color }) => <MapPin size={26} color={color} /> }} />
      <Tabs.Screen
        name="devices"
        options={{
          title: isCaregiver ? 'Their watch' : 'Watch',
          tabBarIcon: ({ color }) => <Watch size={26} color={color} />,
          tabBarBadge: !isCaregiver && watchDown ? '!' : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.dangerStrong, color: '#FFFFFF' },
          tabBarAccessibilityLabel: !isCaregiver && watchDown ? 'Watch, not connected' : undefined,
        }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Settings size={26} color={color} /> }} />
    </Tabs>
  );
}
