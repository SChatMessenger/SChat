import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useTheme } from '../theme';

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

function parseHex(hex: string) {
  let h = hex.replace('#', '');

  // Expand shorthand (#abc -> #aabbcc)
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  const n = parseInt(h, 16);

  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function lighten(hex: string, amt: number) {
  const { r, g, b } = parseHex(hex);

  const mix = (c: number) =>
    Math.round(c + (255 - c) * amt);

  return `#${(
    (1 << 24) +
    (mix(r) << 16) +
    (mix(g) << 8) +
    mix(b)
  )
    .toString(16)
    .slice(1)}`;
}

export function DonutChart({
  segments,
  size = 224,
  strokeWidth = 20,
  gapDeg = 1.8,
  centerTop,
  centerBottom,
  activeKey,
  onSelect,
  minLabelFraction = 0.06,
}: {
  segments: DonutSegment[];

  size?: number;

  strokeWidth?: number;

  gapDeg?: number;

  centerTop: string;

  centerBottom?: string;

  activeKey?: string | null;

  onSelect?: (key: string | null) => void;

  minLabelFraction?: number;
}) {
  const theme = useTheme();

  const cx = size / 2;
  const cy = size / 2;

  const r =
    (size - strokeWidth) / 2 - 2;

  const C = 2 * Math.PI * r;

  const arcs = useMemo(() => {
    const total =
      segments.reduce(
        (a, s) => a + s.value,
        0
      ) || 1;

    let accDeg = 0;

    return segments.map((s) => {
      const frac = s.value / total;

      const startDeg = accDeg;

      accDeg += frac * 360;

      return {
        ...s,
        frac,
        startDeg,
        sweep: frac * 360,
      };
    });
  }, [segments]);

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          {arcs.map((a) => (
            <LinearGradient
              key={a.key}
              id={`g-${a.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop
                offset="0"
                stopColor={lighten(
                  a.color,
                  0.18
                )}
              />

              <Stop
                offset="1"
                stopColor={a.color}
              />
            </LinearGradient>
          ))}
        </Defs>

        {/* Background Track */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={theme.colors.border}
          strokeOpacity={0.05}
          strokeWidth={strokeWidth}
        />

        {/* Segments */}
        {arcs.map((a) => {
          const slot = a.frac * C;

          const gapPx =
            (gapDeg / 360) * C;

          const drawn = Math.max(
            slot - gapPx,
            0
          );

          const rotation =
            -90 +
            a.startDeg +
            gapDeg / 2;

          const isActive =
            activeKey === a.key;

          const dim =
            activeKey != null &&
            !isActive;

          return (
            <G
              key={a.key}
              rotation={rotation}
              origin={`${cx}, ${cy}`}
            >
              <Circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={`url(#g-${a.key})`}
                strokeWidth={
                  isActive
                    ? strokeWidth + 3
                    : strokeWidth
                }
                strokeOpacity={
                  dim ? 0.35 : 1
                }
                strokeDasharray={`${drawn} ${C}`}
                strokeLinecap="butt"
                accessible={!!onSelect}
                accessibilityLabel={
                  onSelect
                    ? `${a.label}, ${Math.round(
                        a.frac * 100
                      )} percent${
                        isActive
                          ? ', selected'
                          : ''
                      }`
                    : undefined
                }
                onPress={
                  onSelect
                    ? () =>
                        onSelect(
                          isActive
                            ? null
                            : a.key
                        )
                    : undefined
                }
              />
            </G>
          );
        })}

        {/* Labels */}
        {arcs.map((a) => {
          if (
            a.frac <
            minLabelFraction
          )
            return null;

          const mid =
            ((-90 +
              a.startDeg +
              a.sweep / 2) *
              Math.PI) /
            180;

          const labelRadius =
            r - strokeWidth * 0.18;

          const x =
            cx +
            labelRadius *
              Math.cos(mid);

          const y =
            cy +
            labelRadius *
              Math.sin(mid);

          const fs = Math.max(
            10,
            Math.min(
              14,
              Math.round(
                9 +
                  a.frac * 14
              )
            )
          );

          const label = `${Math.round(
            a.frac * 100
          )}%`;

          return (
            <G key={a.key}>
              {/* Halo */}
              <SvgText
                x={x}
                y={y + fs / 2 + 0.8}
                fill="#000"
                fillOpacity={0.18}
                fontSize={fs}
                fontWeight="800"
                textAnchor="middle"
              >
                {label}
              </SvgText>

              {/* Main */}
              <SvgText
                x={x}
                y={y + fs / 2}
                fill="#fff"
                fontSize={fs}
                fontWeight="800"
                textAnchor="middle"
              >
                {label}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Center Content */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        pointerEvents="none"
      >
        <Text
          maxFontSizeMultiplier={1.2}
          style={{
            fontSize: 34,
            fontWeight: '900',
            color: theme.colors.primary,
            letterSpacing: -0.6,
          }}
        >
          {centerTop}
        </Text>

        {centerBottom ? (
          <Text
            maxFontSizeMultiplier={1.2}
            style={{
              fontSize: 12,
              fontWeight: '700',
              color:
                theme.colors.textMuted,
              marginTop: 2,
              textTransform:
                'uppercase',
              letterSpacing: 2,
            }}
          >
            {centerBottom}
          </Text>
        ) : null}
      </View>
    </View>
  );
}