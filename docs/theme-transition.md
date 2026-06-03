# Theme Transition — Design

Telegram-style **circular reveal** for switching between Light and Dark mode.
Tapping the sun↔moon icon grows a circle from the icon, revealing the new theme
over the old one. Both sides of the boundary are real frames — old UI outside
the circle, new UI inside — not flat color swatches.

## Concept

A circular reveal creates the illusion that the new theme spreads outward from
the point of interaction, instead of instantly cutting between Light and Dark.
It composes three layers:

```
Old Theme UI   (snapshot, fills outside the circle)
     +
New Theme UI   (live app, shown inside the circle)
     +
Animated Circular Mask   (transparent hole that grows: r 0 → full)
```

```
r = 0       → animation starts (hole closed, only old theme visible)
r = small   → partial reveal
r = medium  → expanding transition
r = large   → almost complete
r = full    → new theme fully visible
```

Why it feels premium:

- **Spatial continuity** — the interface transforms smoothly, no abrupt screen swap.
- **Touch connection** — the reveal originates from the user's exact touch point.
- **Progressive transition** — brightness/contrast change gradually, no harsh flash.
- **Performance illusion** — the growing mask visually hides the theme
  recalculation, redraws, and re-render that happen underneath in one commit.

## Goals

- Smooth, 60fps reveal with **no shake** and **no flash**.
- Reveal originates from the mode **icon**, not an arbitrary tap point.
- Works on Android and iOS in an Expo dev-client build.
- No global theme refactor — keep the single `useAppStore.themeOverride` source.

## Constraints that shaped the design

- The theme is **global** (`themeOverride` in the store), so two themes can't be
  rendered simultaneously from props. We can only show "old vs new" by
  snapshotting one of them.
- No Reanimated / MaskedView installed. `react-native-svg` is available and
  supports **native-driver transform** animation (v15), which is the key to a
  jank-free reveal.

## Architecture

```
App
└─ SafeAreaProvider
   └─ ThemeTransitionProvider .............. owns the reveal; exposes switchTheme()
      ├─ <View ref={rootRef}> .............. snapshot target (whole app)
      │   └─ ThemedRoot → AppNavigator → … → ProfileScreen
      │                                       └─ AnimatedLottie (sun↔moon)  ← tap
      │                                          measured via modeIconRef → origin
      └─ {cover} overlay (mounted only while animating)
          └─ <Svg> Image(old snapshot) masked by a growing <Circle>
```

State flow:

```
useAppStore.themeOverride ──► useTheme() ──► every themed component (the live UI)
        ▲ setThemeOverride(target)
        │
ProfileScreen tap → toggleScheme(e)
   └─ {x,y} = e.nativeEvent.pageX/pageY          (origin = exact touch point)
        └─ switchTheme(target, {x,y})
```

## Reveal sequence (`src/theme/ThemeTransition.tsx`)

1. `switchTheme(target, origin)` — guard against re-entry (`busy`).
2. Compute `maxR` = distance to the farthest screen corner from `origin` (×1.05).
3. `captureRef(rootRef)` → PNG of the **current (old)** theme. *(async)*
4. Theme is still OLD here. Set `scale = 0` and mount the cover: the full old
   snapshot with the mask circle closed (scale 0 ⇒ whole snapshot shown).
5. On the snapshot's `onLoad` → `beginReveal()` (a 400ms timeout is a safety net
   if `onLoad` never fires):
   - `setThemeOverride(target)` — the live UI swaps to NEW, hidden under the
     fully-covering snapshot.
   - `Animated.timing(scale: 0 → 1, useNativeDriver: true)` — the circle
     (`r = maxR`) grows from `origin`; the hole reveals the NEW UI underneath.
6. On complete → `setCover(null)`; overlay unmounts, NEW UI remains.

## Key decisions

| Concern | Mechanism | Why |
|---|---|---|
| No flash of new theme | Swap theme **after** `onLoad`, hole still closed | The file decodes async; swapping early shows new for a frame |
| Both sides real frames | Old = snapshot outside; New = live UI through hole | The Telegram look; avoids flat-color "blank" reveal |
| Smooth (no per-frame JS) | `scale` on **native driver** via rn-svg transform | JS-driven mask radius janks while compositing the snapshot |
| No edge shake | Circle at `r = maxR`, scale `0 → 1` | Up-scaling a 1px circle ~900× jitters the mask edge |
| Snapshot maps 1:1 | `preserveAspectRatio="none"`, size = window | `slice` would scale/offset the image → jump on mount/unmount |
| Origin = touch | `e.nativeEvent.pageX/pageY` from the tap | Reveal emanates from the exact interaction point |
| GPU compositing | `renderToHardwareTextureAndroid` / `shouldRasterizeIOS` on cover | Smoother masked-image compositing |

## The sun↔moon icon

- icons8 Lottie clip (`assets/sun-moon.json`), `progress`-driven (not autoplay).
- Frame mapping: **0 = sun, 0.5 = moon, 1 = sun** (the clip loops back).
- Light rests on `0`, Dark on `0.5`. Each toggle plays the segment through and
  stops: → Dark animates `0 → 0.5`, → Light animates `0.5 → 0`.

## Native dependencies

- `react-native-view-shot` — snapshot of the old screen (`captureRef`).
- `react-native-svg` — mask + native-driver circle scale.
- `lottie-react-native` — the animated mode icon.

All three are native modules: changing them requires a **dev-client rebuild**
(`npx expo run:android` / `run:ios`), not just a JS reload.

## Fallback / future options

- If `react-native-svg`'s native transform still jitters on some device, switch
  the reveal to `@react-native-masked-view/masked-view` with a native-driver
  scaled circular mask (no SVG) — same snapshot strategy, different clipper.
- A prop-driven theme (instead of global store) would allow rendering both
  themes at once and dropping the snapshot entirely, but is a larger refactor.
