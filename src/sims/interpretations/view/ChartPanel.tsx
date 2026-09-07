/** One coordinate chart's picture of the same infall.
 *
 * Four of these sit side by side. They are deliberately drawn to the same size and with the same
 * marker, so that what differs between them is the geometry of the worldline and nothing else.
 *
 * Decorative for assistive technology: every number is in the readout table and the live summary.
 */
import { useMemo } from 'react';
import {
  DEFAULT_START_RADIUS,
  HORIZON,
  eddingtonFinkelsteinV,
  gullstrandPainleveTime,
  kruskal,
  properTimeToHorizon,
  radiusAtProperTime,
  schwarzschildTime,
} from '../../../core/infall';
import { project, projectClamped, toPath, type Axis } from '../../../ui/chartGeometry';
import type { ChartId } from '../description/describeCharts';

const WIDTH = 300;
const HEIGHT = 260;
const PAD_LEFT = 44;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 34;
const SAMPLES = 220;
/** Schwarzschild t is unbounded; the panel plots up to here and says the rest runs off. */
const MAX_SCHWARZSCHILD_TIME = 26;
/** Kruskal's exterior stretches exponentially; this window holds the horizon crossing. */
const KRUSKAL_WINDOW = 3.2;
const MARKER_RADIUS = 5;
/** Nudge off the horizon so the closed forms stay finite at the last sample. */
const HORIZON_EPSILON = 1e-9;
const KRUSKAL_EPSILON = 1e-12;
const AXIS_LABEL_GAP = 10;
const AXIS_LABEL_INSET = 8;
const AXIS_LABEL_DROP = 12;

interface Props {
  id: ChartId;
  properTime: number;
  startRadius?: number;
}

interface Curve {
  points: { x: number; y: number }[];
  xAxis: Axis;
  yAxis: Axis;
  xLabel: string;
  yLabel: string;
  marker: { x: number; y: number } | null;
  /** Drawn where the horizon sits in this chart's coordinates. */
  horizon: 'vertical' | 'diagonal' | null;
  note: string | null;
}

/**
 * Each chart's worldline, in its own coordinates.
 *
 * The horizontal axis is the areal radius for the three charts that keep it, and X for Kruskal,
 * which does not. That difference is the point of the exhibit, not an inconsistency.
 */
