import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

// Generic slide-up bottom sheet: scrim, rounded card, drag handle, optional
// title. Used by every module's sheet (OptionSheet, size editors, pickers) so
// the chrome and dismissal behave identically everywhere.
export function BottomSheet({
  visible,
  onDismiss,
  title,
  children,
  scrollable,
  avoidKeyboard,
}: {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  children: React.ReactNode;
  scrollable?: boolean;
  avoidKeyboard?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const body = (
    <Pressable onPress={onDismiss} style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}>
      <Pressable
        onPress={() => undefined}
        style={{
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 12) + theme.spacing.sm,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 16,
        }}
      >
        <View
          style={{
            width: 44,
            height: 5,
            borderRadius: 3,
            backgroundColor: theme.colors.border,
            alignSelf: 'center',
            marginBottom: theme.spacing.md,
          }}
        />
        {title ? (
          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              theme.typography.title,
              { color: theme.colors.text, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
            ]}
          >
            {title}
          </Text>
        ) : null}
        {scrollable ? (
          <ScrollView style={{ maxHeight: height * 0.6 }} showsVerticalScrollIndicator={false} bounces={false}>
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </Pressable>
    </Pressable>
  );

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      {avoidKeyboard ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </Modal>
  );
}
