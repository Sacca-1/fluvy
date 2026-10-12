import {
  formatTime,
  haptic,
  isUsable,
  stateText,
  strings,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { glyph, head, round, sheetStyles } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { ROW_KEYS, RowsCard, rowSchema, type RowsCardConfig } from '../lock/rows.js';

import { Card } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  nameIconFields,
  numberField,
  selectField,
  textField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { Crossfade } from '../shared/crossfade.js';
import { StreamHolder } from './stream.js';
import {
  CAMERA_RATIOS,
  CLOCK_PLATE,
  ROUNDS_PLATE,
  cameraHeight,
  cameraRatio,
  plateHeight,
} from '../devices-family.js';

const s = strings('camera');

export interface CameraCardConfig extends RowsCardConfig {
  /** Seconds between two stills (0.5–300, default 10). */
  refresh?: number;
  /**
   * `auto` (the default): stills that refresh themselves. `live`: Home Assistant's own stream (WebRTC, HLS or MJPEG,
   * as the camera offers) while the card is on screen; stills again where Home Assistant cannot give one.
   */
  camera_view?: 'auto' | 'live';
  /**
   * The picture's shape: `16:9` (the default), `4:3`, `3:2`, `1:1`, `2:1`, `21:9`, `native` (the camera's own), or
   * Home Assistant's own forms (`16:9`, `56%`).
   */
  aspect_ratio?: string;
  /** `cover` (the default) fills the shape and crops what overflows; `contain` shows the whole picture. */
  fit_mode?: 'cover' | 'contain';
  /** Second line of the head ("Front of house · 1080p"). Default: area and state. */
  subtitle?: string;
}

/** A request that has not answered after this long no longer holds the next one back. */
const STALL_MS = 30_000;
/** This many failures in a row and the last good frame stops standing in for the camera. */
const GIVE_UP = 3;

/** Each camera's own shape once a frame has said it: in memory for this page, in the browser for the next. */
const NATIVE_KEY = 'fluvy-camera-shape';
const natives = new Map<string, number>();
function nativeOf(entity: string | undefined): number {
  if (!entity) return 0;
  if (!natives.size)
    try {
      const stored = JSON.parse(localStorage.getItem(NATIVE_KEY) ?? '{}') as Record<
        string,
        unknown
      >;
      for (const [id, ratio] of Object.entries(stored))
        if (typeof ratio === 'number' && ratio > 0) natives.set(id, ratio);
    } catch {
      // a private window or blocked storage: the shape is read again from the first frame
    }
  return natives.get(entity) ?? 0;
}
function rememberNative(entity: string | undefined, ratio: number): void {
  if (!entity || !(ratio > 0)) return;
  natives.set(entity, ratio);
  try {
    localStorage.setItem(NATIVE_KEY, JSON.stringify(Object.fromEntries(natives)));
  } catch {
    // kept for this page only
  }
}
/**
 * The camera: a 16:9 still that refreshes itself, the live and time pills inside the picture and
 * two overlay actions. Two stacked images take turns: the next frame loads behind the current one
 * and fades in over it once decoded, so the picture never blinks. One interval, which only runs
 * while the card is on screen and the tab is in front, and is gone with the card.
 */
export class FluvyCameraCard extends RowsCard<CameraCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: CameraCardConfig): number {
    return cameraHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    css`
      .dv-card {
        width: auto;
      }
      .dv-cam {
        background: none;
      }
      /* the sheet's vignette, over the picture instead of under it, so the pills stay legible on a bright frame */
      .dv-cam__shade {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        background: radial-gradient(
          120% 90% at 50% 40%,
          transparent 55%,
          color-mix(in srgb, var(--fluvy-neutral-05) 28%, transparent) 100%
        );
      }
      .dv-cam__skeleton {
        position: absolute;
        inset: 0;
        border-radius: 0;
      }
      .dv-cam__tap {
        position: absolute;
        inset: 0;
        z-index: 3;
        width: 100%;
        border-radius: var(--fluvy-radius-control);
      }
      .dv-cam__tap:focus-visible {
        outline-offset: -4px;
      }
      .dv-cam__pill {
        z-index: 4;
        pointer-events: none;
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .dv-cam__live.is-stale {
        opacity: 0;
      }
      .dv-cam__actions {
        z-index: 4;
      }
      /* error and unavailable: the unavailable skin — page fill, dashed hairline, one glyph, one line */
      .dv-cam.is-off {
        background: var(--fluvy-page);
        outline: 1px dashed var(--fluvy-unavailable-border);
        outline-offset: -1px;
      }
      .dv-cam.is-off .fv-plate__img {
        display: none;
      }
      .dv-cam__off {
        position: absolute;
        left: 0;
        right: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
      }
      /* one line, or two on a narrow plate ("No image from the camera" in a 211 column): never a word cut */
      .dv-cam__off p {
        max-width: 100%;
        font-size: 13px;
        font-weight: 500;
        line-height: 24px;
        color: var(--fluvy-unavailable);
        text-align: center;
        overflow-wrap: anywhere;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }
      .dv-cam:fullscreen {
        border-radius: 0;
        background: var(--fluvy-neutral-05);
      }
      .dv-cam:fullscreen .fv-plate__img {
        object-fit: contain;
      }
      /* a low picture leaves its clock out (the rounds would sit on it); full screen has the room for it */
      .dv-cam__time.is-low {
        display: none;
      }
      .dv-cam:fullscreen .dv-cam__time.is-low {
        display: inline-flex;
      }
      /* the snapshot round, left out of a low narrow plate, is back in full screen */
      .dv-cam__snap {
        display: contents;
      }
      .dv-cam__snap.is-low {
        display: none;
      }
      .dv-cam:fullscreen .dv-cam__snap.is-low {
        display: contents;
      }
      /* the whole picture: what the shape does not fill is the screen's dark, as a player's bands are */
      .dv-cam.is-contain:not(.is-off) {
        background: var(--fluvy-neutral-05);
      }
      .dv-cam.is-contain .fv-plate__img {
        object-fit: contain;
      }
      /* frames under a second apart cut as a video does: a fade would never finish before the next */
      .dv-cam.is-quick .fv-plate__img.is-on {
        animation: none;
      }
      /* Home Assistant's stream fills the plate as the stills do */
      .dv-cam__stream {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
      }
      .dv-cam:fullscreen .dv-cam__shade {
        display: none;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    stamp_: { state: true },
    failed_: { state: true },
    stale_: { state: true },
    native_: { state: true },
    fullscreen_: { state: true },
  };
  /** The picture fills the screen: its button leaves it, and says so. */
  declare fullscreen_: boolean;

  /** The two stacked frames: the next one loads behind and shows once decoded. */
  private readonly frames = new Crossfade(
    this,
    () => {
      this.inFlight = 0;
      this.failures = 0;
      this.stamp_ = Date.now();
      this.failed_ = false;
      this.stale_ = false;
      // the frame is the front one once this update has drawn it: its shape is read then
      void this.updateComplete.then(() => this.readNative());
    },
    () => this.onError(),
  );
  /** The camera's own shape (width over height), read off the first frame shown; 0 until then. */
  declare native_: number;
  /** When the shown frame arrived. */
  declare stamp_: number;
  /** No frame to show: none ever came, or the camera kept failing. */
  declare failed_: boolean;
  /** The shown frame is older than it should be: the last request failed, or the loop is stopped. */
  declare stale_: boolean;

  private timer = 0;
  /** Seconds the running interval was started with, so a config change restarts it. */
  private period = 0;
  /** Home Assistant's stream: one element, kept while the card is on screen or near it, gone with the card. */
  private readonly holder = new StreamHolder(this, () => this.sync());
  private inFront = true;
  /** When the request now in flight was made; 0 when there is none. */
  private inFlight = 0;
  private failures = 0;

  constructor() {
    super();
    this.stamp_ = 0;
    this.failed_ = false;
    this.stale_ = false;
    this.native_ = 0;
    this.fullscreen_ = false;
  }

  static override keys = configKeys<CameraCardConfig>()([
    'rows',
    'show_rows',
    'refresh',
    'subtitle',
    'camera_view',
    'aspect_ratio',
    'fit_mode',
  ]);
  static override lists: readonly RowsListSpec[] = [
    { key: 'rows', title: 'editor.rows', keys: ROW_KEYS, schema: rowSchema() },
  ];
  static override aliases: AliasSpec = {
    keys: [{ from: 'sub', to: 'subtitle' }],
    items: { rows: ITEM_ALIASES },
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    camera_view: 'auto',
    aspect_ratio: '16:9',
    fit_mode: 'cover',
    show_rows: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['camera']),
        nameIconFields(),
        textField('subtitle'),
        fieldRow(
          selectField('camera_view', ['auto', 'live']),
          numberField('refresh', 0.5, 300, 0.5),
        ),
        fieldRow(
          selectField('aspect_ratio', CAMERA_RATIOS, { custom: true }),
          selectField('fit_mode', ['cover', 'contain']),
        ),
        boolField('show_rows'),
        entitiesField('rows'),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(s, { refresh: 'refresh' }, {}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): CameraCardConfig {
    return {
      type: 'custom:fluvy-camera-card',
      entity: entities.find((id) => id.startsWith('camera.')) ?? '',
    };
  }

  protected override prepare(config: CameraCardConfig): CameraCardConfig {
    if (!config.entity) throw new Error('fluvy-camera-card: "entity" is required');
    return super.prepare({
      ...config,
      // half a second at the quickest (one request at a time all the same: a slow camera is waited for)
      refresh: Math.min(300, Math.max(0.5, Number(config.refresh) || 10)),
    });
  }

  override getCardSize(): number {
    return 5 + this.rowCount;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- the refresh loop ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    this.inFront = document.visibilityState !== 'hidden';
    document.addEventListener('visibilitychange', this.onTabChange);
    document.addEventListener('fullscreenchange', this.onFullscreen);
    this.sync();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this.onTabChange);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    this.stop();
  }

  /** Full screen entered or left (by the button, Esc or the system): the button follows. */
  private readonly onFullscreen = (): void => {
    this.fullscreen_ =
      this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement !== null;
    // the picture is as wide as the screen now (or the card's again): a still at that width at once
    if (this.timer) this.pull();
  };

  private readonly onTabChange = (): void => {
    this.inFront = document.visibilityState !== 'hidden';
    this.sync();
  };

  private stop(): void {
    clearInterval(this.timer);
    this.timer = 0;
    this.period = 0;
    this.inFlight = 0;
    if (this.stamp_ && !this.stale_) this.stale_ = true;
  }

  /** Whether the last render drew the stream. */
  private shownStream = false;

  /** Home Assistant's stream is what the card shows now (asked for, defined, on screen or only just off it). */
  private get streaming(): boolean {
    return (
      this.config?.camera_view === 'live' && this.holder.playing && this.entity().status === 'ok'
    );
  }

  /**
   * Runs the loop exactly while it is worth running: connected, on screen, tab in front, a camera with a picture, and
   * no stream in its place (asked for on a live card, and again a while after it could not play; stills meanwhile and
   * where there is none).
   */
  private sync(): void {
    const view = this.entity();
    if (this.config?.camera_view === 'live' && view.status === 'ok') this.holder.ask(view.id);
    // the stream comes and goes with the screen, which is not the card's state: draw it again
    const streaming = this.streaming;
    if (streaming !== this.shownStream) {
      this.shownStream = streaming;
      this.requestUpdate();
    }
    const wanted =
      this.isConnected &&
      this.holder.onScreen &&
      this.inFront &&
      !streaming &&
      Boolean(this.hass) &&
      view.status === 'ok' &&
      Boolean(view.attr<string | null>('entity_picture'));
    const seconds = this.config?.refresh ?? 10;
    if (this.timer && (!wanted || seconds !== this.period)) this.stop();
    if (wanted && !this.timer) {
      this.period = seconds;
      this.timer = window.setInterval(() => this.pull(), seconds * 1000);
      this.pull();
    }
  }

  /** Asks the image behind for a fresh still. One request at a time: a slow camera is waited for, not piled onto. */
  private pull(): void {
    const picture = this.entity().attr<string | null>('entity_picture');
    if (!this.hass || !picture) return;
    const now = Date.now();
    if (this.inFlight && now - this.inFlight < STALL_MS) return;
    this.inFlight = now;
    const base = this.hass.hassUrl(picture);
    // the signed token in the URL stays; the still is asked at the plate's width in device pixels (the screen's in
    // full screen: sharp, and no heavier than it needs to be — Home Assistant's own picture cards do the same), and
    // the extra bit keeps the browser from serving one frame forever
    const across = this.fullscreen_ ? Math.max(screen.width, screen.height) : this.contentWidth;
    const width = Math.ceil(across * (window.devicePixelRatio || 1));
    const url = base.startsWith('data:')
      ? `${base}#${now}`
      : `${base}${base.includes('?') ? '&' : '?'}width=${width}&_=${now}`;
    this.frames.show(url);
  }

  /** The first frame has been checked against the remembered shape. */
  private nativeChecked = false;

  /**
   * The camera's own shape: laid out in the one remembered from the last time (so the page does not move before the
   * first frame), then checked against the first frame shown, once — a camera that changed its shape (another
   * profile, turned upright) is taken and remembered anew.
   */
  private readNative(): void {
    if (this.config?.aspect_ratio !== 'native') return;
    if (!this.native_) this.native_ = nativeOf(this.config.entity);
    if (this.nativeChecked) return;
    const front = this.renderRoot.querySelector<HTMLImageElement>('.fv-plate__img.is-on');
    if (!front?.naturalWidth || !front.naturalHeight) return;
    this.nativeChecked = true;
    const ratio = front.naturalWidth / front.naturalHeight;
    if (this.native_ && Math.abs(ratio - this.native_) / this.native_ <= 0.01) return;
    this.native_ = ratio;
    rememberNative(this.config.entity, ratio);
  }

  private onError(): void {
    this.inFlight = 0;
    this.failures += 1;
    if (!this.stamp_ || this.failures >= GIVE_UP) this.failed_ = true;
    else this.stale_ = true;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const previous = changed.get('config') as CameraCardConfig | undefined;
    if (
      previous &&
      (previous.aspect_ratio !== this.config?.aspect_ratio ||
        previous.entity !== this.config?.entity)
    ) {
      this.native_ = 0;
      this.nativeChecked = false;
    }
    // another camera, or stills instead of the stream: the stream goes, and its session with it
    if (
      previous &&
      (previous.camera_view !== this.config?.camera_view || previous.entity !== this.config?.entity)
    )
      this.holder.teardown();
    if (!this.native_ && changed.has('config')) this.readNative();
    if (changed.has('hass') || changed.has('config')) this.sync();
  }

  /** Home Assistant's stream inside the plate: made once, its camera and fit kept current (the whole picture in full screen). */
  private renderStream(ratio: number): HTMLElement {
    return this.holder.draw({
      hass: this.hass,
      stateObj: this.hass?.states[this.config?.entity ?? ''],
      fitMode: this.fullscreen_ || this.config?.fit_mode === 'contain' ? 'contain' : 'cover',
      aspectRatio: ratio,
      className: 'dv-cam__stream',
    });
  }

  /* ---------- actions ---------- */

  private moreInfo(): void {
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement) {
      void document.exitFullscreen();
      return;
    } // the dialog would open behind the picture
    this.tap(this.config?.entity, { action: 'more-info' });
  }

  private fullscreen(): void {
    haptic(this, 'light');
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const box = this.renderRoot.querySelector<HTMLElement>('.dv-cam');
    if (!box || typeof box.requestFullscreen !== 'function') {
      this.moreInfo();
      return;
    } // iPhone: Home Assistant's dialog has the player
    box.requestFullscreen().catch(() => this.moreInfo());
  }

  /* ---------- render ---------- */

  private clock(): string {
    if (!this.stamp_) return '';
    const date = new Date(this.stamp_);
    const full = formatTime(this.hass, date, true);
    return full.length > 9 ? formatTime(this.hass, date, false) : full; // a 12-hour locale keeps the pill's 80 px
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (view.status === 'missing')
      return this.renderEmpty(`${name} · ${stateText(this.hass, view)}`);

    const unusable = view.status !== 'ok';
    const streaming = this.streaming;
    const off =
      unusable || (!streaming && (this.failed_ || !view.attr<string | null>('entity_picture')));
    // the shape asked for (the camera's own once a frame says it), landed on the 4 px grid
    const ratio = cameraRatio(this.config?.aspect_ratio, this.native_);
    const height = plateHeight(this.contentWidth, ratio);
    const contain = this.config?.fit_mode === 'contain';
    // the off block: the 44 glyph, 8, and its line — two lines where the words do not fit the plate's width
    const offText = unusable ? stateText(this.hass, view) : s(this.hass, 'offline');
    const offLines =
      this.headFit.ruler.width('dv-cam__off p', offText) > this.contentWidth - 32 ? 2 : 1;
    const offHeight = 52 + 24 * offLines;
    const offTop = Math.max(0, Math.round((height - offHeight) / 2 / 4) * 4);
    const sub =
      this.config?.subtitle ??
      [view.areaName, stateText(this.hass, view)].filter(Boolean).join(' · ');
    // the head gives way in its order (the sub's last parts, then the circle) before the name is cut
    const fitted = this.headFit.fit({ width: this.contentWidth, title: name, sub, trailing: 44 });
    // inside the picture: "Live" at the top start; where the plate is low its rounds share its rows, and the snapshot
    // round goes before the two would touch; on a taller plate the clock goes before it would touch "Live".
    // "Live" is as wide as its word (12 in, the dot and its 6, 10 out, on the 4 grid), never under 64
    const liveWord = this.headFit.ruler.width('dv-cam__pill dv-cam__live', s(this.hass, 'live'));
    const live = Math.max(64, Math.ceil((26 + liveWord + 10) / 4) * 4);
    const w = this.contentWidth;
    // the rounds share "Live"'s rows under a 100 plate (12 + 24 + 8 + 44 + 12); the clock needs 108 beside them
    const low = height < ROUNDS_PLATE;
    const snapshot = !low || live + 12 + 8 + 96 + 12 <= w;
    // too narrow for the word beside the one round left: its dot alone (32)
    const dot = !this.fullscreen_ && low && !snapshot && live + 12 + 8 + 44 + 12 > w;
    const clock = height >= CLOCK_PLATE && live + 12 + 8 + 80 + 12 <= w;

    return html`<article
      class="fv-card dv-card ${isUsable(view) ? '' : 'is-unavailable'}"
      data-card
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
        tone: isUsable(view) ? toneOf(this.config, 'accent') : 'off',
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: round('dots', 'quiet', this.t('common.more'), () => this.moreInfo()),
        onIconTap: () => this.tap(view.id),
        onHold: () => this.hold(view.id),
        iconLabel: name,
      })}
      <div
        class="dv-cam fv-plate ${off ? 'is-off' : ''} ${contain ? 'is-contain' : ''} ${
          (this.config?.refresh ?? 10) < 1 ? 'is-quick' : ''
        }"
        style="height:${height}px"
      >
        ${streaming ? this.renderStream(ratio) : this.frames.render()}
        ${
          off
            ? html`<div class="dv-cam__off" style="top:${offTop}px;height:${offHeight}px">
                <span class="fv-ico fv-ico--off" data-icon>${glyph('camera')}</span>
                <p>${offText}</p>
              </div>`
            : !this.stamp_ && !streaming
              ? html`<span class="fv-skeleton dv-cam__skeleton"></span>`
              : html` <span class="dv-cam__shade" data-measure="skip"></span>
                  <button
                    class="dv-cam__tap"
                    data-target
                    aria-label=${s(this.hass, 'view', { name })}
                    @click=${() => this.moreInfo()}
                  ></button>
                  <span
                    class="dv-cam__pill dv-cam__live ${this.stale_ && !streaming ? 'is-stale' : ''} ${dot ? 'is-dot' : ''}"
                    style="width:${dot ? 32 : live}px"
                    role="img"
                    aria-label=${s(this.hass, 'live')}
                    aria-hidden=${this.stale_ && !streaming ? 'true' : nothing}
                    ><i></i><span aria-hidden="true">${s(this.hass, 'live')}</span></span
                  >
                  ${
                    streaming
                      ? nothing
                      : html`<span class="dv-cam__pill dv-cam__time ${clock ? '' : 'is-low'}"
                          >${this.clock()}</span
                        >`
                  }
                  <div class="dv-cam__actions">
                    <span class="dv-cam__snap ${snapshot ? '' : 'is-low'}"
                      >${round('snapshot', 'quiet', s(this.hass, 'snapshot'), () => this.moreInfo())}</span
                    >
                    ${
                      this.fullscreen_
                        ? round('close', 'quiet', s(this.hass, 'exit_fullscreen'), () =>
                            this.fullscreen(),
                          )
                        : round('expand', 'quiet', s(this.hass, 'fullscreen'), () =>
                            this.fullscreen(),
                          )
                    }
                  </div>`
        }
      </div>
      ${this.renderRows(true)}
    </article>`;
  }
}