function buildCurve(id: ChartId, properTime: number, startRadius: number): Curve {
  const total = properTimeToHorizon(startRadius);
  const plotBox = {
    from: PAD_LEFT, to: WIDTH - PAD_RIGHT,
  };
  const timeBox = { from: HEIGHT - PAD_BOTTOM, to: PAD_TOP };

  if (id === 'kruskal') {
    // Sampled in proper time and drawn in (X, T). The start of the fall is far outside this
    // window: Kruskal stretches the distant exterior exponentially.
    const samples = Array.from({ length: SAMPLES }, (_, index) => {
      const tau = (total * index) / (SAMPLES - 1);
      const radius = Math.max(radiusAtProperTime(tau, startRadius), HORIZON + KRUSKAL_EPSILON);
      const point = kruskal(radius, startRadius);
      return { x: point.X, y: point.T };
    }).filter(point => Math.abs(point.x) <= KRUSKAL_WINDOW && Math.abs(point.y) <= KRUSKAL_WINDOW);
    const xAxis: Axis = { min: 0, max: KRUSKAL_WINDOW, ...plotBox };
    const yAxis: Axis = { min: -KRUSKAL_WINDOW, max: KRUSKAL_WINDOW, ...timeBox };
    const current = kruskal(
      Math.max(radiusAtProperTime(Math.min(properTime, total), startRadius), HORIZON + KRUSKAL_EPSILON),
      startRadius,
    );
    const inWindow = Math.abs(current.X) <= KRUSKAL_WINDOW && Math.abs(current.T) <= KRUSKAL_WINDOW;
    return {
      points: samples.length > 1 ? samples : [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      xAxis,
      yAxis,
      xLabel: 'X',
      yLabel: 'T',
      marker: inWindow ? { x: current.X, y: current.T } : null,
      horizon: 'diagonal',
      note: 'The fall begins at X ≈ 1.4×10⁶, far outside this window.',
    };
  }

  const coordinate = id === 'schwarzschild'
    ? schwarzschildTime
    : id === 'gullstrandPainleve' ? gullstrandPainleveTime : eddingtonFinkelsteinV;

  const raw = Array.from({ length: SAMPLES }, (_, index) => {
    const tau = (total * index) / (SAMPLES - 1);
    const radius = Math.max(radiusAtProperTime(tau, startRadius), HORIZON + HORIZON_EPSILON);
    return { x: radius, y: coordinate(radius, startRadius) };
  });

  const finite = raw.filter(point => Number.isFinite(point.y));
  const capped = id === 'schwarzschild'
    ? finite.filter(point => point.y <= MAX_SCHWARZSCHILD_TIME)
    : finite;
  const values = capped.map(point => point.y);
  const yAxis: Axis = {
    min: Math.min(...values),
    max: Math.max(...values),
    ...timeBox,
  };
  const xAxis: Axis = { min: HORIZON, max: startRadius, ...plotBox };

  const markerRadius = Math.max(
    radiusAtProperTime(Math.min(properTime, total), startRadius), HORIZON + HORIZON_EPSILON,
  );
  const markerTime = coordinate(markerRadius, startRadius);
  const markerVisible = Number.isFinite(markerTime) && markerTime <= yAxis.max;

  return {
    points: capped,
    xAxis,
    yAxis,
    xLabel: 'r / r_s',
    yLabel: id === 'schwarzschild' ? 't' : id === 'gullstrandPainleve' ? 't_ff' : 'v',
    marker: markerVisible ? { x: markerRadius, y: markerTime } : null,
    horizon: 'vertical',
    note: id === 'schwarzschild'
      ? 'The worldline runs off the top: t → ∞ at the horizon, so it never gets there.'
      : null,
  };
}

export function ChartPanel({ id, properTime, startRadius = DEFAULT_START_RADIUS }: Props) {
  const curve = useMemo(
    () => buildCurve(id, properTime, startRadius), [id, properTime, startRadius],
  );
  const horizonX = curve.horizon === 'vertical' ? project(curve.xAxis, HORIZON) : null;

  return (
    <svg className="chart-panel" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <rect
        className="panel-frame"
        x={PAD_LEFT} y={PAD_TOP}
        width={WIDTH - PAD_LEFT - PAD_RIGHT} height={HEIGHT - PAD_TOP - PAD_BOTTOM}
      />
      {horizonX !== null && (
        <line
          className="panel-horizon"
          x1={horizonX} x2={horizonX} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM}
        />
      )}
      {curve.horizon === 'diagonal' && (
        <>
          <line
            className="panel-horizon"
            x1={project(curve.xAxis, 0)} y1={project(curve.yAxis, 0)}
            x2={project(curve.xAxis, KRUSKAL_WINDOW)} y2={project(curve.yAxis, KRUSKAL_WINDOW)}
          />
          <line
            className="panel-horizon panel-horizon-faint"
            x1={project(curve.xAxis, 0)} y1={project(curve.yAxis, 0)}
            x2={project(curve.xAxis, KRUSKAL_WINDOW)} y2={project(curve.yAxis, -KRUSKAL_WINDOW)}
          />
        </>
      )}
      <path className="panel-worldline" d={toPath(curve.points, curve.xAxis, curve.yAxis)} />
      {curve.marker && (
        <circle
          className="panel-marker"
          cx={projectClamped(curve.xAxis, curve.marker.x)}
          cy={projectClamped(curve.yAxis, curve.marker.y)}
          r={MARKER_RADIUS}
        />
      )}
      <text className="panel-axis" x={WIDTH - PAD_RIGHT} y={HEIGHT - AXIS_LABEL_GAP} textAnchor="end">
        {curve.xLabel}
      </text>
      <text className="panel-axis" x={PAD_LEFT - AXIS_LABEL_INSET} y={PAD_TOP + AXIS_LABEL_DROP} textAnchor="end">
        {curve.yLabel}
      </text>
    </svg>
  );
}
