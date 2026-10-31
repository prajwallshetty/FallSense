import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, TOUCH_MIN } from '../../theme';

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

export function Segmented<T extends string>({ value, options, onChange, accessibilityLabel }: SegmentedProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on, checked: on }}
            style={[styles.item, on ? styles.itemOn : null]}
          >
            <Text style={[styles.text, on ? styles.textOn : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface ChipsProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** Wrapping filter chips, for lists too long for a segmented control. */
export function Chips<T extends string>({ value, options, onChange, accessibilityLabel }: ChipsProps<T>) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on, checked: on }}
            style={[styles.chip, on ? styles.chipOn : null]}
          >
            <Text style={[styles.chipText, on ? styles.textOn : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: 4, marginBottom: spacing.lg },
  item: { flex: 1, minHeight: TOUCH_MIN - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  itemOn: { backgroundColor: colors.primary },
  text: { fontSize: 16, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  textOn: { color: colors.primaryText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
});
