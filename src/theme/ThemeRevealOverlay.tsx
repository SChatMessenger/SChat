import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Canvas,
  Circle,
  Image as SkImage,
  Mask,
  useImage,
} from '@shopify/react-native-skia';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type Origin = { x: number; y: number };

type Props = {
  /** Bumped once per switch. Drives per-transition resets. 0 when idle. */
  revealId: number;
  /** Snapshot of the screen in the *previous* theme. null when idle. */
  oldUri: string | null;
  /** Snapshot of the screen in the *new* theme. null until captured. */
  newUri: string | null;
  /** Tap point in window coordinates; the reveal is anchored here. */
  origin: Origin;
  /** true = new (light) grows outward; false = old (light) collapses inward to
   *  reveal the new (dark) theme. Sunrise vs. sunset. */
  grow: boolean;
  /** Fires once the old snapshot is painted, so the parent can capture the new frame. */
  onOldShown: () => void;
  /** Fires when the sweep completes and the parent can commit + clear. */
  onComplete: () => void;
};

// Sweep duration (ms). Slower = more deliberate/premium reveal; tune here.
const REVEAL_MS = 1000;

// view-shot returns bare paths on iOS; Skia's loader wants a file:// URL.
function normalize(uri: string): string {
  return uri.startsWith('/') ? `file://${uri}` : uri;
}

/**
 * Telegram-style circular theme reveal.
 *
 * The Skia <Canvas> is **permanently mounted** — never gated behind the active
 * state — so no GPU surface is ever created mid-switch (a freshly created Skia
 * surface paints a white frame first; mounting per-switch is what caused the
 * "white flash then reveal" double on Samsung/Xiaomi). When idle the canvas has
 * no children and is fully transparent, so the live app shows straight through.
 *
 * During a switch two opaque snapshots are composited on the UI thread. A single
 * `progress` value (0 → 1) drives the circle, where progress 0 always means
 * "old theme fully shown" for both directions:
 *   - grow (to light):    bg = old, masked = new, radius 0 → maxR  (new grows out)
 *   - collapse (to dark):  bg = new, masked = old, radius maxR → 0 (old collapses in)
 */
export function ThemeRevealOverlay({
  revealId,
  oldUri,
  newUri,
  origin,
  grow,
  onOldShown,
  onComplete,
}: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const oldImg = useImage(oldUri ? normalize(oldUri) : null);
  const newImg = useImage(newUri ? normalize(newUri) : null);

  const progress = useSharedValue(0);
  const shownRef = useRef(false);
  const startedRef = useRef(false);
  // Sweep finished: switch to drawing the plain new snapshot (see render notes).
  const [done, setDone] = useState(false);

  // Distance from the tap point to the farthest corner — the radius that just
  // covers the whole screen.
  const maxR = useMemo(
    () =>
      Math.hypot(
        Math.max(origin.x, W - origin.x),
        Math.max(origin.y, H - origin.y),
      ),
    [origin, W, H],
  );

  // Arm a fresh transition: start from "old fully shown" and re-open the guards.
  // Runs well before the new snapshot exists, so the first masked frame is correct.
  //
  // Skip on teardown (revealId → 0). `progress` is a shared value driving the
  // circle on the UI thread; resetting it to 0 here races the React teardown
  // across threads — the reset can hit Skia's draw before the JS render removes
  // the dark bg, redrawing radius=0 (mask collapsed) → old snapshot full-screen
  // for a frame (the "reveal → dark → light" on a grow; invisible on a collapse
  // because its end-state is already dark). Leaving progress at its terminal 1
  // means any lingering draw shows the full NEW theme instead.
  useEffect(() => {
    if (revealId === 0) return;
    progress.value = 0;
    shownRef.current = false;
    startedRef.current = false;
    setDone(false);
  }, [revealId, progress]);

  // Old snapshot is painted and opaque — safe for the parent to capture the new frame.
  useEffect(() => {
    if (oldImg && oldUri && !shownRef.current) {
      shownRef.current = true;
      onOldShown();
    }
  }, [oldImg, oldUri, onOldShown]);

  // Both snapshots ready — run the sweep once.
  useEffect(() => {
    if (oldImg && newImg && !startedRef.current) {
      startedRef.current = true;
      progress.value = 0;
      progress.value = withTiming(
        1,
        { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) },
        (finished) => {
          'worklet';
          if (finished) {
            // Swap to the plain new-snapshot frame, then let the parent commit/clear.
            runOnJS(setDone)(true);
            runOnJS(onComplete)();
          }
        },
      );
    }
  }, [oldImg, newImg, progress, onComplete]);

  const radius = useDerivedValue(
    () => (grow ? progress.value : 1 - progress.value) * maxR,
    [grow, maxR],
  );

  // Gate ALL drawing on the live `oldUri` prop, not the loaded images. On
  // teardown the parent nulls oldUri/newUri, but Skia's useImage drops the two
  // images on different frames — keying off the (lagging) loaded image lets the
  // freeze branch repaint the stale old snapshot full-screen for a frame, which
  // is the "reveal → old-theme bg → new-theme" teardown flash. The prop clears
  // instantly, so this stops painting the moment the reveal ends.
  const active = oldUri != null;
  const bothLoaded = !!(oldImg && newImg);
  // Three phases. DONE is the key one: once the sweep finishes we draw ONLY the
  // new snapshot full-screen — no bg, no mask, no `progress`/`radius`. So the
  // final frame and the teardown can't race the shared value or mis-resolve the
  // animated mask into a stale snapshot (the "reveal → flash → settle" double).
  const showFreeze = active && !done && !bothLoaded && !!oldImg;
  const showReveal = active && !done && bothLoaded;
  const showDone = active && done && !!newImg;
  const bg = grow ? oldImg : newImg;
  const fg = grow ? newImg : oldImg;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Freeze: only the old snapshot exists yet. */}
        {showFreeze ? (
          <SkImage image={oldImg} x={0} y={0} width={W} height={H} fit="fill" />
        ) : null}
        {/* Reveal: directional composite driven by the animated circle. */}
        {showReveal ? (
          <SkImage image={bg} x={0} y={0} width={W} height={H} fit="fill" />
        ) : null}
        {showReveal ? (
          <Mask
            mode="alpha"
            mask={<Circle cx={origin.x} cy={origin.y} r={radius} color="white" />}
          >
            <SkImage image={fg} x={0} y={0} width={W} height={H} fit="fill" />
          </Mask>
        ) : null}
        {/* Done: plain new snapshot, no shared value left in play. */}
        {showDone ? (
          <SkImage image={newImg} x={0} y={0} width={W} height={H} fit="fill" />
        ) : null}
      </Canvas>
    </View>
  );
}
