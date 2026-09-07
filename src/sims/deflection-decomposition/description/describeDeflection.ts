/** Figures and the screen-reader summary for the deflection decomposition, PHYSICS_SPEC §7.4.
 *
 * Pure and unit-tested. The chart is an SVG the browser will happily draw wrong without ever
 * failing, so every number in it — and every number spoken — is computed here and asserted,
 * rather than being formatted inline in the view where nothing checks it.
 */
import {
  DEFLECTION_PRESETS,
  EINSTEIN_1911_PPN_GAMMA,
  GR_PPN_GAMMA,
  WEAK_DEFLECTION_LIMIT_RADIANS,
  deflection,
  radiansToArcseconds,
  weakDeflectionBetaThreshold,
  type DeflectionTerms,
} from '../../../core/deflection';
import { ARCSECONDS_PER_TURN, C, METRES_PER_KILOMETRE } from '../../../core/units';

const DECIMAL_BASE = 10;
/** The apple, at log10(10/c) = -7.48. The slider's slow end; §7.4's own table starts here. */
export const MIN_LOG_BETA = Math.log10(DEFLECTION_PRESETS[0].speed / C);
export const MAX_LOG_BETA = 0;

export interface DeflectionState {
  /** log10(v/c). The quantity the slider actually moves: v spans fifteen decades. */
  logBeta: number;
  /** PPN space-curvature coefficient. 1 = general relativity, 0 = Einstein 1911. */
  ppnGamma: number;
}

export const betaFromLog = (logBeta: number): number =>
  Math.min(1, DECIMAL_BASE ** logBeta);

/**
 * The slider moves in integer steps, not in log-beta directly.
 *
 * React Aria snaps to a grid anchored at the minimum, and with a float step the top of the range
 * is not reachable: the exhibit opened at beta = 0.9844 instead of at light, which is the single
 * value it exists to show. Integers are exact, and both endpoints are pinned explicitly rather
 * than left to float division.
 */
export const SLIDER_STEPS = 750;

export function logBetaFromIndex(index: number): number {
  if (index <= 0) return MIN_LOG_BETA;
  if (index >= SLIDER_STEPS) return MAX_LOG_BETA;
  return MIN_LOG_BETA + ((MAX_LOG_BETA - MIN_LOG_BETA) * index) / SLIDER_STEPS;
}

export function indexFromLogBeta(logBeta: number): number {
  const fraction = (logBeta - MIN_LOG_BETA) / (MAX_LOG_BETA - MIN_LOG_BETA);
  return Math.min(SLIDER_STEPS, Math.max(0, Math.round(fraction * SLIDER_STEPS)));
}

/** Speed in m/s for a given log10(beta). */
export const speedFromLog = (logBeta: number): number => betaFromLog(logBeta) * C;

export interface DeflectionFigures extends DeflectionTerms {
  beta: number;
  speed: number;
  /** Arcseconds — what the reader compares against 0.8756" and 1.7512". */
  timeArcsec: number;
  spaceArcsec: number;
  totalArcsec: number;
  /** How many full turns the linearized total claims. Only interesting when it is absurd. */
  fullTurns: number;
  /** The nearest named system from §7.4's table, if the slider is sitting on one. */
  presetId: string | null;
}

/** Within this factor of a preset speed the readout names it. Wide, because the axis is log. */
const PRESET_MATCH_TOLERANCE = 1.02;

export function deflectionFigures(state: DeflectionState): DeflectionFigures {
  const beta = betaFromLog(state.logBeta);
  const terms = deflection(beta, { ppnGamma: state.ppnGamma });
  const speed = beta * C;
  const totalArcsec = radiansToArcseconds(terms.total);
  const preset = DEFLECTION_PRESETS.find(
    candidate => Math.max(candidate.speed / speed, speed / candidate.speed) <= PRESET_MATCH_TOLERANCE,
  );
  return {
    ...terms,
    beta,
    speed,
    timeArcsec: radiansToArcseconds(terms.timeCurvature),
    spaceArcsec: radiansToArcseconds(terms.spaceCurvature),
    totalArcsec,
    fullTurns: totalArcsec / ARCSECONDS_PER_TURN,
    presetId: preset?.id ?? null,
  };
}

/** Human speed string: m/s below a km/s, km/s above it, and c at the top. */
export function formatSpeed(speed: number): string {
  if (speed >= C) return 'c, the speed of light';
  if (speed >= METRES_PER_KILOMETRE) return `${(speed / METRES_PER_KILOMETRE).toPrecision(3)} km/s`;
  return `${speed.toPrecision(3)} m/s`;
}

/** Arcseconds, in a form that survives spanning fifteen orders of magnitude. */
const EXPONENTIAL_ABOVE = 1e5;
const EXPONENTIAL_BELOW = 1e-3;
const SIGNIFICANT_FIGURES = 4;

