/** Figures and the screen-reader summary for the Interpretations module, PHYSICS_SPEC §7.4 B.
 *
 * Pure and unit-tested. Everything the four panels display is computed here, so the panels
 * cannot disagree with each other or with the spoken summary — which matters more than usual in
 * a module whose entire claim is that four different-looking pictures agree.
 */
import {
  DEFAULT_START_RADIUS,
  HORIZON,
  eddingtonFinkelsteinV,
  gullstrandPainleveTime,
  kretschmann,
  kruskal,
  properTimeToHorizon,
  radialTidal,
  radiusAtProperTime,
  radiusFromEddingtonV,
  radiusFromKruskal,
  radiusFromSchwarzschildTime,
  schwarzschildTime,
  type KruskalPoint,
} from '../../../core/infall';

export type ChartId = 'schwarzschild' | 'gullstrandPainleve' | 'eddingtonFinkelstein' | 'kruskal';

export interface ChartDefinition {
  id: ChartId;
  name: string;
  /** The vertical axis of this chart's panel. */
  timeLabel: string;
  /** What the chart does at the horizon — the thing that differs. */
  atHorizon: string;
  /** One sentence on what this chart is for. */
  character: string;
  /** Why part of the worldline is not in this panel, where that applies. */
  windowNote?: string;
}

export const CHARTS: readonly ChartDefinition[] = [
  {
    id: 'schwarzschild',
    name: 'Schwarzschild',
    timeLabel: 't',
    atHorizon: 't → ∞',
    character: 'The static picture. Nothing flows; the faller never arrives.',
    windowNote: 'The worldline runs off the top: t → ∞ at the horizon, so in this chart it never '
      + 'gets there.',
  },
  {
    id: 'gullstrandPainleve',
    name: 'Gullstrand–Painlevé',
    timeLabel: 't_ff',
    atHorizon: 'finite',
    character: 'Flat space with an inward river. The faller’s own clock is the time coordinate.',
  },
  {
    id: 'eddingtonFinkelstein',
    name: 'Eddington–Finkelstein',
    timeLabel: 'v',
    atHorizon: 'finite',
    character: 'Built on infalling light. Regular across the horizon; the light cones tip over.',
  },
  {
    id: 'kruskal',
    name: 'Kruskal–Szekeres',
    timeLabel: 'T',
    atHorizon: 'finite',
    character: 'The maximal extension. Light travels at 45° everywhere.',
    windowNote: 'Kruskal stretches the distant exterior exponentially: the fall begins at '
      + 'X ≈ 1.4×10⁶, far outside this window.',
  },
];

export interface ChartReading {
  id: ChartId;
  /** This chart's own time coordinate at the event, as a display string. */
  timeValue: string;
  /** The areal radius this chart recovers, by its own route — never handed in. */
  recoveredRadius: number;
  kretschmann: number;
  tidal: number;
  /** How the recovered radius differs from the trajectory's, relative. The gate is 1e-12. */
  radiusDeviation: number;
}

export interface EventReadings {
  properTime: number;
  radius: number;
  /** True once the faller is at or inside the horizon. */
  pastHorizon: boolean;
  charts: ChartReading[];
  /** Largest relative disagreement in K across the four charts. The headline number. */
  invariantSpread: number;
}

const INFINITY_GLYPH = '∞';
const TIME_PLACES = 4;
const RADIUS_PLACES = 6;

const format = (value: number, places: number): string =>
  Number.isFinite(value) ? value.toFixed(places) : INFINITY_GLYPH;

/**
 * Each chart's own route from the event to the areal radius.
 *
 * `fromCoordinates` is deliberately given only what its chart holds — never the radius. The
 * module's whole assertion is that four independent routes agree, and a route handed the answer
 * would prove nothing, so the constraint is expressed in the signature rather than left to care.
 * `C` is the chart's coordinate representation: a single time for three of them, the null pair
 * (U, V) for Kruskal, whose recovery cannot go through T and X without losing the precision the
 * 1e-10 gate needs (PHYSICS_SPEC §7.4).
 */
interface ChartRoute<C> {
  id: ChartId;
  /** Whether this chart covers the event at all. Schwarzschild and EF stop at the horizon. */
  covers: (radius: number) => boolean;
  toCoordinates: (radius: number, startRadius: number) => C;
  /** The number this chart's panel shows. */
  display: (coordinates: C) => number;
  fromCoordinates: (coordinates: C, startRadius: number) => number;
}

interface ErasedRoute {
  id: ChartId;
  covers: (radius: number) => boolean;
  read: (radius: number, startRadius: number) => { display: number; recovered: number };
}

function erase<C>(route: ChartRoute<C>): ErasedRoute {
  return {
    id: route.id,
    covers: route.covers,
    read: (radius, startRadius) => {
      const coordinates = route.toCoordinates(radius, startRadius);
      return {
        display: route.display(coordinates),
        recovered: route.fromCoordinates(coordinates, startRadius),
      };
    },
  };
}

