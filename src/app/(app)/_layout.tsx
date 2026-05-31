import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="caregiver/index" options={{ title: 'Caregiver Panel' }} />
      <Stack.Screen name="contacts/index" options={{ title: 'Emergency Contacts' }} />
      <Stack.Screen name="admin/index" options={{ title: 'Admin Console' }} />
    </Stack>
  );
}