export function formatArcseconds(value: number): string {
  if (value >= EXPONENTIAL_ABOVE || (value > 0 && value < EXPONENTIAL_BELOW)) {
    return `${value.toExponential(2)}″`;
  }
  return `${value.toPrecision(SIGNIFICANT_FIGURES)}″`;
}

/** The space/time ratio, readable at both ends: 1.00 at light, 1.11e-15 for an apple. */
export function formatRatio(value: number): string {
  if (value >= EXPONENTIAL_BELOW) return value.toPrecision(3);
  return value.toExponential(2);
}

/**
 * The live summary BUILD_PLAN §6 requires. It carries the physics, not a picture caption: the
 * two contributions, their ratio, and — where it applies — the fact that the number on screen is
 * outside the formula's domain, which is the one thing a sighted reader gets from the shaded band.
 */
export function describeDeflection(state: DeflectionState): string {
  const f = deflectionFigures(state);
  const named = DEFLECTION_PRESETS.find(preset => preset.id === f.presetId);
  const subject = named ? `${named.label}, ${formatSpeed(f.speed)}` : formatSpeed(f.speed);
  const parts = [
    `Deflector: the Sun, ray grazing the limb. Particle speed ${subject}, `
    + `so v over c is ${f.beta.toExponential(2)}.`,
    `Space curvature contributes ${formatArcseconds(f.spaceArcsec)}, unchanged at every speed. `
    + `Time curvature contributes ${formatArcseconds(f.timeArcsec)}.`,
    `The space contribution is ${f.spaceOverTime.toExponential(2)} times the time contribution; `
    + `that ratio is exactly v squared over c squared.`,
  ];
  if (f.weakDeflectionValid) {
    parts.push(`Total deflection ${formatArcseconds(f.totalArcsec)}.`);
  } else {
    parts.push(
      `The linearized formula gives ${formatArcseconds(f.totalArcsec)}, which is `
      + `${f.fullTurns.toExponential(2)} full turns and is not a deflection at all. `
      + `Below ${formatSpeed(weakDeflectionBetaThreshold({ ppnGamma: state.ppnGamma }) * C)} the `
      + `small-angle approximation has failed; the ratio above is still exact, the total is not.`,
    );
  }
  if (state.ppnGamma !== GR_PPN_GAMMA) {
    parts.push(
      state.ppnGamma === EINSTEIN_1911_PPN_GAMMA
        ? 'Space curvature coefficient gamma is 0: this is Einstein’s 1911 theory, which '
          + 'observation excludes.'
        : `Space curvature coefficient gamma is ${state.ppnGamma}, not general relativity’s 1.`,
    );
  }
  return parts.join(' ');
}

export interface CurvePoint {
  logBeta: number;
  /** log10 of the contribution in arcseconds. The y axis spans fifteen decades; it must be log. */
  logTime: number;
  logSpace: number;
  logTotal: number;
}

/**
 * The plotted curves. Sampling in log(beta) is what makes the shape readable: on a linear axis
 * every named system except light sits within one pixel of zero.
 */
export function deflectionCurve(ppnGamma: number, samples: number): CurvePoint[] {
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError('Need at least two samples.');
  }
  const points: CurvePoint[] = [];
  for (let index = 0; index < samples; index++) {
    const logBeta = MIN_LOG_BETA + ((MAX_LOG_BETA - MIN_LOG_BETA) * index) / (samples - 1);
    const terms = deflection(betaFromLog(logBeta), { ppnGamma });
    points.push({
      logBeta,
      logTime: Math.log10(radiansToArcseconds(terms.timeCurvature)),
      logSpace: Math.log10(radiansToArcseconds(terms.spaceCurvature)),
      logTotal: Math.log10(radiansToArcseconds(terms.total)),
    });
  }
  return points;
}

/**
 * log10(arcsec) bounds of the plot.
 *
 * Non-finite entries are dropped: at gamma = 0 the space contribution is exactly zero and its
 * log is -Infinity. Letting that reach the axis produced an axis with an infinite minimum, and
 * `decadeTicks` then counted upwards from -Infinity — an infinite loop that hung the tab. The
 * space line is simply not drawable on a log axis when it is zero, and the chart omits it.
 */
export function curveBounds(points: readonly CurvePoint[]): { min: number; max: number } {
  const values = points
    .flatMap(point => [point.logSpace, point.logTotal])
    .filter(Number.isFinite);
  if (values.length === 0) throw new RangeError('No finite points to bound.');
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Whether the space contribution can be drawn at all. False only at gamma = 0. */
export function hasDrawableSpaceLine(points: readonly CurvePoint[]): boolean {
  return points.every(point => Number.isFinite(point.logSpace));
}

/** log10(arcsec) of the weak-deflection ceiling — the boundary of the shaded band. */
export const WEAK_LIMIT_LOG_ARCSEC = Math.log10(
  radiansToArcseconds(WEAK_DEFLECTION_LIMIT_RADIANS),
);
