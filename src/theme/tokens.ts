export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  body: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  heading: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const },
  caption: { fontSize: 13, lineHeight: 18 },
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
};

const lightColors: Colors = {
  background: '#ffffff',
  surface: '#f5f5f7',
  text: '#111111',
  textMuted: '#5a5a5f',
  primary: '#2563eb',
  onPrimary: '#ffffff',
  border: '#e5e5ea',
};

const darkColors: Colors = {
  background: '#0b0b0d',
  surface: '#1a1a1f',
  text: '#f5f5f7',
  textMuted: '#a0a0a8',
  primary: '#60a5fa',
  onPrimary: '#0b0b0d',
  border: '#2a2a30',
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
};

export function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palette[scheme],
    spacing,
    radii,
    typography,
  };
}
