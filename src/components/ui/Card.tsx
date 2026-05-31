import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  accentBorder?: boolean;
  dangerBorder?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  onPress,
  accentBorder = false,
  dangerBorder = false,
}) => {
  const borderColor = dangerBorder
    ? 'rgba(239,68,68,0.3)'
    : accentBorder
      ? 'rgba(13,148,136,0.3)'
      : '#1E293B';

  const containerStyle: ViewStyle = {
    ...styles.card,
    borderColor,
  };

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[containerStyle, style]}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(30,41,59,0.4)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
});
