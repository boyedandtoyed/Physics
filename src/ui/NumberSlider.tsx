import { Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  minValue: number;
  maxValue: number;
  step: number;
  /** Rendered next to the value, e.g. "r_s" or "°". */
  unit?: string;
  /** Decimal places in the readout. */
  places?: number;
  /** Explanation shown under the control and associated with it for assistive technology. */
  hint?: string;
  /** Overrides the readout. For a slider whose raw value is an index rather than the quantity
   * the reader cares about — a log axis, say — the number on the thumb must be the quantity. */
  format?: (value: number) => string;
}

/** Accessible numeric control. React Aria gives keyboard operation, correct ARIA and a live
 * output for free, which is what BUILD_PLAN §6 means by "everything doable with the mouse is
 * doable with the keyboard" — not a mouse control with a key handler bolted on. */
export function NumberSlider({
  label, value, onChange, minValue, maxValue, step, unit = '', places = 1, hint, format,
}: Props) {
  const hintId = hint ? `${label.replace(/\W+/g, '-').toLowerCase()}-hint` : undefined;
  return (
    <Slider
      className="control"
      value={value}
      onChange={onChange}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      aria-describedby={hintId}
    >
      <div className="control-head">
        <Label>{label}</Label>
        <SliderOutput>{({ state }) => format
        ? format(Number(state.values[0]))
        : `${Number(state.values[0]).toFixed(places)}${unit}`}</SliderOutput>
      </div>
      <SliderTrack>{({ state }) => (
        <>
          <div className="track-fill" style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
          <SliderThumb />
        </>
      )}</SliderTrack>
      {hint ? <p className="control-hint" id={hintId}>{hint}</p> : null}
    </Slider>
  );
}
