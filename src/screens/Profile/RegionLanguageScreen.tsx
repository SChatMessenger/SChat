import { useCallback, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '../../store';
import { useTheme, type Theme } from '../../theme';
import { Card, GlassHeader, IconButton, OptionSheet, SectionLabel, type OptionItem } from '../../components';
import { useHardwareBack, useSlideIn } from '../../hooks';
import { COUNTRIES } from '../../utils/countries';

const CONTENT_MAX_WIDTH = 560;

type Language = { code: string; label: string; native: string };

const EN: Language = { code: 'en', label: 'English', native: 'English' };

// Languages offered per region. India lists its major scheduled languages;
// other regions list their common ones. Anything unmapped falls back to English.
const LANGUAGES_BY_REGION: Record<string, Language[]> = {
  IN: [
    EN,
    { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
    { code: 'bn', label: 'Bengali', native: 'বাংলা' },
    { code: 'te', label: 'Telugu', native: 'తెలుగు' },
    { code: 'mr', label: 'Marathi', native: 'मराठी' },
    { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
    { code: 'ur', label: 'Urdu', native: 'اردو' },
    { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
    { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ' },
    { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
    { code: 'as', label: 'Assamese', native: 'অসমীয়া' },
  ],
  US: [EN, { code: 'es', label: 'Spanish', native: 'Español' }],
  GB: [EN],
  CA: [EN, { code: 'fr', label: 'French', native: 'Français' }],
  AU: [EN],
  SG: [
    EN,
    { code: 'zh', label: 'Chinese', native: '中文' },
    { code: 'ms', label: 'Malay', native: 'Bahasa Melayu' },
    { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  ],
  AE: [{ code: 'ar', label: 'Arabic', native: 'العربية' }, EN],
  DE: [{ code: 'de', label: 'German', native: 'Deutsch' }, EN],
  FR: [{ code: 'fr', label: 'French', native: 'Français' }, EN],
  JP: [{ code: 'ja', label: 'Japanese', native: '日本語' }, EN],
  BR: [{ code: 'pt', label: 'Portuguese', native: 'Português' }, EN],
  ID: [{ code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia' }, EN],
  BD: [{ code: 'bn', label: 'Bengali', native: 'বাংলা' }, EN],
  EG: [{ code: 'ar', label: 'Arabic', native: 'العربية' }, EN],
  PK: [{ code: 'ur', label: 'Urdu', native: 'اردو' }, EN],
  NG: [EN],
  ZA: [EN],
  MX: [{ code: 'es', label: 'Spanish', native: 'Español' }, EN],
  CN: [{ code: 'zh', label: 'Chinese', native: '中文' }, EN],
  RU: [{ code: 'ru', label: 'Russian', native: 'Русский' }, EN],
  IT: [{ code: 'it', label: 'Italian', native: 'Italiano' }, EN],
  ES: [{ code: 'es', label: 'Spanish', native: 'Español' }, EN],
  NL: [{ code: 'nl', label: 'Dutch', native: 'Nederlands' }, EN],
  TR: [{ code: 'tr', label: 'Turkish', native: 'Türkçe' }, EN],
  KR: [{ code: 'ko', label: 'Korean', native: '한국어' }, EN],
  TH: [{ code: 'th', label: 'Thai', native: 'ไทย' }, EN],
  VN: [{ code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt' }, EN],
  PH: [EN, { code: 'fil', label: 'Filipino', native: 'Filipino' }],
  IL: [
    { code: 'he', label: 'Hebrew', native: 'עברית' },
    { code: 'ar', label: 'Arabic', native: 'العربية' },
    EN,
  ],
  SE: [{ code: 'sv', label: 'Swedish', native: 'Svenska' }, EN],
  CH: [
    { code: 'de', label: 'German', native: 'Deutsch' },
    { code: 'fr', label: 'French', native: 'Français' },
    { code: 'it', label: 'Italian', native: 'Italiano' },
    EN,
  ],
  PL: [{ code: 'pl', label: 'Polish', native: 'Polski' }, EN],
  UA: [
    { code: 'uk', label: 'Ukrainian', native: 'Українська' },
    { code: 'ru', label: 'Russian', native: 'Русский' },
    EN,
  ],
  AR: [{ code: 'es', label: 'Spanish', native: 'Español' }, EN],
  QA: [{ code: 'ar', label: 'Arabic', native: 'العربية' }, EN],
  KE: [EN, { code: 'sw', label: 'Swahili', native: 'Kiswahili' }],
};

function languagesFor(iso2: string): Language[] {
  return LANGUAGES_BY_REGION[iso2] ?? [EN];
}

export function RegionLanguageScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(insets.top + 64);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  const close = useAppStore((s) => s.closeProfileSubScreen);
  const appRegion = useAppStore((s) => s.appRegion);
  const appLanguage = useAppStore((s) => s.appLanguage);
  const setAppRegion = useAppStore((s) => s.setAppRegion);
  const setAppLanguage = useAppStore((s) => s.setAppLanguage);

  const [regionOpen, setRegionOpen] = useState(false);

  const slide = useSlideIn();
  const onBack = useCallback(() => slide.close(close), [slide, close]);

  useHardwareBack(
    useCallback(() => {
      if (regionOpen) {
        setRegionOpen(false);
        return true;
      }
      onBack();
      return true;
    }, [regionOpen, onBack]),
  );

  const country = COUNTRIES.find((c) => c.code === appRegion) ?? COUNTRIES[0];
  const langs = languagesFor(appRegion);

  const onPickRegion = (iso2: string) => {
    setAppRegion(iso2);
    // Keep language valid for the new region; default to its first option.
    const next = languagesFor(iso2);
    if (!next.some((l) => l.code === appLanguage)) setAppLanguage(next[0].code);
    setRegionOpen(false);
  };

  const regionOptions: OptionItem<string>[] = [...COUNTRIES]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      key: c.code,
      label: `${c.flag}  ${c.name}`,
    }));

  return (
    <Animated.View style={[styles.flex, { backgroundColor: theme.colors.background }, slide.style]}>
      <GlassHeader
        onHeightChange={setHeaderH}
        title="Region & Language"
        hideAccent
        leftSlot={
          <IconButton icon="lucide:chevron-left" size={22} onPress={onBack} accessibilityLabel="Back" />
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: 96 + insets.bottom, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentWidth, paddingHorizontal: theme.spacing.lg }}>
          {/* Region */}
          <SectionLabel theme={theme} label="Region" />
          <Card theme={theme}>
            <Pressable
              onPress={() => setRegionOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Region: ${country.name}. Tap to change.`}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                  backgroundColor: pressed ? theme.colors.background : 'transparent',
                },
              ]}
            >
              <Text style={{ fontSize: 22 }}>{country.flag}</Text>
              <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.body, { color: theme.colors.text, fontWeight: '600' }]}
                >
                  {country.name}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
                >
                  Sets available languages, date & number formats.
                </Text>
              </View>
              <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
            </Pressable>
          </Card>

          {/* Language */}
          <SectionLabel theme={theme} label="Language" />
          <Card theme={theme}>
            {langs.map((l, i) => {
              const active = l.code === appLanguage;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => setAppLanguage(l.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={l.label}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                      backgroundColor: pressed ? theme.colors.background : 'transparent',
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={[
                        theme.typography.body,
                        { color: theme.colors.text, fontWeight: active ? '700' : '500' },
                      ]}
                    >
                      {l.native}
                    </Text>
                    {l.native !== l.label ? (
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 1 }]}
                      >
                        {l.label}
                      </Text>
                    ) : null}
                  </View>
                  <Iconify
                    icon={active ? 'lucide:circle-check' : 'lucide:circle'}
                    size={20}
                    color={active ? theme.colors.primary : theme.colors.border}
                  />
                </Pressable>
              );
            })}
          </Card>
          <Text
            maxFontSizeMultiplier={1.3}
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
            This sets the app’s display language. Messages from others stay in the language they were sent.
          </Text>
        </View>
      </ScrollView>

      <OptionSheet
        visible={regionOpen}
        title="Region"
        options={regionOptions}
        value={appRegion}
        onChange={onPickRegion}
        onDismiss={() => setRegionOpen(false)}
      />

      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
