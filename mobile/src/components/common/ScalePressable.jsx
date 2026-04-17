import React from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ScalePressable({
  children,
  style,
  pressedScale = 0.95,
  ...props
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        scale.value = withSpring(pressedScale, { damping: 18, stiffness: 300, mass: 0.6 });
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 280, mass: 0.5 });
        props.onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}