import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { colors } from '../../theme';

export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)), []);
  return online;
}

export const OfflineBanner: React.FC<{ topInset?: number }> = ({ topInset = 0 }) => {
  const online = useIsOnline();
  if (online) return null;
  return (
    <View style={[styles.banner, { paddingTop: topInset + 6 }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <WifiOff size={18} color={colors.bg} />
      <Text style={styles.text}>No internet. Alerts are saved on this phone and sent when you are back online.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.warning, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  text: { color: colors.bg, fontWeight: '700', fontSize: 14, flex: 1 },
});
