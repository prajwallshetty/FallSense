import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'pending' | 'acknowledged' | 'false_alarm' | 'escalated' | 'active' | 'inactive';
  label?: string;
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, style }) => {
  const getColors = () => {
    switch (status) {
      case 'connected':
      case 'acknowledged':
      case 'active':
        return { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', text: '#10B981', dot: '#10B981' };
      case 'disconnected':
      case 'inactive':
        return { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#64748B', dot: '#64748B' };
      case 'pending':
        return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#F59E0B', dot: '#F59E0B' };
      case 'false_alarm':
        return { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#3B82F6', dot: '#3B82F6' };
      case 'escalated':
        return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#EF4444', dot: '#EF4444' };
      default:
        return { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#64748B', dot: '#64748B' };
    }
  };

  const colors = getColors();
  const displayLabel = label || status.replace('_', ' ').toUpperCase();

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }, style]}>
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <Text style={[styles.text, { color: colors.text }]}>{displayLabel}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
