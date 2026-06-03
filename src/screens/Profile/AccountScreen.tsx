import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import { useAppStore, useBootStore, useChatStore, useIdentityStore } from '../../store';
import { useTheme, type Theme } from '../../theme';
import { Card, GlassHeader, IconButton, SectionLabel } from '../../components';
import { useHardwareBack, useSlideIn } from '../../hooks';
import { formatRegion, regionFromPhone } from '../../utils/region';

const CONTENT_MAX_WIDTH = 560;
const DANGER = '#ef4444';

export function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(insets.top + 64);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  const closeAccount = useAppStore((s) => s.closeAccount);
  const displayName = useAppStore((s) => s.displayName);
  const setDisplayName = useAppStore((s) => s.setDisplayName);
  const avatarUri = useAppStore((s) => s.avatarUri);
  const setAvatarUri = useAppStore((s) => s.setAvatarUri);
  const dob = useAppStore((s) => s.dob);
  const setDob = useAppStore((s) => s.setDob);
  const bio = useAppStore((s) => s.bio);
  const setBio = useAppStore((s) => s.setBio);
  const phone = useIdentityStore((s) => s.phone);
  const dialCode = useIdentityStore((s) => s.dialCode);
  const detectedRegion = regionFromPhone(dialCode, phone);
  const accountCountry = detectedRegion.country;
  const preciseLocation = useAppStore((s) => s.preciseLocation);
  const setPreciseLocation = useAppStore((s) => s.setPreciseLocation);

  const [locating, setLocating] = useState(false);

  const usePreciseLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Location permission denied',
          perm.canAskAgain
            ? 'You can grant permission and try again.'
            : 'Open Settings to enable location access for SChat.',
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const p = places[0];
      if (!p) {
        Alert.alert('No address found', 'Could not resolve your location to a place name.');
        return;
      }
      setPreciseLocation({
        city: p.city ?? p.subregion ?? null,
        region: p.region ?? null,
        country: p.country ?? null,
        countryCode: p.isoCountryCode ?? null,
        capturedAt: Date.now(),
      });
    } catch (e) {
      Alert.alert('Location failed', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLocating(false);
    }
  };

  const clearPreciseLocation = () => {
    Alert.alert('Use phone-derived region?', 'This will discard the precise location you captured.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setPreciseLocation(null) },
    ]);
  };

  const preciseLabel = (() => {
    if (!preciseLocation) return null;
    const parts: string[] = [];
    if (preciseLocation.city) parts.push(preciseLocation.city);
    if (preciseLocation.region && preciseLocation.region !== preciseLocation.city)
      parts.push(preciseLocation.region);
    if (preciseLocation.country) parts.push(preciseLocation.country);
    return parts.join(', ') || null;
  })();

  const [draftName, setDraftName] = useState(displayName);
  const [draftDob, setDraftDob] = useState(dob);
  const [draftBio, setDraftBio] = useState(bio);

  const dirty =
    draftName !== displayName || draftDob !== dob || draftBio !== bio;

  const onSave = () => {
    if (!dirty) return;
    if (draftName !== displayName) setDisplayName(draftName);
    if (draftDob !== dob) setDob(draftDob);
    if (draftBio !== bio) setBio(draftBio);
    Keyboard.dismiss();
  };

  const slide = useSlideIn();

  const onBack = useCallback(() => {
    if (!dirty) {
      slide.close(closeAccount);
      return;
    }
    Alert.alert('Discard changes?', 'You have unsaved edits.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setDraftName(displayName);
          setDraftDob(dob);
          setDraftBio(bio);
          slide.close(closeAccount);
        },
      },
    ]);
  }, [dirty, slide, closeAccount, displayName, dob, bio]);

  useHardwareBack(useCallback(() => {
    onBack();
    return true;
  }, [onBack]));

  const reportRegionProblem = () => {
    Alert.alert(
      'Report a problem',
      `"${formatRegion(detectedRegion)}" is derived from your registered phone number (${dialCode}${phone}). State/circle is inferred from the area code (US/Canada) or operator prefix (India). Numbers can be ported across regions, so this reflects the original allocation rather than your current location.`,
    );
  };

  const resetIdentity = useIdentityStore((s) => s.reset);
  const resetBoot = useBootStore((s) => s.reset);
  const conversations = useChatStore((s) => s.conversations);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const resetProfile = useAppStore((s) => s.resetProfile);

  const confirmDelete = () => {
    Alert.alert(
      'Delete account',
      'This erases your identity, keys, and all messages on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            for (const c of conversations) deleteConversation(c.id);
            void resetProfile();
            resetIdentity();
            resetBoot();
            closeAccount();
          },
        },
      ],
    );
  };

  const pickAvatar = () => {
    Alert.alert(
      'Upload photo',
      'expo-image-picker is not installed yet — wire this up to ImagePicker.launchImageLibraryAsync().',
    );
  };

  const initial = (draftName.trim()[0] ?? displayName.trim()[0] ?? 'Y').toUpperCase();
  const displayPhone = phone ? formatPhone(phone) : '';

  return (
    <Animated.View style={[styles.flex, { backgroundColor: theme.colors.background }, slide.style]}>
      <GlassHeader
        onHeightChange={setHeaderH}
        title="Account"
        hideAccent
        leftSlot={
          <IconButton
            icon="lucide:chevron-left"
            size={22}
            onPress={onBack}
            accessibilityLabel="Back"
          />
        }
        rightSlot={
          <Pressable
            onPress={onSave}
            disabled={!dirty}
            hitSlop={theme.touch.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Save"
            accessibilityState={{ disabled: !dirty }}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: dirty ? theme.colors.primary : 'transparent',
                opacity: pressed && dirty ? 0.85 : 1,
              },
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.2}
              style={[
                theme.typography.caption,
                {
                  color: dirty ? theme.colors.onPrimary : theme.colors.textMuted,
                  fontWeight: '700',
                  letterSpacing: 0.3,
                },
              ]}
            >
              SAVE
            </Text>
          </Pressable>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{
              paddingTop: headerH,
              paddingBottom: 96 + insets.bottom,
              alignItems: 'center',
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View
              style={{
                width: contentWidth,
                paddingHorizontal: theme.spacing.lg,
              }}
            >
              {/* Avatar header */}
              <View style={styles.avatarBlock}>
                <Pressable
                  onPress={pickAvatar}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={[styles.avatar, { backgroundColor: theme.colors.surface }]}
                    />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
                      <Text
                        maxFontSizeMultiplier={1.2}
                        style={[styles.avatarInitial, { color: theme.colors.onPrimary }]}
                      >
                        {initial}
                      </Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.cameraBadge,
                      {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.background,
                      },
                    ]}
                  >
                    <Iconify icon="lucide:camera" size={14} color={theme.colors.onPrimary} />
                  </View>
                </Pressable>

                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[
                    theme.typography.title,
                    {
                      color: theme.colors.text,
                      marginTop: theme.spacing.md,
                      textAlign: 'center',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {(draftName || displayName).trim() || 'Your name'}
                </Text>
                {displayPhone ? (
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[
                      styles.mono,
                      { color: theme.colors.textMuted, marginTop: 2 },
                    ]}
                  >
                    {displayPhone}
                  </Text>
                ) : null}

                {avatarUri ? (
                  <Pressable
                    onPress={() => setAvatarUri(null)}
                    hitSlop={theme.touch.hitSlop}
                    style={{ marginTop: theme.spacing.sm }}
                  >
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: DANGER, fontWeight: '600' },
                      ]}
                    >
                      Remove photo
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={pickAvatar} hitSlop={theme.touch.hitSlop} style={{ marginTop: theme.spacing.sm }}>
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.primary, fontWeight: '600' },
                      ]}
                    >
                      Change photo
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Personal info card */}
              <SectionLabel theme={theme} label="Personal info" />
              <Card theme={theme}>
                <Row
                  theme={theme}
                  icon="lucide:user"
                  label="Name"
                  value={draftName}
                  onChange={(t) => setDraftName(t.slice(0, 40))}
                  placeholder="Your name"
                  maxLength={40}
                />
                <Row
                  theme={theme}
                  icon="lucide:calendar"
                  label="Date of birth"
                  value={draftDob}
                  onChange={(t) => setDraftDob(t.slice(0, 10))}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
                <Row
                  theme={theme}
                  icon="lucide:align-left"
                  label="Bio"
                  value={draftBio}
                  onChange={(t) => setDraftBio(t.slice(0, 160))}
                  placeholder="A short blurb about you"
                  maxLength={160}
                  multiline
                  showCounter
                />
              </Card>

              {/* Account region (derived from phone number) */}
              <SectionLabel theme={theme} label="Account based in" />
              <Card theme={theme}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{ fontSize: 22, marginRight: theme.spacing.sm }}
                  >
                    {accountCountry.flag}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={[theme.typography.body, { color: theme.colors.text, fontWeight: '600' }]}
                    >
                      {preciseLabel ?? formatRegion(detectedRegion)}
                    </Text>
                    {preciseLocation ? (
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
                      >
                        Precise · captured {new Date(preciseLocation.capturedAt).toLocaleDateString()}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={preciseLocation ? clearPreciseLocation : usePreciseLocation}
                  disabled={locating}
                  accessibilityRole="button"
                  accessibilityLabel={preciseLocation ? 'Clear precise location' : 'Use precise location'}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                      backgroundColor: pressed ? theme.colors.background : 'transparent',
                      opacity: locating ? 0.6 : 1,
                    },
                  ]}
                >
                  <Iconify
                    icon={preciseLocation ? 'lucide:x-circle' : 'lucide:map-pin'}
                    size={18}
                    color={preciseLocation ? '#ef4444' : theme.colors.primary}
                  />
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[
                      theme.typography.body,
                      {
                        color: preciseLocation ? '#ef4444' : theme.colors.primary,
                        marginLeft: theme.spacing.sm,
                        fontWeight: '600',
                        flex: 1,
                      },
                    ]}
                  >
                    {preciseLocation ? 'Use phone-derived region' : 'Use precise location'}
                  </Text>
                  {locating ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
                </Pressable>
              </Card>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: theme.colors.textMuted,
                    marginTop: theme.spacing.xs,
                    paddingHorizontal: theme.spacing.xs,
                    lineHeight: theme.typography.caption.lineHeight + 2,
                  },
                ]}
              >
                {preciseLocation
                  ? 'Showing your captured GPS location. Tap to revert to the phone-derived region.'
                  : 'Derived from your registered phone number. Tap "Use precise location" to read it from GPS once — requires location permission.'}
                {' '}
                <Text
                  onPress={reportRegionProblem}
                  style={{ color: theme.colors.primary, fontWeight: '600' }}
                >
                  Report a problem
                </Text>
              </Text>

              {/* Danger zone */}
              <SectionLabel theme={theme} label="Danger zone" />
              <Card theme={theme}>
                <Pressable
                  onPress={confirmDelete}
                  accessibilityRole="button"
                  accessibilityLabel="Delete account"
                  style={({ pressed }) => [
                    styles.dangerRow,
                    {
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.md,
                      backgroundColor: pressed ? DANGER + '14' : 'transparent',
                    },
                  ]}
                >
                  <Iconify icon="lucide:trash-2" size={18} color={DANGER} />
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        color: DANGER,
                        marginLeft: theme.spacing.sm,
                        fontWeight: '600',
                        flex: 1,
                      },
                    ]}
                  >
                    Delete account
                  </Text>
                  <Iconify icon="lucide:chevron-right" size={14} color={DANGER} />
                </Pressable>
              </Card>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: theme.colors.textMuted,
                    marginTop: theme.spacing.xs,
                    paddingHorizontal: theme.spacing.xs,
                  },
                ]}
              >
                Permanently erases identity, keys, and all on-device messages.
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </Animated.View>
  );
}

