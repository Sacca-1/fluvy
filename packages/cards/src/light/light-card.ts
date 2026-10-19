import {
  formatNumber,
  isUsable,
  lightDefaults,
  PALETTE_ACCENT,
  stateText,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type LightTint,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
  type HomeAssistant,
} from '@fluvy/core';
import { LIT_FLOOR } from '@fluvy/tokens/runtime';

import {
  head,
  label,
  readout,
  rulerLabels,
  sheetStyles,
  stepper,
  toggle,
  type RulerChangeDetail,
  type RulerWindowDetail,
  type Tone,
} from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { Card, HEAD_BASE } from '../shared/base.js';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';
import { configKeys } from '../shared/config.js';

import { glyphFor, stateWord } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorLanguage,
  editorWord,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  showIconField,
  textField,
  tintField,
} from '../shared/form.js';
import { listAttr, rowsOf } from '../shared/heights.js';
import { COLOURED, DIMMABLE, glowOf, hexOf, type LightWhites } from '../shared/light.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { fitValueRow, STEPPER, STEPPER_HALVES, valueRowClass } from '../shared/value-row.js';
import type { HeldColour } from './colour.js';
import {
  CUSTOM,
  defaultSwatches,
  SWATCH_WORDS,
  swatchEntry,
  swatchItem,
  type SwatchEntry,
} from './swatches.js';

/** How the card is drawn: the full dimmer, or the compact one (its level in the head, the ruler alone); `auto` picks by width. */
export type LightVariant = 'auto' | 'full' | 'compact';

/** How much of its colour a lit card shows: a lit tile's whole fill, a gentle wash, or as much as the lamp is bright. */
export type TintStrength = 'soft' | 'brightness' | 'full';
const STRENGTHS: readonly TintStrength[] = ['soft', 'brightness', 'full'];

export interface LightCardConfig extends FluvyCardConfig {
  variant?: LightVariant;
  /** The − and + beside the full card's level (default). Off: the level is set on its ruler, and the readout is the card's tap. */
  show_stepper?: boolean;
  /** Send brightness while dragging (throttled) instead of only on release. */
  live_update?: boolean;
  show_temperature?: boolean;
  /** The colour-temperature ruler's ticks take a faint warm → cool tint (default). Off = neutral ticks like the brightness ruler. */
  temperature_tint?: boolean;
  /** A colour bulb's hue ruler and quick colours (default). Off: the card of a white bulb. */
  show_color?: boolean;
  /**
   * The quick colours, in order, any number: `warm`, `cool`, a Home Assistant colour name, `#rrggbb`, `[r, g, b]`,
   * `picker`, or any of those with a name (`{ color, name }`).
   */
  colors?: readonly SwatchEntry[];
  /**
   * The card shows its light's colour on its surface (1.9): never (`off`), while the light is on (`on`), or at rest
   * too (`always`: a quiet wash) — the house's choice (fluvy's settings) where the card says none.
   */
  tint?: LightTint;
  /** How much: a lit tile's whole fill (`full`, the default), a gentle wash (`soft`), or as the lamp is bright. */
  tint_strength?: TintStrength;
  /** A lit white: as the palette's lit light (`palette`, the default), or by its temperature (`temperature`). */
  light_whites?: LightWhites;
}

/** The colour controls' module: fetched the first time a colour bulb is drawn, once for every light card. */
type ColourModule = typeof import('./colour.js');
let colourModule: Promise<ColourModule> | undefined;

/**
 * The quick colour a row of the editor is: the words, the picker, or Custom colour — one of your own, picked in the
 * well the row then shows (Home Assistant's select with a typed value says the value, not the word, so none is
 * typed here: a name or a hex still reads from YAML). Worded when the editor
 * first asks, in its language: this card is in every page's first chunk, which lands before a house's catalogue
 * does, so a select worded at load would say its raw values ("warm", "custom") in a Spanish house.
 */
