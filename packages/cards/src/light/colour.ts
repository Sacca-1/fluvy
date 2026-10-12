import type { EntityView, MessageKey } from '@fluvy/core';
import { icon, label, rulerLabels, type RulerChangeDetail } from '@fluvy/ui';
import { css, html, nothing, type TemplateResult } from 'lit';
import { COLOURED, hexOf } from '../shared/light.js';

/*
 * A colour bulb's controls, fetched the first time the light card draws one (`import('./colour.js')`): the hue ruler
 * that takes the temperature ruler's slot while the bulb is in a colour, the row of quick colours under it, and the
 * matching that says which of them the bulb is on. The card keeps the wiring (what to send, the hold); this keeps the
 * tables, the maths and the row's sheet.
 */

export type Rgb = readonly [number, number, number];

/**
 * A quick colour as configured: `warm`, `cool`, one of Home Assistant's colour names, `#rrggbb` (or `#rgb`),
 * `[r, g, b]`, or `picker` — the round that opens the browser's own colour picker.
 */
export type SwatchEntry = string | readonly number[];

/**
 * A quick colour, resolved: a white at a temperature, a colour, or the picker; `hex` is what its round shows (the
 * picker's is empty: its round is a ring of the hues, and holds the bulb's colour while the bulb is on one of its own).
 */
export type Swatch =
  | {
      readonly kind: 'white';
      readonly word: 'warm' | 'cool';
      readonly kelvin: number;
      readonly hex: string;
    }
  | { readonly kind: 'colour'; readonly name: string; readonly rgb: Rgb; readonly hex: string }
  | { readonly kind: 'picker'; readonly hex: string };

/** The colour the finger chose: a colour (with its hue, so the ruler holds still) or a white's temperature. */
export type HeldColour = { readonly rgb: Rgb; readonly hue: number } | { readonly kelvin: number };

/** What the bulb shows, as the swatches are matched against it: a colour, a white at a temperature, or nothing (off). */
export interface Shown {
  readonly rgb?: Rgb | undefined;
  readonly kelvin?: number | undefined;
}

/**
 * What a bulb glows when asked for one of Home Assistant's colour names: Home Assistant's own `THEME_COLORS` (the
 * colours its colour picker lists), not the palette's tones — a bulb wears no palette, and "red" must be red on it.
 */
export const BULB_COLORS: Readonly<Record<string, string>> = {
  red: '#f44336',
  pink: '#e91e63',
  purple: '#926bc7',
  'deep-purple': '#6e41ab',
  indigo: '#3f51b5',
  blue: '#2196f3',
  'light-blue': '#03a9f4',
  cyan: '#00bcd4',
  teal: '#009688',
  green: '#4caf50',
  'light-green': '#8bc34a',
  lime: '#cddc39',
  yellow: '#ffeb3b',
  amber: '#ffc107',
  orange: '#ff9800',
  'deep-orange': '#ff5722',
  brown: '#795548',
  'light-grey': '#bdbdbd',
  grey: '#9e9e9e',
  'dark-grey': '#606060',
  'blue-grey': '#607d8b',
  white: '#ffffff',
};

/** The colour names the catalogue has a word for (`option.red` …); any other name reads as itself, capitalised. */
const WORDED: ReadonlySet<string> = new Set([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
]);
const capitalise = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** The quick colours a bulb gets when the config lists none: two whites first where it has a temperature. */
const WITH_WHITES: readonly SwatchEntry[] = ['warm', 'cool', 'red', 'orange', 'green', 'blue'];
const COLOURS_ONLY: readonly SwatchEntry[] = ['red', 'orange', 'green', 'blue', 'purple', 'pink'];

/** A colour counts as a swatch's within this much a channel; a white within this share of the bulb's range. */
const RGB_TOLERANCE = 12;
const KELVIN_SHARE = 0.15;