function Row({
  theme,
  icon,
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  maxLength,
  multiline,
  showCounter,
}: {
  theme: Theme;
  icon: string;
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
  maxLength?: number;
  multiline?: boolean;
  showCounter?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: multiline ? 'flex-start' : 'center',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Iconify
        icon={icon}
        size={18}
        color={theme.colors.textMuted}
        style={multiline ? { marginTop: 2 } : undefined}
      />
      <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, flex: 1 },
            ]}
          >
            {label}
          </Text>
          {showCounter && maxLength ? (
            <Text
              maxFontSizeMultiplier={1.2}
              style={[theme.typography.caption, { color: theme.colors.textMuted }]}
            >
              {value.length}/{maxLength}
            </Text>
          ) : null}
        </View>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          maxLength={maxLength}
          keyboardType={keyboardType ?? 'default'}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          maxFontSizeMultiplier={1.3}
          style={[
            theme.typography.body,
            {
              color: theme.colors.text,
              padding: 0,
              marginTop: 2,
              minHeight: multiline ? 60 : undefined,
            },
          ]}
        />
      </View>
    </View>
  );
}

function formatPhone(p: string) {
  const digits = p.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `+${digits}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  avatarBlock: { alignItems: 'center', marginTop: 8 },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 44, fontWeight: '700' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mono: { fontFamily: 'monospace', fontSize: 13, letterSpacing: 0.5 },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerRow: { flexDirection: 'row', alignItems: 'center' },
});
