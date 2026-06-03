import { Animated, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { usePressScale } from '../hooks/usePressScale';

type Props = Omit<PressableProps, 'children'> & {
  scaleTo?: number;
  children?: React.ReactNode;
  style?: ViewStyle | ((state: { pressed: boolean }) => ViewStyle);
  innerStyle?: ViewStyle;
};

export function PressableScale({
  scaleTo = 0.97,
  children,
  style,
  innerStyle,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const { scale, onPressIn: animIn, onPressOut: animOut } = usePressScale(scaleTo);

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        animIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animOut();
        onPressOut?.(e);
      }}
      style={style}
    >
      <Animated.View style={[{ transform: [{ scale }] }, innerStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
