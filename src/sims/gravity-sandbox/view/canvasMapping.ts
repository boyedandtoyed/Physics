/** Pixel ↔ sim-unit mapping for a full-canvas viewport.
 *
 * The inverse of what `ui/gl/LineRenderer` does on the way in. Getting it wrong places a body
 * somewhere other than where the reader clicked, which reads as the physics being wrong rather
 * than the arithmetic, so it is separated out and tested against the forward map.
 */
import { squareBounds, type Bounds } from '../../../ui/gl/LineRenderer';

export interface CanvasFrame {
  /** CSS pixels, not the backing store. Pointer events are in CSS pixels. */
  width: number;
  height: number;
  /** Half-extent of the shorter axis, in sim units. */
  extent: number;
}

export const frameBounds = (frame: CanvasFrame): Bounds =>
  squareBounds(frame.extent, frame.width, frame.height);

/**
 * Pixel position, measured from the top-left of the canvas, to sim units.
 *
 * GL's y grows upward and the DOM's grows downward, which is the one sign in here worth checking.
 */
export function pixelToSim(
  pixelX: number, pixelY: number, frame: CanvasFrame,
): { x: number; y: number } {
  const bounds = frameBounds(frame);
  return {
    x: bounds.minX + (pixelX / frame.width) * (bounds.maxX - bounds.minX),
    y: bounds.minY + (1 - pixelY / frame.height) * (bounds.maxY - bounds.minY),
  };
}

/** The forward map, so the inverse can be checked against it rather than against itself. */
export function simToPixel(
  x: number, y: number, frame: CanvasFrame,
): { x: number; y: number } {
  const bounds = frameBounds(frame);
  return {
    x: ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * frame.width,
    y: (1 - (y - bounds.minY) / (bounds.maxY - bounds.minY)) * frame.height,
  };
}

/** Sim-unit length of one CSS pixel, for hit-test radii that stay the same size on screen. */
export const simPerPixel = (frame: CanvasFrame): number => {
  const bounds = frameBounds(frame);
  return (bounds.maxX - bounds.minX) / frame.width;
};