const swatchSelect = (): HaFormSchemaItem => ({
  name: 'color',
  selector: {
    select: {
      mode: 'dropdown',
      options: [
        ...SWATCH_WORDS.map((value) => ({
          value,
          label: editorWord(
            (value === 'warm' || value === 'cool'
              ? `light.${value}`
              : `option.${value}`) as MessageKey,
          ),
        })),
        { value: CUSTOM, label: editorWord('option.custom') },
      ],
    },
  },
});
/** A Custom row's well: Home Assistant's own colour selector, `[r, g, b]`. */
const RGB_FIELD: HaFormSchemaItem = { name: 'rgb', selector: { color_rgb: {} } };

/** A row's fields in one language: the select and the name on one line, the well under them while the row is Custom. */
interface SwatchFields {
  readonly color: HaFormSchemaItem;
  readonly word: readonly HaFormSchemaItem[];
  readonly custom: readonly HaFormSchemaItem[];
}
const fieldsByLanguage = new Map<string, SwatchFields>();
/** The row's fields for the editor's language, built once per language: the same arrays for the same answer. */
const swatchFieldsFor = (): SwatchFields => {
  const { language } = editorLanguage();
  let fields = fieldsByLanguage.get(language);
  if (!fields) {
    const color = swatchSelect();
    const word: readonly HaFormSchemaItem[] = [fieldRow(color, textField('name'))];
    fields = { color, word, custom: [...word, RGB_FIELD] };
    fieldsByLanguage.set(language, fields);
  }
  return fields;
};

/** The fields a row shows: the well only while the row is Custom; the same array for the same answer. */
const swatchFields = (item: Readonly<Record<string, unknown>>): readonly HaFormSchemaItem[] =>
  item['color'] === CUSTOM ? swatchFieldsFor().custom : swatchFieldsFor().word;

/** The colour modes a config's bulb supports, as the house reports them; none where the editor has no house yet. */
const modesOf = (
  config: Readonly<Record<string, unknown>>,
  hass: { states: Record<string, { attributes: Record<string, unknown> }> } | undefined,
): readonly string[] => {
  const entity = config['entity'];
  const modes =
    typeof entity === 'string'
      ? hass?.states[entity]?.attributes['supported_color_modes']
      : undefined;
  return Array.isArray(modes) ? modes.filter((m): m is string => typeof m === 'string') : [];
};

/** Under this content width the full layout has no room for its value and stepper: the compact one takes over. */
const COMPACT_BELOW = 260;

/**
 * The precision dimmer: a big tabular value with its stepper, the ruler underneath (relative drag,
 * slide away to slow down, hold for the 1 % scale), and a second ruler for colour temperature. A colour bulb gets a
 * row of quick colours under that ruler's slot, and the slot holds a hue ruler while the bulb is in a colour; the
 * card wears the bulb's colour as its accent. Half a section wide (or `variant: compact`) it keeps the head, with
 * the level in its state line, and the brightness ruler alone: two lamps share a line. The switch is never what a
 * narrow column costs: the head is fitted round it (the sub steps aside, then the icon circle), as the fan's is.
 */
export class FluvyLightCard extends Card<LightCardConfig> {
  /** The head, measured: what gives way in a narrow column is the sub, then the icon — never the switch. */
  private readonly head = new HeadFit(this);