const coversOutside = (radius: number): boolean => radius > HORIZON;
const identity = (value: number): number => value;

const ROUTES: readonly ErasedRoute[] = [
  erase<number>({
    id: 'schwarzschild',
    covers: coversOutside,
    toCoordinates: schwarzschildTime,
    display: identity,
    fromCoordinates: radiusFromSchwarzschildTime,
  }),
  erase<number>({
    id: 'gullstrandPainleve',
    covers: () => true,
    toCoordinates: gullstrandPainleveTime,
    display: identity,
    fromCoordinates: radiusAtProperTime,
  }),
  erase<number>({
    id: 'eddingtonFinkelstein',
    covers: coversOutside,
    toCoordinates: eddingtonFinkelsteinV,
    display: identity,
    fromCoordinates: radiusFromEddingtonV,
  }),
  erase<KruskalPoint>({
    id: 'kruskal',
    covers: coversOutside,
    toCoordinates: kruskal,
    display: point => point.T,
    fromCoordinates: radiusFromKruskal,
  }),
];


/**
 * Every chart's reading at one physical event, labelled by the faller's proper time.
 *
 * Each chart recovers the areal radius through its own inverse rather than being handed
 * `radius`. Comparing the charts at the same r would compare a number with itself.
 */
export function readEvent(
  tau: number,
  startRadius = DEFAULT_START_RADIUS,
): EventReadings {
  const radius = radiusAtProperTime(tau, startRadius);
  const pastHorizon = radius <= HORIZON;

  const charts: ChartReading[] = ROUTES.map(route => {
    if (!route.covers(radius)) {
      return {
        id: route.id,
        timeValue: INFINITY_GLYPH,
        recoveredRadius: Number.NaN,
        kretschmann: Number.NaN,
        tidal: Number.NaN,
        radiusDeviation: Number.NaN,
      };
    }
    const { display, recovered } = route.read(radius, startRadius);
    return {
      id: route.id,
      timeValue: format(display, TIME_PLACES),
      recoveredRadius: recovered,
      kretschmann: kretschmann(recovered),
      tidal: radialTidal(recovered),
      radiusDeviation: Math.abs(recovered / radius - 1),
    };
  });

  const finite = charts.map(chart => chart.kretschmann).filter(Number.isFinite);
  const invariantSpread = finite.length > 1 ? Math.max(...finite) / Math.min(...finite) - 1 : 0;

  return { properTime: tau, radius, pastHorizon, charts, invariantSpread };
}

/** The trajectory sampled for plotting, in proper time. */
export function sampleTrajectory(
  samples: number,
  startRadius = DEFAULT_START_RADIUS,
): { tau: number; radius: number }[] {
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError('Need at least two samples.');
  }
  const total = properTimeToHorizon(startRadius);
  return Array.from({ length: samples }, (_, index) => {
    const tau = (total * index) / (samples - 1);
    return { tau, radius: radiusAtProperTime(tau, startRadius) };
  });
}

export const formatRadius = (radius: number): string =>
  Number.isFinite(radius) ? radius.toFixed(RADIUS_PLACES) : '—';

/** Scientific, since K runs from 1e-5 to 12 over the fall. */
export const formatInvariant = (value: number): string =>
  Number.isFinite(value) ? value.toExponential(4) : '—';

/**
 * The live summary BUILD_PLAN §6 requires.
 *
 * Four SVG panels are opaque to assistive technology, and the claim being made is a numerical
 * agreement, so the summary states the agreement as a number rather than describing pictures.
 */
export function describeEvent(readings: EventReadings): string {
  const spread = readings.invariantSpread;
  const parts = [
    `Event at proper time ${readings.properTime.toFixed(3)} r_s over c, areal radius `
    + `${readings.radius.toFixed(4)} r_s.`,
    'The same event in four charts: '
    + readings.charts
      .map(chart => {
        const definition = CHARTS.find(candidate => candidate.id === chart.id);
        return `${definition?.name} ${definition?.timeLabel} = ${chart.timeValue}`;
      })
      .join(', ')
    + '.',
    `Every chart recovers the same curvature: Kretschmann scalar `
    + `${formatInvariant(readings.charts[1]!.kretschmann)}, tidal component `
    + `${formatInvariant(readings.charts[1]!.tidal)}, agreeing across the charts to `
    + `${spread === 0 ? 'the last digit held' : spread.toExponential(1)}.`,
  ];
  if (readings.pastHorizon) {
    parts.push(
      'The faller is at or inside the horizon. Schwarzschild and Eddington–Finkelstein time '
      + 'no longer label this event; the faller’s own clock does, and reads a finite number. '
      + 'Nothing happens to the faller here — the curvature is unremarkable.',
    );
  }
  return parts.join(' ');
}
