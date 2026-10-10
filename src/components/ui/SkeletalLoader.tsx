import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme';

interface SkeletalLoaderProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletalLoader: React.FC<SkeletalLoaderProps> = ({ width = '100%', height = 20, borderRadius = 8, style }) => {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return <Animated.View accessibilityLabel="Loading" style={[styles.loader, { width, height, borderRadius, opacity: pulse }, style]} />;
};

const styles = StyleSheet.create({ loader: { backgroundColor: colors.surfaceRaised } });
