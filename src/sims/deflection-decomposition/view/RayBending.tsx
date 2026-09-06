/** The bend itself: one ray grazing the Sun, split into the half that is time curvature and the
 * half that is space curvature.
 *
 * Angles are exaggerated by a stated factor. 1.7512" is 8.49e-6 rad; drawn to scale the two rays
 * and the undeflected line would be the same pixel. The factor is on the figure, not in a caption
 * elsewhere, because an unlabelled exaggerated angle is exactly the kind of convincing-but-wrong
 * picture this project exists not to ship.
 */
import { GR_PPN_GAMMA, deflection, radiansToArcseconds } from '../../../core/deflection';
import { deflectionFigures, formatArcseconds } from '../description/describeDeflection';

const WIDTH = 720;
const HEIGHT = 250;
const SUN_X = 470;
const SUN_Y = 210;
const SUN_RADIUS = 96;
/** Where the ray grazes the limb and the bend is drawn from. */
const GRAZE_X = SUN_X;
const GRAZE_Y = SUN_Y - SUN_RADIUS;
const RAY_LENGTH = 232;
/** Light's 1.7512" is drawn at this angle; everything else uses the same factor. */
const REFERENCE_DEGREES = 21;
const MAX_DRAWN_DEGREES = 44;
const DEGREES_IN_HALF_TURN = 180;
/** 1.7512", derived rather than transcribed so it cannot drift from the core. */
const LIGHT_TOTAL_ARCSEC = radiansToArcseconds(deflection(1, { ppnGamma: GR_PPN_GAMMA }).total);
const LIGHT_TOTAL_RADIANS = deflection(1, { ppnGamma: GR_PPN_GAMMA }).total;
/** Dimensionless: how many times larger the drawn angle is than the real one. */
const EXAGGERATION = (REFERENCE_DEGREES / DEGREES_IN_HALF_TURN) * Math.PI / LIGHT_TOTAL_RADIANS;
/** A 23 mm coin subtends 1.7512" at this distance. 0.023 / 8.490e-6 rad. */
const COIN_DISTANCE_KM = 2.709;
const COIN_MILLIMETRES = 23;
/** Layout, px. */
const RAY_START_X = 16;
const GRAZE_DOT_RADIUS = 4;
const LABEL_X = 20;
const LABEL_LIFT = 12;
const STRAIGHT_LABEL_LIFT = 10;
const STRAIGHT_LABEL_INSET = 6;

interface Props {
  logBeta: number;
  ppnGamma: number;
}

export function RayBending({ logBeta, ppnGamma }: Props) {
  const figures = deflectionFigures({ logBeta, ppnGamma });
  const degreesPerArcsecond = REFERENCE_DEGREES / LIGHT_TOTAL_ARCSEC;
  const drawn = (arcsec: number) => Math.min(MAX_DRAWN_DEGREES, arcsec * degreesPerArcsecond);
  const timeDegrees = drawn(figures.timeArcsec);
  const totalDegrees = drawn(figures.totalArcsec);
  const offScale = figures.totalArcsec * degreesPerArcsecond > MAX_DRAWN_DEGREES;

  // The ray arrives travelling +x and is bent towards the Sun, i.e. +y in SVG coordinates.
  const end = (degrees: number) => {
    const radians = (degrees * Math.PI) / DEGREES_IN_HALF_TURN;
    return {
      x: GRAZE_X + RAY_LENGTH * Math.cos(radians),
      y: GRAZE_Y + RAY_LENGTH * Math.sin(radians),
    };
  };
  const straight = end(0);
  const timeOnly = end(timeDegrees);
  const total = end(totalDegrees);

  return (
    <figure className="ray-figure">
      <svg
        className="ray-diagram"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          `A ray from a distant star grazing the Sun's limb. Time curvature alone bends it `
          + `${formatArcseconds(figures.timeArcsec)}; adding space curvature brings the total to `
          + `${formatArcseconds(figures.totalArcsec)}. Angles are exaggerated to be visible.`
        }
      >
        <circle className="ray-sun" cx={SUN_X} cy={SUN_Y} r={SUN_RADIUS} />
        <line className="ray-incoming" x1={RAY_START_X} y1={GRAZE_Y} x2={GRAZE_X} y2={GRAZE_Y} />
        <line
          className="ray-straight"
          x1={GRAZE_X}
          y1={GRAZE_Y}
          x2={straight.x}
          y2={straight.y}
        />
        <line className="ray-time" x1={GRAZE_X} y1={GRAZE_Y} x2={timeOnly.x} y2={timeOnly.y} />
        <line className="ray-total" x1={GRAZE_X} y1={GRAZE_Y} x2={total.x} y2={total.y} />
        <circle className="ray-graze" cx={GRAZE_X} cy={GRAZE_Y} r={GRAZE_DOT_RADIUS} />
        <text className="ray-label" x={LABEL_X} y={GRAZE_Y - LABEL_LIFT}>Starlight</text>
        <text className="ray-label ray-label-straight" x={straight.x - STRAIGHT_LABEL_INSET} y={straight.y - STRAIGHT_LABEL_LIFT} textAnchor="end">
          undeflected
        </text>
      </svg>
      <figcaption>
        Angles exaggerated ×{Math.round(EXAGGERATION).toLocaleString()}
        {offScale
          ? ' — and still clipped: the bend at this speed runs off the figure.'
          : '.'}
        {' '}Drawn true, the three lines would be one pixel wide: {formatArcseconds(LIGHT_TOTAL_ARCSEC)}
        {' '}is {LIGHT_TOTAL_RADIANS.toExponential(3)} radians, the angle a {COIN_MILLIMETRES} mm coin
        {' '}subtends from {COIN_DISTANCE_KM} km. Current total {formatArcseconds(figures.totalArcsec)}
        {' '}({figures.total.toExponential(3)} rad).
      </figcaption>
    </figure>
  );
}