/** The picker's opening colour where the bulb is on none of its own: Home Assistant's orange. */
const PICKER_OPENS_ON = '#ff9800';
/** A colour chosen in the picker goes to the bulb this long after the last change: a drag in it is not a call a move. */
const PICK_DEBOUNCE = 250;
const pickTimers = new WeakMap<HTMLInputElement, number>();

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** `#rrggbb` or `#rgb` (any case, the hash optional) as `[r, g, b]`; anything else nothing. */
export function rgbOf(text: string): Rgb | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return undefined;
  const digits = match[1] ?? '';
  const hex = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** A black body at `kelvin` as the colour a white bulb shows (Tanner Helland's fit; 1000–40000 K). */
export function kelvinRgb(kelvin: number): Rgb {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp255(r), clamp255(g), clamp255(b)];
}

/** A hue (0–360) and a saturation (0–100) at full value as `[r, g, b]`: what the ruler sends is what the bulb glows. */
export function hsToRgb(hue: number, saturation: number): Rgb {
  const c = saturation / 100;
  const channel = (n: number): number => {
    const k = (n + hue / 60) % 6;
    return clamp255(255 * (1 - c * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [channel(5), channel(3), channel(1)];
}

/** The hue (0–360) of `[r, g, b]`; a grey has none and reads 0. */
export function hueOf([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60 + 360) % 360;
}

/** A quick colour as configured, resolved for a bulb whose temperatures run `minK`–`maxK`; nothing for what is not one. */
export function resolveSwatch(entry: SwatchEntry, minK: number, maxK: number): Swatch | undefined {
  if (Array.isArray(entry)) {
    const parts = entry.slice(0, 3);
    if (parts.length < 3 || parts.some((n) => typeof n !== 'number' || !Number.isFinite(n)))
      return undefined;
    const rgb = parts.map(clamp255) as unknown as Rgb;
    return { kind: 'colour', name: hexOf(rgb), rgb, hex: hexOf(rgb) };
  }
  if (typeof entry !== 'string') return undefined;
  const text = entry.trim().toLowerCase();
  if (text === 'picker') return { kind: 'picker', hex: '' };
  if (text === 'warm' || text === 'cool') {
    const kelvin = Math.max(minK, Math.min(maxK, text === 'warm' ? 2700 : 5000));
    return { kind: 'white', word: text, kelvin, hex: hexOf(kelvinRgb(kelvin)) };
  }
  const rgb = rgbOf(BULB_COLORS[text] ?? text);
  return rgb ? { kind: 'colour', name: text, rgb, hex: hexOf(rgb) } : undefined;
}

/**
 * How far `target` is from what the bulb shows when it is within tolerance — a colour ±12 a channel, a white within
 * 15 % of the bulb's range — and infinite otherwise, or across kinds (a white is never a colour's match).
 */
function gap(target: Shown, shown: Shown, range: number): number {
  if (target.rgb && shown.rgb) {
    const gaps = target.rgb.map((v, k) => Math.abs(v - (shown.rgb?.[k] ?? 0)));
    return Math.max(...gaps) <= RGB_TOLERANCE ? gaps.reduce((a, b) => a + b, 0) : Infinity;
  }
  if (target.kelvin !== undefined && shown.kelvin !== undefined) {
    const d = Math.abs(target.kelvin - shown.kelvin);
    return d <= KELVIN_SHARE * range ? d : Infinity;
  }
  return Infinity;
}

/**
 * The swatch the bulb is on: the nearest within tolerance, else the picker's round when the bulb glows a colour none
 * of them has (a white is never the picker's), or −1 (off, a colour of its own and no picker).
 */
export function activeSwatch(swatches: readonly Swatch[], shown: Shown, range: number): number {
  let best = -1;
  let nearest = Infinity;
  swatches.forEach((swatch, i) => {
    const d = swatch.kind === 'picker' ? Infinity : gap(swatch, shown, range);
    if (d < nearest) {
      nearest = d;
      best = i;
    }
  });
  if (best === -1 && shown.rgb) return swatches.findIndex((swatch) => swatch.kind === 'picker');
  return best;
}

/** What the bulb shows: the finger's choice while it is held, else what the bulb reports while it is on. */
export function shownOf(view: EntityView, on: boolean, held: HeldColour | null): Shown {
  if (held) return held;
  if (!on) return {};
  const mode = view.attr<string | null>('color_mode') ?? '';
  const rgb = view.attr<number[] | null>('rgb_color');
  const kelvin = view.attr<number | null>('color_temp_kelvin');
  if (COLOURED.has(mode) && Array.isArray(rgb) && rgb.length >= 3)
    return { rgb: [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0] };
  if (mode === 'color_temp' && typeof kelvin === 'number') return { kelvin };
  return {};
}

/** Whether the bulb reports the colour the finger chose (within the swatches' tolerances): the hold can let go. */
export const reported = (view: EntityView, held: HeldColour, range: number): boolean =>
  gap(held, shownOf(view, true, null), range) < Infinity;

/** Black or white, whichever reads better on a colour (WCAG luminance): the check on the swatch the bulb is on. */
function inkOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const linear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * linear((n >> 16) & 255) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#111111' : '#ffffff';
}

export interface ColourOptions {
  readonly view: EntityView;
  readonly t: (key: MessageKey) => string;
  readonly name: string;
  readonly width: number;
  readonly on: boolean;
  readonly held: HeldColour | null;
  readonly colors: readonly SwatchEntry[] | undefined;
  readonly minK: number;
  readonly maxK: number;
  readonly format: (value: number) => string;
  /** The temperature ruler, when the bulb has one and the card shows it: the slot's ruler while the bulb is white. */
  readonly temperature: (() => TemplateResult) | undefined;
  /** The finger's choice: the card holds it and sends `data` with `light.turn_on`. */
  readonly pick: (choice: HeldColour, data: Record<string, unknown>) => void;
}

/**
 * The colour bulb's controls: one ruler slot — the hue ruler while the bulb is in a colour (or has no temperature
 * ruler), the temperature ruler while it is white — and the quick colours under it, the one the bulb is on checked.
 * A white swatch leads to the temperature ruler, a colour to the hue ruler: the swatches are the mode's switch.
 */
export function colourControls(o: ColourOptions): TemplateResult {
  const shown = shownOf(o.view, o.on, o.held);
  const hs = o.view.attr<number[] | null>('hs_color');
  const hue =
    o.held && 'rgb' in o.held ? o.held.hue : (hs?.[0] ?? (shown.rgb ? hueOf(shown.rgb) : 0));
  // a bulb that reports no saturation is given the full one: the ruler is for colours, not for whites
  const saturation = hs?.[1] || 100;
  const range = o.maxK - o.minK;
  const modes = o.view.attr<string[]>('supported_color_modes') ?? [];
  const entries = o.colors ?? (modes.includes('color_temp') ? WITH_WHITES : COLOURS_ONLY);
  const swatches = entries.flatMap((entry) => resolveSwatch(entry, o.minK, o.maxK) ?? []);
  const active = activeSwatch(swatches, shown, range);
  const word = (swatch: Swatch): string =>
    swatch.kind === 'white'
      ? o.t(`light.${swatch.word}`)
      : swatch.kind === 'picker'
        ? o.t('option.picker')
        : WORDED.has(swatch.name)
          ? o.t(`option.${swatch.name}` as MessageKey)
          : capitalise(swatch.name);
  const pickSwatch = (swatch: Swatch): void => {
    if (swatch.kind === 'white')
      o.pick({ kelvin: swatch.kelvin }, { color_temp_kelvin: swatch.kelvin });
    else if (swatch.kind === 'colour')
      o.pick({ rgb: swatch.rgb, hue: hueOf(swatch.rgb) }, { rgb_color: [...swatch.rgb] });
  };
  // the picker's choice, 250 ms after its last change (a drag in it fires `input` a move); `change` too, for the
  // browsers that fire it alone when the picker closes
  const picked = (e: Event): void => {
    const input = e.currentTarget as HTMLInputElement;
    clearTimeout(pickTimers.get(input));
    pickTimers.set(
      input,
      window.setTimeout(() => {
        const rgb = rgbOf(input.value);
        if (rgb) o.pick({ rgb, hue: hueOf(rgb) }, { rgb_color: [...rgb] });
      }, PICK_DEBOUNCE),
    );
  };
  const slot =
    shown.rgb || !o.temperature
      ? html`${label(o.t('editor.color'))}
          <fluvy-ruler
            .value=${hue}
            .min=${0}
            .max=${360}
            .step=${1}
            .length=${o.width}
            tone="accent"
            .minor=${1 / 12}
            .major=${0.25}
            ?inactive=${!o.on}
            tint="hue"
            .label=${`${o.name} · ${o.t('editor.color')}`}
            .format=${(v: number) => `${o.format(v)}°`}
            @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => {
              const h = e.detail.value;
              o.pick({ rgb: hsToRgb(h, saturation), hue: h }, { hs_color: [h, saturation] });
            }}
          ></fluvy-ruler>
          ${rulerLabels([])}`
      : o.temperature();
  return html`${slot}
    <div class="lc-swatches">
      ${swatches.map((swatch, i) => {
        const current = i === active;
        if (swatch.kind === 'picker') {
          // the bulb's colour while the round holds it; the input fills the round unseen, and a tap on the round is
          // a tap on it (the label's), so the browser's own picker opens with the bulb's colour
          const hex = current && shown.rgb ? hexOf(shown.rgb) : PICKER_OPENS_ON;
          return html`<label
            class="lc-swatch lc-swatch--picker ${current ? 'is-active' : ''}"
            data-target
            style="--swatch:${hex};--swatch-ink:${inkOn(hex)}"
            title=${word(swatch)}
            aria-label=${word(swatch)}
          >
            ${current ? icon('check') : nothing}
            <input
              class="lc-swatch__input"
              type="color"
              data-measure="skip"
              .value=${hex}
              aria-label=${word(swatch)}
              @input=${picked}
              @change=${picked}
            />
          </label>`;
        }
        return html`<button
          class="lc-swatch ${current ? 'is-active' : ''}"
          data-target
          style="--swatch:${swatch.hex};--swatch-ink:${inkOn(swatch.hex)}"
          title=${word(swatch)}
          aria-label=${word(swatch)}
          aria-pressed=${current ? 'true' : 'false'}
          @click=${() => pickSwatch(swatch)}
        >
          ${current ? icon('check') : nothing}
        </button>`;
      })}
    </div>`;
}

/**
 * The quick colours' row: 16 above, 44 rounds 8 apart from the left, wrapping (six fill a phone's column). A round is
 * its colour, its edge that colour a shade deeper (a grey ring stair-stepped round a saturated round; a pale one still
 * stands off the card by it), the check in black or white by luminance.
 */
export const styles = css`
  .lc-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .lc-swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid color-mix(in oklab, var(--swatch) 86%, var(--fluvy-text));
    border-radius: 50%;
    background: var(--swatch);
    color: var(--swatch-ink);
    cursor: pointer;
  }
  .lc-swatch svg {
    width: 20px;
    height: 20px;
  }
  /* the picker's round: a ring of the hues (the colour wheel's), its edge the text ink faint; holding the bulb's
     colour, the colour fills it inside a 3 px ring of the hues, the check on the colour */
  .lc-swatch--picker {
    position: relative;
    overflow: hidden;
    border-color: color-mix(in oklab, var(--fluvy-text) 24%, transparent);
    background: conic-gradient(
      from 90deg,
      #f44336,
      #ffeb3b,
      #4caf50,
      #00bcd4,
      #2196f3,
      #926bc7,
      #f44336
    );
  }
  .lc-swatch--picker.is-active {
    border: 3px solid transparent;
    background:
      linear-gradient(var(--swatch), var(--swatch)) padding-box,
      conic-gradient(from 90deg, #f44336, #ffeb3b, #4caf50, #00bcd4, #2196f3, #926bc7, #f44336)
        border-box;
  }
  /* the browser's colour input, the whole round and unseen: the tap and the keyboard reach it, the eye does not */
  .lc-swatch__input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .lc-swatch--picker:has(.lc-swatch__input:focus-visible) {
    outline: 2px solid var(--fluvy-accent);
    outline-offset: 2px;
  }
`;

/** The row's sheet into a card's shadow root, once, beside the card's own (as `AccentSheet.adopt` does). */
export function adopt(root: ShadowRoot): void {
  const sheet = styles.styleSheet;
  if (sheet) {
    if (!root.adoptedStyleSheets.includes(sheet))
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } else if (!root.querySelector('style[data-fluvy-colour]')) {
    // no constructible sheets: a style element ahead of what Lit renders, where its own fallback puts them
    const element = document.createElement('style');
    element.dataset['fluvyColour'] = '';
    element.textContent = styles.cssText;
    root.prepend(element);
  }
}
