import {
  formatDuration,
  formatNumber,
  formatTime,
  isUsable,
  numberAttr,
  relativeTime,
  resolveEntity,
  stateText,
  strings,
  textAttr,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import {
  clamp,
  clickPress,
  glyph,
  ico,
  icon,
  label,
  preventMenu,
  round,
  sheetStyles,
  startPress,
  type ChipItem,
  type IconRef,
  type RulerChangeDetail,
} from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { keyed } from 'lit/directives/keyed.js';

import { Card } from '../shared/base.js';
import { HeadFit } from '../energy/head.js';

import {
  actionFields,
  boolField,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
} from '../shared/form.js';
import {
  controlsField,
  fitControls,
  hasPower,
  hasVolume,
  isActive,
  isOff,
  isPlaying,
  MEDIA,
  mediaControls,
  mediaPicture,
  playable,
  playPauseAction,
  powerAction,
  trackPosition,
  type MediaControl,
  type PowerAction,
} from '../shared/media.js';
import { mediaHeight } from '../media-family.js';
import { configKeys, type RowStyle } from '../shared/config.js';
import { chipRow } from '../shared/chips.js';
import { fitLine } from '../shared/fit.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const s = strings('media');

export type MediaVariant = 'full' | 'mini' | 'hero';

export interface MediaCardConfig extends FluvyCardConfig {
  /** `full` = the player card, `mini` = the 44 row, `hero` = the 200 artwork layout. */
  variant?: MediaVariant;
  /** Sources as chips filling the row (default) or content-sized. */
  source_style?: RowStyle;
  show_source?: boolean;
  show_volume?: boolean;
  /**
   * The power round: the head's trailing round in place of "…" (the dialog stays a tap on the art, or a still press
   * on the head, away), the hero's corner, and the mini row when `controls` names it. On by default, for a player
   * that can be switched on or off; it reads "Turn on" on a player that is off, in place of a dead transport.
   */
  show_power?: boolean;
  /**
   * The mini row's rounds in order — `power`, `previous`, `play`, `next`, `volume` — each when the player can
   * take it; as many as the row holds beside the title, the last ones giving way. Default `[play, next]`.
   */
  controls?: readonly MediaControl[];
}

/** The click of a held artwork or row, seen before its own buttons': a hold never also taps. */
const clickHeld = { handleEvent: clickPress, capture: true };

const VARIANTS: readonly MediaVariant[] = ['full', 'mini', 'hero'];
const SEEK_STEP = 10; // seconds per arrow key
const MAX_SOURCES = 6;
/** The mini row's rounds when none are asked for: what it always drew. */
const MINI_CONTROLS: readonly MediaControl[] = ['play', 'next'];

/* the head's geometry (media.css): the 80 art and its 16, the 48 round and the 16 before it, the speaker line's
   20 glyph and its 6; the mini row's 44 art and 12 gaps on the compact card's 16 padding, and a title's 96 floor */
const ART = 80 + 16;
const ROUND = 48;
const HEAD_GAP = 16;
const SPEAKER_GLYPH = 20 + 6;
const MINI_PADDING = 16;
const MINI_ART = 44 + 12;
const MINI_ROUND = 12 + 44;
const TITLE_FLOOR = 96;

/** A picture URL that is safe inside `url("…")` — quotes and backslashes can never reach the stylesheet. */
const cssUrl = (url: string): string => url.replace(/["\\]/g, '');

/**
 * The media player: artwork, what is playing, the seek bar with its times, the five-round transport
 * and the volume ruler — in three sizes (`full`, `mini`, `hero`).
 *
 * Everything on a `media_player` is optional, so every line degrades: no artwork falls back to the
 * gradient plate, no duration hides the seek bar, no feature bit hides its control, and an idle or
 * unreachable speaker (the dead Cast device every instance has) reads as calm, not broken.
 *
 * The head keeps one trailing round, as every head of the language does: the power round for a player
 * that can be switched on or off (two 48 rounds beside the 80 art would leave a title 104 px at a phone's
 * column), else "…"; the dialog stays a tap on the art and a still press on the head away.
 */
export class FluvyMediaCard extends Card<MediaCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: MediaCardConfig): number {
    return mediaHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.media,
    css`
      /* the sheet fixes 360; a dashboard column decides here */
      .md-card,
      .md-mini {
        width: auto;
      }

      /* artwork: the language's plate (.fv-art), the entity picture crossfading over it; the mini's glyph is 20, the
         hero's 32, and an idle hero sits flat like the sheet's empty panel */
      .md-art--s svg {
        width: 20px;
        height: 20px;
      }
      .md-art--l svg {
        width: 32px;
        height: 32px;
      }
      .md-art--l.fv-art--idle {
        box-shadow: inset 0 0 0 1px var(--fluvy-border);
      }
      .md-art-tap {
        display: block;
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
      }
      /* the mini row's words as its tap, where the art has given way to the row's one round */
      .md-mini__text {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
        min-width: 0;
        height: 44px;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      /* fluid text: the source line ellipsizes instead of pushing the card open */
      .md-source__text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .md-hero__title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .md-card--hero .md-source {
        justify-content: center;
      }

      /* seek: the fill and the knob move on the compositor, one step a second while playing */
      .md-progress {
        max-width: 100%;
        touch-action: pan-y;
      }
      .md-progress[role='slider'] {
        cursor: pointer;
      }
      .md-progress .fv-knob {
        left: 0;
        top: 0;
      }
      .md-progress__fill {
        width: 100%;
        transform-origin: left center;
      }
      .is-playing .md-progress__fill {
        transition: transform 1s linear;
      }
      .is-playing .md-progress .fv-knob {
        transition: translate 1s linear;
      }
      .is-scrubbing .md-progress__fill,
      .is-scrubbing .md-progress .fv-knob {
        transition: none;
      }

      /* the sheet's 20 px transport gap, kept centred: it closes on a narrow column instead of clipping,
         and a wide column keeps the rhythm instead of flinging the rounds to the edges */
      .md-controls {
        justify-content: center;
      }

      /* the play glyph swaps under the finger */
      .md-swap {
        display: flex;
        animation: md-swap 200ms var(--fv-ease-out) both;
      }
      @keyframes md-swap {
        from {
          opacity: 0;
          transform: scale(0.72);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      .md-volume fluvy-ruler {
        flex: 0 0 auto;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    tick_: { state: true },
    scrub_: { state: true },
  };

  /** Beats the local clock: while playing the position advances once a second without a state change. */
  declare tick_: number;
  /** Fraction under the finger while the seek bar is being dragged. */
  declare scrub_: number | null;

  private timer = 0;
  /** Lays the head's lines out to the room its rounds leave (measured, re-measured when a font lands). */
  private readonly head = new HeadFit(this);
  /** Two stacked artwork layers; the front one holds the current picture so a change crossfades. */
  private readonly layers: [string, string] = ['', ''];
  private front = 0;

  constructor() {
    super();
    this.tick_ = 0;
    this.scrub_ = null;
  }

  static override keys = configKeys<MediaCardConfig>()([
    'variant',
    'source_style',
    'show_source',
    'show_volume',
    'show_power',
    'controls',
  ]);
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['media_player']),
        nameIconFields(),
        fieldRow(selectField('variant', VARIANTS), selectField('source_style', ['full', 'chips'])),
        fieldRow(boolField('show_source'), boolField('show_volume')),
        boolField('show_power'),
        controlsField(),
        ...colourFields(),
        actionFields(),
      ],
      ...formLabels({}),
    };
  }
  /** What the card does for a key left out, shown in the editor: the power round is offered where the player has one. */
  static override defaults: EditorDefaults = (config, hass) => {
    const view = resolveEntity(hass, typeof config['entity'] === 'string' ? config['entity'] : '');
    return {
      variant: 'full',
      source_style: 'full',
      show_source: true,
      show_volume: true,
      show_power: view.stateObj ? hasPower(view) : true,
      controls: [...MINI_CONTROLS],
    };
  };

  static getStubConfig(_hass: unknown, entities: readonly string[]): MediaCardConfig {
    return {
      type: 'custom:fluvy-media-card',
      entity: entities.find((id) => id.startsWith('media_player.')) ?? '',
    };
  }

  protected override prepare(config: MediaCardConfig): MediaCardConfig {
    if (!config.entity) throw new Error('fluvy-media-card: "entity" is required');
    const variant = config.variant && VARIANTS.includes(config.variant) ? config.variant : 'full';
    return { ...config, variant };
  }

  private get variant(): MediaVariant {
    return this.config?.variant ?? 'full';
  }

  override getCardSize(): number {
    return this.variant === 'mini' ? 2 : this.variant === 'hero' ? 12 : 7;
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: this.variant === 'hero' ? 8 : 6 };
  }

  /* ---------- lifecycle ---------- */

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.syncTimer();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  /** One interval, only while a playing track has a duration to advance along. */
  private syncTimer(): void {
    const view = this.entity();
    // `isConnected`: Home Assistant keeps pushing `hass` at a card it has already removed
    const needed =
      this.isConnected &&
      view.status === 'ok' &&
      this.isPlaying(view) &&
      numberAttr(view, 'media_duration') !== null;
    if (needed && !this.timer)
      this.timer = window.setInterval(() => {
        this.tick_ = Date.now();
      }, 1000);
    else if (!needed) this.stopTimer();
  }

  /* ---------- reading the entity ---------- */

  private isPlaying(view: EntityView): boolean {
    return isPlaying(this.stateOf(view));
  }

  private isActive(view: EntityView): boolean {
    return isActive(this.stateOf(view));
  }

  /** Artist · album, a series title for television, the app as a last resort. */
  private secondary(view: EntityView): string {
    const parts = [
      textAttr(view, 'media_series_title'),
      textAttr(view, 'media_artist'),
      textAttr(view, 'media_album_name'),
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : textAttr(view, 'app_name');
  }

  /** The speaker line under the track: the device, plus its input when one is selected. */
  private sourceLine(view: EntityView, name: string, said: string): string {
    const source = textAttr(view, 'source');
    return source && source !== name && source !== said ? `${name} · ${source}` : name;
  }

  private idleLine(view: EntityView): string {
    const text = stateText(this.hass, view);
    const when = view.stateObj?.last_changed;
    if (!when) return text;
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return text;
    return `${text} · ${s(this.hass, 'last_played', { time: relativeTime(this.hass, date) })}`;
  }

  private unavailableLine(view: EntityView): string {
    const text = stateText(this.hass, view);
    const when = view.stateObj?.last_changed;
    if (!when) return text;
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return text;
    const sameDay = date.toDateString() === new Date().toDateString();
    return `${text} · ${sameDay ? s(this.hass, 'since', { time: formatTime(this.hass, date) }) : relativeTime(this.hass, date)}`;
  }

  /* ---------- commands ---------- */

  private playPause(view: EntityView): void {
    const { service, expect } = playPauseAction(view, this.stateOf(view));
    this.expect(view.id, expect);
    this.call('media_player', service);
  }

  private seek(seconds: number): void {
    this.call('media_player', 'media_seek', { seek_position: Math.round(seconds) });
  }

  /** What the power round does now, or null: asked away, or a player that can be neither switched on nor off. */
  private power(view: EntityView): PowerAction | null {
    return this.config?.show_power === false ? null : powerAction(view, this.stateOf(view));
  }

  /* ---------- pieces ---------- */

  /** The gradient plate with the entity picture over it; a picture change crossfades the two layers. */
  private art(size: number, picture: string, extra = ''): TemplateResult {
    if (this.layers[this.front] !== picture) {
      this.front = this.front === 0 ? 1 : 0;
      this.layers[this.front] = picture;
    }
    return html`<span
      class="fv-art ${extra}"
      data-measure="skip"
      style="width:${size}px;height:${size}px"
    >
      ${this.layers.map(
        (url, index) =>
          html`<span
            class="fv-art__img ${url && index === this.front ? 'is-on' : ''}"
            style=${url ? `background-image:url("${cssUrl(url)}")` : nothing}
          ></span>`,
      )}
      ${picture ? nothing : glyph('speaker')}
    </span>`;
  }

  private transportRound(
    ref: IconRef,
    on: boolean,
    text: string,
    onClick: () => void,
  ): TemplateResult {
    return html`<button
      class="fv-round ${on ? 'is-on' : 'fv-round--quiet'}"
      data-control
      data-target
      aria-label=${text}
      title=${text}
      aria-pressed=${on ? 'true' : 'false'}
      @click=${onClick}
    >
      ${icon(ref)}
    </button>`;
  }

  private playRound(view: EntityView): TemplateResult {
    const playing = this.isPlaying(view);
    const active = this.isActive(view);
    const name = playing ? 'pause' : 'play';
    const text = playing ? this.t('media.pause') : this.t('media.play');
    return html`<button
      class="fv-round ${active ? 'fv-round--accent' : 'fv-round--quiet'}"
      data-control
      data-target
      aria-label=${text}
      title=${text}
      @click=${() => this.playPause(view)}
    >
      ${keyed(name, html`<span class="md-swap">${glyph(name)}</span>`)}
    </button>`;
  }

  /** Switches the player off, or — the one clear thing to do with a player that is off — on, in the primary fill. */
  private powerRound(view: EntityView, action: PowerAction, extra = ''): TemplateResult {
    const on = action.service === 'turn_on';
    return round(
      'power',
      on ? 'accent' : 'quiet',
      s(this.hass, on ? 'power_on' : 'power_off'),
      () => {
        this.expect(view.id, action.expect);
        this.call('media_player', action.service);
      },
      false,
      extra,
    );
  }

  /** Mutes and unmutes a player that can be muted; else the round opens its dialog, where the volume is. */
  private volumeRound(view: EntityView): TemplateResult {
    const muted = view.attr<boolean>('is_volume_muted') === true;
    if (!view.supports(MEDIA.VOLUME_MUTE))
      return round('volume', 'quiet', this.t('media.volume'), () =>
        this.tap(view.id, { action: 'more-info' }),
      );
    return round(
      muted ? 'volumeOff' : 'volume',
      'quiet',
      muted ? s(this.hass, 'unmute') : this.t('media.mute'),
      () => this.call('media_player', 'volume_mute', { is_volume_muted: !muted }),
    );
  }

  private repeatRound(view: EntityView): TemplateResult {
    const mode = textAttr(view, 'repeat') || 'off';
    const next = mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
    const text = s(
      this.hass,
      mode === 'one' ? 'repeat_one' : mode === 'all' ? 'repeat_all' : 'repeat_off',
    );
    return this.transportRound(mode === 'one' ? 'repeatOne' : 'repeat', mode !== 'off', text, () =>
      this.call('media_player', 'repeat_set', { repeat: next }),
    );
  }

  /**
   * The transport: five equal rounds 20 apart on the sheet. A column that cannot hold them 8 apart loses the ends
   * (shuffle and repeat: the modes, which more-info still offers) before the three that move the track; one that
   * cannot hold even those steps the rounds down to 44. A player that is off has no transport while the head's
   * power round (`powered`) is there to switch it on: that round is the one clear thing to do.
   */
  private renderTransport(
    view: EntityView,
    big: boolean,
    powered: boolean,
  ): TemplateResult | typeof nothing {
    const active = this.isActive(view);
    const canPlay = playable(view) && !(powered && isOff(this.stateOf(view)));
    const items: { readonly round: TemplateResult; readonly mode?: boolean }[] = [];
    if (active && view.supports(MEDIA.SHUFFLE)) {
      const on = view.attr<boolean>('shuffle') === true;
      items.push({
        round: this.transportRound('shuffle', on, this.t('media.shuffle'), () =>
          this.call('media_player', 'shuffle_set', { shuffle: !on }),
        ),
        mode: true,
      });
    }
    if (active && view.supports(MEDIA.PREVIOUS)) {
      items.push({
        round: round('prev', 'quiet', this.t('media.previous'), () =>
          this.call('media_player', 'media_previous_track'),
        ),
      });
    }
    if (canPlay) items.push({ round: this.playRound(view) });
    if (active && view.supports(MEDIA.NEXT)) {
      items.push({
        round: round('next', 'quiet', this.t('media.next'), () =>
          this.call('media_player', 'media_next_track'),
        ),
      });
    }
    if (active && view.supports(MEDIA.REPEAT))
      items.push({ round: this.repeatRound(view), mode: true });
    if (!items.length) return nothing;
    const width = this.contentWidth;
    const needs = (count: number, size: number): number => count * size + (count - 1) * 8;
    let size = big ? 56 : 48;
    const shown = needs(items.length, size) <= width ? items : items.filter((item) => !item.mode);
    if (needs(shown.length, size) > width) size = 44;
    const gap =
      shown.length > 1
        ? `min(20px, calc((100% - ${shown.length * size}px) / ${shown.length - 1}))`
        : '0px';
    return html`<div
      class="md-controls ${size === 48 ? '' : `md-controls--${size}`}"
      style="gap:${gap}"
    >
      ${shown.map((item) => item.round)}
    </div>`;
  }

  private renderSeek(view: EntityView, big: boolean): TemplateResult | typeof nothing {
    const duration = numberAttr(view, 'media_duration');
    const position = trackPosition(view, duration);
    if (duration === null || position === null) return nothing;
    const width = this.contentWidth;
    const fraction = this.scrub_ ?? position / duration;
    const shown = this.scrub_ === null ? position : this.scrub_ * duration;
    const seekable = view.supports(MEDIA.SEEK);
    const moving = this.isPlaying(view) && this.scrub_ === null;
    // the knob keeps a 4 px optical overhang at the ends, never half outside the column (as fluvy-ruler does)
    const x = clamp(fraction * width - 14, -4, width - 24);
    const text = `${this.config?.name ?? view.name} · ${s(this.hass, 'position')}`;
    return html`<div class="md-seek ${big ? 'md-seek--sheet' : ''}">
      <div
        class="md-progress"
        data-control
        data-target
        style="width:${width}px"
        role=${seekable ? 'slider' : nothing}
        tabindex=${seekable ? 0 : nothing}
        aria-label=${seekable ? text : nothing}
        aria-valuemin=${seekable ? 0 : nothing}
        aria-valuemax=${seekable ? Math.round(duration) : nothing}
        aria-valuenow=${seekable ? Math.round(shown) : nothing}
        aria-valuetext=${seekable ? formatDuration(shown) : nothing}
        @pointerdown=${this.onSeekDown}
        @pointermove=${this.onSeekMove}
        @pointerup=${this.onSeekUp}
        @pointercancel=${this.onSeekCancel}
        @keydown=${this.onSeekKey}
      >
        <span
          class="md-progress__fill"
          data-measure="value"
          style="transform:scaleX(${fraction.toFixed(5)})"
        ></span>
        <span
          class="fv-knob fv-knob--accent"
          data-measure="value"
          style="width:28px;height:28px;translate:${moving ? x.toFixed(2) : Math.round(x)}px 8px"
        ></span>
      </div>
      <div class="md-times">
        <span>${formatDuration(shown)}</span><span>${formatDuration(duration)}</span>
      </div>
    </div>`;
  }

  private renderVolume(view: EntityView): TemplateResult | typeof nothing {
    if (this.config?.show_volume === false) return nothing;
    const canSet = view.supports(MEDIA.VOLUME_SET);
    const canMute = view.supports(MEDIA.VOLUME_MUTE);
    if (!canSet && !canMute) return nothing;
    const muted = view.attr<boolean>('is_volume_muted') === true;
    const level = numberAttr(view, 'volume_level');
    const value = level === null ? 0 : Math.round(clamp(level, 0, 1) * 100);
    const name = this.config?.name ?? view.name;
    const length = this.contentWidth - (canMute ? 64 : 0);
    return html`${label(this.t('media.volume'))}
      <div class="md-volume">
        ${
          canSet
            ? html`<fluvy-ruler
                .value=${value}
                .min=${0}
                .max=${100}
                .step=${1}
                .length=${length}
                .tone=${muted ? 'neutral' : 'accent'}
                unit="%"
                .label=${`${name} · ${this.t('media.volume')}`}
                .format=${(v: number) => formatNumber(this.hass, v, { digits: 0 })}
                @fluvy-change=${(event: CustomEvent<RulerChangeDetail>) => this.call('media_player', 'volume_set', { volume_level: event.detail.value / 100 })}
              ></fluvy-ruler>`
            : nothing
        }
        ${canMute ? this.volumeRound(view) : nothing}
      </div>`;
  }

  private renderSources(view: EntityView): TemplateResult | typeof nothing {
    if (this.config?.show_source === false) return nothing;
    const list = view.attr<readonly string[]>('source_list');
    if (!Array.isArray(list) || !list.length || !view.supports(MEDIA.SELECT_SOURCE)) return nothing;
    const current = textAttr(view, 'source');
    const names = list.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
    const shown = names.slice(0, MAX_SOURCES);
    if (current && !shown.includes(current)) {
      shown.pop();
      shown.unshift(current);
    }
    if (!shown.length) return nothing;
    const items: ChipItem[] = shown.map((source) => ({
      key: source,
      label: source,
      active: source === current,
    }));
    return html`${label(this.t('media.source'))}${chipRow(items, (key) => this.call('media_player', 'select_source', { source: key }), this.config?.source_style)}`;
  }

  /* ---------- seek gestures ---------- */

  private fractionAt(event: PointerEvent): number {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return clamp((event.clientX - box.left) / Math.max(1, box.width), 0, 1);
  }

  private readonly onSeekDown = (event: PointerEvent): void => {
    if (!this.entity().supports(MEDIA.SEEK)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    this.scrub_ = this.fractionAt(event);
  };

  private readonly onSeekMove = (event: PointerEvent): void => {
    if (this.scrub_ === null) return;
    this.scrub_ = this.fractionAt(event);
  };

  private readonly onSeekUp = (event: PointerEvent): void => {
    if (this.scrub_ === null) return;
    const fraction = this.fractionAt(event);
    this.scrub_ = null;
    const duration = numberAttr(this.entity(), 'media_duration');
    if (duration !== null) this.seek(fraction * duration);
  };

  private readonly onSeekCancel = (): void => {
    this.scrub_ = null;
  };

  private readonly onSeekKey = (event: KeyboardEvent): void => {
    const view = this.entity();
    if (!view.supports(MEDIA.SEEK)) return;
    const duration = numberAttr(view, 'media_duration');
    if (duration === null) return;
    const position = trackPosition(view, duration) ?? 0;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = position + SEEK_STEP;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = position - SEEK_STEP;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = duration;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.seek(clamp(next, 0, duration));
  };

  /* ---------- variants ---------- */

  private renderPlayer(view: EntityView, name: string, hero: boolean): TemplateResult {
    const active = this.isActive(view);
    const picture = mediaPicture(this.hass, view);
    const title = active
      ? textAttr(view, 'media_title') || textAttr(view, 'app_name') || name
      : this.t('media.nothing');
    let second = active ? this.secondary(view) : this.idleLine(view);
    if (active && (second === title || !second)) second = stateText(this.hass, view);
    const speaker = this.sourceLine(view, name, second);
    const saysSpeaker = speaker !== title;
    const classes = `fv-card md-card ${hero ? 'md-card--hero' : ''} ${this.isPlaying(view) ? 'is-playing' : ''} ${this.scrub_ === null ? '' : 'is-scrubbing'}`;
    const wide = this.contentWidth >= 312;
    const power = this.power(view);
    const body = html` ${this.renderSeek(view, hero)}
    ${this.renderTransport(view, hero && wide, power !== null)} ${this.renderVolume(view)}
    ${this.renderSources(view)}`;

    // the artwork is the card's icon: a tap is the tap action, a still press the hold action
    const tap = (): void => this.tap(view.id);
    const hold = (): void => this.hold(view.id);
    if (hero) {
      // the corner round keeps 12 px clear of the art, which gives up that room on both sides (it stays centred)
      const clear = power ? 2 * (ROUND + 12) : 0;
      const size = Math.min(200, Math.floor((this.contentWidth - clear) / 4) * 4);
      return html`<article class=${classes} data-card>
        <div class="md-hero">
          <button
            class="md-art-tap fv-ico--tap"
            aria-label=${name}
            .fvTap=${tap}
            .fvHold=${hold}
            @pointerdown=${startPress}
            @contextmenu=${preventMenu}
            @click=${clickPress}
          >
            ${this.art(size, picture, `md-art--l ${active || picture ? '' : 'fv-art--idle'}`)}
          </button>
          ${power ? this.powerRound(view, power, 'md-hero__power') : nothing}
        </div>
        <div class="md-hero__text" data-align="center">
          <h3 class="md-hero__title" data-name>${title}</h3>
          ${second ? html`<p class="fv-card__sub">${second}</p>` : nothing}
          ${saysSpeaker ? html`<p class="fv-card__sub md-source">${glyph('speaker')}<span class="md-source__text">${speaker}</span></p>` : nothing}
        </div>
        ${body}
      </article>`;
    }

    // the title is a name and may end in an ellipsis; the lines under it lose their trailing segments instead
    const room = this.contentWidth - ART - HEAD_GAP - ROUND;
    const sub = this.head.fitSub(second, room);
    const source = this.head.fitSub(speaker, room - SPEAKER_GLYPH);
    return html`<article class=${classes} data-card>
      <div
        class="md-now fv-card__head--hold"
        .fvHold=${hold}
        @pointerdown=${startPress}
        @contextmenu=${preventMenu}
        @click=${clickHeld}
      >
        <button class="md-art-tap fv-ico--tap" aria-label=${name} @click=${tap}>
          ${this.art(80, picture, active || picture ? '' : 'fv-art--idle')}
        </button>
        <div class="md-now__text">
          <h3 class="fv-card__title md-title" data-name>${title}</h3>
          ${sub ? html`<p class="fv-card__sub">${sub}</p>` : nothing}
          ${saysSpeaker ? html`<p class="fv-card__sub md-source">${glyph('speaker')}<span class="md-source__text">${source}</span></p>` : nothing}
        </div>
        ${
          power
            ? this.powerRound(view, power)
            : round('dots', 'quiet', this.t('common.more'), () =>
                this.tap(view.id, { action: 'more-info' }),
              )
        }
      </div>
      ${body}
    </article>`;
  }

  /**
   * The mini row's rounds: the controls asked for that this player can take now, in their order — as many as the
   * row holds beside a title of 96 (a name's floor), the rest giving way in an order of need (`fitControls`). A
   * power round makes the player's off state its own: the play round then waits for it to be on. A column that
   * cannot hold even one round beside the art lets the art go first (the compact tile's rule) and keeps the one
   * round that matters most: the row is there to control the player.
   */
  private miniRounds(
    view: EntityView,
    inner: number,
  ): { readonly art: boolean; readonly rounds: TemplateResult[] } {
    const state = this.stateOf(view);
    const active = isActive(state);
    const power = this.power(view);
    const offered = mediaControls(this.config?.controls, MINI_CONTROLS).filter((control) => {
      switch (control) {
        case 'power':
          return power !== null;
        case 'previous':
          return active && view.supports(MEDIA.PREVIOUS);
        case 'play':
          return playable(view) && !(power && isOff(state));
        case 'next':
          return active && view.supports(MEDIA.NEXT);
        case 'volume':
          return this.config?.show_volume !== false && hasVolume(view);
      }
    });
    const beside = Math.max(0, Math.floor((inner - MINI_ART - TITLE_FLOOR) / MINI_ROUND));
    const art = beside > 0 || !offered.length;
    const rounds = fitControls(offered, art ? beside : 1).map((control) => {
      switch (control) {
        case 'power':
          return this.powerRound(view, power as PowerAction);
        case 'previous':
          return round('prev', 'quiet', this.t('media.previous'), () =>
            this.call('media_player', 'media_previous_track'),
          );
        case 'play':
          return this.playRound(view);
        case 'next':
          return round('next', 'quiet', this.t('media.next'), () =>
            this.call('media_player', 'media_next_track'),
          );
        case 'volume':
          return this.volumeRound(view);
      }
    });
    return { art, rounds };
  }

  private renderMini(view: EntityView, name: string): TemplateResult {
    const active = this.isActive(view);
    const picture = mediaPicture(this.hass, view);
    const duration = numberAttr(view, 'media_duration');
    const position = trackPosition(view, duration);
    const title = active
      ? textAttr(view, 'media_title') || textAttr(view, 'app_name') || name
      : name;
    const inner = this.width - 2 * MINI_PADDING;
    const { art, rounds } = this.miniRounds(view, inner);
    // the line under the title keeps its first segment (the speaker's name, or the state) and loses the rest —
    // the position, a value, never ends in an ellipsis; the figures are measured by their shape ("0:00"), as they
    // are tabular, so a position ticking once a second never fills the ruler's memory
    const line = active
      ? [name, position === null ? this.secondary(view) : formatDuration(position)].filter(Boolean)
      : this.idleLine(view).split(' · ');
    const sub = fitLine(
      line.map((text, index) => ({ text, optional: index > 0 })),
      inner - (art ? MINI_ART : 0) - rounds.length * MINI_ROUND,
      (text) => this.head.ruler.width('fv-row__sub', text.replace(/\d/g, '0')),
    );
    const tap = (): void => this.tap(view.id);
    const text = html`<span class="fv-row__title" data-name>${title}</span
      ><span class="fv-row__sub" data-name>${sub}</span>`;
    return html`<article
      class="fv-card md-mini__card ${this.isPlaying(view) ? 'is-playing' : ''}"
      data-card
    >
      <div
        class="md-mini__row fv-card__head--hold"
        .fvHold=${() => this.hold(view.id)}
        @pointerdown=${startPress}
        @contextmenu=${preventMenu}
        @click=${clickHeld}
      >
        ${
          !art
            ? nothing
            : picture
              ? html`<button class="md-art-tap fv-ico--tap" aria-label=${name} @click=${tap}>
                  ${this.art(44, picture, 'md-art--s')}
                </button>`
              : ico(this.config?.icon ?? 'speaker', active ? 'media' : 'neutral', {
                  onTap: tap,
                  label: name,
                })
        }
        ${
          art
            ? html`<div class="fv-row__text">${text}</div>`
            : html`<button class="md-mini__text" aria-label=${name} @click=${tap}>${text}</button>`
        }
        ${rounds}
      </div>
    </article>`;
  }

  /** Unreachable: the calm dashed row every instance needs for its dead Cast devices. */
  private renderOff(view: EntityView, name: string, variant: MediaVariant): TemplateResult {
    const text = html`<div class="fv-row__text">
      <span class="fv-row__title" data-name>${name}</span>
      <span class="fv-row__sub">${this.unavailableLine(view)}</span>
    </div>`;
    if (variant === 'mini') {
      return html`<article class="fv-tile fv-tile--off" data-card>
        ${ico('ban', 'off')}${text}
      </article>`;
    }
    return html`<article class="fv-card md-card is-off is-unavailable" data-card>
      <div class="md-mini__row">${ico('ban', 'off')}${text}</div>
    </article>`;
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (view.status === 'missing')
      return this.renderEmpty(`${name} · ${stateText(this.hass, view)}`);
    const variant = this.variant;
    if (!isUsable(view)) return this.renderOff(view, name, variant);
    if (variant === 'mini') return this.renderMini(view, name);
    return this.renderPlayer(view, name, variant === 'hero');
  }
}
