/** The shared shell every simulation renders into: canvas left, controls right.
 *
 * Two columns on a wide screen with the canvas taking the majority; a bottom drawer on a narrow
 * one. Clicking the canvas expands it to fill the viewport with the panel floating over it, and
 * Escape or the close button restores the layout.
 *
 * The panel is a real `<aside>` with a heading, and the expand/collapse control is a button, so
 * the whole thing works from the keyboard and reads correctly to assistive technology. Focus is
 * moved into the dialog on expand and returned to the canvas on close.
 */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { usePlaybackStore, usePresentation } from './playbackStore';
import './simStage.css';

interface Props {
  simId: string;
  /** The canvas (or any renderer surface) — it fills the stage. */
  canvas: ReactNode;
  /** Sliders, readouts, equations. Scrolls independently of the canvas. */
  controls: ReactNode;
  /**
   * A label that must be on screen whenever the simulation is — a stated exaggeration, a
   * coordinate choice, a disclaimer the spec requires. It renders as the first row of the canvas
   * column, above the canvas, in every layout including the expanded view.
   *
   * This is a slot in the layout rather than something each sim bolts on, because bolting it on
   * put it below the fold three times running (deflection, Mercury, ISCO). Placed under the
   * canvas it falls past the fold at the default window height; overlaid at the head of the
   * canvas the sticky control drawer clips it on a phone. As a row of the grid it is on screen
   * whenever the head of the canvas is, and it is outside the panel's scroll area entirely.
   *
   * No sim should manage its own above-canvas permanent label.
   */
  permanentLabel?: ReactNode;
  /** Long-form prose shown under the stage: misconceptions, the physics panel, sources. */
  children?: ReactNode;
  /** Transport is only meaningful for sims that actually animate. */
  showTransport?: boolean;
  panelLabel?: string;
}

export function SimStage({
  simId, canvas, controls, children, showTransport = true, panelLabel = 'Controls',
  permanentLabel,
}: Props) {
  const presentation = usePresentation(simId);
  const setFocused = usePlaybackStore(state => state.setFocused);
  const togglePlaying = usePlaybackStore(state => state.togglePlaying);
  const reset = usePlaybackStore(state => state.reset);
  const panelId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setFocused(simId, false), [setFocused, simId]);

  useEffect(() => {
    if (!presentation.focused) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    // Move focus into the expanded view so Escape is meaningful and Tab stays in context.
    closeButton.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [presentation.focused, close]);

  return (
    <div
      className={presentation.focused ? 'sim-stage is-focused' : 'sim-stage'}
      ref={stage}
      {...(presentation.focused ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Expanded simulation' } : {})}
    >
      <div className="stage-main">
        {/* Before the canvas in the DOM as well as above it on screen, so a screen reader reaches
            the caveat before the thing it qualifies — and, critically, OUTSIDE `.stage-columns`,
            which is the containing block the narrow-screen drawer is sticky within. Inside it,
            the drawer rises to the top of the stage on arrival and covers the label completely.
            That is the fourth appearance of this bug and the reason the slot is structural. */}
        {permanentLabel ? <div className="stage-permanent-label">{permanentLabel}</div> : null}
        <div className="stage-columns">
        <div className="stage-canvas-wrap">
          {canvas}
          {presentation.focused && (
            <Button className="stage-close" onPress={close} ref={closeButton}>
              Close <kbd>Esc</kbd>
            </Button>
          )}
        </div>

        <aside className="stage-panel" aria-label={panelLabel} id={panelId}>
          <div className="stage-panel-head">
            <h2>{panelLabel}</h2>
            <div className="transport" role="group" aria-label="View and playback">
              <Button
                className="transport-button"
                onPress={() => setFocused(simId, !presentation.focused)}
              >
                {presentation.focused ? 'Restore' : 'Expand'}
              </Button>
            </div>
            {showTransport && (
              <div className="transport" role="group" aria-label="Playback">
                <Button
                  className="transport-button"
                  onPress={() => togglePlaying(simId)}
                  aria-pressed={presentation.playing}
                >
                  {presentation.playing ? 'Pause' : 'Play'}
                </Button>
                <Button className="transport-button" onPress={() => reset(simId)}>Reset</Button>
              </div>
            )}
          </div>
          <div className="stage-panel-body">{controls}</div>
        </aside>
        </div>
      </div>

      {children ? <div className="stage-prose">{children}</div> : null}
    </div>
  );
}

/** The canvas surface itself, with the click-to-expand behaviour and its keyboard equivalent.
 *
 * `clickToExpand` exists because a sim whose canvas is an *input* surface cannot also treat a
 * click as "make me bigger". The gravity sandbox places a mass where you click; with expand on,
 * the first placement also opened focus mode, the canvas grew from 540 px to 912 px tall, and
 * every subsequent click mapped to different sim coordinates — so a right-click aimed at the body
 * you had just placed missed it by 67 pixels. The Expand button in the panel is the affordance in
 * that case, and it is always present.
 */
export function StageCanvas({
  simId, dragging, children, clickToExpand = true,
}: { simId: string; dragging: boolean; children: ReactNode; clickToExpand?: boolean }) {
  const setFocused = usePlaybackStore(state => state.setFocused);
  const presentation = usePresentation(simId);
  return (
    <div
      className="stage-surface"
      onClick={() => {
        if (clickToExpand && !dragging && !presentation.focused) setFocused(simId, true);
      }}
    >
      {children}
    </div>
  );
}
