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
  /** Long-form prose shown under the stage: misconceptions, the physics panel, sources. */
  children?: ReactNode;
  /** Transport is only meaningful for sims that actually animate. */
  showTransport?: boolean;
  panelLabel?: string;
}

export function SimStage({
  simId, canvas, controls, children, showTransport = true, panelLabel = 'Controls',
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

      {children ? <div className="stage-prose">{children}</div> : null}
    </div>
  );
}

/** The canvas surface itself, with the click-to-expand behaviour and its keyboard equivalent. */
export function StageCanvas({
  simId, dragging, children,
}: { simId: string; dragging: boolean; children: ReactNode }) {
  const setFocused = usePlaybackStore(state => state.setFocused);
  const presentation = usePresentation(simId);
  return (
    <div
      className="stage-surface"
      onClick={() => { if (!dragging && !presentation.focused) setFocused(simId, true); }}
    >
      {children}
    </div>
  );
}
