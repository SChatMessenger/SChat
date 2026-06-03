import { Dimensions, PixelRatio } from 'react-native';

const BASE_WIDTH = 375;
const SCREEN_WIDTH = Dimensions.get('window').width;
const RAW_SCALE = SCREEN_WIDTH / BASE_WIDTH;
export const SCALE = Math.min(Math.max(RAW_SCALE, 0.9), 1.25);

function s(n: number): number {
  return PixelRatio.roundToNearestPixel(n * SCALE);
}

export const spacing = {
  xs: s(4),
  sm: s(8),
  md: s(16),
  lg: s(24),
  xl: s(32),
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  body: { fontSize: s(16), lineHeight: s(24) },
  title: { fontSize: s(22), lineHeight: s(28), fontWeight: '600' as const },
  heading: { fontSize: s(28), lineHeight: s(34), fontWeight: '700' as const },
  caption: { fontSize: s(13), lineHeight: s(18) },
} as const;

export const touch = {
  min: 44,
  hitSlop: 10,
} as const;

export type ColorScheme = 'light' | 'dark';

export type Colors = {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  border: string;
  /** Translucent tint laid over a BlurView for liquid-glass surfaces. */
  glassTint: string;
  /** Light "glass edge" highlight border for liquid-glass surfaces. */
  glassEdge: string;
};

const lightColors: Colors = {
  background: '#ffffff',
  surface: '#f5f5f7',
  text: '#111111',
  textMuted: '#5a5a5f',
  primary: '#2563eb',
  onPrimary: '#ffffff',
  border: '#e5e5ea',
  // Thin, blur-forward tint so the frosted content reads through (liquid glass).
  glassTint: 'rgba(255,255,255,0.28)',
  glassEdge: 'rgba(255,255,255,0.7)',
};

const darkColors: Colors = {
  background: '#010101',
  surface: '#212121',
  text: '#f5f5f7',
  textMuted: '#a0a0a8',
  primary: '#60a5fa',
  onPrimary: '#0b0b0d',
  border: '#2a2a30',
  glassTint: 'rgba(20,20,26,0.28)',
  glassEdge: 'rgba(255,255,255,0.18)',
};

export const palette: Record<ColorScheme, Colors> = {
  light: lightColors,
  dark: darkColors,
};

export type Theme = {
  scheme: ColorScheme;
  colors: Colors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  touch: typeof touch;
};

export function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palette[scheme],
    spacing,
    radii,
    typography,
    touch,
  };
}
