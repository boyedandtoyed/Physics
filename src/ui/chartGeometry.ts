/** Pure SVG scaling, shared by every sim that draws a chart.
 *
 * Lives in ui/ rather than in a sim because sims must never import each other
 * (BUILD_PLAN §5); the Interpretations module needs exactly this arithmetic.
 *
 * Separated and tested because an inverted or mis-scaled axis draws a perfectly plausible
 * picture and is silently wrong — the same failure mode the shadow-radius measurement exists to
 * catch in the raymarcher, but with nothing measuring the output.
 */

export interface Axis {
  /** Data value at the low edge of the plotted band. */
  min: number;
  max: number;
  /** Pixel coordinate the minimum maps to. */
  from: number;
  /** Pixel coordinate the maximum maps to. SVG y axis grows downwards, so for a vertical axis
   * this is the SMALLER number. Making that explicit is the point of the type. */
  to: number;
}

/** Map a data value onto its pixel coordinate. Values outside [min, max] extrapolate. */
export function project(axis: Axis, value: number): number {
  const { min, max, from, to } = axis;
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError('Axis bounds must be finite, with the maximum above the minimum.');
  }
  return from + ((value - min) / (max - min)) * (to - from);
}

/** Clamp to the plotted band first — for markers that must not escape the frame. */
export function projectClamped(axis: Axis, value: number): number {
  return project(axis, Math.min(axis.max, Math.max(axis.min, value)));
}

export interface XY {
  x: number;
  y: number;
}

/** An SVG polyline path through the projected points. */
export function toPath(points: readonly XY[], xAxis: Axis, yAxis: Axis): string {
  if (points.length === 0) throw new RangeError('Cannot build a path from no points.');
  return points
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'}${project(xAxis, point.x).toFixed(2)} `
      + `${project(yAxis, point.y).toFixed(2)}`)
    .join(' ');
}

/** Whole-decade tick values inside an axis, for a log-scaled axis's labels. */
export function decadeTicks(axis: Axis, maxTicks: number): number[] {
  // A non-finite bound would make this count upwards forever. That is not hypothetical: an
  // all-zero series gives log10 = -Infinity, and the loop below hung the tab.
  if (!Number.isFinite(axis.min) || !Number.isFinite(axis.max)) {
    throw new RangeError('Cannot place ticks on a non-finite axis.');
  }
  const first = Math.ceil(axis.min);
  const last = Math.floor(axis.max);
  const all: number[] = [];
  for (let value = first; value <= last; value++) all.push(value);
  if (all.length <= maxTicks) return all;
  const stride = Math.ceil(all.length / maxTicks);
  return all.filter((_, index) => index % stride === 0);
}
