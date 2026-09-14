/** The critical radii against spin. BUILD_PLAN §4's "ISCO-vs-spin curve (BPT), Teo photon orbits
 * as the accuracy probe", drawn.
 *
 * Decorative for assistive technology: every number in it is also in the readout and the live
 * summary, which are the accessible path (BUILD_PLAN §6).
 */
import { useMemo } from 'react';
import { project, toPath, type Axis, type XY } from '../../../ui/chartGeometry';
import { MAX_SPIN } from '../../../core/kerr';
import { radiiCurve, type RadiiSample } from '../description/radiiCurve';

const WIDTH = 720;
const HEIGHT = 340;
const PAD_LEFT = 54;
const PAD_RIGHT = 168;
const PAD_TOP = 18;
const PAD_BOTTOM = 44;
const SAMPLES = 220;
const MAX_RADIUS = 9.4;
/** Tick values, generated rather than listed so the axis and its labels cannot drift apart.
 *  Y stops at the retrograde ISCO at extremality, which is the tallest thing on the chart. */
const X_TICK_COUNT = 5;
/** Odd radii from 1 M to the retrograde ISCO at extremality, which is the tallest thing here. */
const Y_TICK_VALUES = 5;
const X_TICKS: readonly number[] =
  Array.from({ length: X_TICK_COUNT + 1 }, (_, index) => index / X_TICK_COUNT);
const Y_TICKS: readonly number[] =
  Array.from({ length: Y_TICK_VALUES }, (_, index) => 1 + index * 2);
const TICK_GAP = 8;
const TICK_BASELINE = 4;
const AXIS_LABEL_GAP = 6;
const LEGEND_GAP = 18;
const LEGEND_TOP = 26;
const MARKER_LABEL_DY = -6;
const LEGEND_INSET = 12;
const LEGEND_SWATCH = 18;
const LEGEND_TEXT_X = 24;
const LEGEND_SWATCH_Y = -4;
const PLACES = 2;

interface Series {
  key: keyof Omit<RadiiSample, 'spin'>;
  label: string;
  className: string;
  dashed?: boolean;
}

/** Drawn back to front: the horizons are the floor, the orbits are the subject. */
const SERIES: readonly Series[] = [
  { key: 'innerHorizon', label: 'Inner horizon r_−', className: 'radii-horizon', dashed: true },
  { key: 'outerHorizon', label: 'Outer horizon r_+', className: 'radii-horizon' },
  { key: 'photonPrograde', label: 'Photon, prograde', className: 'radii-photon' },
  { key: 'photonRetrograde', label: 'Photon, retrograde', className: 'radii-photon', dashed: true },
  { key: 'iscoPrograde', label: 'ISCO, prograde', className: 'radii-isco' },
  { key: 'iscoRetrograde', label: 'ISCO, retrograde', className: 'radii-isco', dashed: true },
];

export function RadiiChart({ spin }: { spin: number }) {
  const curve = useMemo(() => radiiCurve(SAMPLES, MAX_SPIN), []);
  const xAxis: Axis = { min: 0, max: 1, from: PAD_LEFT, to: WIDTH - PAD_RIGHT };
  const yAxis: Axis = { min: 0, max: MAX_RADIUS, from: HEIGHT - PAD_BOTTOM, to: PAD_TOP };

  const paths = SERIES.map(series => ({
    ...series,
    d: toPath(
      curve.map((sample): XY => ({ x: sample.spin, y: sample[series.key] })), xAxis, yAxis,
    ),
  }));

  const markerX = project(xAxis, spin);

  return (
    <figure className="radii-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="presentation" aria-hidden="true">
        <line
          x1={PAD_LEFT} y1={HEIGHT - PAD_BOTTOM} x2={WIDTH - PAD_RIGHT} y2={HEIGHT - PAD_BOTTOM}
          className="axis"
        />
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={HEIGHT - PAD_BOTTOM} className="axis" />

        {X_TICKS.map(tick => (
          <g key={`x${tick}`}>
            <line
              x1={project(xAxis, tick)} y1={HEIGHT - PAD_BOTTOM}
              x2={project(xAxis, tick)} y2={HEIGHT - PAD_BOTTOM + TICK_BASELINE} className="axis"
            />
            <text
              x={project(xAxis, tick)} y={HEIGHT - PAD_BOTTOM + TICK_GAP + AXIS_LABEL_GAP * 2}
              textAnchor="middle" className="tick"
            >{tick}</text>
          </g>
        ))}
        {Y_TICKS.map(tick => (
          <g key={`y${tick}`}>
            <line
              x1={PAD_LEFT - TICK_BASELINE} y1={project(yAxis, tick)}
              x2={PAD_LEFT} y2={project(yAxis, tick)} className="axis"
            />
            <text
              x={PAD_LEFT - TICK_GAP} y={project(yAxis, tick) + TICK_BASELINE}
              textAnchor="end" className="tick"
            >{tick}</text>
          </g>
        ))}

        {paths.map(series => (
          <path
            key={`${series.key}`} d={series.d}
            className={series.dashed ? `${series.className} is-dashed` : series.className}
          />
        ))}

        {/* Where the slider currently is, so the curve and the picture above it are the same hole. */}
        <line
          x1={markerX} y1={PAD_TOP} x2={markerX} y2={HEIGHT - PAD_BOTTOM} className="radii-marker"
        />
        <text x={markerX} y={PAD_TOP + MARKER_LABEL_DY} textAnchor="middle" className="tick">
          a/M = {spin.toFixed(PLACES)}
        </text>

        {SERIES.map((series, index) => (
          <g key={`legend-${series.key}`} transform={`translate(${WIDTH - PAD_RIGHT + LEGEND_INSET}, ${LEGEND_TOP + index * LEGEND_GAP})`}>
            <line
              x1={0} y1={LEGEND_SWATCH_Y} x2={LEGEND_SWATCH} y2={LEGEND_SWATCH_Y}
              className={series.dashed ? `${series.className} is-dashed` : series.className}
            />
            <text x={LEGEND_TEXT_X} y={0} className="tick">{series.label}</text>
          </g>
        ))}

        <text
          x={(PAD_LEFT + WIDTH - PAD_RIGHT) / 2} y={HEIGHT - AXIS_LABEL_GAP}
          textAnchor="middle" className="axis-label"
        >Spin a/M</text>
        <text
          transform={`translate(${AXIS_LABEL_GAP * 2}, ${(PAD_TOP + HEIGHT - PAD_BOTTOM) / 2}) rotate(-90)`}
          textAnchor="middle" className="axis-label"
        >Radius / M</text>
      </svg>
      <figcaption>
        Every critical radius against spin. The prograde orbits fall towards M as the spin
        approaches extremal and the retrograde ones climb away from it — the ISCO runs from 6 M at
        a = 0 to 1 M prograde and 9 M retrograde, and the photon orbits from 3 M to M and 4 M.
        They meet only in the limit; the slider stops at 0.998, where the prograde ISCO is still
        1.24 M.
      </figcaption>
    </figure>
  );
}
