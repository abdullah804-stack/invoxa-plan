import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

const ACTION_WIDTH = 108;

interface SwipeRowProps {
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

/**
 * Swipe left to reveal one action. Built on the platform's own PanResponder so
 * the app does not need a gesture library for a single row interaction.
 */
export function SwipeRow({ children, actionLabel, onAction, disabled = false }: SwipeRowProps) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const settle = (open: boolean) => {
    isOpen.current = open;
    Animated.spring(translateX, {
      toValue: open ? -ACTION_WIDTH : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !disabled &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderMove: (_event, gesture) => {
          const base = isOpen.current ? -ACTION_WIDTH : 0;
          translateX.setValue(Math.max(-ACTION_WIDTH, Math.min(0, base + gesture.dx)));
        },
        onPanResponderRelease: (_event, gesture) => {
          const base = isOpen.current ? -ACTION_WIDTH : 0;
          settle(base + gesture.dx < -ACTION_WIDTH / 2);
        },
        onPanResponderTerminate: () => settle(isOpen.current),
      }),
    [disabled, translateX],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.actionLayer, { backgroundColor: colors.accentSoft }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => {
            settle(false);
            onAction();
          }}
          style={styles.actionButton}
        >
          <Text style={[styles.actionText, { color: colors.accent }]}>{actionLabel}</Text>
        </Pressable>
      </View>
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.content,
          { backgroundColor: colors.surface, borderColor: colors.border },
          { transform: [{ translateX }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  actionLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  actionButton: {
    width: ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  actionText: {
    ...typeScale.bodyStrong,
  },
  content: {
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
