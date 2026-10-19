import {
  actionRuns,
  formatNumber,
  isActive,
  isUsable,
  lightDefaults,
  relativeTime,
  stateText,
  TOGGLE_DOMAINS,
  toggleEntity,
  valueParts,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import {
  ico,
  pressCover,
  readout,
  type RulerChangeDetail,
  sheetStyles,
  textWidth,
  toggle,
  type Tone,
} from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { Card } from '../shared/base.js';

import { currentTone, glyphFor, toneFor } from '../shared/domain.js';
import { DIMMABLE, glowOf } from '../shared/light.js';
import { fitLine, TextRuler } from '../shared/fit.js';
import { FontsSettled } from '../shared/fonts.js';

import {
  actionFields,
  boolField,
  colourFields,
  entitiesField,
  entityField,
  formLabels,
  nameIconFields,
  selectField,
  tintField,
} from '../shared/form.js';
import { statusToneOf, type LightColours, type Tint } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

export type TileSize = 'large' | 'compact' | 'mini';
export const TILE_SIZES: readonly TileSize[] = ['large', 'compact', 'mini'];

/** One tile's own settings — the single card's config, or one item of a tiles group. */
export interface TileItem {
  entity: string;
  name?: string;
  icon?: string;
  tone?: Tone;
  /** The tile's own colour (a Home Assistant colour name or `#rrggbb`): the accent inside it. */
  color?: string;
  /** Entities shown as small readouts in the foot of a large tile (a plug's power, its energy today, its cost): two, or three when the tile is wide; the first one joins the state line of a small tile. */
  readouts?: readonly string[];
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
}

export interface TileCardConfig extends FluvyCardConfig, LightColours, Omit<TileItem, 'entity'> {
  /** `large` (default): icon + switch, name, state and a foot. `compact`: one 76 px row. `mini`: icon over name, 108 px. */
  size?: TileSize;
  /** `always`: a tile shows its colour at rest too — a wash of it and its hairline (`on`, the default: only when on). */
  tint?: Tint;
}

const COVER_SET_POSITION = 4;
const FAN_SET_SPEED = 1;
const MORE_INFO: ActionConfig = { action: 'more-info' };
const TOGGLE: ActionConfig = { action: 'toggle' };
/** A large tile's head holds its icon circle, 8 of air and the switch; a narrower tile's circle is the switch. */
const HEAD_ROOM = 44 + 8 + 48;
/** Two readouts share a foot from this inner width; under it the first one has the foot to itself. */
const TWO_READOUTS = 120;
/** Three readouts (power, today, cost) share a foot from this inner width: a tile on its own row. */
const THREE_READOUTS = 292;

/**
 * The tile. Large (172 × 168): icon circle + switch, name, state, and a foot that is either a compact
 * ruler (brightness, cover position, fan speed) or two small readouts. Compact (76 tall) and mini
 * (108 tall, icon over name) are the same tile without the switch: the whole surface toggles on tap
 * and opens the details on hold — the Mushroom-sized buttons people group in pairs and threes. A large tile's
 * surface taps and holds the same, through a button stretched under its switch and ruler (never around them).
 * Active = the tone's pastel fill in every size; unavailable = the off skin on the same anatomy, at the same size.
 */
export class FluvyTileCard extends Card<TileCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: TileCardConfig): number {
    return config.size === 'compact' || config.size === 'mini' ? 76 : 168;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.home,
    css`
      .fv-tile {
        display: block;
        height: 168px;
        text-align: left;
      }
      .fv-tile > fluvy-ruler {
        margin-top: -4px;
      }
      .fv-tile__foot {
        grid-template-columns: minmax(0, 46%) minmax(0, 54%);
      }
      .fv-tile__foot--three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .fv-tile__foot--one {
        grid-template-columns: minmax(0, 1fr);
      }
      /* a foot under the state line: a name that would end in an ellipsis steps down to 14 px first (as the compact tiles' does) */
      .fv-tile--tight .fv-tile__name {
        font-size: 14px;
      }
      /* nothing under the state line: the name may take the foot's room, two balanced lines, before an ellipsis */
      .fv-tile--footless .fv-tile__name {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
        text-wrap: balance;
      }
      /* an unavailable large tile is the live one in the off skin: its name keeps its place under the head */
      .fv-tile--off > .fv-tile__name {
        margin-top: 12px;
      }
      .fv-tile--compact {
        display: flex;
        height: 76px;
      }
      /* a compact tile inside a card (a room's controls) is 84 tall: the sheet's rule, which the line above would
         otherwise override */
      .fv-tile--compact.fv-tile--inner {
        height: 84px;
      }
      .fv-tile--mini {
        display: flex;
        height: 108px;
        text-align: center;
      }
      .fv-tile__body {
        display: block;
        cursor: pointer;
      }
    `,
  ];

  static override keys = configKeys<TileCardConfig>()(['size', 'readouts', 'tint', 'light_colors']);
  static override defaults: EditorDefaults = () => ({
    size: 'large',
    tint: 'on',
    light_colors: lightDefaults().colors,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(),
        nameIconFields(),
        selectField('size', TILE_SIZES),
        ...colourFields(),
        tintField(),
        boolField('light_colors'),
        entitiesField('readouts', ['sensor']),
        actionFields(),
      ],
      ...formLabels({ readouts: 'editor.readouts' }),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): TileCardConfig {
    const entity =
      entities.find((id) => /^(light|switch|cover|fan)\./.test(id)) ?? entities[0] ?? '';
    return { type: 'custom:fluvy-tile-card', entity };
  }

  protected override prepare(config: TileCardConfig): TileCardConfig {
    if (!config.entity) throw new Error('fluvy-tile-card: "entity" is required');
    return config;
  }

  override getCardSize(): number {
    return this.size() === 'large' ? 3 : 1;
  }

  override getGridOptions(): LovelaceGridOptions {
    switch (this.size()) {
      case 'mini':
        return { columns: 3, rows: 'auto', min_columns: 3 };
      case 'compact':
        return { columns: 6, rows: 'auto', min_columns: 4 };
      default:
        return { columns: 6, rows: 'auto', min_columns: 6 };
    }
  }

  protected size(): TileSize {
    const size = this.config?.size;
    return size && TILE_SIZES.includes(size) ? size : 'large';
  }

  protected override watched(): readonly string[] {
    return [this.config?.entity ?? '', ...(this.config?.readouts ?? [])];
  }

  /** What the foot ruler controls for this entity, if anything. */
  private level(
    view: EntityView,
  ): { value: number; commit: (value: number) => void; label: string } | null {
    if (view.domain === 'light') {
      const modes = view.attr<string[]>('supported_color_modes') ?? [];
      if (!modes.some((m) => DIMMABLE.has(m))) return null;
      const brightness = view.attr<number>('brightness');
      return {
        value: brightness ? Math.round((brightness / 255) * 100) : 0,
        commit: (v) => this.call('light', 'turn_on', { brightness_pct: v }, view.id),
        label: this.t('light.brightness'),
      };
    }
    if (view.domain === 'cover' && view.supports(COVER_SET_POSITION)) {
      return {
        value: view.attr<number>('current_position') ?? 0,
        commit: (v) => this.call('cover', 'set_cover_position', { position: v }, view.id),
        label: this.t('cover.position'),
      };
    }
    if (view.domain === 'fan' && view.supports(FAN_SET_SPEED)) {
      return {
        value: view.attr<number>('percentage') ?? 0,
        commit: (v) => this.call('fan', 'set_percentage', { percentage: v }, view.id),
        label: this.t('fan.speed'),
      };
    }
    return null;
  }

  /**
   * The line under the name. State is said once: when the head already shows the reading (a sensor
   * on a large tile), this line carries context — the room, or when it last moved — never the same
   * figure again. A small tile has no head figure, so there the reading IS the line.
   */
  private stateLine(
    view: EntityView,
    on: boolean,
    level: number | null,
    valueInHead: boolean,
    small = false,
  ): string {
    if (view.status !== 'ok') {
      // a small tile has room for the word, not for "· 16 h ago" as well
      const since =
        view.stateObj && !small
          ? ` · ${relativeTime(this.hass, new Date(view.stateObj.last_changed))}`
          : '';
      return `${stateText(this.hass, view)}${since}`;
    }
    if (valueInHead) {
      if (view.areaName) return view.areaName;
      return view.stateObj ? relativeTime(this.hass, new Date(view.stateObj.last_changed)) : '';
    }
    const text = stateText(this.hass, view);
    return on && level !== null && level > 0
      ? `${text} · ${formatNumber(this.hass, level, { digits: 0 })} %`
      : text;
  }

  /** Widths laid out by the browser in the tile's own classes (a mini's 12 px, a compact's 13), never guessed. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);

  constructor() {
    super();
    // a web font arriving changes every width: measure afresh and lay the small tiles out again
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  /**
   * A tile's state line fitted to its tile: what does not fit loses its " · " segments from the end (a large tile's
   * "· 11 days ago", a small one's reading); a word that cannot fit at all is a dash on a tile without a reading
   * (unavailable, unknown) and nothing on one with — never a cut. The room is the tile's width less its sides (16 on a
   * large or compact tile, 12 on a mini, or what a narrower mini can spare around its 44 circle) and, where the line
   * sits beside the circle (a large tile's off skin, a compact one 128 or wider, an inner one 136 or wider), the circle
   * and its gap. `under`: the line sits under the head (a live large tile: "On · 70 %" over its ruler) and has the
   * whole width.
   */
  private fitState(
    line: string,
    size: TileSize,
    dash: boolean,
    inside = false,
    under = false,
  ): string {
    const width = Math.floor(this.tileWidth());
    const small = size !== 'large';
    const mini = size === 'mini';
    const sides = mini ? (width < 68 ? Math.max(8, Math.floor((width - 44) / 2)) : 12) : 16;
    // a compact tile under 128 (an inner one under 136) hides its circle (tiles.css) and gives the words its room
    const beside =
      !mini && !under && (size === 'large' || width >= (inside ? 136 : 128)) ? 44 + 12 : 0;
    const room = width - 2 * sides - beside;
    const cls = small ? `fv-tile fv-tile--${size} > fv-tile__state` : 'fv-tile > fv-tile__state';
    const measure = (text: string): number => this.ruler.width(cls, text);
    const fitted = fitLine(
      line.split(' · ').map((text, index) => ({ text, optional: index > 0 })),
      room,
      measure,
    );
    if (fitted && measure(fitted) <= room) return fitted;
    return dash ? '—' : '';
  }

  /** The reading of the first readout ("142 W"), for a small tile's state line. */
  private readoutText(item: TileItem): string {
    const id = item.readouts?.[0];
    if (!id) return '';
    const view = this.entity(id);
    if (view.status !== 'ok') return '';
    const parts = valueParts(this.hass, view);
    return parts.unit ? `${parts.value} ${parts.unit}` : parts.value;
  }

  private flip(view: EntityView, next: boolean): void {
    if (!this.hass) return;
    this.expect(
      view.id,
      next
        ? view.domain === 'cover'
          ? 'open'
          : view.domain === 'lock'
            ? 'unlocked'
            : 'on'
        : view.domain === 'cover'
          ? 'closed'
          : view.domain === 'lock'
            ? 'locked'
            : 'off',
    );
    void toggleEntity(this.hass, view.id);
  }

  /**
   * Runs a tile action; a toggle goes through the optimistic flip so the fill answers under the finger — unless it
   * is to be asked about first: then nothing moves before the answer.
   */
  private act(view: EntityView, on: boolean, action: ActionConfig): void {
    if (action.action === 'toggle' && !action.entity && !action.confirmation) this.flip(view, !on);
    else this.tap(view.id, action);
  }

  protected renderCard(): TemplateResult {
    const config = this.config as TileCardConfig & { entity: string };
    return this.renderTile(config, this.size());
  }

  /**
   * The colour a lit light's tile wears (`light_colors`, 1.9; the house's choice where the card says none): its bulb's
   * — unless the tile, or the card, has a colour or a tone of its own, which it keeps.
   */
  protected glow(item: TileItem, view: EntityView, on: boolean): string | undefined {
    const config = this.config;
    if (view.domain !== 'light' || item.color || item.tone || config?.color || config?.tone)
      return undefined;
    return (config?.light_colors ?? lightDefaults().colors) ? glowOf(view, on) : undefined;
  }

  /** The width one tile gets: the card's own (a tiles group divides its width). */
  protected tileWidth(): number {
    return this.width;
  }

  /** Whether the name reads whole at the large tile's 16/600 (2 px of margin for a fallback face). */
  private nameFits(name: string): boolean {
    const family = getComputedStyle(this).fontFamily;
    return textWidth(name, `600 16px ${family}`) <= this.tileWidth() - 32 - 2;
  }

  /**
   * One tile of the given size — the single card, or each item of a tiles group. `inside`: the tile sits inside a
   * card (a room's controls): an inner tile, 84 tall, the control radius, page fill, no hairline.
   */
  protected renderTile(item: TileItem, size: TileSize, inside = false): TemplateResult {
    const view = this.entity(item.entity);
    const name = item.name ?? view.name;
    const glyph = item.icon ?? glyphFor(view);
    const small = size !== 'large';
    const sizeClass = small ? ` fv-tile--${size}${inside ? ' fv-tile--inner' : ''}` : '';

    // a missing or unreachable entity wears the off skin on the live tile's own anatomy and size — the ban circle, the
    // name, its state line, a dash in every reading, a switch that does not move: only the colours change, so it never
    // stands shorter than its neighbours. An unknown one is a live tile whose word is "Unknown".
    const usable = isUsable(view);
    const state = this.stateOf(view);
    const on =
      usable &&
      (state === view.state
        ? isActive(view)
        : !['off', 'closed', 'locked', 'idle', 'docked', 'paused'].includes(state));
    const tone = statusToneOf(item, toneFor(view));
    // a grouped tile's own colour sits on its article (the lone card's is the card's, written by the base), and a lit
    // light's bulb's where it has none
    const glow = usable ? this.glow(item, view, on) : undefined;
    const accent = this.accents.item(item === this.config ? glow : item.color || glow);
    const level = this.level(view);
    const canToggle = TOGGLE_DOMAINS.has(view.domain);
    const sensorLike = view.domain === 'sensor' || view.domain === 'binary_sensor' || !canToggle;
    const iconTone =
      currentTone(view, on ? tone : 'accent') === 'neutral' ? 'accent' : on ? tone : 'accent';
    // a coloured tile keeps its colour at rest when the card asks (`tint: always`): its rest wash and the fill's hairline
    const tinted =
      usable && this.config?.tint === 'always' && item.color && !on ? ' is-tinted' : '';
    const classes = usable
      ? `fv-tile fv-tile--${tone} fv-tile--tap${sizeClass}${tinted} ${on ? 'is-on' : ''}`
      : `fv-tile fv-tile--off fv-tile--tap${sizeClass}`;
    // what cannot be read cannot be switched: its tap opens the details, its toggle (if asked) goes to Home Assistant
    const run = (action: ActionConfig): void =>
      usable ? this.act(view, on, action) : this.tap(view.id, action);
    const holdAction = item.hold_action ?? MORE_INFO;
    const holdNow = actionRuns(holdAction, view.id) ? () => run(holdAction) : undefined;

    if (small) {
      // the whole tile is the button (laid over it): tap toggles what toggles (opens what does not), hold opens the
      // details
      const tapAction = item.tap_action ?? (usable && canToggle ? TOGGLE : MORE_INFO);
      const tapNow = (): void => run(tapAction);
      let line = this.stateLine(view, on, level ? level.value : null, false, true);
      const reading = usable ? this.readoutText(item) : '';
      if (reading) line = `${line} · ${reading}`;
      line = this.fitState(line, size, !usable, inside);
      return html`<article class=${classes} data-card data-accent=${(usable && accent) || nothing}>
        ${usable ? ico(glyph, iconTone) : ico('ban', 'off')}
        <div class="fv-tile__text">
          <h3 class="fv-tile__name">${name}</h3>
          <p class="fv-tile__state">${line}</p>
        </div>
        ${pressCover(name, tapNow, holdNow)}
      </article>`;
    }

    // everything in a large tile is drawn to its inner width (its own less 16 px sides): a tile squeezed narrow
    // folds its switch into the icon circle, gives its value to the state line, keeps one readout
    const inner = Math.floor(this.tileWidth()) - 32;
    const family = getComputedStyle(this).fontFamily;
    const parts = sensorLike ? valueParts(this.hass, view) : null;
    const valueInHead =
      parts !== null &&
      44 + 8 + textWidth(`${parts.value} ${parts.unit}`.trim(), `600 16px ${family}`) <= inner;
    const switchApart = canToggle && inner >= HEAD_ROOM;
    const flip = (event: Event): void => {
      event.stopPropagation();
      this.flip(view, !on);
    };
    const lead = !usable
      ? ico('ban', 'off')
      : canToggle && !switchApart
        ? ico(glyph, iconTone, { onTap: flip, label: name, checked: on })
        : ico(glyph, iconTone);
    const trailing = switchApart
      ? toggle(on, tone, (next) => this.flip(view, next), name, !usable)
      : parts && valueInHead
        ? html`<span class="fv-tile__value"
            >${parts.value}${parts.unit ? html` <span class="fv-unit">${parts.unit}</span>` : nothing}</span
          >`
        : nothing;

    let foot: TemplateResult | typeof nothing = nothing;
    if (level) {
      foot = html`<fluvy-ruler
        class=${on ? '' : 'fv-ruler--off'}
        ?on-fill=${on}
        .value=${on ? level.value : 0}
        .min=${0}
        .max=${100}
        .step=${1}
        .length=${Math.max(24, inner)}
        .knob=${28}
        .minor=${1 / 12}
        .major=${1 / 4}
        .tone=${on ? tone : 'neutral'}
        ?inactive=${!on}
        ?wake=${usable}
        ?inert=${!usable}
        unit="%"
        .label=${`${name} · ${level.label}`}
        .format=${(v: number) => formatNumber(this.hass, v, { digits: 0 })}
        @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => level.commit(e.detail.value)}
      ></fluvy-ruler>`;
    } else if (item.readouts?.length) {
      const stats = item.readouts.map((id) => {
        const r = this.entity(id);
        const p = valueParts(this.hass, r);
        const short =
          r.deviceClass === 'power'
            ? this.t('energy.power')
            : r.deviceClass === 'energy'
              ? this.t('energy.today')
              : r.deviceClass === 'monetary'
                ? this.t('energy.cost')
                : r.name.replace(name, '').trim() || r.name;
        return { label: short, value: p.value, unit: p.unit };
      });
      // two share the foot as 46 % and 54 % (64 and 76 in a 172 tile), three equal thirds, while every label and every
      // reading holds its cell (fr's "PUISSANCE" and "AUJOURD'HUI" do not on a phone, de's "LEISTUNG" and a "0.8 kWh"
      // not in half a section): else the first has the foot to itself
      const cells = (n: number): number[] =>
        n === 2 ? [inner * 0.46, inner * 0.54] : Array<number>(n).fill(inner / n);
      const holds = (n: number): boolean =>
        stats.slice(0, n).every(({ label, value, unit }, i) => {
          const cell = cells(n)[i] ?? 0;
          return (
            this.ruler.width('fv-readout__label', label) <= cell &&
            this.ruler.width(
              'fv-readout fv-readout--xs > fv-readout__value',
              value,
              'fv-unit',
              unit,
            ) <= cell
          );
        });
      const shown = Math.min(
        stats.length,
        inner >= THREE_READOUTS && holds(3) ? 3 : inner >= TWO_READOUTS && holds(2) ? 2 : 1,
      );
      foot = html`<div
        class="fv-tile__foot ${shown === 1 ? 'fv-tile__foot--one' : shown === 3 ? 'fv-tile__foot--three' : ''}"
      >
        ${stats.slice(0, shown).map((stat) => readout({ ...stat, size: 'xs' }))}
      </div>`;
    }

    // the tile's button is laid over it, under its controls (the switch, a circle that is one, the ruler): a tap runs
    // the tap action, a still press the hold action — never a switch inside a button
    const tapAction = item.tap_action ?? MORE_INFO;
    const tapNow = actionRuns(tapAction, view.id) ? () => this.tap(view.id, tapAction) : undefined;
    return html`<article
      class=${`${classes}${foot === nothing ? ' fv-tile--footless' : this.nameFits(name) ? '' : ' fv-tile--tight'}`}
      data-card
      data-accent=${(usable && accent) || nothing}
    >
      <div class="fv-tile__head">${lead}${trailing}</div>
      <h3 class="fv-tile__name">${name}</h3>
      <p class="fv-tile__state">
        ${this.fitState(
          this.stateLine(view, on, level ? level.value : null, valueInHead),
          size,
          !usable,
          inside,
          true,
        )}
      </p>
      ${foot} ${tapNow || holdNow ? pressCover(name, tapNow, holdNow) : nothing}
    </article>`;
  }
}
