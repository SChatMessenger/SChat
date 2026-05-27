import { useColorScheme } from 'react-native';
import { useAppStore } from '../store/slices/useAppStore';
import { buildTheme, type ColorScheme, type Theme } from './tokens';

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const override = useAppStore((s) => s.themeOverride);
  const scheme: ColorScheme =
    override === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : override;
  return buildTheme(scheme);
}
