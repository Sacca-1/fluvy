import { FluvyDial } from './controls/dial.js';
import { FluvyRuler } from './controls/ruler.js';

export * from './glyphs.js';
export * from './parts.js';
export * from './chart.js';
export * from './motion.js';
export * from './haptics.js';
export * from './clock.js';
export * from './text.js';
export * from './tones.js';
export { baseStyles, setFallbackTokens, sheetStyles } from './styles/index.js';
export {
  clamp,
  clickPress,
  decimalsOf,
  holdKey,
  precisionGain,
  preventMenu,
  saneRange,
  scrubFraction,
  snap,
  startPress,
  startStepRepeat,
  stopStepRepeat,
  trackDrag,
  type PressTarget,
} from './controls/pointer.js';
export { sideScroll } from './controls/side-scroll.js';
export { localPoint, zoomOf } from './controls/zoom.js';
export { ScrubController, scrub } from './controls/scrub.js';
export { FluvyRuler, type RulerChangeDetail, type RulerWindowDetail } from './controls/ruler.js';
export { FluvyDial, type DialArc, type DialChangeDetail } from './controls/dial.js';

/** Defined synchronously on import: a card template may use the controls in its first render. */
if (!customElements.get('fluvy-ruler')) customElements.define('fluvy-ruler', FluvyRuler);
if (!customElements.get('fluvy-dial')) customElements.define('fluvy-dial', FluvyDial);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-ruler': FluvyRuler;
    'fluvy-dial': FluvyDial;
  }
}
