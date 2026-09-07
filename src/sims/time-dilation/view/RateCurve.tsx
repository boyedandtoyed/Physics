/** dτ/dt against radius for a static Schwarzschild clock.
 *
 * The horizontal axis is log(r/r_s − 1), which is where the curve actually has shape: on a linear
 * axis in r the whole plot is a flat line at 1 with a cliff you cannot see.
 *
 * Decorative for assistive technology: every number is in the readout and the live summary.
 */
import { useMemo } from 'react';
import { decadeTicks, project, projectClamped, toPath, type Axis } from '../../../ui/chartGeometry';
import {
  MAX_LOG_HEIGHT,
  MIN_LOG_HEIGHT,
  clockFigures,
  rateCurve,
} from '../description/describeClocks';

const WIDTH = 660;
const HEIGHT = 280;
const PAD_LEFT = 56;
const PAD_RIGHT = 18;
const PAD_TOP = 16;
const PAD_BOTTOM = 44;
const SAMPLES = 240;
const MAX_X_TICKS = 7;
const MARKER_RADIUS = 5;
const TICK_GAP = 8;
const TICK_BASELINE = 4;
const LABEL_DROP = 18;
const AXIS_LABEL_GAP = 6;
const RATE_TICK_COUNT = 4;
/** Quarters of the rate axis, which runs 0 to 1 by construction. */
const RATE_TICKS = Array.from(
  { length: RATE_TICK_COUNT + 1 }, (_, index) => index / RATE_TICK_COUNT,
);

interface Props {
  logHeight: number;
}

export function RateCurve({ logHeight }: Props) {
  const points = useMemo(() => rateCurve(SAMPLES), []);
  const xAxis: Axis = {
    min: MIN_LOG_HEIGHT, max: MAX_LOG_HEIGHT, from: PAD_LEFT, to: WIDTH - PAD_RIGHT,
  };
  const yAxis: Axis = { min: 0, max: 1, from: HEIGHT - PAD_BOTTOM, to: PAD_TOP };

  const path = toPath(
    points.map(point => ({ x: point.logHeight, y: point.rate })), xAxis, yAxis,
  );
  const current = clockFigures(logHeight);

  return (
    <svg
      className="rate-curve"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={
        'Clock rate against distance from the horizon. The rate falls to zero at the horizon as a '
        + 'limit and approaches one far away. The figures are in the readout below.'
      }
    >
      {RATE_TICKS.map(tick => (
        <g key={tick}>
          <line
            className="curve-grid"
            x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT}
            y1={project(yAxis, tick)} y2={project(yAxis, tick)}
          />
          <text
            className="curve-tick"
            x={PAD_LEFT - TICK_GAP}
            y={project(yAxis, tick) + TICK_BASELINE}
            textAnchor="end"
          >
            {tick.toFixed(2)}
          </text>
        </g>
      ))}

      {decadeTicks(xAxis, MAX_X_TICKS).map(tick => (
        <g key={`x${tick}`}>
          <line
            className="curve-grid"
            x1={project(xAxis, tick)} x2={project(xAxis, tick)}
            y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM}
          />
          <text
            className="curve-tick"
            x={project(xAxis, tick)}
            y={HEIGHT - PAD_BOTTOM + LABEL_DROP}
            textAnchor="middle"
          >
            {formatDecade(tick)}
          </text>
        </g>
      ))}

      {/* The horizon is the left edge and is never reached: no static clock exists there. */}
      <line
        className="curve-horizon"
        x1={PAD_LEFT} x2={PAD_LEFT} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM}
      />
      <path className="curve-line" d={path} />
      <circle
        className="curve-marker"
        cx={projectClamped(xAxis, logHeight)}
        cy={projectClamped(yAxis, current.rate)}
        r={MARKER_RADIUS}
      />
      <text
        className="curve-axis-label"
        x={(WIDTH + PAD_LEFT) / 2}
        y={HEIGHT - AXIS_LABEL_GAP}
        textAnchor="middle"
      >
        Height above the horizon, r − r_s
      </text>
    </svg>
  );
}

const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const DECIMAL_BASE = 10;

/** "10⁻⁶ r_s" and so on, without nested tspans. */
function formatDecade(exponent: number): string {
  if (exponent === 0) return 'r_s';
  const sign = exponent < 0 ? '⁻' : '';
  const digits = String(Math.abs(exponent))
    .split('')
    .map(digit => SUPERSCRIPTS[Number.parseInt(digit, DECIMAL_BASE)] ?? '')
    .join('');
  return `10${sign}${digits}`;
}
