import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Iconify } from 'react-native-iconify';
import { useTabsStore, type TabKey } from '../../src/stores';
import { useTheme, type Theme } from '../../src/theme';

const TABS: TabKey[] = ['chats', 'status', 'communities', 'profile'];

const ICON_SIZE = 22;
const BAR_HEIGHT = 56;
const SIDE_MARGIN = 16;
const INDICATOR_INSET = 6;

function TabIcon({ tabKey, color }: { tabKey: TabKey; color: string }) {
  switch (tabKey) {
    case 'chats':
      return (
        <Iconify
          icon="streamline-sharp:chat-two-bubbles-oval"
          size={ICON_SIZE}
          color={color}
        />
      );
    case 'status':
      return <Iconify icon="streamline-sharp:story-post" size={ICON_SIZE} color={color} />;
    case 'communities':
      return <Iconify icon="lucide:users" size={ICON_SIZE} color={color} />;
    case 'profile':
      return <Iconify icon="lucide:user" size={ICON_SIZE} color={color} />;
  }
}

export function BottomTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const activeTab = useTabsStore((s) => s.activeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);

  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth > 0 ? (barWidth - INDICATOR_INSET * 2) / TABS.length : 0;
  const activeIndex = Math.max(0, TABS.indexOf(activeTab));

  const indicatorX = useRef(new Animated.Value(activeIndex * tabWidth)).current;

  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: activeIndex * tabWidth,
      useNativeDriver: true,
      tension: 180,
      friction: 18,
    }).start();
  }, [activeIndex, tabWidth, indicatorX]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 8 }]}
    >
      <View style={[styles.shadowFrame, shadowFor(theme)]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 60 : 90}
          tint={theme.scheme === 'dark' ? 'dark' : 'light'}
          style={styles.blur}
        >
          <View
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
            style={[
              styles.barInner,
              {
                backgroundColor: tintForScheme(theme),
                borderColor: theme.colors.border,
              },
            ]}
          >
            {tabWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.indicator,
                  {
                    width: tabWidth,
                    backgroundColor:
                      theme.scheme === 'dark'
                        ? 'rgba(255,255,255,0.10)'
                        : 'rgba(0,0,0,0.06)',
                    transform: [{ translateX: indicatorX }],
                  },
                ]}
              />
            ) : null}

            {TABS.map((key) => (
              <TabItem
                key={key}
                tabKey={key}
                active={activeTab === key}
                onPress={() => setActiveTab(key)}
              />
            ))}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

function TabItem({
  tabKey,
  active,
  onPress,
}: {
  tabKey: TabKey;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const iconColor = active ? theme.colors.primary : theme.colors.textMuted;

  const activeAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(activeAnim, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      tension: 220,
      friction: 14,
    }).start();
  }, [active, activeAnim]);

  const scale = Animated.add(
    activeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
    pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -0.08] }),
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(pressAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 240,
          friction: 16,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(pressAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 240,
          friction: 16,
        }).start()
      }
      hitSlop={4}
      style={styles.item}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <TabIcon tabKey={tabKey} color={iconColor} />
      </Animated.View>
    </Pressable>
  );
}

function tintForScheme(theme: Theme) {
  return theme.scheme === 'dark' ? 'rgba(26,26,31,0.55)' : 'rgba(255,255,255,0.55)';
}

function shadowFor(theme: Theme) {
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: theme.scheme === 'dark' ? 0.55 : 0.18,
      shadowRadius: 24,
    },
    android: { elevation: 10 },
    default: {},
  });
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: SIDE_MARGIN,
    right: SIDE_MARGIN,
    alignItems: 'stretch',
  },
  shadowFrame: { borderRadius: BAR_HEIGHT / 2 },
  blur: { borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: INDICATOR_INSET,
  },
  indicator: {
    position: 'absolute',
    top: INDICATOR_INSET,
    bottom: INDICATOR_INSET,
    left: INDICATOR_INSET,
    borderRadius: (BAR_HEIGHT - INDICATOR_INSET * 2) / 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_HEIGHT,
  },
});
