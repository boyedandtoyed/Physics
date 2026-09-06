/** The two contributions across fifteen decades of speed, log-log.
 *
 * Decorative for assistive technology: every number in it is also in the live summary and the
 * readout, which are the accessible path (BUILD_PLAN §6).
 */
import { useMemo } from 'react';
import {
  WEAK_LIMIT_LOG_ARCSEC,
  curveBounds,
  deflectionCurve,
  type CurvePoint,
} from '../description/describeDeflection';
import { MAX_LOG_BETA, MIN_LOG_BETA } from '../description/describeDeflection';
import { decadeTicks, project, projectClamped, toPath, type Axis } from './chartGeometry';

const WIDTH = 720;
const HEIGHT = 340;
const PAD_LEFT = 62;
const PAD_RIGHT = 16;
const PAD_TOP = 18;
const PAD_BOTTOM = 44;
const SAMPLES = 160;
const MAX_X_TICKS = 8;
const MAX_Y_TICKS = 6;
const HEADROOM = 0.4;
/** Label insets, px. */
const LABEL_INSET_X = 10;
const LABEL_INSET_Y = 18;
const TICK_GAP = 8;
const TICK_BASELINE = 4;
const AXIS_LABEL_GAP = 6;

interface Props {
  logBeta: number;
  ppnGamma: number;
}

export function DeflectionChart({ logBeta, ppnGamma }: Props) {
  const points = useMemo(() => deflectionCurve(ppnGamma, SAMPLES), [ppnGamma]);
  const bounds = useMemo(() => curveBounds(points), [points]);

  const xAxis: Axis = { min: MIN_LOG_BETA, max: MAX_LOG_BETA, from: PAD_LEFT, to: WIDTH - PAD_RIGHT };
  const yAxis: Axis = {
    min: bounds.min - HEADROOM,
    max: bounds.max + HEADROOM,
    from: HEIGHT - PAD_BOTTOM,
    to: PAD_TOP,
  };

  const series = (pick: (point: CurvePoint) => number) =>
    toPath(points.map(point => ({ x: point.logBeta, y: pick(point) })), xAxis, yAxis);

  const markerX = projectClamped(xAxis, logBeta);
  // Everything above this line is a deflection the linearization cannot describe.
  const bandFloor = project(yAxis, Math.min(yAxis.max, WEAK_LIMIT_LOG_ARCSEC));

  return (
    <svg
      className="deflection-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={
        'Log-log chart of deflection against particle speed. The space-curvature contribution is '
        + 'a horizontal line at 0.8756 arcseconds. The time-curvature contribution is a straight '
        + 'line of slope minus two, crossing it at the speed of light. The figures are given in '
        + 'the readout below.'
      }
    >
      <rect
        className="chart-invalid-band"
        x={PAD_LEFT}
        y={PAD_TOP}
        width={WIDTH - PAD_LEFT - PAD_RIGHT}
        height={Math.max(0, bandFloor - PAD_TOP)}
      />
      <text className="chart-band-label" x={PAD_LEFT + LABEL_INSET_X} y={PAD_TOP + LABEL_INSET_Y}>
        Above 0.01 rad — no longer a deflection
      </text>

      {decadeTicks(yAxis, MAX_Y_TICKS).map(tick => (
        <g key={`y${tick}`}>
          <line
            className="chart-grid"
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={project(yAxis, tick)}
            y2={project(yAxis, tick)}
          />
          <text className="chart-tick" x={PAD_LEFT - TICK_GAP} y={project(yAxis, tick) + TICK_BASELINE} textAnchor="end">
            {tick === 0 ? '1″' : `10${superscript(tick)}″`}
          </text>
        </g>
      ))}

      {decadeTicks(xAxis, MAX_X_TICKS).map(tick => (
        <g key={`x${tick}`}>
          <line
            className="chart-grid"
            x1={project(xAxis, tick)}
            x2={project(xAxis, tick)}
            y1={PAD_TOP}
            y2={HEIGHT - PAD_BOTTOM}
          />
          <text
            className="chart-tick"
            x={project(xAxis, tick)}
            y={HEIGHT - PAD_BOTTOM + LABEL_INSET_Y}
            textAnchor="middle"
          >
            {tick === 0 ? 'c' : `10${superscript(tick)}c`}
          </text>
        </g>
      ))}

      <path className="chart-line chart-total" d={series(point => point.logTotal)} />
      <path className="chart-line chart-time" d={series(point => point.logTime)} />
      <path className="chart-line chart-space" d={series(point => point.logSpace)} />

      <line className="chart-marker" x1={markerX} x2={markerX} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} />

      <text className="chart-axis-label" x={(WIDTH + PAD_LEFT) / 2} y={HEIGHT - AXIS_LABEL_GAP} textAnchor="middle">
        Particle speed
      </text>
    </svg>
  );
}

const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const DECIMAL_BASE = 10;

/** Unicode superscript for an integer exponent, so the tick labels need no nested tspans. */
function superscript(value: number): string {
  const sign = value < 0 ? '⁻' : '';
  return sign + String(Math.abs(value))
    .split('')
    .map(digit => SUPERSCRIPTS[Number.parseInt(digit, DECIMAL_BASE)] ?? '')
    .join('');
}
