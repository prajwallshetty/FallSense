import React, { useEffect } from 'react';
import { View, Animated, ViewStyle } from 'react-native';

interface SkeletalLoaderProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

export const SkeletalLoader: React.FC<SkeletalLoaderProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}) => {
  const pulseAnim = new Animated.Value(0.3);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          opacity: pulseAnim,
        },
        styles.loader,
        style,
      ]}
    />
  );
};

import { StyleSheet } from 'react-native';
const styles = StyleSheet.create({
  loader: {
    backgroundColor: '#1E293B', // dark:bg-slate-800 equivalent
  },
});
