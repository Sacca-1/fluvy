import { coverClassLabel } from './class-label.js';
import {
  formatNumber,
  isUsable,
  numberAttr,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import {
  actions,
  clamp,
  head,
  label,
  readout,
  sheetStyles,
  stepper,
  type ActionItem,
  type ChipItem,
  type GlyphName,
  type RulerChangeDetail,
  type RulerWindowDetail,
  type Tone,
} from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { Card } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  nameIconFields,
  numberField,
  selectField,
  textField,
} from '../shared/form.js';
import {
  actionGap,
  actionsThatFit,
  Burst,
  headSub,
  Hold,
  motionStyles,
  releasePresses,
  shownStateText,
  StableTemplate,
} from './common.js';
import { configKeys, ITEM_ALIASES, type AliasSpec, type RowStyle } from '../shared/config.js';
import { chipRow } from '../shared/chips.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { HeadFit } from '../energy/head.js';
import { COMPACT, listLength } from '../shared/heights.js';

const coverStrings = strings('cover');

/** One saved place for a cover: "Morning · 60 %". `position` and `tilt` are percentages, 100 = open. */
export interface CoverFavorite {
  name?: string;
  position?: number;
  tilt?: number;
}

/** `full` (default): the position ruler, tilt, the actions and the favourites. `compact`: the head and the actions. */
export type CoverVariant = 'full' | 'compact';

export interface CoverCardConfig extends FluvyCardConfig {
  subtitle?: string;
  variant?: CoverVariant;
  favorites?: readonly CoverFavorite[];
  /** Favourites as chips filling the row (default) or content-sized. */
  favorites_style?: RowStyle;
  show_tilt?: boolean;
  show_favorites?: boolean;
  /** The slats' angle at 100 % tilt. When set, tilt reads and steps in degrees (15°) instead of percent. */
  tilt_angle?: number;
}

/* cover / valve supported_features */
const OPEN = 1;
const CLOSE = 2;
const SET_POSITION = 4;
const STOP = 8;
const OPEN_TILT = 16;
const CLOSE_TILT = 32;
const SET_TILT_POSITION = 128;

/** Device classes that read better with their own glyph than with the blinds. */
const CLASS_GLYPH: Record<string, GlyphName> = {
  garage: 'car',
  door: 'door',
  gate: 'door',
  damper: 'fan',
};

/** The ruler column (56 labels + 8 + 44 band) and the 24 gap: what the side column does not get. */
const RULER_COLUMN = 132;

type Percent = number | null;

/** Positions are whole percents; a device that answers 59 for 60 has arrived. */
const near = (a: Percent, b: Percent): boolean => a !== null && b !== null && Math.abs(a - b) <= 1;

const percentAttr = (view: EntityView, key: string): Percent => {
  const value = numberAttr(view, key);
  return value === null ? null : clamp(Math.round(value), 0, 100);
};

/**
 * Blinds, shades, garage doors, gates — and valves, which Home Assistant models the same way.
 * The vertical ruler is the position (open at the top, closed at the bottom), the side column
 * carries the two numbers, and the open / stop / close row runs the full width under them.
 *
 * A blind takes its time: the knob and the number hold the position that was asked for while the
 * cover says it is travelling, instead of snapping back to where the motor happens to be.
 */
