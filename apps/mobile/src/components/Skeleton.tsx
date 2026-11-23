import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** A pulsing block for loading states; screens never show a bare spinner twice. */
export function Skeleton({ width = '100%', height = 16, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.block, { width, height, backgroundColor: colors.skeleton, opacity }, style]}
    />
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <View style={styles.rows}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={64} style={styles.row} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: radius.sm,
  },
  rows: {
    gap: 12,
  },
  row: {
    borderRadius: radius.md,
  },
});
