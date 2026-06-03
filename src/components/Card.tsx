import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '../theme';

// Rounded surface container used to group settings rows. The optional `theme`
// prop is accepted for call-site compatibility with older screens but ignored —
// the component reads the live theme itself.
export function Card({
  children,
  style,
}: {
  theme?: Theme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, overflow: 'hidden' },
        style,
      ]}
    >
      {children}
    </View>
  );
}
