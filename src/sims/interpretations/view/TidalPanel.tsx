/** Geodesic deviation: the part of gravity no coordinate choice can remove, and no "expansion"
 * story reproduces at all. PHYSICS_SPEC §7.4 Claim B, point 2.
 *
 * A ring of free test particles is stretched radially and squeezed transversely. The radial
 * component is -2M/r^3 and the transverse +M/r^3, so the stretch is exactly twice the squeeze at
 * every radius — that 2:1 is exact and is drawn to scale even though the overall deformation is
 * exaggerated to be visible.
 */
import { DEFAULT_START_RADIUS, HORIZON, radialTidal } from '../../../core/infall';

const SIZE = 190;
const CENTRE = SIZE / 2;
const BASE_RADIUS = 44;
/** Deformation is scaled from the tidal magnitude and capped, so the ring stays a ring. */
const MAX_STRAIN = 0.62;
/** The drawn strain sweeps from 0 at the start of the fall to MAX_STRAIN at the horizon, and it
 * sweeps LOGARITHMICALLY because the field grows by a factor of 512 over that stretch: a linear
 * map would show nothing at all until the last instant. Stated in the caption. */
const START_TIDAL = Math.abs(radialTidal(DEFAULT_START_RADIUS));
const HORIZON_TIDAL = Math.abs(radialTidal(HORIZON));
const PARTICLE_COUNT = 16;
const PARTICLE_RADIUS = 3.4;
const ARROW = 20;
const HALF = 0.5;
const LABEL_GAP = 10;

interface Props {
  radius: number;
}

export function TidalPanel({ radius }: Props) {
  const magnitude = Math.abs(radialTidal(radius));
  // Compressive log scaling: the field runs over five decades along the fall and a linear map
  // would show nothing until the last instant.
  const sweep = (Math.log10(magnitude) - Math.log10(START_TIDAL))
    / (Math.log10(HORIZON_TIDAL) - Math.log10(START_TIDAL));
  const strain = Math.min(MAX_STRAIN, Math.max(0, MAX_STRAIN * sweep));
  // Stretch along r (drawn vertically, towards the hole) is twice the transverse squeeze.
  const alongRadius = BASE_RADIUS * (1 + strain);
  const transverse = BASE_RADIUS * (1 - strain * HALF);

  return (
    <figure className="tidal-figure">
      <svg
        className="tidal-diagram"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          `A ring of free-falling test particles at r = ${radius.toFixed(3)} r_s, stretched along `
          + 'the radial direction and squeezed across it. The radial tidal component is '
          + `${radialTidal(radius).toExponential(3)} c squared per r_s squared, and the stretch is `
          + 'exactly twice the squeeze at every radius.'
        }
      >
        <circle className="tidal-reference" cx={CENTRE} cy={CENTRE} r={BASE_RADIUS} />
        <ellipse className="tidal-ring" cx={CENTRE} cy={CENTRE} rx={transverse} ry={alongRadius} />
        {Array.from({ length: PARTICLE_COUNT }, (_, index) => {
          const angle = (index / PARTICLE_COUNT) * 2 * Math.PI;
          return (
            <circle
              key={angle}
              className="tidal-particle"
              cx={CENTRE + transverse * Math.sin(angle)}
              cy={CENTRE + alongRadius * Math.cos(angle)}
              r={PARTICLE_RADIUS}
            />
          );
        })}
        <line
          className="tidal-arrow"
          x1={CENTRE} y1={CENTRE - alongRadius}
          x2={CENTRE} y2={CENTRE - alongRadius - ARROW}
        />
        <line
          className="tidal-arrow"
          x1={CENTRE} y1={CENTRE + alongRadius}
          x2={CENTRE} y2={CENTRE + alongRadius + ARROW}
        />
        <line
          className="tidal-arrow tidal-arrow-in"
          x1={CENTRE - transverse - ARROW * HALF} y1={CENTRE}
          x2={CENTRE - transverse} y2={CENTRE}
        />
        <line
          className="tidal-arrow tidal-arrow-in"
          x1={CENTRE + transverse + ARROW * HALF} y1={CENTRE}
          x2={CENTRE + transverse} y2={CENTRE}
        />
        <text className="tidal-label" x={CENTRE} y={LABEL_GAP} textAnchor="middle">stretch</text>
        <text className="tidal-label" x={CENTRE} y={SIZE - 2} textAnchor="middle">stretch</text>
      </svg>
      <figcaption>
        Deformation exaggerated and swept on a <em>logarithmic</em> scale, because the field grows
        512-fold between 8 r<sub>s</sub> and the horizon. The <strong>2:1 ratio of stretch to
        squeeze is exact</strong> and is drawn to scale. A uniform expansion has identically zero
        geodesic deviation — it
        produces no tidal field at any radius, which is why the “everything is expanding” picture
        cannot reproduce this panel at all.
      </figcaption>
    </figure>
  );
}
