import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { Iconify } from 'react-native-iconify';
import { useAppStore, useChatStore, useIdentityStore, type VerifyScanResult } from '../../store';
import { encodeContactCode } from '../../services/crypto/contactCode';
import { useTheme } from '../../theme';

const OK_GREEN = '#22c55e';
const DANGER = '#ff453a';

// Show MY public contact code as a QR, and scan THEIRS. Scanning pins the peer's
// real identity key and makes you both verified contacts (SudoProto §11.5, the
// in-person channel). The code carries only public material — never a secret key.
export function QrVerifyModal({
  visible,
  onDismiss,
  peerName,
  onVerified,
}: {
  visible: boolean;
  onDismiss: () => void;
  peerName?: string;
  onVerified?: (conversationId: string | undefined) => void;
}) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const inboxId = useIdentityStore((s) => s.inboxId);
  const identity = useIdentityStore((s) => s.identity);
  const username = useAppStore((s) => s.username);
  const verifyByContactCode = useChatStore((s) => s.verifyByContactCode);

  const [mode, setMode] = useState<'show' | 'scan'>('show');
  const [result, setResult] = useState<VerifyScanResult['status'] | null>(null);

  const myCode =
    inboxId && identity ? encodeContactCode({ inboxId, username, identity }) : '';
  const who = peerName?.trim() || 'this person';

  useEffect(() => {
    if (visible) {
      setMode('show');
      setResult(null);
    }
  }, [visible]);

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (result) return; // already decided — ignore the camera's repeat frames
      const res = verifyByContactCode(data);
      setResult(res.status);
      if (res.status === 'verified') onVerified?.(res.conversationId);
    },
    [result, verifyByContactCode, onVerified],
  );

  const startScan = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setResult(null);
    setMode('scan');
  }, [permission, requestPermission]);

  const resultView = result ? (
    <View style={styles.center}>
      <Iconify
        icon={result === 'verified' ? 'lucide:shield-check' : 'lucide:shield-alert'}
        size={48}
        color={result === 'verified' ? OK_GREEN : DANGER}
      />
      <Text
        style={[
          theme.typography.title,
          {
            color: result === 'verified' ? OK_GREEN : DANGER,
            marginTop: 12,
            textAlign: 'center',
          },
        ]}
      >
        {result === 'verified'
          ? 'Verified contact'
          : result === 'self'
            ? 'That’s your own code'
            : 'Not an SChat code'}
      </Text>
      <Text
        style={[
          theme.typography.body,
          { color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' },
        ]}
      >
        {result === 'verified'
          ? `You’re now verified contacts — their real key is pinned, and they can see your full profile. No one is intercepting this chat.`
          : result === 'self'
            ? 'You scanned your own contact code.'
            : 'That QR isn’t a contact code. Scan the code from their profile’s “My contact code”.'}
      </Text>
      <Pressable
        onPress={result === 'verified' ? onDismiss : () => setResult(null)}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[theme.typography.body, { color: theme.colors.onPrimary, fontWeight: '700' }]}>
          {result === 'verified' ? 'Done' : 'Try again'}
        </Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          onPress={() => undefined}
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
          <View style={styles.headerRow}>
            <Text style={[theme.typography.title, { color: theme.colors.text }]}>
              {mode === 'scan' ? 'Scan contact code' : 'My contact code'}
            </Text>
            <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Close">
              <Iconify icon="lucide:x" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {result ? (
            resultView
          ) : mode === 'scan' ? (
            <View style={styles.center}>
              <View style={styles.cameraWrap}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={onScanned}
                />
              </View>
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textMuted, marginTop: 14, textAlign: 'center' },
                ]}
              >
                Point the camera at {who}’s contact code QR.
              </Text>
              <Pressable
                onPress={() => setMode('show')}
                style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[theme.typography.body, { color: theme.colors.primary }]}>
                  Show my code instead
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.center}>
              {myCode ? (
                <View style={styles.qrCard}>
                  <QRCode value={myCode} size={208} backgroundColor="#ffffff" color="#000000" />
                </View>
              ) : (
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 40 },
                  ]}
                >
                  Sign in to generate your contact code.
                </Text>
              )}
              {username ? (
                <Text style={[theme.typography.body, { color: theme.colors.primary, marginTop: 12 }]}>
                  @{username}
                </Text>
              ) : null}
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' },
                ]}
              >
                Have {who} scan this, then scan theirs — you’ll both become verified
                contacts and unlock each other’s full profile.
              </Text>
              <Pressable
                onPress={startScan}
                disabled={!myCode}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: theme.colors.primary, opacity: !myCode ? 0.4 : pressed ? 0.8 : 1 },
                ]}
              >
                <Iconify icon="lucide:qr-code" size={18} color={theme.colors.onPrimary} />
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.onPrimary, fontWeight: '700', marginLeft: 8 },
                  ]}
                >
                  Scan their code
                </Text>
              </Pressable>
              {permission && !permission.granted && !permission.canAskAgain ? (
                <Text
                  style={[
                    theme.typography.caption,
                    { color: DANGER, marginTop: 10, textAlign: 'center' },
                  ]}
                >
                  Camera access is off — enable it in Settings to scan.
                </Text>
              ) : null}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  center: { alignItems: 'center', paddingTop: 12 },
  qrCard: { padding: 16, borderRadius: 16, backgroundColor: '#ffffff' },
  cameraWrap: {
    width: 240,
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 22,
    alignSelf: 'stretch',
  },
  linkBtn: { paddingVertical: 10, marginTop: 6 },
});