export class FluvyCoverCard extends Card<CoverCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: CoverCardConfig): number {
    if (config.variant === 'compact') return COMPACT;
    const favorites = config.show_favorites !== false && listLength(config, ['favorites']) ? 88 : 0;
    return 328 + favorites;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    motionStyles,
    css`
      /* the sheet drew 65 %: at 0 % and 100 % the 36 px knob needs 18 px past the scale's ends, clear of the head and of the action row */
      .dv-cover {
        margin-top: 24px;
        margin-bottom: 8px;
      }
      /* narrow column: the tilt stepper drops under its readout instead of crowding the value */
      .dv-cover--tight .dv-cover__side {
        gap: 8px;
      }
      .dv-cover--tight .dv-cover__tilt {
        display: block;
        height: auto;
      }
      .dv-cover--tight .dv-cover__tilt .fv-stepper {
        margin-top: 8px;
      }
      .dv-cover--narrow {
        gap: 16px;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    dragged: { state: true },
    fine: { state: true },
  };

  /** Position under the finger while the ruler is being dragged. */
  declare dragged: Percent;
  /** The tenth of the range the ruler shows while its fine scale is up: the end labels become numbers. */
  declare fine: RulerWindowDetail | null;

  private travelling = false;
  private readonly target = new Hold<Percent>(this, () => this.travelling);
  private readonly tiltHold = new Hold<Percent>(this);
  private readonly tiltBurst = new Burst();
  private readonly tiltStepper = new StableTemplate(this);

  constructor() {
    super();
    this.dragged = null;
    this.fine = null;
  }

  static override keys = configKeys<CoverCardConfig>()([
    'subtitle',
    'variant',
    'favorites',
    'favorites_style',
    'show_tilt',
    'show_favorites',
    'tilt_angle',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'favorites',
      idKey: 'name',
      title: 'editor.favorites',
      keys: ['name', 'position', 'tilt'],
      schema: [
        textField('name'),
        fieldRow(numberField('position', 0, 100), numberField('tilt', 0, 100)),
      ],
    },
  ];
  static override aliases: AliasSpec = { items: { favorites: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'full',
    favorites_style: 'full',
    show_tilt: true,
    show_favorites: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['cover', 'valve']),
        nameIconFields(),
        fieldRow(textField('subtitle'), numberField('tilt_angle', 0, 360)),
        fieldRow(
          selectField('variant', ['full', 'compact']),
          selectField('favorites_style', ['full', 'chips']),
        ),
        fieldRow(boolField('show_tilt'), boolField('show_favorites')),
        { name: 'favorites', selector: { object: {} } },
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(coverStrings, { tilt_angle: 'tilt_angle' }, {}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): CoverCardConfig {
    return {
      type: 'custom:fluvy-cover-card',
      entity: entities.find((id) => /^(cover|valve)\./.test(id)) ?? '',
    };
  }

  protected override prepare(config: CoverCardConfig): CoverCardConfig {
    if (!config.entity) throw new Error('fluvy-cover-card: "entity" is required');
    if (config.favorites !== undefined && !Array.isArray(config.favorites))
      throw new Error('fluvy-cover-card: "favorites" must be a list of { name, position, tilt }');
    return config;
  }

  private readonly head = new HeadFit(this);

  private get compact(): boolean {
    return this.config?.variant === 'compact';
  }

  override getCardSize(): number {
    if (this.compact) return 3;
    const view = this.entity();
    return 3 + (view.supports(SET_POSITION) ? 4 : 0) + (this.favoritesFor(view).length ? 2 : 0);
  }

  /** The full card needs its ruler's width; the compact one — the head and the actions — half a section at least. */
  override getGridOptions(): LovelaceGridOptions {
    return this.compact
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 8 };
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    releasePresses(this.renderRoot);
    this.tiltBurst.flush();
    this.target.clear();
    this.tiltHold.clear();
  }

  /** The favourites this cover can actually reach: a position needs SET_POSITION, a tilt needs SET_TILT_POSITION. */
  private favoritesFor(view: EntityView): readonly CoverFavorite[] {
    const position = view.supports(SET_POSITION);
    const tilt = view.domain === 'cover' && view.supports(SET_TILT_POSITION);
    return (this.config?.favorites ?? []).filter(
      (f) =>
        f !== null &&
        typeof f === 'object' &&
        ((position && typeof f.position === 'number') || (tilt && typeof f.tilt === 'number')),
    );
  }

  /** Degrees at 100 % tilt, or 0 when tilt reads in percent. */
  private get tiltAngle(): number {
    const angle = this.config?.tilt_angle;
    return typeof angle === 'number' && angle > 0 ? angle : 0;
  }

  private tiltOf(view: EntityView): Percent {
    return this.tiltHold.read(percentAttr(view, 'current_tilt_position'), near);
  }

  private command(view: EntityView, key: string): void {
    const valve = view.domain === 'valve';
    const positioned =
      view.supports(SET_POSITION) && percentAttr(view, 'current_position') !== null;
    if (key === 'stop') {
      this.target.clear();
      this.expect(view.id, view.state); // drops an "Opening" we were still expecting
      this.call(view.domain, valve ? 'stop_valve' : 'stop_cover');
      return;
    }
    const open = key === 'open';
    if (positioned) this.target.set(open ? 100 : 0);
    this.expect(view.id, open ? 'opening' : 'closing');
    this.call(
      view.domain,
      valve ? (open ? 'open_valve' : 'close_valve') : open ? 'open_cover' : 'close_cover',
    );
  }

  private moveTo(view: EntityView, position: number): void {
    const value = clamp(Math.round(position), 0, 100);
    this.dragged = null;
    this.target.set(value);
    this.expect(view.id, view.state); // a new destination: drops an "Opening" still expected from the row
    this.call(view.domain, view.domain === 'valve' ? 'set_valve_position' : 'set_cover_position', {
      position: value,
    });
  }

  /** One step of the tilt stepper: 10 % at a time, or 5° when the card reads in degrees. Quick steps make one call. */
  private stepTilt(direction: 1 | -1): void {
    const view = this.entity();
    if (view.status === 'unavailable' || view.status === 'missing') return;
    if (!view.supports(SET_TILT_POSITION)) {
      this.call('cover', direction > 0 ? 'open_cover_tilt' : 'close_cover_tilt');
      return;
    }
    const angle = this.tiltAngle;
    const perPercent = angle ? angle / 100 : 1;
    const grid = angle ? 5 : 10;
    const shown = Math.round((this.tiltOf(view) ?? 0) * perPercent);
    const next =
      direction > 0
        ? Math.floor(shown / grid) * grid + grid
        : Math.ceil(shown / grid) * grid - grid;
    const tilt = clamp(Math.round(next / perPercent), 0, 100);
    this.tiltHold.set(tilt);
    this.tiltBurst.push(() =>
      this.call('cover', 'set_cover_tilt_position', { tilt_position: tilt }),
    );
  }

  private applyFavorite(view: EntityView, favorite: CoverFavorite): void {
    if (typeof favorite.position === 'number' && view.supports(SET_POSITION))
      this.moveTo(view, favorite.position);
    if (typeof favorite.tilt === 'number' && view.supports(SET_TILT_POSITION)) {
      const tilt = clamp(Math.round(favorite.tilt), 0, 100);
      this.tiltHold.set(tilt);
      this.call('cover', 'set_cover_tilt_position', { tilt_position: tilt });
    }
  }

  private percent(value: number): string {
    return `${formatNumber(this.hass, value, { digits: 0 })} %`;
  }

  /** "Morning · 60 %", "Night · closed", or just "60 %" when the favourite has no name. */
  private favoriteLabel(favorite: CoverFavorite): string {
    const position = favorite.position;
    const value =
      typeof position === 'number'
        ? position >= 100
          ? this.t('common.open')
          : position <= 0
            ? this.t('common.closed')
            : this.percent(position)
        : `${this.t('cover.tilt')} ${this.percent(favorite.tilt ?? 0)}`;
    return favorite.name ? `${favorite.name} · ${value.toLowerCase()}` : value;
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (view.status === 'missing')
      return this.renderEmpty(`${name} · ${stateText(this.hass, view)}`);

    const valve = view.domain === 'valve';
    const unusable = !isUsable(view);
    const compact = this.compact;
    const reported = percentAttr(view, 'current_position');
    // Home Assistant's own rule for the ends: the position when there is one, the state otherwise
    const fullyOpen = reported !== null ? reported >= 100 : view.state === 'open';
    const fullyClosed = reported !== null ? reported <= 0 : view.state === 'closed';
    // the travel is over once the cover says so, even if the "Opening" we expected never came
    const expected = this.stateOf(view);
    const shown =
      (expected === 'opening' && fullyOpen) || (expected === 'closing' && fullyClosed)
        ? view.state
        : expected;
    const moving = shown === 'opening' || shown === 'closing';
    this.travelling = moving;

    const position = reported === null ? null : (this.dragged ?? this.target.read(reported, near));
    const tilt = this.tiltOf(view);
    const open = view.status === 'ok' && (position !== null ? position > 0 : shown !== 'closed');
    const active: Tone = valve ? 'water' : 'accent';
    const tone: Tone = unusable ? 'off' : open || moving ? active : 'neutral';

    const canPosition = view.supports(SET_POSITION);
    const canTilt =
      !valve &&
      (view.supports(SET_TILT_POSITION) || view.supports(OPEN_TILT) || view.supports(CLOSE_TILT));
    const showTilt =
      !valve && !compact && this.config?.show_tilt !== false && (canTilt || tilt !== null);
    const tight = canPosition && showTilt && this.contentWidth - RULER_COLUMN < 180; // the stepper drops under its readout
    // the 24 gap between the ruler column and the readouts closes to 16 where the 96 stepper would not fit beside it
    const narrow = canPosition && showTilt && this.contentWidth < RULER_COLUMN + 96;

    // a cover whose state is only assumed (one-way radio) keeps both directions live, as Home Assistant does
    const assumed = view.attr<boolean>('assumed_state') === true;
    const row: ActionItem[] = [];
    if (view.supports(OPEN))
      row.push({
        key: 'open',
        glyph: 'up',
        label: this.t('cover.open'),
        disabled: unusable || (!assumed && (fullyOpen || shown === 'opening')),
      });
    if (view.supports(STOP))
      row.push({ key: 'stop', glyph: 'stop', label: this.t('cover.stop'), disabled: unusable });
    if (view.supports(CLOSE))
      row.push({
        key: 'close',
        glyph: 'down',
        label: this.t('cover.close'),
        disabled: unusable || (!assumed && (fullyClosed || shown === 'closing')),
      });

    const favorites =
      compact || this.config?.show_favorites === false ? [] : this.favoritesFor(view);
    // a compact card narrower than three cells keeps open and close (stop steps aside); one too narrow for
    // those keeps its head alone — the card's real width decides, not the drawing floor
    if (compact) {
      const fit = actionsThatFit(this.contentWidth);
      if (row.length > fit && row.some((item) => item.key === 'stop'))
        row.splice(
          row.findIndex((item) => item.key === 'stop'),
          1,
        );
      if (row.length > fit) row.splice(fit);
    }
    const chipItems: ChipItem[] = favorites.map((favorite, index) => ({
      key: String(index),
      label: this.favoriteLabel(favorite),
      active:
        !unusable &&
        (typeof favorite.position !== 'number' || near(position, Math.round(favorite.position))) &&
        (typeof favorite.tilt !== 'number' || near(tilt, Math.round(favorite.tilt))),
    }));

    const fine = this.fine;
    const angle = this.tiltAngle;
    const tiltReadout = (size: 'm' | 'l'): TemplateResult =>
      readout({
        label: this.t('cover.tilt'),
        size,
        value:
          tilt === null
            ? '—'
            : formatNumber(this.hass, angle ? (tilt * angle) / 100 : tilt, { digits: 0 }),
        unit: tilt === null ? '' : angle ? '°' : '%',
      });
    const tiltLabel = this.t('cover.tilt');
    const tiltStepper =
      canTilt && !unusable
        ? this.tiltStepper.get(tiltLabel, () =>
            stepper((direction) => this.stepTilt(direction), {
              decrease: `${tiltLabel} · ${this.t('common.decrease')}`,
              increase: `${tiltLabel} · ${this.t('common.increase')}`,
            }),
          )
        : nothing;

    const classLabel = coverClassLabel(this.hass, view.domain, view.deviceClass);
    const sub =
      this.config?.subtitle ??
      (view.areaName
        ? [view.areaName, classLabel].filter(Boolean).join(' · ')
        : classLabel.charAt(0).toUpperCase() + classLabel.slice(1));

    // the head fitted to its column: the badge steps aside before the name is cut, then the sub, then the icon
    const fitted = this.head.fit({
      width: this.contentWidth,
      title: name,
      sub: headSub(sub, this.contentWidth),
      badge: { text: shownStateText(this.hass, view, shown), tone },
    });
    return html`<article
      class="fv-card dv-card ${unusable ? 'is-unavailable is-off' : ''}"
      style="--dv-action-gap:${actionGap(this.contentWidth, row.length)}px"
      data-card
    >
      ${head({
        icon: fitted.icon
          ? (this.config?.icon ?? CLASS_GLYPH[view.deviceClass] ?? glyphFor(view))
          : null,
        tone,
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: fitted.badge,
        onIconTap: () => this.tap(view.id),
        onHold: () => this.hold(view.id),
        iconLabel: name,
      })}
      ${
        canPosition && !compact
          ? html` <div
              class="dv-cover ${tight ? 'dv-cover--tight' : ''} ${narrow ? 'dv-cover--narrow' : ''}"
            >
              <div class="dv-cover__ruler">
                <div class="dv-vlabels" style="height:160px">
                  <span style="top:0">${fine ? this.percent(fine.max) : this.t('common.open')}</span
                  ><span style="top:160px"
                    >${fine ? this.percent(fine.min) : this.t('common.closed')}</span
                  >
                </div>
                <fluvy-ruler
                  vertical
                  .value=${position ?? 0}
                  .min=${0}
                  .max=${100}
                  .step=${1}
                  .length=${160}
                  .band=${44}
                  .tone=${open || moving ? active : 'neutral'}
                  ?inactive=${unusable || position === null}
                  ?disabled=${unusable}
                  unit="%"
                  .label=${`${name} · ${this.t('cover.position')}`}
                  .format=${(value: number) => formatNumber(this.hass, value, { digits: 0 })}
                  @fluvy-input=${(event: CustomEvent<RulerChangeDetail>) => {
                    this.dragged = event.detail.value;
                  }}
                  @fluvy-change=${(event: CustomEvent<RulerChangeDetail>) => this.moveTo(view, event.detail.value)}
                  @fluvy-window=${(event: CustomEvent<RulerWindowDetail>) => {
                    this.fine = event.detail.fine ? event.detail : null;
                  }}
                ></fluvy-ruler>
              </div>
              <div class="dv-cover__side">
                ${readout({ label: this.t('cover.position'), value: position === null ? '—' : formatNumber(this.hass, position, { digits: 0 }), unit: position === null ? '' : '%' })}
                ${showTilt ? html`<div class="dv-cover__tilt">${tiltReadout('m')}${tiltStepper}</div>` : nothing}
              </div>
            </div>`
          : showTilt
            ? html`<div class="dv-value fv-value-row">${tiltReadout('l')}${tiltStepper}</div>`
            : nothing
      }
      ${row.length ? actions(row, (key) => this.command(view, key)) : nothing}
      ${
        chipItems.length
          ? html`${label(coverStrings(this.hass, 'favourites'))}${chipRow(
              chipItems,
              (key) => {
                const favorite = favorites[Number(key)];
                if (favorite && !unusable) this.applyFavorite(view, favorite);
              },
              this.config?.favorites_style,
              { ruler: this.head.ruler, width: this.contentWidth },
            )}`
          : nothing
      }
    </article>`;
  }
}
