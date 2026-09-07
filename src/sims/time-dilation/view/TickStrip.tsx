/** Two clocks, the same stretch of far-away time, different numbers of ticks.
 *
 * The rate curve says 0.707; this says "seven ticks down here for every ten up there", which is
 * the same fact in the form people actually reason with. Static by construction — no animation,
 * so nothing here depends on motion the reader may have switched off.
 */
import { clockFigures, formatRadius, formatRadiusSpoken } from '../description/describeClocks';

const WIDTH = 660;
const HEIGHT = 118;
const PAD_X = 12;
const ROW_ONE = 34;
const ROW_TWO = 88;
const TICK_HEIGHT = 15;
const LABEL_LIFT = 13;
/** Ticks drawn for the far clock. The deep clock gets this many times its rate. */
const FAR_TICKS = 40;
const MIN_DEEP_TICKS = 1;
const HALF_CELL = 0.5;

interface Props {
  logHeight: number;
}

export function TickStrip({ logHeight }: Props) {
  const figures = clockFigures(logHeight);
  const span = WIDTH - 2 * PAD_X;
  // How many of the deep clock's ticks fit in the same coordinate interval. Rounded for drawing,
  // and floored at one so the strip never renders as an empty row — the number itself is in the
  // readout, so rounding here costs nothing and a blank strip would read as a bug.
  const deepTicks = Math.max(MIN_DEEP_TICKS, Math.round(FAR_TICKS * figures.rate));

  // Exactly `count` marks, one centred in each of `count` equal cells. Drawing count + 1
  // fenceposts would put 41 marks under a label reading "40 ticks", and would divide by zero at
  // count = 1.
  const row = (count: number, y: number) =>
    Array.from({ length: count }, (_, index) => {
      const x = PAD_X + (span * (index + HALF_CELL)) / count;
      return <line key={index} x1={x} x2={x} y1={y} y2={y + TICK_HEIGHT} />;
    });

  return (
    <figure className="tick-figure">
      <svg
        className="tick-strip"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          `Over the same stretch of far-away time, the distant clock ticks ${FAR_TICKS} times and `
          + `the clock at ${formatRadiusSpoken(figures.radius)} ticks ${deepTicks} times.`
        }
      >
        <text className="tick-label" x={PAD_X} y={ROW_ONE - LABEL_LIFT}>
          Far away — {FAR_TICKS} ticks
        </text>
        <g className="tick-marks tick-far">{row(FAR_TICKS, ROW_ONE)}</g>

        <text className="tick-label" x={PAD_X} y={ROW_TWO - LABEL_LIFT}>
          At {formatRadius(figures.radius)} — {deepTicks} tick{deepTicks === 1 ? '' : 's'}
        </text>
        <g className="tick-marks tick-deep">{row(deepTicks, ROW_TWO)}</g>
      </svg>
      <figcaption>
        The same stretch of coordinate time, counted by two static clocks. Neither clock is
        broken and neither is running slow in its own frame — each measures one second per second.
        The comparison is what differs. Tick counts are rounded for drawing; the exact rate is in
        the readout.
      </figcaption>
    </figure>
  );
}
