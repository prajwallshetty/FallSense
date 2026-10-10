import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { User, Users } from 'lucide-react-native';
import type { UserRole } from '../../types';
import { colors, radius, spacing } from '../../theme';

const OPTIONS: { role: UserRole; title: string; body: string }[] = [
  { role: 'elderly', title: 'I wear the watch', body: 'This phone connects to my SafeFall watch.' },
  { role: 'caregiver', title: 'I care for someone', body: 'I want to receive their alerts.' },
];

export const RolePicker: React.FC<{ value: UserRole; onChange: (r: UserRole) => void }> = ({ value, onChange }) => (
  <View style={{ gap: spacing.md, marginBottom: spacing.xl }} accessibilityRole="radiogroup">
    {OPTIONS.map((o) => {
      const selected = value === o.role;
      const Icon = o.role === 'elderly' ? User : Users;
      return (
        <Pressable
          key={o.role}
          onPress={() => onChange(o.role)}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          accessibilityLabel={`${o.title}. ${o.body}`}
          style={[styles.option, selected ? styles.selected : null]}
        >
          <Icon size={28} color={selected ? colors.primary : colors.textSubtle} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, selected ? { color: colors.primary } : null]}>{o.title}</Text>
            <Text style={styles.body}>{o.body}</Text>
          </View>
          <View style={[styles.radio, selected ? styles.radioOn : null]} />
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, minHeight: 76, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.textSubtle, marginTop: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
});
