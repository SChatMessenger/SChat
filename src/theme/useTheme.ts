import { useColorScheme } from 'react-native';
import { useAppStore } from '../store/slices/useAppStore';
import { buildTheme, type ColorScheme, type Theme } from './tokens';

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const override = useAppStore((s) => s.themeOverride);
  // Total resolution: an explicit light/dark wins; 'system' — and any
  // unexpected/undefined stored value — follows the device. Never yields an
  // out-of-palette scheme, which would make theme.colors undefined and crash
  // every consumer (theme.colors.background, etc.).
  const scheme: ColorScheme =
    override === 'dark'
      ? 'dark'
      : override === 'light'
        ? 'light'
        : systemScheme === 'dark'
          ? 'dark'
          : 'light';
  return buildTheme(scheme);
}
