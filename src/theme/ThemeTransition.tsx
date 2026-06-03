import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Appearance, Dimensions, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useAppStore, type ThemeOverride } from '../store/slices/useAppStore';
import { ThemeRevealOverlay, type Origin } from './ThemeRevealOverlay';

type Ctx = {
  switchTheme: (target: ThemeOverride, origin?: Origin) => void;
};

const ThemeTransitionContext = createContext<Ctx | null>(null);

type Scheme = 'light' | 'dark';

type Reveal = {
  id: number;
  target: ThemeOverride;
  origin: Origin;
  grow: boolean;
  oldUri: string;
  newUri: string | null;
};

const CAPTURE = { format: 'png', quality: 1, result: 'tmpfile' } as const;
// Stable fallback while idle — the overlay ignores origin when there's no reveal.
const IDLE_ORIGIN: Origin = { x: 0, y: 0 };

function centerOrigin(): Origin {
  const { width, height } = Dimensions.get('window');
  return { x: width / 2, y: height / 2 };
}

// Run cb after two animation frames — enough for a freshly committed React tree
// (and the Skia canvas under it) to actually paint before we act on it.
function afterPaint(cb: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

// Mirror of useTheme's resolution: what scheme is actually on screen for an override.
function resolveScheme(override: ThemeOverride): Scheme {
  if (override === 'system') {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  }
  return override;
}

export function ThemeTransitionProvider({ children }: { children: React.ReactNode }) {
  const setThemeOverride = useAppStore((s) => s.setThemeOverride);
  const rootRef = useRef<View>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const revealRef = useRef<Reveal | null>(null);
  const busyRef = useRef(false);
  const idRef = useRef(0);
  revealRef.current = reveal;

  // End the transition: commit the chosen theme for real, then hold 2 frames so
  // the new live UI paints beneath the full-new overlay before we remove it —
  // otherwise a stale-theme frame flashes as the overlay clears.
  const finish = useCallback(() => {
    const r = revealRef.current;
    if (r) setThemeOverride(r.target);
    // Let the committed new theme paint under the full-new overlay before
    // clearing, so the handoff to the live UI shows no stale-theme frame.
    afterPaint(() => {
      busyRef.current = false;
      setReveal(null);
    });
  }, [setThemeOverride]);

  // Animated path: snapshot the current theme, freeze it on top, then let the
  // overlay tell us when to flip the live theme and capture the new frame.
  const switchTheme = useCallback(
    (target: ThemeOverride, origin?: Origin) => {
      const current = useAppStore.getState().themeOverride;
      if (target === current) return;

      // Nothing visible changes (e.g. system→light while already light): just
      // set the override, no reveal.
      const fromScheme = resolveScheme(current);
      const toScheme = resolveScheme(target);
      if (fromScheme === toScheme) {
        setThemeOverride(target);
        return;
      }

      const node = rootRef.current;
      // No view to capture, or a transition is already running: just swap.
      if (busyRef.current || !node) {
        setThemeOverride(target);
        return;
      }

      busyRef.current = true;
      const o = origin ?? centerOrigin();
      const grow = toScheme === 'light'; // light grows out, dark collapses in
      const id = ++idRef.current;
      captureRef(node, CAPTURE)
        .then((oldUri) =>
          setReveal({ id, target, origin: o, grow, oldUri, newUri: null }),
        )
        .catch(() => {
          busyRef.current = false;
          setThemeOverride(target);
        });
    },
    [setThemeOverride],
  );

  // The old freeze snapshot is now covering the screen. Hold until it is solidly
  // painted, THEN flip the live theme beneath it (flipping before Skia paints
  // lets the new theme flash through full-screen, then the reveal shows it
  // again). Hold once more so the new theme paints, capture it, and leave the
  // live theme committed to the target for the whole reveal — the opaque overlay
  // covers it, and because the live UI is already the new theme, clearing the
  // overlay at the end is race-free. (Reverting to the old theme here caused a
  // stale-theme frame to flash when the overlay cleared at the end of a grow.)
  const handleOldShown = useCallback(() => {
    const r = revealRef.current;
    if (!r) return;
    afterPaint(() => {
      setThemeOverride(r.target);
      afterPaint(() => {
        const node = rootRef.current;
        if (!node) return finish();
        captureRef(node, CAPTURE)
          .then((newUri) => setReveal((cur) => (cur ? { ...cur, newUri } : cur)))
          .catch(finish);
      });
    });
  }, [finish, setThemeOverride]);

  return (
    <ThemeTransitionContext.Provider value={{ switchTheme }}>
      <View style={styles.flex}>
        <View ref={rootRef} collapsable={false} style={styles.flex}>
          {children}
        </View>
        {/* Always mounted: the Skia canvas must never be created/destroyed per
            switch, or its GPU surface paints a white frame on creation. */}
        <ThemeRevealOverlay
          revealId={reveal?.id ?? 0}
          oldUri={reveal?.oldUri ?? null}
          newUri={reveal?.newUri ?? null}
          origin={reveal?.origin ?? IDLE_ORIGIN}
          grow={reveal?.grow ?? true}
          onOldShown={handleOldShown}
          onComplete={finish}
        />
      </View>
    </ThemeTransitionContext.Provider>
  );
}

export function useThemeSwitch() {
  const ctx = useContext(ThemeTransitionContext);
  if (!ctx) throw new Error('useThemeSwitch must be used within ThemeTransitionProvider');
  return ctx.switchTheme;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
