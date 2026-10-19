import {
  formatDuration,
  formatNumber,
  isUsable,
  numberAttr,
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
  clickPress,
  glyph,
  holdKey,
  icon,
  preventMenu,
  round,
  sheetStyles,
  startPress,
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

import {
  actionFields,
  boolField,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
} from '../shared/form.js';
import {
  controlsField,
  fitControls,
  hasPower,
  hasVolume,
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
import { NOW_PLAYING_CONTROLS, nowPlayingHeight } from '../media-family.js';
import { configKeys } from '../shared/config.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const s = strings('now-playing');

export interface NowPlayingCardConfig extends FluvyCardConfig {
  /** Speaker name shown after the artist. Defaults to the entity's name. */
  name?: string;
  /** The volume round at the end of the transport (it opens the player's dialog). */
  show_volume?: boolean;
  /** The power round, when `controls` names it: on by default, for a player that can be switched on or off. */
  show_power?: boolean;
  /**
   * The strip's rounds — `power`, `previous`, `play`, `next`, `volume` — the transport centred in the order named,
   * power on the left edge and volume on the right; a strip too narrow for them all loses the last named. Default
   * `[previous, play, next, volume]`.
   */
  controls?: readonly MediaControl[];
}

/** The click of a held strip, seen before its buttons': a hold never also taps. */
const clickHeld = { handleEvent: clickPress, capture: true };

/** Under this content width the centred trio would meet the edge rounds (W / 2 − 136 < 16). */
const CENTRED_FROM = 304;
/** The spread strip's 44 rounds and their 8 gaps: how many a narrow column holds. */
const SPREAD_ROUND = 44;
const SPREAD_GAP = 8;
/** The strip's rounds when none are asked for: what it always drew. */
const DEFAULT_CONTROLS = NOW_PLAYING_CONTROLS;
/** Where a round sits: power on the left edge, the transport between, volume on the right edge. */
const EDGE: Readonly<Record<MediaControl, -1 | 0 | 1>> = {
  power: -1,
  previous: 0,
  play: 0,
  next: 0,
  volume: 1,
};

/**
 * The compact "now playing" of the home sheet (`.hm-media`): 64 artwork, what is on, a 4 px progress
 * line with its times (at rest, its times dashes, while nothing has a length: the strip keeps its size whatever
 * plays), and 48 rounds — the transport centred on the card, volume on the right edge and, when asked for, power on
 * the left. A player out of reach keeps the whole strip, still, in the off skin. `fluvy-media-card` is the full player (seek knob, volume
 * ruler, sources, mini and hero); this is the strip a home view puts between its tiles, and it
 * leaves volume and everything else to the entity's own dialog.
 */
export class FluvyNowPlayingCard extends Card<NowPlayingCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns (no rounds: no strip, 64 less). */
  static override layoutHeight(config: NowPlayingCardConfig): number {
    return nowPlayingHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.home,
    css`
      /* the sheet's 1fr column would grow with a long title */
      .hm-media {
        grid-template-columns: 64px minmax(0, 1fr);
      }

      /* the artwork and the words are one button: laid over their row, under nothing (the progress and the rounds
         have rows of their own); the art gives under the finger and the words dim, as a head's circle and name do */
      .hm-media__tap {
        position: relative;
        z-index: 1;
        grid-row: 1;
        grid-column: 1 / -1;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: var(--fluvy-radius-control);
        background: none;
        cursor: pointer;
        -webkit-touch-callout: none;
      }
      .hm-media__tap:active {
        transform: none;
      }
      /* the art and the words hold the first row with the button laid over them: placed there, not after it (a
         button that took the row first left a 64 px gap over the strip, 1.9.0's #42) */
      .hm-media > .hm-art {
        grid-row: 1;
        grid-column: 1;
        transition: scale var(--fv-fast) var(--fv-ease);
      }
      .hm-media > .hm-media__titles {
        grid-row: 1;
        grid-column: 2;
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .hm-media:has(> .hm-media__tap:active) > .hm-art {
        scale: 0.94;
      }
      .hm-media:has(> .hm-media__tap:active) > .hm-media__titles {
        opacity: 0.7;
      }
      /* why a player is out of reach takes a second line rather than an ellipsis (the art's 64 holds the title and two) */
      .hm-media__why {
        white-space: normal;
      }
      /* the line under the title: its names may end in their ellipsis, the state after them stays whole */
      .hm-media__line {
        display: flex;
      }
      .hm-media__line > span {
        flex: none;
        white-space: pre;
      }
      .hm-media__line > [data-name] {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      @media (hover: hover) {
        .hm-media:has(> .hm-media__tap:hover:not(:active)) > .hm-art {
          scale: 1.06;
        }
      }

      /* the fill slides on the compositor inside the clipped track (its round end stays round), one step a second */
      .hm-progress {
        overflow: hidden;
      }
      .hm-progress__fill {
        width: 100%;
        transform: translateX(calc((var(--played, 0) - 1) * 100%));
      }
      .is-playing .hm-progress__fill {
        transition: transform 1s linear;
      }

      /* the sheet pins the rounds at 72 / 136 / 200 / 272 of its 320 column: the trio centred with 16
         gaps, volume on the right edge. The same picture at 320, fluid everywhere else. */
      .hm-transport {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }
      .hm-transport > .hm-transport__btn {
        position: static;
        flex: 0 0 48px;
      }
      .hm-transport > .hm-transport__volume {
        position: absolute;
        top: 0;
        right: 0;
        left: auto;
      }
      .hm-transport > .hm-transport__power {
        position: absolute;
        top: 0;
        left: 0;
        right: auto;
      }
      /* a narrow column spreads them all instead of letting the trio meet the edge rounds */
      .hm-transport--spread {
        justify-content: space-between;
        gap: 0;
      }
      .hm-transport--spread > .hm-transport__volume,
      .hm-transport--spread > .hm-transport__power {
        position: static;
      }
      /* four 48 rounds in 260 would land on third-pixels; the compact card's 44 rounds give 4 × 44 + 3 × 28 = 260 */
      .hm-transport--spread > .hm-transport__btn {
        flex-basis: 44px;
        width: 44px;
        height: 44px;
      }
      .hm-transport--spread .hm-transport__btn svg {
        width: 20px;
        height: 20px;
      }
      .hm-transport__btn > .fv-swap {
        display: flex;
      }
    `,
  ];

  static override properties = { ...Card.properties, tick_: { state: true } };

  /** Beats once a second while a track with a duration is playing: the position advances with no state change. */
  declare tick_: number;

  private clock: number | undefined;

  constructor() {
    super();
    this.tick_ = 0;
  }

  static override keys = configKeys<NowPlayingCardConfig>()([
    'show_volume',
    'show_power',
    'controls',
  ]);
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['media_player']),
        nameIconFields(),
        fieldRow(boolField('show_volume'), boolField('show_power')),
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
      show_volume: true,
      show_power: view.stateObj ? hasPower(view) : true,
      controls: [...DEFAULT_CONTROLS],
    };
  };

  static getStubConfig(_hass: unknown, entities: readonly string[]): NowPlayingCardConfig {
    return {
      type: 'custom:fluvy-now-playing-card',
      entity: entities.find((id) => id.startsWith('media_player.')) ?? '',
    };
  }

  protected override prepare(config: NowPlayingCardConfig): NowPlayingCardConfig {
    if (!config.entity) throw new Error('fluvy-now-playing-card: "entity" is required');
    return config;
  }

  override getCardSize(): number {
    return 4;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- the clock ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate(); // a card that is re-attached picks its clock up again in `updated`
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopClock();
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const view = this.entity();
    // Lit still updates an element that has left the page (one last `hass`): it must not start a clock nobody will stop
    if (this.isConnected && this.isPlaying(view) && numberAttr(view, 'media_duration') !== null)
      this.clock ??= window.setInterval(() => {
        this.tick_ += 1;
      }, 1000);
    else this.stopClock();
  }

  private stopClock(): void {
    clearInterval(this.clock);
    this.clock = undefined;
  }

  /* ---------- facts ---------- */

  private isPlaying(view: EntityView): boolean {
    return view.status === 'ok' && isPlaying(this.stateOf(view));
  }

  private playPause(view: EntityView): void {
    const { service, expect } = playPauseAction(view, this.stateOf(view));
    this.expect(view.id, expect);
    this.call('media_player', service);
  }

  /* ---------- pieces ---------- */

  /** The sheet's gradient plate; the entity picture fades in over it once it has loaded, and a picture that fails leaves the plate. */
  private art(view: EntityView, active: boolean): TemplateResult {
    const picture = active ? mediaPicture(this.hass, view) : '';
    const loaded = (event: Event): void =>
      (event.currentTarget as HTMLElement).classList.add('is-on');
    return html`<span class="fv-art hm-art ${active ? '' : 'fv-art--idle'}">
      ${isUsable(view) ? icon(this.config?.icon, 'speaker') : glyph('ban')}
      ${picture ? keyed(picture, html`<img class="fv-art__img" src=${picture} alt="" draggable="false" @load=${loaded} />`) : nothing}
    </span>`;
  }

  private progress(view: EntityView, track: string): TemplateResult {
    const duration = numberAttr(view, 'media_duration');
    const position = duration !== null && duration > 0 ? trackPosition(view, duration) : null;
    // nothing with a length (idle, a stream, a player out of reach): the line at rest, its times dashes (1.9)
    if (duration === null || position === null)
      return html`<div class="hm-progress" aria-hidden="true"></div>
        <div class="hm-times"><span>—</span><span>—</span></div>`;
    const text = s(this.hass, 'progress', {
      position: formatDuration(position),
      duration: formatDuration(duration),
    });
    return html`<div
        class="hm-progress"
        role="progressbar"
        aria-label=${text}
        aria-valuemin="0"
        aria-valuemax=${Math.round(duration)}
        aria-valuenow=${Math.round(position)}
      >
        ${keyed(track, html`<span class="hm-progress__fill" data-measure="value" style="--played:${(position / duration).toFixed(4)}"></span>`)}
      </div>
      <div class="hm-times">
        <span>${formatDuration(position)}</span><span>${formatDuration(duration)}</span>
      </div>`;
  }

  /**
   * The strip's rounds, from `controls`: the transport (previous · play · next, in the order named, disabled where the
   * player cannot) centred, power on the left edge and volume on the right — each edge only when the player has it.
   * Off with a power round, the strip is power and volume alone: no dead transport under the one clear thing to do.
   * A strip too narrow to centre spreads them at 44, and one too narrow for them all lets them give way in an order
   * of need (`fitControls`), play last of all.
   */
  private transport(view: EntityView, active: boolean): TemplateResult | typeof nothing {
    const state = this.stateOf(view);
    // a player gone from the house keeps the rounds its config asks for: its features are not known (1.9)
    const gone = view.status === 'missing';
    const power =
      this.config?.show_power === false
        ? null
        : gone
          ? ({ service: 'turn_off', expect: 'off' } as const)
          : powerAction(view, state);
    const offered = mediaControls(this.config?.controls, DEFAULT_CONTROLS).filter((control) => {
      if (control === 'power') return power !== null;
      if (control === 'volume')
        return this.config?.show_volume !== false && (gone || hasVolume(view));
      return !(power && isOff(state));
    });
    const width = this.contentWidth;
    const spread = width < CENTRED_FROM;
    const fits = spread ? Math.floor((width + SPREAD_GAP) / (SPREAD_ROUND + SPREAD_GAP)) : Infinity;
    const shown = [...fitControls(offered, fits)].sort((a, b) => EDGE[a] - EDGE[b]);
    if (!shown.length) return nothing;
    return html`<div class="hm-transport ${spread ? 'hm-transport--spread' : ''}">
      ${shown.map((control) => this.round(control, view, active, power))}
    </div>`;
  }

  private round(
    control: MediaControl,
    view: EntityView,
    active: boolean,
    power: PowerAction | null,
  ): TemplateResult {
    switch (control) {
      case 'power':
        return this.powerRound(view, power as PowerAction);
      case 'previous':
        return round(
          'prev',
          'quiet',
          this.t('media.previous'),
          () => this.call('media_player', 'media_previous_track'),
          !(active && view.supports(MEDIA.PREVIOUS)) || !isUsable(view),
          'hm-transport__btn',
        );
      case 'play':
        return this.playRound(view, active);
      case 'next':
        return round(
          'next',
          'quiet',
          this.t('media.next'),
          () => this.call('media_player', 'media_next_track'),
          !(active && view.supports(MEDIA.NEXT)) || !isUsable(view),
          'hm-transport__btn',
        );
      case 'volume':
        return this.volumeRound(view);
    }
  }

  /** Switches the player off, or — the one clear thing to do with a player that is off — on, in the primary fill. */
  private powerRound(view: EntityView, action: PowerAction): TemplateResult {
    const on = action.service === 'turn_on';
    return round(
      'power',
      on ? 'accent' : 'quiet',
      this.t(on ? 'media.power_on' : 'media.power_off'),
      () => {
        this.expect(view.id, action.expect);
        this.call('media_player', action.service);
      },
      !isUsable(view),
      'hm-transport__btn hm-transport__power',
    );
  }

  /** Plays or pauses; wakes a player that is off (a strip with a power round leaves that to the round, and draws none). */
  private playRound(view: EntityView, active: boolean): TemplateResult {
    const playing = this.isPlaying(view);
    const canPlay = playable(view);
    const text = playing ? this.t('media.pause') : this.t('media.play');
    return html`<button
      class="fv-round ${active ? 'fv-round--accent' : 'fv-round--quiet'} hm-transport__btn"
      data-control
      data-target
      aria-label=${text}
      title=${text}
      ?disabled=${!canPlay || !isUsable(view)}
      @click=${() => this.playPause(view)}
    >
      ${keyed(playing, html`<span class="fv-swap">${glyph(playing ? 'pause' : 'play')}</span>`)}
    </button>`;
  }

  /** The volume, as a figure on the round that opens the player's dialog, where the ruler is. */
  private volumeRound(view: EntityView): TemplateResult {
    const level = numberAttr(view, 'volume_level');
    const muted = view.attr<boolean | null>('is_volume_muted') === true;
    const text = [
      this.t('media.volume'),
      muted
        ? s(this.hass, 'muted')
        : level === null
          ? ''
          : `${formatNumber(this.hass, Math.round(level * 100), { digits: 0 })} %`,
    ]
      .filter(Boolean)
      .join(' · ');
    return round(
      muted ? 'volumeOff' : 'volume',
      'quiet',
      text,
      () => this.tap(view.id, { action: 'more-info' }),
      !isUsable(view),
      'hm-transport__btn hm-transport__volume',
    );
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const speaker = this.config?.name ?? view.name;

    // the artwork and what is on are the card's head, and its button: a tap is the tap action, a still press on the
    // strip the hold action; the progress and the rounds under them keep their own
    const { onTap, onHold } = this.headActions(view.id);
    const tap = onTap
      ? html`<button
          class="hm-media__tap"
          aria-label=${speaker}
          @click=${onTap}
          @keydown=${holdKey(onHold)}
        ></button>`
      : nothing;

    // a player out of reach (unavailable, or gone from the house) is the whole strip at rest in the off skin: its name
    // and why beside the plate, the progress line and the rounds still — only the colours change (1.9)
    if (!isUsable(view)) {
      return html`<article class="fv-card hm-media is-off is-unavailable" data-card>
        ${this.art(view, false)}
        <div class="hm-media__titles">
          <h3 class="fv-card__title hm-media__title" data-name>${speaker}</h3>
          <p class="fv-card__sub hm-media__why">${stateText(this.hass, view)}</p>
        </div>
        ${tap} ${this.progress(view, speaker)} ${this.transport(view, false)}
      </article>`;
    }

    const state = this.stateOf(view);
    const playing = this.isPlaying(view);
    const active = playing || state === 'paused';
    const title = active
      ? textAttr(view, 'media_title') || textAttr(view, 'app_name') || speaker
      : this.t('media.nothing');
    const artist = active
      ? textAttr(view, 'media_artist') || textAttr(view, 'media_series_title')
      : '';
    // segments after "·" are lower-case unless they are names; the names (the artist, the speaker) may end in their
    // ellipsis, the state after the speaker stays whole
    const [name = '', after = ''] = active
      ? [artist, speaker === title ? '' : speaker].filter(Boolean)
      : [speaker, stateText(this.hass, view).toLocaleLowerCase()];

    return html`<article
      class="fv-card hm-media fv-card__head--hold ${playing ? 'is-playing' : ''}"
      data-card
      .fvHold=${onHold}
      @pointerdown=${startPress}
      @contextmenu=${onHold ? preventMenu : nothing}
      @click=${clickHeld}
    >
      ${this.art(view, active)}
      <div class="hm-media__titles">
        <h3 class="fv-card__title hm-media__title" data-name>${title}</h3>
        ${
          name
            ? html`<p class="fv-card__sub hm-media__line">
                <span data-name>${name}</span>${
                  after ? html`<span data-name=${active || nothing}> · ${after}</span>` : nothing
                }
              </p>`
            : html`<p class="fv-card__sub">${stateText(this.hass, view)}</p>`
        }
      </div>
      ${tap} ${this.progress(view, title)} ${this.transport(view, active)}
    </article>`;
  }
}
