/**
 * PracticeHistoryChart
 * --------------------
 * Compact 30-day (or N-day) daily practice sparkline for the Profile
 * Achievements section. Renders as a bar chart because daily-count data
 * is naturally discrete and reads better as bars than a jagged polyline.
 *
 * Design language matches AttendanceTrendChart: hand-rolled SVG in the
 * warm brand palette, no chart library, tiny bundle impact.
 *
 * Props:
 *   - days: PracticeHistoryDay[] (oldest → newest; expected to be N days
 *     contiguous with zero-fill from the backend)
 *   - width, height: outer dimensions
 *   - highlightBestDay: outline the peak bar in accent color
 */
import React, { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/theme";
import type { PracticeHistoryDay } from "@/src/api/client";

type Props = {
  days: PracticeHistoryDay[];
  width?: number;
  height?: number;
  highlightBestDay?: boolean;
};

const PADDING_X = 16;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 22;

export function PracticeHistoryChart({
  days,
  width = 320,
  height = 96,
  highlightBestDay = true,
}: Props) {
  const { bars, maxVal, bestIdx, firstLabel, lastLabel } = useMemo(() => {
    if (!days.length) {
      return {
        bars: [] as PracticeHistoryDay[],
        maxVal: 0,
        bestIdx: -1,
        firstLabel: "",
        lastLabel: "",
      };
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    let best = -1;
    let bestVal = -1;
    for (let i = 0; i < days.length; i++) {
      if (days[i].count > bestVal) {
        bestVal = days[i].count;
        best = i;
      }
    }
    // Only highlight if it's actually a peak (>0)
    if (bestVal <= 0) best = -1;
    return {
      bars: days,
      maxVal: max,
      bestIdx: best,
      firstLabel: fmtDay(days[0].date),
      lastLabel: fmtDay(days[days.length - 1].date),
    };
  }, [days]);

  if (!bars.length) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>No practice yet</Text>
      </View>
    );
  }

  const innerW = width - PADDING_X * 2;
  const innerH = height - PADDING_TOP - PADDING_BOTTOM;
  // Each bar gets an equal-width column with a small gap.
  const columnW = innerW / bars.length;
  const barW = Math.max(2, columnW * 0.7);
  const barGap = columnW - barW;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* Baseline */}
        <Line
          x1={PADDING_X}
          y1={PADDING_TOP + innerH}
          x2={PADDING_X + innerW}
          y2={PADDING_TOP + innerH}
          stroke={colors.border}
          strokeWidth={1}
        />
        {/* Midline (dashed) */}
        <Line
          x1={PADDING_X}
          y1={PADDING_TOP + innerH / 2}
          x2={PADDING_X + innerW}
          y2={PADDING_TOP + innerH / 2}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="2,4"
          opacity={0.5}
        />

        {/* Bars */}
        {bars.map((d, i) => {
          const h = (d.count / maxVal) * innerH;
          const x = PADDING_X + i * columnW + barGap / 2;
          const y = PADDING_TOP + innerH - h;
          const isBest = highlightBestDay && i === bestIdx;
          const isEmpty = d.count === 0;
          const fill = isBest
            ? colors.brandTertiary
            : isEmpty
              ? colors.border
              : colors.brandPrimary;
          // Give zero-bars a tiny 2px stub so the chart doesn't look sparse.
          const drawH = isEmpty ? 2 : Math.max(2, h);
          const drawY = isEmpty ? PADDING_TOP + innerH - 2 : y;
          return (
            <Rect
              key={d.date}
              x={x}
              y={drawY}
              width={barW}
              height={drawH}
              rx={2}
              fill={fill}
              opacity={isEmpty ? 0.55 : 1}
            />
          );
        })}

        {/* Y-axis max marker */}
        <SvgText
          x={PADDING_X}
          y={PADDING_TOP - 2}
          fill={colors.muted}
          fontSize={9}
          fontWeight="600"
        >
          {`peak ${maxVal}`}
        </SvgText>

        {/* First / last day labels */}
        <SvgText
          x={PADDING_X}
          y={height - 6}
          fill={colors.muted}
          fontSize={10}
          fontWeight="600"
        >
          {firstLabel}
        </SvgText>
        <SvgText
          x={PADDING_X + innerW}
          y={height - 6}
          fill={colors.muted}
          fontSize={10}
          fontWeight="600"
          textAnchor="end"
        >
          {lastLabel}
        </SvgText>
      </Svg>
    </View>
  );
}

function fmtDay(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso.slice(5);
  }
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 10,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: "italic",
  },
});

export default PracticeHistoryChart;
