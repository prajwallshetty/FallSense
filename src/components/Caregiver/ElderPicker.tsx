import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing, TOUCH_MIN } from '../../theme';

/** Lets a caregiver with several linked people choose whose data is shown. */
export const ElderPicker: React.FC = () => {
  const { relations, activeElderlyId, setActiveElderly } = useAuthStore();
  if (relations.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }} contentContainerStyle={{ gap: spacing.sm }}>
      {relations.map((r) => {
        const selected = r.elderlyId === activeElderlyId;
        return (
          <Pressable
            key={r.relationId}
            onPress={() => setActiveElderly(r.elderlyId)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.chip, selected ? styles.selected : null]}
          >
            <Text style={[styles.text, selected ? { color: colors.primaryText } : null]}>{r.elderlyName}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  chip: { minHeight: TOUCH_MIN - 4, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, justifyContent: 'center' },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: 16, fontWeight: '700', color: colors.text },
});