  /**
   * The card's height at a 360 column, for the automatic dashboard's columns — from the config alone: the ruler
   * slot (a label, the ruler and its labels: 100) when a temperature or a hue ruler may show, and the quick colours
   * (16 above, 44 rounds, six a row, as many rows as the count takes; a named entry counts one) when they may; a
   * white bulb under the same config draws less, and a list of none draws no row.
   */
  static override layoutHeight(config: LightCardConfig, hass?: HomeAssistant): number {
    if (config.variant === 'compact') return 188;
    // the house says what the bulb does: a colour bulb its ruler and swatches, a white one its temperature ruler, a
    // dimmer neither (and a bulb the house has not described draws as a dimmer); without the house, a colour bulb
    const modes = listAttr(hass, config.entity, 'supported_color_modes');
    const colour = !hass || modes.some((m) => COLOURED.has(m));
    const temperature = colour || modes.includes('color_temp');
    const slot =
      (config.show_temperature !== false && temperature) || (config.show_color !== false && colour)
        ? 100
        : 0;
    const rows = config.show_color !== false && colour ? rowsOf(config.colors?.length ?? 6, 6) : 0;
    const swatches = rows ? 8 + rows * 52 : 0;
    return 268 + slot + swatches;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.slider,
    css`
      .sl-card {
        height: auto;
        min-height: 256px;
      } /* the sheet fixes 256 so its five states line up; a colour-temperature ruler makes the card taller */
      .sl-bubble-row {
        pointer-events: none;
      }
      .sl-card--compact {
        min-height: 0;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    preview_: { state: true },
    window_: { state: true },
  };

  /** Value under the finger while a drag is in flight. */
  declare preview_: number | null;
  declare window_: RulerWindowDetail | null;

  private lastSend = 0;
  /** The level the user chose, shown until the lamp reports it (slow lamps take seconds) or 5 s pass. */
  private held: { value: number; expires: number } | null = null;
  private heldTimer = 0;
  private sendTimer = 0;
  /** The level on screen right now; the stepper counts from here, never from a value captured at render time. */
  private level = 0;
  /** The colour the finger chose, shown (the check, the ruler, the accent) until the bulb reports it or 5 s pass. */
  private heldColour: { choice: HeldColour; expires: number } | null = null;
  private colourTimer = 0;
  /** The colour controls, once their module has landed; asked for on the first render of a colour bulb. */
  private colour: ColourModule | undefined;
  private colourAsked = false;

  constructor() {
    super();
    this.preview_ = null;
    this.window_ = null;
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<LightCardConfig>()([
    'variant',
    'show_stepper',
    'live_update',
    'show_temperature',
    'temperature_tint',
    'show_color',
    'colors',
    'tint',
    'tint_strength',
    'light_whites',
  ]);
  /**
   * The quick colours, edited row by row in their order, any number of them: each a colour (a word, the picker,
   * or Custom with its well) and a name of its own. The bulb's default six show as rows until the list is touched.
   */
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'colors',
      title: 'editor.colors',
      idKey: 'color',
      get picker() {
        return swatchFieldsFor().color;
      },
      keys: ['color', 'rgb', 'name'],
      get schema() {
        return swatchFieldsFor().custom;
      },
      schemaOf: swatchFields,
      read: swatchItem,
      write: swatchEntry,
      // the well is Home Assistant's colour input, which paints its whole field: a floating label would sit on the
      // colour, so the well carries no label and its word goes under it as the helper
      computeLabel: (schema) => (schema.name === 'rgb' ? '' : undefined),
      computeHelper: (schema) =>
        schema.name === 'color'
          ? editorWord('editor.color_help')
          : schema.name === 'name'
            ? editorWord('editor.swatch_name_help')
            : schema.name === 'rgb'
              ? editorWord('editor.rgb')
              : undefined,
    },
  ];
  /** What the editor shows where the config says nothing: what the card does then (the quick colours by the bulb). */
  static override defaults: EditorDefaults = (config, hass) => ({
    live_update: false,
    variant: 'auto',
    show_stepper: true,
    show_temperature: true,
    show_color: true,
    temperature_tint: true,
    colors: defaultSwatches(modesOf(config, hass)),
    tint: lightDefaults().tint,
    tint_strength: 'full',
    light_whites: 'palette',
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['light']),
        nameIconFields(),
        showIconField(),
        fieldRow(selectField('variant', ['auto', 'full', 'compact']), boolField('show_stepper')),
        fieldRow(boolField('show_temperature'), boolField('show_color')),
        // the list is edited row by row (the rows editor takes the field out of the form)
        { name: 'colors', selector: { object: {} } },
        boolField('temperature_tint'),
        boolField('live_update'),
        // its colour follows the light's unless one is given (Home Assistant's State, as its own tile's)
        ...colourFields({ state: true }),
        fieldRow(
          tintField(['off', 'on', 'always']),
          selectField('tint_strength', STRENGTHS, { words: { full: 'full_colour' } }),
        ),
        selectField('light_whites', ['palette', 'temperature']),
        actionFields(),
      ],
      ...formLabels({
        show_temperature: 'light.temperature',
        show_color: 'editor.show_color',
        colors: 'editor.colors',
        temperature_tint: 'editor.temperature_tint',
        live_update: 'editor.live_update',
      }),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): LightCardConfig {
    return {
      type: 'custom:fluvy-light-card',
      entity: entities.find((id) => id.startsWith('light.')) ?? '',
    };
  }

  protected override prepare(config: LightCardConfig): LightCardConfig {
    if (!config.entity) throw new Error('fluvy-light-card: "entity" is required');
    return {
      ...config,
      variant: config.variant ?? 'auto',
      show_temperature: config.show_temperature ?? true,
      show_color: config.show_color ?? true,
      temperature_tint: config.temperature_tint ?? true,
      live_update: config.live_update ?? false,
    };
  }

  /** A light group's members are watched too: its colour is theirs. */
  protected override watched(): readonly string[] {
    return [...super.watched(), ...this.members()];
  }

  /** What a light group holds (`entity_id`); none for a single light. */
  private members(): readonly string[] {
    const ids = this.hass?.states[this.config?.entity ?? '']?.attributes['entity_id'];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  }

  override getCardSize(): number {
    return this.config?.variant === 'compact' ? 2 : 4;
  }
  /**
   * Half a section is enough (two lamps on a line); a card asked to be compact starts there, and never goes under it:
   * in a third, the switch left its name no room.
   */
  override getGridOptions(): LovelaceGridOptions {
    return this.config?.variant === 'compact'
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** Shows `value` for five seconds — what the finger set — while Home Assistant catches up. */
  private pin(value: number): void {
    this.held = { value, expires: Date.now() + 5000 };
    clearTimeout(this.heldTimer);
    this.heldTimer = window.setTimeout(() => {
      this.held = null;
      this.requestUpdate();
    }, 5000);
    this.requestUpdate();
  }

  private send(value: number): void {
    if (value <= 0) this.call('light', 'turn_off');
    else this.call('light', 'turn_on', { brightness_pct: value });
  }

  /** From the ruler: the choice is final, send it now. */
  private setBrightness(value: number): void {
    this.pin(value);
    clearTimeout(this.sendTimer);
    this.send(value);
  }

  /** From the stepper: every tap counts from what is on screen, and a burst of taps is one call. */
  private stepBrightness(direction: 1 | -1): void {
    const next = Math.min(100, Math.max(0, this.level + direction));
    this.pin(next);
    clearTimeout(this.sendTimer);
    this.sendTimer = window.setTimeout(() => this.send(next), 650); // longer than the 530 ms before a held button starts repeating
  }

  /** A swatch or the hue ruler: the colour is held for five seconds, as a level is, and the bulb wakes to it. */
  private pickColour(choice: HeldColour, data: Record<string, unknown>): void {
    this.heldColour = { choice, expires: Date.now() + 5000 };
    clearTimeout(this.colourTimer);
    this.colourTimer = window.setTimeout(() => {
      this.heldColour = null;
      this.requestUpdate();
    }, 5000);
    this.expect(this.config?.entity ?? '', 'on');
    this.call('light', 'turn_on', data);
  }

  /** The colour controls' module, fetched once; its sheet adopted as it lands, and the card drawn again. */
  private loadColour(): void {
    if (this.colourAsked) return;
    this.colourAsked = true;
    void (colourModule ??= import('./colour.js')).then((module) => {
      if (this.renderRoot instanceof ShadowRoot) module.adopt(this.renderRoot);
      this.colour = module;
      this.requestUpdate();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.heldTimer);
    clearTimeout(this.sendTimer);
    clearTimeout(this.colourTimer);
  }

  private onInput(value: number): void {
    this.preview_ = value;
    if (!this.config?.live_update) return;
    const now = performance.now();
    if (now - this.lastSend > 200) {
      this.lastSend = now;
      this.setBrightness(value);
    }
  }

  /** The colour-temperature ruler under its label, warm to cool, inactive while the lamp is off. */
  private temperatureRuler(
    name: string,
    width: number,
    on: boolean,
    kelvin: number,
    minK: number,
    maxK: number,
    unusable: boolean,
    onFill: boolean,
  ): TemplateResult {
    // its label on one line: the short form where the column does not hold "Température de couleur" (half a section)
    const words = this.t('light.temperature');
    return html`${label(this.head.ruler.width('fv-label', words) <= width ? words : this.t('light.temperature_short'))}
      <fluvy-ruler
        .value=${kelvin}
        .min=${minK}
        .max=${maxK}
        .step=${50}
        .length=${width}
        tone="accent"
        .minor=${0.1}
        .major=${0.5}
        ?inactive=${!on}
        ?disabled=${unusable}
        ?on-fill=${onFill}
        .tint=${this.config?.temperature_tint === false ? '' : 'warm-cool'}
        unit="K"
        .label=${`${name} · ${this.t('light.temperature')}`}
        .format=${(v: number) => formatNumber(this.hass, v, { digits: 0 })}
        @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => this.call('light', 'turn_on', { color_temp_kelvin: e.detail.value })}
      ></fluvy-ruler>
      ${rulerLabels([
        [0, this.t('light.warm')],
        [1, this.t('light.cool')],
      ])}`;
  }

  /**
   * The full card's level and its stepper, laid out for the column from every figure it can show (100 %, the word for
   * off), never from the state (`fitValueRow`): beside, else the stepper centred under the level; the stepper stays,
   * still, while the lamp cannot be reached. Without it the readout is the card's tap.
   */
  private renderLevel(
    entityId: string,
    name: string,
    on: boolean,
    unusable: boolean,
    level: number,
  ): TemplateResult {
    const label = this.t('light.brightness');
    const off = this.t('common.off');
    const fit = fitValueRow(this.head.ruler, {
      width: this.contentWidth,
      control: this.config?.show_stepper === false ? 0 : STEPPER,
      narrow: STEPPER_HALVES,
      labels: [label],
      figures: [{ value: formatNumber(this.hass, 100, { digits: 0 }), unit: '%' }, { value: off }],
    });
    const lit = on || this.preview_ !== null;
    const value = unusable ? '—' : lit ? formatNumber(this.hass, level, { digits: 0 }) : off;
    const unit = unusable || !lit ? '' : '%';
    return html`<div class="sl-value ${valueRowClass(fit.layout)}">
      ${readout({ label, value, unit, size: fit.size })}
      ${
        fit.layout !== 'alone'
          ? stepper((d) => this.stepBrightness(d), {
              disabled: unusable,
              decrease: this.t('common.decrease'),
              increase: this.t('common.increase'),
            })
          : this.readoutTap(entityId, `${name} · ${label} ${value} ${unit}`)
      }
    </div>`;
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    // a light that cannot be read keeps the card's whole anatomy, still: its switch, its level ("—"), its rulers
    const unusable = !isUsable(view);
    const on = !unusable && (this.stateOf(view) === 'on' || (this.held?.value ?? 0) > 0);
    const modes = view.attr<string[]>('supported_color_modes') ?? [];
    // a light Home Assistant has not described (gone, or unavailable since it started) draws as a dimmer
    const dimmable = modes.some((m) => DIMMABLE.has(m)) || (unusable && !modes.length);
    const raw = view.attr<number | null>('brightness');
    const reported = on && typeof raw === 'number' ? Math.max(1, Math.round((raw / 255) * 100)) : 0;
    // released only by an exact match or by time: a ±1 tolerance would swallow every single-step change
    if (this.held && (this.held.value === reported || Date.now() > this.held.expires))
      this.held = null;
    const level = this.held ? this.held.value : reported;
    this.level = level;
    const shownLevel = this.preview_ ?? level;
    const w = this.contentWidth;
    const variant = this.config?.variant ?? 'auto';
    const compact = variant === 'compact' || (variant === 'auto' && w < COMPACT_BELOW);
    const win = this.window_?.fine ? this.window_ : null;
    // on the fine scale the labels are the major ticks themselves (whole values); the ones too close to an end are left out
    const ticks: [number, string][] = win
      ? win.marks
          .filter(([f]) => f > 0.06 && f < 0.94)
          .map(([f, v]) => [f, formatNumber(this.hass, v, { digits: 0 })])
      : compact || w < COMPACT_BELOW
        ? [
            [0, '0'],
            [0.5, '50'],
            [1, '100'],
          ]
        : [
            [0, '0'],
            [0.25, '25'],
            [0.5, '50'],
            [0.75, '75'],
            [1, '100'],
          ];
    // the compact head says the level where the full card has its big value ("On · 70 %")
    const state = stateText(this.hass, view);
    const figure = `${formatNumber(this.hass, shownLevel, { digits: 0 })} %`;
    const sub = compact
      ? on && dimmable
        ? `${state} · ${figure}`
        : state
      : (!unusable && view.areaName) || state;
    // where the state's words would not hold beside the switch (es "Encendida" in half a section), the line says the
    // level, or the state's one word ("Not found"), else keeps its place, empty (the switch says on or off) — never a
    // word cut; an area's name ends in its ellipsis, as names do
    const short =
      compact || sub === state
        ? [
            ...(compact && on && dimmable
              ? [figure]
              : unusable
                ? [stateWord(this.hass, view)]
                : []),
            '\u00a0',
          ]
        : [];

    // a colour bulb: its controls come with their module (the first colour bulb fetches it); until then, the white bulb's card
    const coloured = modes.some((m) => COLOURED.has(m)) && this.config?.show_color !== false;
    if (coloured && !this.colour) this.loadColour();
    const colour = coloured ? this.colour : undefined;
    const kelvin = view.attr<number | null>('color_temp_kelvin');
    const minK = view.attr<number>('min_color_temp_kelvin') ?? 2000;
    const maxK = view.attr<number>('max_color_temp_kelvin') ?? 6500;
    // the held colour lets go when the bulb reports it, or when its time is up
    if (
      this.heldColour &&
      (Date.now() > this.heldColour.expires ||
        this.colour?.reported(view, this.heldColour.choice, maxK - minK))
    )
      this.heldColour = null;
    const choice = this.heldColour?.choice ?? null;

    // its colour: the one it is given (a name, a hex; Primary: the palette's accent), else a tone it is given, else
    // the light's own — the finger's choice while held, what it glows (a group: its lit members', by brightness), the
    // colour it last glowed while a flip waits for Home Assistant — and, glowing none, the palette's lit light
    const own = this.accents.pick(this.config?.color);
    const tone: Tone = own ? 'accent' : (this.config?.tone ?? 'light');
    const live =
      own || this.config?.tone
        ? undefined
        : choice
          ? 'rgb' in choice
            ? hexOf(choice.rgb)
            : undefined
          : glowOf(
              view,
              on,
              this.config?.light_whites,
              this.members().map((id) => this.entity(id)),
            );
    // the icon, the switch and the rulers take it through the light-active family `data-accent` remaps
    const accent = live ? this.accents.item(live) : undefined;

    // its surface (`tint`): lit, a lit tile's whole fill or a wash as strong as asked; at rest (`always`) a quiet wash
    // where no `card_color` is; a light that cannot be read keeps the unavailable skin
    const tint = this.config?.tint ?? lightDefaults().tint;
    const strength = this.config?.tint_strength ?? 'full';
    // a word the card does not know is never lit
    const lit = on && (tint === 'on' || tint === 'always');
    const full = lit && strength === 'full';
    const source = live ?? (own && own !== PALETTE_ACCENT ? own : tone);
    const surface = lit
      ? full
        ? undefined
        : this.accents.lit(
            source,
            strength === 'soft' ? LIT_FLOOR : dimmable ? Math.max(LIT_FLOOR, shownLevel / 100) : 1,
          )
      : tint === 'always' && !unusable && !this.config?.card_color
        ? this.accents.lit(source, 0)
        : undefined;

    // the head fitted to its column round its switch: the sub steps aside, then the icon — never the switch (half
    // a phone's section leaves 136: the name and the switch, and the ruler under them)
    const fitted = this.head.fit({
      width: w,
      title: name,
      sub,
      shorter: short,
      trailing: SWITCH_SLOT,
    });
    const temperature =
      modes.includes('color_temp') && this.config?.show_temperature !== false
        ? () => this.temperatureRuler(name, w, on, kelvin ?? minK, minK, maxK, unusable, full)
        : undefined;

    return html`<article
      class="fv-card sl-card ${unusable ? 'is-unavailable is-off' : ''} ${compact ? 'sl-card--compact' : ''} ${full ? `is-lit fv-tone--${tone}` : lit && surface ? 'is-glow' : ''}"
      data-card
      data-accent=${accent ?? nothing}
      data-surface=${surface ?? nothing}
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
        small: fitted.small,
        tone: unusable ? 'off' : on ? tone : 'neutral',
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: toggle(
          on,
          tone,
          (next) => {
            this.expect(view.id, next ? 'on' : 'off');
            this.call('light', next ? 'turn_on' : 'turn_off');
          },
          name,
          unusable,
        ),
        cut: fitted.cut,
        ...this.headActions(view.id),
      })}
      ${
        dimmable
          ? html` ${compact ? nothing : this.renderLevel(view.id, name, on, unusable, shownLevel)}
              <div class="sl-bubble-row"></div>
              <fluvy-ruler
                .value=${level}
                .min=${0}
                .max=${100}
                .step=${1}
                .length=${w}
                .tone=${on ? tone : 'neutral'}
                ?disabled=${unusable}
                ?inactive=${!on}
                ?wake=${!unusable}
                ?on-fill=${full}
                unit="%"
                .label=${`${name} · ${this.t('light.brightness')}`}
                .format=${(v: number) => formatNumber(this.hass, v, { digits: 0 })}
                @fluvy-input=${(e: CustomEvent<RulerChangeDetail>) => this.onInput(e.detail.value)}
                @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => {
                  this.preview_ = null;
                  this.setBrightness(e.detail.value);
                }}
                @fluvy-window=${(e: CustomEvent<RulerWindowDetail>) => {
                  this.window_ = e.detail;
                }}
              ></fluvy-ruler>
              ${rulerLabels(ticks)}`
          : nothing
      }
      ${
        // the compact layout asked for keeps the head and the ruler; one of a colour bulb by its width (a zoomed phone)
        // keeps a row of its quick colours too
        variant === 'compact'
          ? nothing
          : colour
            ? colour.colourControls({
                view,
                t: (key) => this.t(key),
                name,
                width: w,
                on,
                held: choice,
                colors: this.config?.colors,
                minK,
                maxK,
                format: (v) => formatNumber(this.hass, v, { digits: 0 }),
                temperature,
                disabled: unusable,
                onFill: full,
                row: compact,
                host: this,
                pick: (picked, data) => this.pickColour(picked, data),
              })
            : compact
              ? nothing
              : (temperature?.() ?? nothing)
      }
    </article>`;
  }
}
