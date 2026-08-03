/**
 * Compact multi-line sparkline for the Instructor Dashboard.
 *
 * Deliberately does not use a full chart library — a hand-rolled SVG keeps
 * bundle size tiny and gives us fine control over the visual language
 * (matches the app's warm palette).
 *
 * Renders two overlaid polylines (attendance + completions) across the
 * same X axis (week index). Each line has a subtle filled area beneath
 * so peaks read at a glance. A dashed baseline sits at y=0 for grounding.
 *
 * Props:
 *   - weeks: series to render (oldest → newest, left → right)
 *   - showAttendance / showCompletions: toggle each series independently
 *   - width, height: outer dimensions
 */
import React from "react";
import { View, StyleSheet, Text, Platform } from "react-native";
import Svg, { Polyline, Polygon, Line, Circle, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/theme";

export type TrendWeekPoint = {
  week_start: string;
  attendance: number;
  completions: number;
  classes: number;
};

type Props = {
  weeks: TrendWeekPoint[];
  width?: number;
  height?: number;
  showAttendance?: boolean;
  showCompletions?: boolean;
};

const PADDING_X = 22;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 26;

export default function AttendanceTrendChart({
  weeks,
  width = 320,
  height = 160,
  showAttendance = true,
  showCompletions = true,
}: Props) {
  if (!weeks || weeks.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>No trend data yet</Text>
      </View>
    );
  }

  const attendanceSeries = weeks.map((w) => w.attendance || 0);
  const completionsSeries = weeks.map((w) => w.completions || 0);
  const activeSeries: number[][] = [];
  if (showAttendance) activeSeries.push(attendanceSeries);
  if (showCompletions) activeSeries.push(completionsSeries);
  const maxVal = Math.max(1, ...activeSeries.flat());

  const innerW = width - PADDING_X * 2;
  const innerH = height - PADDING_TOP - PADDING_BOTTOM;

  // X positions (evenly spaced across the inner width).
  const stepX = weeks.length > 1 ? innerW / (weeks.length - 1) : innerW;
  const xAt = (i: number) => PADDING_X + i * stepX;
  const yAt = (v: number) =>
    PADDING_TOP + innerH - (v / maxVal) * innerH;

  const buildPoints = (series: number[]) =>
    series.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  const buildArea = (series: number[]) => {
    const line = buildPoints(series);
    // Close down to the baseline (both ends) to make a filled polygon.
    return `${PADDING_X},${PADDING_TOP + innerH} ${line} ${PADDING_X + innerW},${PADDING_TOP + innerH}`;
  };

  // Label just first and last week (short: "Jun 16" style).
  const labelFor = (iso: string): string => {
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
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* Baseline (dashed) */}
        <Line
          x1={PADDING_X}
          y1={PADDING_TOP + innerH}
          x2={PADDING_X + innerW}
          y2={PADDING_TOP + innerH}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        {/* Midline (dashed, subtle) */}
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

        {/* Attendance fill + line */}
        {showAttendance && (
          <>
            <Polygon
              points={buildArea(attendanceSeries)}
              fill={colors.brandSecondary}
              opacity={0.14}
            />
            <Polyline
              points={buildPoints(attendanceSeries)}
              fill="none"
              stroke={colors.brandSecondary}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {attendanceSeries.map((v, i) => (
              <Circle
                key={`att-${i}`}
                cx={xAt(i)}
                cy={yAt(v)}
                r={i === attendanceSeries.length - 1 ? 4 : 2.5}
                fill={colors.brandSecondary}
              />
            ))}
          </>
        )}

        {/* Completions fill + line */}
        {showCompletions && (
          <>
            <Polygon
              points={buildArea(completionsSeries)}
              fill={colors.brandPrimary}
              opacity={0.10}
            />
            <Polyline
              points={buildPoints(completionsSeries)}
              fill="none"
              stroke={colors.brandPrimary}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {completionsSeries.map((v, i) => (
              <Circle
                key={`cmp-${i}`}
                cx={xAt(i)}
                cy={yAt(v)}
                r={i === completionsSeries.length - 1 ? 4 : 2.5}
                fill={colors.brandPrimary}
              />
            ))}
          </>
        )}

        {/* Y-axis max marker (top-right) */}
        <SvgText
          x={PADDING_X}
          y={PADDING_TOP - 2}
          fill={colors.muted}
          fontSize={10}
          fontWeight="600"
        >
          {`max ${maxVal}`}
        </SvgText>

        {/* First / last week labels */}
        <SvgText
          x={PADDING_X}
          y={height - 8}
          fill={colors.muted}
          fontSize={10}
          fontWeight="600"
        >
          {labelFor(weeks[0].week_start)}
        </SvgText>
        <SvgText
          x={PADDING_X + innerW}
          y={height - 8}
          fill={colors.muted}
          fontSize={10}
          fontWeight="600"
          textAnchor="end"
        >
          {labelFor(weeks[weeks.length - 1].week_start)}
        </SvgText>
      </Svg>
    </View>
  );
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
    ...(Platform.OS === "web" ? {} : {}),
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: "italic",
  },
});
