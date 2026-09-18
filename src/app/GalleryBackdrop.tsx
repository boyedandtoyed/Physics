/** The collection page's live background: a star field and a slowly turning Flamm funnel.
 *
 * **Purely decorative, and it says so.** Nothing here is measured, nothing is interactive, and no
 * claim rests on it: the star field is a hash and the funnel is the same exact embedding the
 * curvature sim draws, turned slowly so the page is not static. It is drawn with the shared
 * `Scene3D`, so it cannot drift away from what the sims show.
 *
 * It degrades to nothing at all. Without WebGL2 the component renders no canvas and the page's
 * own themed background stands, which is what it does today — a backdrop that fails should leave
 * the page it decorates exactly as it found it.
 */
import { useEffect, useRef, useState } from 'react';
import { Scene3D } from '../ui/gl/Scene3D';
import { lensFor, type Pose } from '../ui/gl/camera3d';
import { polarGridVertices, type FabricParams } from '../ui/gl/fabric';
import { useDarkTheme } from '../ui/useDarkTheme';

/** r_s in the funnel's own units. */
const HORIZON = 1;
const OUTER = 26;
const RINGS = 22;
const SPOKES = 40;
const SEGMENTS = 88;
const DISTANCE = 34;
const INCLINATION = 0.3;
const TURNS_PER_SECOND = 0.006;
const MAX_DEVICE_PIXEL_RATIO = 1.5;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const TAU = Math.PI * 2;
/** Depth at which a grid line is fully the deep colour: the funnel's own drop, so the tint
 * spans exactly the surface being drawn rather than an arbitrary range. */
const DEEP_AT = 2 * Math.sqrt(HORIZON * (OUTER - HORIZON));

const DARK_LINE: readonly [number, number, number] = [0.26, 0.4, 0.46];
const DARK_DEEP: readonly [number, number, number] = [0.42, 0.32, 0.6];
const LIGHT_LINE: readonly [number, number, number] = [0.52, 0.58, 0.66];
const LIGHT_DEEP: readonly [number, number, number] = [0.42, 0.34, 0.6];
const DARK_ALPHA = 0.85;
const LIGHT_ALPHA = 0.55;
/** Brightness multiplies the radiance before the tone map, so it mostly buys alpha: a star
 * saturates towards opaque while empty sky stays at alpha 0 and paints nothing at all. That is
 * why the canvas can sit at high opacity over body text without costing any contrast — almost
 * none of it is painted. */
const DARK_STARS = 2.6;
/** The field is a bright thing on a bright page; on light it is nearly off. */
const LIGHT_STARS = 0.5;

const FABRIC: FabricParams = {
  mode: 'flamm',
  masses: [{ x: 0, y: 0, mass: 1, radius: HORIZON }],
  heightScale: 1,
  floor: Number.POSITIVE_INFINITY,
  outerRadius: OUTER,
};

export function GalleryBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(true);
  const dark = useDarkTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let scene: Scene3D;
    try {
      scene = new Scene3D(canvas);
      scene.setFabricMesh(polarGridVertices(HORIZON, OUTER, RINGS, SPOKES, SEGMENTS));
    } catch {
      // No WebGL2, or no context to spare. The page's own background is the fallback and it is
      // already there; there is nothing to report and nobody to report it to.
      setSupported(false);
      return undefined;
    }

    // A page that turns forever is a page that cannot be read by everyone. Respect the setting.
    const stillness = window.matchMedia('(prefers-reduced-motion: reduce)');
    let azimuth = 0.8;
    let handle = 0;
    let stopped = false;
    let previous = performance.now();

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const pose: Pose = { distance: DISTANCE, inclination: INCLINATION, azimuth };
      const lens = lensFor(width / height);
      scene.beginFrame({ pose, lens, width, height });
      scene.drawStars(dark ? DARK_STARS : LIGHT_STARS);
      scene.drawFabric(FABRIC, {
        lineColour: dark ? DARK_LINE : LIGHT_LINE,
        deepColour: dark ? DARK_DEEP : LIGHT_DEEP,
        deepAt: DEEP_AT,
        alpha: dark ? DARK_ALPHA : LIGHT_ALPHA,
      });
      scene.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      azimuth = (azimuth + seconds * TURNS_PER_SECOND * TAU) % TAU;
      draw();
      handle = requestAnimationFrame(step);
    };

    draw();
    if (!stillness.matches) handle = requestAnimationFrame(step);
    const onPreferenceChange = () => {
      cancelAnimationFrame(handle);
      if (!stillness.matches && !stopped) handle = requestAnimationFrame(step);
    };
    stillness.addEventListener('change', onPreferenceChange);

    return () => {
      stopped = true;
      cancelAnimationFrame(handle);
      stillness.removeEventListener('change', onPreferenceChange);
      scene.dispose();
    };
  }, [dark]);

  if (!supported) return null;
  return (
    <div className="gallery-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
