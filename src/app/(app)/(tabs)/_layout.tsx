import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, Bell, History, Home, Settings } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { allIncidents, needsAttention, useCaretakerStore } from '../../../store/caretakerStore';
import { useWatchStore } from '../../../store/watchStore';
import { colors } from '../../../theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const isCaregiver = useAuthStore((s) => s.profile?.role === 'caregiver');
  const watchDown = useWatchStore((s) => s.monitoringEnabled && (s.connection !== 'connected' || s.isStale));
  const unacknowledged = useCaretakerStore((s) => allIncidents(s.overview).filter(needsAttention).length);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: 68 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarBadgeStyle: { backgroundColor: colors.dangerStrong, color: '#FFFFFF' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={26} color={color} /> }} />
      <Tabs.Screen
        name="monitor"
        options={{
          title: 'Monitor',
          href: isCaregiver ? null : undefined,
          tabBarIcon: ({ color }) => <Activity size={26} color={color} />,
          tabBarBadge: !isCaregiver && watchDown ? '!' : undefined,
          tabBarAccessibilityLabel: !isCaregiver && watchDown ? 'Monitor, watch not connected' : undefined,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          href: isCaregiver ? undefined : null,
          tabBarIcon: ({ color }) => <Bell size={26} color={color} />,
          tabBarBadge: isCaregiver && unacknowledged > 0 ? unacknowledged : undefined,
        }}
      />
      <Tabs.Screen name="health" options={{ title: 'History', tabBarIcon: ({ color }) => <History size={26} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Settings size={26} color={color} /> }} />
      {/* Kept and reachable from Settings, but not part of the main navigation. */}
      <Tabs.Screen name="location" options={{ href: null }} />
      <Tabs.Screen name="devices" options={{ href: null }} />
    </Tabs>
  );
}
