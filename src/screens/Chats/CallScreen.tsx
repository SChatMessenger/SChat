import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import { useChatStore } from '../../store';
import { useHardwareBack } from '../../hooks';

const END_RED = '#ef4444';
const SCREEN_BG = '#0b0b0f';

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CallScreen() {
  const insets = useSafeAreaInsets();
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId),
  );
  const callType = useChatStore((s) => s.activeCall);
  const endCall = useChatStore((s) => s.endCall);

  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [videoOn, setVideoOn] = useState(true);
  // Mock lifecycle: "Calling…" for a beat, then a running call timer. Real
  // signalling/WebRTC would drive these transitions instead.
  const [connected, setConnected] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useHardwareBack(
    useCallback(() => {
      endCall();
      return true;
    }, [endCall]),
  );

  useEffect(() => {
    const t = setTimeout(() => setConnected(true), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [connected]);

  if (!conversation || !callType) return null;
  const isVideo = callType !== 'voice';
  const kindLabel =
    callType === 'meet' ? 'Meeting' : callType === 'video' ? 'Video call' : 'Voice call';
  const status = connected ? formatElapsed(elapsed) : `${kindLabel} · Calling…`;

  return (
    <View style={[styles.flex, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: conversation.avatarColor }]}>
          <Text style={styles.avatarInitial}>
            {conversation.name[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.name}>
          {conversation.name}
        </Text>
        <Text style={[styles.status, { fontVariant: connected ? ['tabular-nums'] : undefined }]}>
          {status}
        </Text>
        <View style={styles.encRow}>
          <Iconify icon="lucide:lock" size={11} color="rgba(255,255,255,0.45)" />
          <Text style={styles.enc}>End-to-end encrypted</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <ControlButton
          icon={muted ? 'lucide:mic-off' : 'lucide:mic'}
          label="Mute"
          active={muted}
          onPress={() => setMuted((m) => !m)}
        />
        {isVideo ? (
          <ControlButton
            icon={videoOn ? 'lucide:video' : 'lucide:video-off'}
            label="Camera"
            active={!videoOn}
            onPress={() => setVideoOn((v) => !v)}
          />
        ) : (
          <ControlButton
            icon="lucide:volume-2"
            label="Speaker"
            active={speaker}
            onPress={() => setSpeaker((s) => !s)}
          />
        )}
        {isVideo ? (
          <ControlButton icon="lucide:refresh-cw" label="Flip" onPress={() => undefined} />
        ) : null}
        <ControlButton icon="lucide:phone-off" label="End" danger onPress={endCall} />
      </View>
      <StatusBar style="light" />
    </View>
  );
}

function ControlButton({
  icon,
  label,
  active,
  danger,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const bg = danger ? END_RED : active ? '#ffffff' : 'rgba(255,255,255,0.16)';
  const fg = danger ? '#ffffff' : active ? SCREEN_BG : '#ffffff';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.controlWrap, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.control, { backgroundColor: bg }]}>
        <Iconify icon={icon} size={26} color={fg} />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: SCREEN_BG, alignItems: 'center', justifyContent: 'space-between' },
  header: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#ffffff', fontSize: 52, fontWeight: '600' },
  name: { color: '#ffffff', fontSize: 28, fontWeight: '700', marginTop: 24 },
  status: { color: 'rgba(255,255,255,0.7)', fontSize: 15, marginTop: 8, letterSpacing: 0.3 },
  encRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  enc: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginLeft: 5 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 28 },
  controlWrap: { alignItems: 'center', width: 68 },
  control: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8 },
});
