import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import { useAppStore, type AutoDownloadRule, type DataMode, type LessDataCalls } from '../../store';
import { useTheme, type Theme } from '../../theme';
import {
  BottomSheet,
  Card,
  DonutChart,
  GlassHeader,
  IconButton,
  OptionSheet,
  SectionLabel,
  SettingsRow,
  type DonutSegment,
  type OptionItem,
} from '../../components';
import { useHardwareBack, useSlideIn } from '../../hooks';

const CONTENT_MAX_WIDTH = 960;

// These would come from native storage/usage telemetry. Kept here so the
// surface is real to interact with; swap for measured values when wired.
const DATA_USED_GB = 7.96;
const STORAGE_BREAKDOWN: { key: string; label: string; mb: number; color: string; icon: string }[] = [
  { key: 'videos', label: 'Videos', mb: 230.0, color: '#4f8cff', icon: 'ph:video-camera-bold' },
  { key: 'photos', label: 'Photos', mb: 70.0, color: '#5ac8fa', icon: 'ph:images-bold' },
  { key: 'files', label: 'Files', mb: 45.0, color: '#ff9f0a', icon: 'ph:file-bold' },
  { key: 'cache', label: 'Cache', mb: 40.0, color: '#34c759', icon: 'ph:database-bold' },
  { key: 'voice', label: 'Voice', mb: 22.0, color: '#ff453a', icon: 'ph:microphone-bold' },
  { key: 'system', label: 'System', mb: 12.0, color: '#af52de', icon: 'ph:gear-six-bold' },
];
const STORAGE_TOTAL_MB = STORAGE_BREAKDOWN.reduce((a, b) => a + b.mb, 0);
const RECLAIMABLE_MB = STORAGE_BREAKDOWN.find((s) => s.label === 'Cache')?.mb ?? 0;

const MODES: { key: DataMode; label: string; blurb: string }[] = [
  { key: 'saver', label: 'Saver', blurb: 'Almost nothing downloads on cellular. Best for tight plans.' },
  { key: 'balanced', label: 'Balanced', blurb: 'Small media on cellular, more on Wi-Fi. A sensible default.' },
  { key: 'unlimited', label: 'Unlimited', blurb: 'Everything downloads automatically on any network.' },
];

const VIDEO_SIZES = [0, 5, 10, 15, 50, -1];
const FILE_SIZES = [0, 1, 3, 5, 10, -1];
const CAP_GBS = [0, 2, 5, 10, 20, 50];
const STORAGE_CAPS = [0, 500, 1000, 2000, 5000];
const KEEP_DAYS = [0, 7, 30, 90];

const NETWORKS: { key: 'cellular' | 'wifi' | 'roaming'; label: string; icon: string }[] = [
  { key: 'cellular', label: 'Mobile data', icon: 'lucide:smartphone' },
  { key: 'wifi', label: 'Wi-Fi', icon: 'lucide:wifi' },
  { key: 'roaming', label: 'Roaming', icon: 'lucide:plane' },
];

const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const sizeLabel = (mb: number) => {
  if (mb < 0) return 'No limit';
  if (mb === 0) return 'Off';
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  if (mb >= 1024) return `${trimNum(mb / 1024)} GB`;
  return `${trimNum(mb)} MB`;
};
const capLabel = (gb: number) => (gb === 0 ? 'No cap' : `${gb} GB`);
const storageLabel = (mb: number) => (mb === 0 ? 'Off' : mb < 1000 ? `${mb} MB` : `${mb / 1000} GB`);
const keepLabel = (d: number) =>
  d === 0 ? 'Forever' : d === 7 ? '1 week' : d === 30 ? '1 month' : d === 90 ? '3 months' : `${d} days`;
const fmtMb = (mb: number) => (mb < 1000 ? `${mb.toFixed(1)} MB` : `${(mb / 1000).toFixed(2)} GB`);
const splitSize = (mb: number) =>
  mb < 1000 ? { value: mb.toFixed(1), unit: 'MB' } : { value: (mb / 1000).toFixed(2), unit: 'GB' };

