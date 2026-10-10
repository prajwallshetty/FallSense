import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, TOUCH_MIN, type } from '../../theme';
import { OfflineBanner } from './OfflineBanner';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Shows a back button that uses the navigation stack (Android back behaves the same). */
  back?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** Tab screens sit above the tab bar, so they need less bottom padding. */
  inTabs?: boolean;
}

export const Screen: React.FC<ScreenProps> = ({ title, subtitle, back, right, children, refreshing, onRefresh, scroll = true, inTabs }) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const header = (title || back) && (
    <View style={styles.header}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
          hitSlop={8}
        >
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={type.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
  const padding = { paddingTop: insets.top + spacing.md, paddingBottom: (inTabs ? spacing.xxl : insets.bottom + spacing.xxxl) };
  return (
    <View style={styles.root}>
      <OfflineBanner topInset={insets.top} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, padding]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, padding, { flex: 1 }]}>
          {header}
          {children}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  back: { width: TOUCH_MIN, height: TOUCH_MIN, marginLeft: -12, alignItems: 'center', justifyContent: 'center' },
  subtitle: { ...type.body, marginTop: 4 },
});