const CALLS: { key: LessDataCalls; label: string }[] = [
  { key: 'never', label: 'Never' },
  { key: 'roaming', label: 'Only while roaming' },
  { key: 'always', label: 'Always' },
];

type SizeSheet = { net: 'cellular' | 'wifi' | 'roaming'; kind: 'video' | 'files' } | null;

export function DataStorageScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(insets.top + 64);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  const close = useAppStore((s) => s.closeProfileSubScreen);
  const ds = useAppStore((s) => s.dataStorage);
  const setDataStorage = useAppStore((s) => s.setDataStorage);
  const setAutoDownload = useAppStore((s) => s.setAutoDownload);
  const applyDataMode = useAppStore((s) => s.applyDataMode);

  const [sizeSheet, setSizeSheet] = useState<SizeSheet>(null);
  const [photoSheet, setPhotoSheet] = useState<'cellular' | 'wifi' | 'roaming' | null>(null);
  const [custom, setCustom] = useState<SizeSheet>(null);
  const [customVal, setCustomVal] = useState('');
  const [customUnit, setCustomUnit] = useState<'KB' | 'MB' | 'GB'>('MB');
  const [capOpen, setCapOpen] = useState(false);
  const [storageCapOpen, setStorageCapOpen] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [activeSeg, setActiveSeg] = useState<string | null>(null);
  const donutAnim = useRef(new Animated.Value(0)).current;
  const iconAnims = useRef(STORAGE_BREAKDOWN.map(() => new Animated.Value(0))).current;

  const slide = useSlideIn();
  const onBack = useCallback(() => slide.close(close), [slide, close]);

  const anySheet =
    sizeSheet || photoSheet || custom || capOpen || storageCapOpen || keepOpen || callsOpen || storageOpen;
  useHardwareBack(
    useCallback(() => {
      if (anySheet) {
        setSizeSheet(null);
        setPhotoSheet(null);
        setCustom(null);
        setCapOpen(false);
        setStorageCapOpen(false);
        setKeepOpen(false);
        setCallsOpen(false);
        setStorageOpen(false);
        return true;
      }
      onBack();
      return true;
    }, [anySheet, onBack]),
  );

  useEffect(() => {
    if (!storageOpen) {
      setActiveSeg(null);
      iconAnims.forEach((v) => v.setValue(0));
      return;
    }
    donutAnim.setValue(0);
    Animated.spring(donutAnim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 55 }).start();

    // Telegram-style: each category icon springs in, staggered top-to-bottom.
    iconAnims.forEach((v) => v.setValue(0));
    Animated.stagger(
      55,
      iconAnims.map((v) =>
        Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }),
      ),
    ).start();
  }, [storageOpen, donutAnim, iconAnims]);

  const donutSegments: DonutSegment[] = STORAGE_BREAKDOWN.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.mb,
    color: s.color,
  }));
  const activeData = STORAGE_BREAKDOWN.find((s) => s.key === activeSeg);
  const donutCenter = activeData
    ? { top: splitSize(activeData.mb).value, bottom: activeData.label }
    : { top: splitSize(STORAGE_TOTAL_MB).value, bottom: splitSize(STORAGE_TOTAL_MB).unit };

  const rule = (net: 'cellular' | 'wifi' | 'roaming'): AutoDownloadRule => ds[net];

  const onFreeUp = () => {
    Alert.alert(
      'Free up space',
      `This clears ${fmtMb(RECLAIMABLE_MB)} of cached media. Anything you've starred or sent stays. It re-downloads when you open it again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Free up', style: 'destructive', onPress: () => undefined },
      ],
    );
  };

  const explainWhy = () => {
    Alert.alert(
      'How your data budget works',
      'Pick one mode and the app sets every auto-download rule for you — no per-network, per-type toggling. ' +
        'A monthly cap (optional) makes it switch to Saver on its own as you approach the limit, and roaming always falls back to Saver. ' +
        'Storage Autopilot keeps the app under a size you choose by clearing the oldest cached media first; your sent and starred files are never touched.',
      [{ text: 'Got it' }],
    );
  };

  const sizeOptions = (kind: 'video' | 'files'): OptionItem<string>[] =>
    (kind === 'video' ? VIDEO_SIZES : FILE_SIZES).map((n) => ({ key: String(n), label: sizeLabel(n) }));

  // "Custom size…" — open an inline number + unit (KB/MB/GB) editor. Dismiss the
  // size sheet first so the two modals don't fight, then open after it slides out.
  const openCustomSize = () => {
    const sheet = sizeSheet;
    if (!sheet) return;
    const r = rule(sheet.net);
    const cur = sheet.kind === 'video' ? r.videoMb : r.filesMb;
    let unit: 'KB' | 'MB' | 'GB' = 'MB';
    let val = '';
    if (cur > 0) {
      if (cur < 1) {
        unit = 'KB';
        val = String(Math.round(cur * 1024));
      } else if (cur >= 1024) {
        unit = 'GB';
        val = trimNum(cur / 1024);
      } else {
        unit = 'MB';
        val = trimNum(cur);
      }
    }
    setSizeSheet(null);
    setCustomVal(val);
    setCustomUnit(unit);
    setTimeout(() => setCustom(sheet), 300);
  };

  // 1024 of any unit is the next unit up, so a value only ever holds 0–1023.
  const onCustomChange = (t: string) => {
    let s = t.replace(/[^0-9.]/g, '');
    const dot = s.indexOf('.');
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
    if (Number(s) > 1023) s = '1023';
    setCustomVal(s);
  };

  const applyCustom = () => {
    if (!custom) return;
    const n = Math.min(1023, Math.max(0, Number(customVal)));
    if (!Number.isFinite(n)) {
      setCustom(null);
      return;
    }
    const mb = customUnit === 'KB' ? n / 1024 : customUnit === 'GB' ? n * 1024 : n;
    const r = rule(custom.net);
    setAutoDownload(custom.net, custom.kind === 'video' ? { ...r, videoMb: mb } : { ...r, filesMb: mb });
    setCustom(null);
  };

  // Live preview of what the typed number + unit resolves to.
  const customMb = (() => {
    const n = Math.min(1023, Math.max(0, Number(customVal) || 0));
    return customUnit === 'KB' ? n / 1024 : customUnit === 'GB' ? n * 1024 : n;
  })();

  const capUsedRatio = ds.monthlyCapGb > 0 ? Math.min(1, DATA_USED_GB / ds.monthlyCapGb) : 0;

  return (
    <Animated.View style={[styles.flex, { backgroundColor: theme.colors.background }, slide.style]}>
      <GlassHeader
        onHeightChange={setHeaderH}
        title="Data & Storage"
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
          {/* ── Data Budget ───────────────────────────────────────── */}
          <SectionLabel theme={theme} label="Data Budget" />
          <Card theme={theme}>
            <View style={{ padding: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm }}>
                <Iconify icon="lucide:gauge" size={18} color={theme.colors.primary} />
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.body, { color: theme.colors.text, fontWeight: '700', marginLeft: theme.spacing.sm, flex: 1 }]}
                >
                  {DATA_USED_GB.toFixed(2)} GB used this month
                </Text>
                {ds.mode === 'custom' ? (
                  <Text maxFontSizeMultiplier={1.3} style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                    Custom
                  </Text>
                ) : null}
              </View>

              {/* Mode chips */}
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                {MODES.map((m) => {
                  const active = ds.mode === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => applyDataMode(m.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{
                        flex: 1,
                        paddingVertical: theme.spacing.sm,
                        borderRadius: theme.radii.md,
                        alignItems: 'center',
                        backgroundColor: active ? theme.colors.primary : theme.colors.background,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={[
                          theme.typography.caption,
                          { color: active ? theme.colors.onPrimary : theme.colors.text, fontWeight: '700' },
                        ]}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}
              >
                {ds.mode === 'custom'
                  ? 'Fine-tuned below. Pick a mode to reset to a preset.'
                  : MODES.find((m) => m.key === ds.mode)?.blurb}
              </Text>
            </View>

            <Divider theme={theme} />
            <NavRow
              theme={theme}
              label="Monthly cap"
              value={capLabel(ds.monthlyCapGb)}
              onPress={() => setCapOpen(true)}
            />
            {ds.monthlyCapGb > 0 ? (
              <View style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${capUsedRatio * 100}%`,
                      height: '100%',
                      backgroundColor: capUsedRatio > 0.9 ? '#ff453a' : theme.colors.primary,
                    }}
                  />
                </View>
                <Text maxFontSizeMultiplier={1.3} style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {DATA_USED_GB.toFixed(2)} of {ds.monthlyCapGb} GB this cycle
                </Text>
              </View>
            ) : null}
            <Divider theme={theme} />
            <ToggleRow
              theme={theme}
              icon="lucide:zap"
              label="Switch to Saver near limit"
              value={ds.autoSaverNearCap}
              disabled={ds.monthlyCapGb === 0}
              onValueChange={(v) => setDataStorage('autoSaverNearCap', v)}
            />
            <Divider theme={theme} />
            <ToggleRow
              theme={theme}
              icon="lucide:plane"
              label="Always use Saver on roaming"
              value={ds.roamingSaver}
              onValueChange={(v) => setDataStorage('roamingSaver', v)}
            />
          </Card>

          {/* ── Storage Autopilot ─────────────────────────────────── */}
          <SectionLabel theme={theme} label="Storage" />
          <Card theme={theme}>
            <Pressable
              onPress={() => setStorageOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="View storage breakdown"
              style={({ pressed }) => ({ padding: theme.spacing.md, backgroundColor: pressed ? theme.colors.background : 'transparent' })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm }}>
                <Iconify icon="lucide:hard-drive" size={18} color={theme.colors.primary} />
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.body, { color: theme.colors.text, fontWeight: '700', marginLeft: theme.spacing.sm, flex: 1 }]}
                >
                  {fmtMb(STORAGE_TOTAL_MB)} on this device
                </Text>
                <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
              </View>
              {/* Breakdown bar */}
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                {STORAGE_BREAKDOWN.map((seg) => (
                  <View key={seg.label} style={{ flex: seg.mb, backgroundColor: seg.color }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
                {STORAGE_BREAKDOWN.map((seg) => (
                  <View key={seg.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color, marginRight: 5 }} />
                    <Text maxFontSizeMultiplier={1.3} style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                      {seg.label} {seg.mb.toFixed(0)}MB
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>

            <Divider theme={theme} />
            <NavRow
              theme={theme}
              label="Keep SChat under"
              value={storageLabel(ds.storageCapMb)}
              hint="Auto-clears oldest cache to stay under"
              onPress={() => setStorageCapOpen(true)}
            />
            <Divider theme={theme} />
            <NavRow
              theme={theme}
              label="Auto-clear cache older than"
              value={keepLabel(ds.keepMediaDays)}
              onPress={() => setKeepOpen(true)}
            />
            <Divider theme={theme} />
            <Pressable
              onPress={onFreeUp}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                backgroundColor: pressed ? theme.colors.background : 'transparent',
              })}
            >
              <Iconify icon="lucide:trash-2" size={16} color={theme.colors.primary} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.body, { color: theme.colors.primary, fontWeight: '600', marginLeft: theme.spacing.sm, flex: 1 }]}
              >
                Free up {fmtMb(RECLAIMABLE_MB)} now
              </Text>
              <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
            </Pressable>
          </Card>

          {/* ── Auto-download (granular) ──────────────────────────── */}
          <SectionLabel theme={theme} label="Auto-download" />
          {NETWORKS.map((net, ni) => {
            const r = rule(net.key);
            return (
              <View key={net.key} style={ni > 0 ? { marginTop: theme.spacing.sm } : undefined}>
                <Card theme={theme} style={{ paddingVertical: theme.spacing.xs }}>
                  <View style={{ paddingHorizontal: theme.spacing.md, paddingBottom: 2, flexDirection: 'row', alignItems: 'center' }}>
                    <Iconify icon={net.icon} size={15} color={theme.colors.textMuted} />
                    <Text
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={1}
                      style={[theme.typography.caption, { color: theme.colors.text, fontWeight: '700', marginLeft: theme.spacing.sm }]}
                    >
                      {net.label}
                    </Text>
                  </View>
                  <NavRow
                    theme={theme}
                    icon="lucide:image"
                    label="Photos"
                    value={r.photos ? 'On' : 'Off'}
                    onPress={() => setPhotoSheet(net.key)}
                  />
                  <NavRow
                    theme={theme}
                    icon="lucide:film"
                    label="Videos"
                    value={sizeLabel(r.videoMb)}
                    onPress={() => setSizeSheet({ net: net.key, kind: 'video' })}
                  />
                  <NavRow
                    theme={theme}
                    icon="lucide:file"
                    label="Files"
                    value={sizeLabel(r.filesMb)}
                    onPress={() => setSizeSheet({ net: net.key, kind: 'files' })}
                  />
                </Card>
              </View>
            );
          })}

          {/* ── Save to gallery ───────────────────────────────────── */}
          <SectionLabel theme={theme} label="Save to gallery" />
          <Card theme={theme}>
            <ToggleRow theme={theme} icon="lucide:images" label="Private chats" value={ds.saveGalleryPrivate} onValueChange={(v) => setDataStorage('saveGalleryPrivate', v)} />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:users" label="Groups" value={ds.saveGalleryGroups} onValueChange={(v) => setDataStorage('saveGalleryGroups', v)} />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:megaphone" label="Channels" value={ds.saveGalleryChannels} onValueChange={(v) => setDataStorage('saveGalleryChannels', v)} />
          </Card>

          {/* ── Calls & connection ────────────────────────────────── */}
          <SectionLabel theme={theme} label="Calls & connection" />
          <Card theme={theme}>
            <ToggleRow theme={theme} icon="lucide:play" label="Stream videos & audio" value={ds.streamMedia} onValueChange={(v) => setDataStorage('streamMedia', v)} />
            <Divider theme={theme} />
            <NavRow theme={theme} icon="lucide:phone" label="Use less data for calls" value={CALLS.find((c) => c.key === ds.lessDataCalls)?.label ?? ''} onPress={() => setCallsOpen(true)} />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:server" label="Use proxy" value={ds.proxyEnabled} onValueChange={(v) => setDataStorage('proxyEnabled', v)} />
          </Card>

          <Pressable onPress={explainWhy} accessibilityRole="button" style={{ marginTop: theme.spacing.md, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.xs }}>
            <Iconify icon="lucide:info" size={14} color={theme.colors.primary} />
            <Text maxFontSizeMultiplier={1.3} style={[theme.typography.caption, { color: theme.colors.primary, marginLeft: 6, fontWeight: '600' }]}>
              How your data budget works
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sheets */}
      <OptionSheet
        visible={!!photoSheet}
        title="Auto-download photos"
        options={[
          { key: 'on', label: 'On' },
          { key: 'off', label: 'Off' },
        ]}
        value={photoSheet ? (rule(photoSheet).photos ? 'on' : 'off') : null}
        onChange={(key) => {
          if (!photoSheet) return;
          const r = rule(photoSheet);
          setAutoDownload(photoSheet, { ...r, photos: key === 'on' });
          setPhotoSheet(null);
        }}
        onDismiss={() => setPhotoSheet(null)}
      />
      <OptionSheet
        visible={!!sizeSheet}
        title={sizeSheet?.kind === 'files' ? 'Auto-download files up to' : 'Auto-download videos up to'}
        options={sizeSheet ? sizeOptions(sizeSheet.kind) : []}
        value={sizeSheet ? String(sizeSheet.kind === 'video' ? rule(sizeSheet.net).videoMb : rule(sizeSheet.net).filesMb) : null}
        onChange={(key) => {
          if (!sizeSheet) return;
          const r = rule(sizeSheet.net);
          const mb = Number(key);
          setAutoDownload(sizeSheet.net, sizeSheet.kind === 'video' ? { ...r, videoMb: mb } : { ...r, filesMb: mb });
          setSizeSheet(null);
        }}
        footer={{ icon: 'lucide:plus', label: 'Custom size…', onPress: openCustomSize }}
        onDismiss={() => setSizeSheet(null)}
      />
      <OptionSheet
        visible={capOpen}
        title="Monthly data cap"
        options={CAP_GBS.map((g) => ({ key: String(g), label: capLabel(g) }))}
        value={String(ds.monthlyCapGb)}
        onChange={(key) => {
          setDataStorage('monthlyCapGb', Number(key));
          setCapOpen(false);
        }}
        onDismiss={() => setCapOpen(false)}
      />
      <OptionSheet
        visible={storageCapOpen}
        title="Keep SChat under"
        options={STORAGE_CAPS.map((m) => ({ key: String(m), label: storageLabel(m) }))}
        value={String(ds.storageCapMb)}
        onChange={(key) => {
          setDataStorage('storageCapMb', Number(key));
          setStorageCapOpen(false);
        }}
        onDismiss={() => setStorageCapOpen(false)}
      />
      <OptionSheet
        visible={keepOpen}
        title="Auto-clear cache older than"
        options={KEEP_DAYS.map((d) => ({ key: String(d), label: keepLabel(d) }))}
        value={String(ds.keepMediaDays)}
        onChange={(key) => {
          setDataStorage('keepMediaDays', Number(key));
          setKeepOpen(false);
        }}
        onDismiss={() => setKeepOpen(false)}
      />
      <OptionSheet
        visible={callsOpen}
        title="Use less data for calls"
        options={CALLS.map((c) => ({ key: c.key, label: c.label }))}
        value={ds.lessDataCalls}
        onChange={(key) => {
          setDataStorage('lessDataCalls', key as LessDataCalls);
          setCallsOpen(false);
        }}
        onDismiss={() => setCallsOpen(false)}
      />

      {/* Storage breakdown — donut dashboard */}
      <BottomSheet visible={storageOpen} onDismiss={() => setStorageOpen(false)} title="Storage" scrollable>
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
          {/* Donut dashboard card */}
          <View
            style={{
              alignItems: 'center',
            }}
          >
            <Animated.View
              style={{
                opacity: donutAnim,
                transform: [{ scale: donutAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
              }}
            >
              <DonutChart
                segments={donutSegments}
                activeKey={activeSeg}
                onSelect={setActiveSeg}
                centerTop={donutCenter.top}
                centerBottom={donutCenter.bottom}
                size={230}
                strokeWidth={60} // slightly thick ring; keeps small slices clean
                gapDeg={2}
              />
            </Animated.View>
          </View>

          {/* Category list */}
          <View
            style={{
              marginTop: theme.spacing.md,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              overflow: 'hidden',
            }}
          >
            {STORAGE_BREAKDOWN.map((seg, i) => {
              const pct = Math.round((seg.mb / STORAGE_TOTAL_MB) * 100);
              const on = activeSeg === seg.key;
              const dim = activeSeg != null && !on;
              return (
                <Pressable
                  key={seg.key}
                  onPress={() => setActiveSeg(on ? null : seg.key)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 9,
                    paddingHorizontal: theme.spacing.md,
                    opacity: dim ? 0.5 : 1,
                    backgroundColor: on || pressed ? theme.colors.background : 'transparent',
                    borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                  })}
                >
                  <Animated.View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      backgroundColor: seg.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: theme.spacing.md,
                      opacity: iconAnims[i],
                      transform: [
                        { scale: iconAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                      ],
                    }}
                  >
                    <Iconify icon={seg.icon} size={17} color="#fff" />
                  </Animated.View>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    numberOfLines={1}
                    style={[theme.typography.body, { color: theme.colors.text, flex: 1, fontWeight: '600' }]}
                  >
                    {seg.label}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[theme.typography.caption, { color: theme.colors.textMuted, width: 76, textAlign: 'right' }]}
                  >
                    {fmtMb(seg.mb)}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[theme.typography.body, { color: theme.colors.text, fontWeight: '700', width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] }]}
                  >
                    {pct}%
                  </Text>
                  <View style={{ marginLeft: 6 }}>
                    <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onFreeUp}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: theme.spacing.md,
              alignSelf: 'stretch',
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radii.md,
              paddingVertical: theme.spacing.md,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text maxFontSizeMultiplier={1.3} style={[theme.typography.body, { color: theme.colors.onPrimary, fontWeight: '700' }]}>
              Free up {fmtMb(RECLAIMABLE_MB)}
            </Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Custom size editor — number + KB/MB/GB unit */}
      <BottomSheet
        visible={!!custom}
        onDismiss={() => setCustom(null)}
        title={`Custom ${custom?.kind === 'files' ? 'file' : 'video'} size`}
        avoidKeyboard
      >
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
              {/* Big centered number */}
              <TextInput
                value={customVal}
                onChangeText={onCustomChange}
                keyboardType="numeric"
                maxLength={6}
                autoFocus
                selectTextOnFocus
                placeholder="0"
                placeholderTextColor={theme.colors.border}
                maxFontSizeMultiplier={1.2}
                onSubmitEditing={applyCustom}
                style={{
                  color: theme.colors.text,
                  fontSize: 44,
                  fontWeight: '800',
                  textAlign: 'center',
                  paddingVertical: theme.spacing.xs,
                }}
              />

              {/* Full-width segmented unit control */}
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radii.md,
                  padding: 3,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.border,
                  marginTop: theme.spacing.sm,
                }}
              >
                {(['KB', 'MB', 'GB'] as const).map((u) => {
                  const active = customUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setCustomUnit(u)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{
                        flex: 1,
                        paddingVertical: theme.spacing.sm,
                        borderRadius: theme.radii.md,
                        alignItems: 'center',
                        backgroundColor: active ? theme.colors.primary : 'transparent',
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={[
                          theme.typography.body,
                          { color: active ? theme.colors.onPrimary : theme.colors.text, fontWeight: '700' },
                        ]}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Live preview */}
              <Text
                maxFontSizeMultiplier={1.3}
                style={[
                  theme.typography.body,
                  { color: theme.colors.text, fontWeight: '600', textAlign: 'center', marginTop: theme.spacing.md },
                ]}
              >
                {customMb === 0 ? 'Off — won’t auto-download' : `Auto-downloads up to ${sizeLabel(customMb)}`}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.caption, { color: theme.colors.textMuted, textAlign: 'center', marginTop: 2 }]}
              >
                Max 1023 per unit · 1024 rolls to the next unit
              </Text>
              <Pressable
                onPress={applyCustom}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  marginTop: theme.spacing.md,
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radii.md,
                  paddingVertical: theme.spacing.md,
                  alignItems: 'center',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.body, { color: theme.colors.onPrimary, fontWeight: '700' }]}
                >
                  Set size
                </Text>
              </Pressable>
        </View>
      </BottomSheet>

      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </Animated.View>
  );
}

function Divider(_props: { theme: Theme }) {
  return null;
}

function ToggleRow(p: {
  theme: Theme;
  icon: string;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  indent?: boolean;
}) {
  return (
    <SettingsRow
      compact
      icon={p.icon}
      label={p.label}
      indent={p.indent}
      disabled={p.disabled}
      toggle={{ value: p.value, onValueChange: p.onValueChange }}
    />
  );
}

function NavRow(p: {
  theme: Theme;
  icon?: string;
  label: string;
  value: string;
  hint?: string;
  indent?: boolean;
  onPress: () => void;
}) {
  return (
    <SettingsRow
      compact
      icon={p.icon}
      label={p.label}
      subtitle={p.hint}
      value={p.value}
      chevron
      indent={p.indent}
      onPress={p.onPress}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
