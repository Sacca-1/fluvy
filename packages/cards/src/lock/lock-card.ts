import {
  haptic,
  isUsable,
  stateText,
  strings,
  type EntityView,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type HomeAssistant,
} from '@fluvy/core';

import {
  button,
  clamp,
  glyph,
  head,
  localPoint,
  reducedMotion,
  sheetStyles,
  spring,
  trackDrag,
  type SpringHandle,
  type Tone,
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

import '../alarm/keypad.js';
import type { FluvyKeypad } from '../alarm/keypad.js';
import { Card, HEAD_BASE } from '../shared/base.js';

import {
  actionFields,
  boolField,
  colourFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  showIconField,
  textField,
} from '../shared/form.js';

import {
  changedLine,
  changedShort,
  ROW_KEYS,
  RowsCard,
  rowSchema,
  type RowsCardConfig,
} from './rows.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { lockHeight } from '../devices-family.js';

const s = strings('lock');

export interface LockCardConfig extends RowsCardConfig {
  subtitle?: string;
  /** `full` (default): the slide and the rows. `compact`: the head and the slide. */
  variant?: 'full' | 'compact';
}

type LockService = 'lock' | 'unlock' | 'open';

/** `lock.open` — the latch some locks can pull back. */
const FEATURE_OPEN = 1;
/** How far along the track the knob has to be when it is let go for the gesture to count. */
const COMMIT = 0.85;
/** The gesture starts on the knob (36 px, grabbed within a 64 px zone), not anywhere on the track. */
const GRAB = 32;
/** A keyboard unlock asks twice; the second press has to come within this window. */
const CONFIRM_MS = 2000;
/** 4 px inset at both ends of the track plus the 36 px knob. */
const KNOB_BOX = 44;
/** A `code_format` that only admits digits: `^\d{4}$`, `\d+`, `^[0-9]{4,8}$`. Anything else needs a real text field. */
const NUMERIC = /^\^?(?:\\d|\[0-9\])(?:\{(\d+)(?:,(\d*))?\}|[+*])?\$?$/;

/**
 * The lock: one deliberate gesture and nothing else. The knob starts at the true start of a 44 px
 * track and follows the finger; let go past 85 % of the travel and it commits, anywhere short of that
 * it springs back and nothing is called. A tap does nothing, a cancelled touch does nothing, the
 * keyboard asks twice, the latch asks in a sheet, and a lock with a code asks for it on the keypad.
 */
export class FluvyLockCard extends RowsCard<LockCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: LockCardConfig, hass?: HomeAssistant): number {
    return lockHeight(config, hass);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    css`
      .dv-card {
        width: auto;
      }
      .dv-slide {
        touch-action: pan-y;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        border-radius: 22px;
      }
      .dv-slide:not(.is-inert) .dv-slide__knob {
        cursor: grab;
      }
      .dv-slide.is-dragging,
      .dv-slide.is-dragging .dv-slide__knob {
        cursor: grabbing;
      }
      /* the same control, mirrored: an open lock slides back the other way, so the ring waits at the start */
      .dv-slide--reverse .dv-slide__end {
        right: auto;
        left: 4px;
      }
      .dv-slide__knob {
        transition:
          scale var(--fv-base) var(--fv-spring),
          box-shadow var(--fv-base) var(--fv-ease);
      }
      .dv-slide.is-dragging .dv-slide__knob {
        scale: 1.12;
        will-change: transform;
        box-shadow:
          0 0 0 2px var(--tone-ink),
          0 8px 18px -4px color-mix(in srgb, var(--fluvy-neutral-05) 32%, transparent),
          0 0 0 6px var(--knob-halo);
      }
      .dv-slide__hint {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .dv-slide__hint.is-hidden {
        display: none;
      }
      .dv-slide.is-moving .dv-slide__hint {
        animation: fv-shimmer 1200ms ease-in-out infinite;
      }
      .dv-slide__end {
        animation: fv-fade var(--fv-slow) var(--fv-ease) both;
        transition:
          color var(--fv-fast) var(--fv-ease),
          box-shadow var(--fv-fast) var(--fv-ease);
      }
      /* past the commit point the destination lights up: letting go now does it */
      .dv-slide.is-ready .dv-slide__end {
        color: var(--fluvy-accent);
        box-shadow: 0 0 0 2px var(--fluvy-accent);
      }
      .dv-slide--warning .fv-knob {
        --tone-ink: var(--fluvy-warning);
      }
      .dv-slide.is-inert .fv-knob {
        --tone-ink: var(--fluvy-text-disabled);
      }
      .dv-slide:focus-visible {
        outline-offset: 3px;
      }
      .dv-open {
        margin-top: 16px;
      }
      .dv-open .fv-btn {
        height: 44px;
      } /* a full-width action row, not a lone 148 × 48 sheet button */
    `,
  ];

  static override properties = { ...Card.properties, confirming_: { state: true } };

  /** True between the two presses of a keyboard unlock. */
  declare confirming_: boolean;

  private track: HTMLElement | null = null;
  private knob: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private detach: (() => void) | null = null;
  private motion: SpringHandle | null = null;
  private confirmTimer = 0;
  private dragging = false;
  private placed = false;
  private ready = false;
  private from = 0;
  private pos = 0;
  private goal = 0;
  /** Whether Home Assistant holds a default code for the lock (then it asks for none). */
  private readonly defaultCode = new Map<string, Promise<boolean>>();

  constructor() {
    super();
    this.confirming_ = false;
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<LockCardConfig>()(['rows', 'show_rows', 'subtitle', 'variant']);
  static override lists: readonly RowsListSpec[] = [
    { key: 'rows', title: 'editor.rows', keys: ROW_KEYS, schema: rowSchema() },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ variant: 'full', show_rows: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['lock']),
        nameIconFields(),
        showIconField(),
        fieldRow(textField('subtitle'), selectField('variant', ['full', 'compact'])),
        boolField('show_rows'),
        entitiesField('rows'),
        ...colourFields(),
        actionFields(),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): LockCardConfig {
    return {
      type: 'custom:fluvy-lock-card',
      entity: entities.find((id) => id.startsWith('lock.')) ?? '',
    };
  }

  protected override prepare(config: LockCardConfig): LockCardConfig {
    if (!config.entity) throw new Error('fluvy-lock-card: "entity" is required');
    this.defaultCode.clear();
    return super.prepare(config);
  }

  private get compact(): boolean {
    return this.config?.variant === 'compact';
  }

  override getCardSize(): number {
    return 3 + (this.compact ? 0 : this.rowCount);
  }
  /** The full card takes a section, the compact one half of it (in a third, its head left the name no room). */
  override getGridOptions(): LovelaceGridOptions {
    return this.compact
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detach?.();
    this.detach = null;
    this.track = this.knob = this.hint = null;
    this.motion?.stop();
    this.dragging = false;
    this.placed = false;
    clearTimeout(this.confirmTimer);
    this.confirmTimer = 0;
  }

  /* ---------- state ---------- */

  /** The knob rests at the start while the bolt is (going) home: the next gesture unlocks. Everything else locks. */
  private get atStart(): boolean {
    const view = this.entity();
    const state = this.stateOf(view);
    return !isUsable(view) || state === 'locked' || state === 'locking';
  }

  /** Nothing to slide: no lock to talk to, or the bolt is already on its way. */
  private get frozen(): boolean {
    const view = this.entity();
    const state = this.stateOf(view);
    return !isUsable(view) || state === 'locking' || state === 'unlocking' || state === 'opening';
  }

  private get span(): number {
    return Math.max(0, this.contentWidth - KNOB_BOX);
  }

  private get rest(): number {
    return this.atStart ? 0 : this.span;
  }

  /** 0 at rest → 1 at the destination, whichever way the control points. */
  private travel(pos: number): number {
    const span = this.span;
    if (span <= 0) return 0;
    return this.atStart ? pos / span : (span - pos) / span;
  }

  /* ---------- the gesture ---------- */

  private paint(pos: number): void {
    this.pos = pos;
    const travel = this.travel(pos);
    // the position as `translate`, as the ruler's knob rides: the lift's `scale` composes after it, so it never
    // scales the travel (a `transform` would ride ahead of the finger by the lift)
    if (this.knob) this.knob.style.translate = `${Math.round(pos * 100) / 100}px 0`;
    if (this.hint) this.hint.style.opacity = String(clamp(1 - travel * 1.6, 0, 1));
    const ready = this.dragging && travel >= COMMIT;
    if (ready !== this.ready) {
      this.ready = ready;
      this.track?.classList.toggle('is-ready', ready);
      if (ready) haptic(this, 'selection');
    }
  }

  private springTo(target: number): void {
    this.goal = target;
    this.motion ??= spring(this.pos, (value) => this.paint(value), {
      stiffness: 340,
      damping: 0.9,
    });
    this.motion.set(target);
  }

  private jumpTo(target: number): void {
    this.goal = target;
    this.motion ??= spring(target, (value) => this.paint(value), { stiffness: 340, damping: 0.9 });
    this.motion.jump(target);
  }

  /** A tap is answered, never obeyed: the knob leans towards the destination and comes back. */
  private nudge(): void {
    if (reducedMotion() || !this.knob?.animate) return;
    const lean = this.atStart ? 12 : -12;
    this.knob.animate(
      [{ transform: 'none' }, { transform: `translateX(${lean}px)` }, { transform: 'none' }],
      {
        duration: 420,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    );
  }

  private bind(track: HTMLElement): void {
    this.detach = trackDrag(track, {
      start: (sample) => {
        if (this.frozen) return false;
        // the knob is placed in the track's own pixels: the finger is read in them too (a zoomed view)
        if (Math.abs(localPoint(track, sample.event).x - (KNOB_BOX / 2 + this.pos)) > GRAB) {
          this.nudge();
          return false;
        }
        this.motion?.stop();
        this.dragging = true;
        this.resetConfirm();
        this.from = this.pos;
        track.classList.add('is-dragging');
        return true;
      },
      move: (sample) => this.jumpTo(clamp(this.from + sample.dx, 0, this.span)),
      end: (sample, moved) => {
        const decided =
          moved && sample.event.type === 'pointerup' && this.travel(this.pos) >= COMMIT; // a cancelled touch never decides
        this.dragging = false;
        track.classList.remove('is-dragging');
        if (decided) {
          this.commit();
          return;
        }
        if (!moved) this.nudge();
        this.springTo(this.rest);
      },
    });
  }

  private resetConfirm(): void {
    clearTimeout(this.confirmTimer);
    this.confirmTimer = 0;
    if (this.confirming_) this.confirming_ = false;
  }

  /** Keyboard and assistive activation: the first press asks, the second one within 2 s decides. */
  private press(): void {
    if (this.frozen || this.dragging) return;
    if (this.confirming_) {
      this.resetConfirm();
      this.commit();
      return;
    }
    this.confirming_ = true;
    this.confirmTimer = window.setTimeout(() => {
      this.confirmTimer = 0;
      this.confirming_ = false;
    }, CONFIRM_MS);
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) this.press(); // a held key is one press, however long it is held
  }

  private commit(): void {
    const unlocking = this.atStart;
    haptic(this, 'success');
    const coded = Boolean(this.entity().attr<string | null>('code_format'));
    this.springTo(coded ? this.rest : unlocking ? this.span : 0); // with a code still to come, the knob goes home and waits
    void this.request(unlocking ? 'unlock' : 'lock');
  }

  /* ---------- services ---------- */

  private hasDefaultCode(entityId: string): Promise<boolean> {
    let known = this.defaultCode.get(entityId);
    if (!known) {
      known = this.hass
        ? this.hass
            .callWS<{ options?: { lock?: { default_code?: string | null } } } | null>({
              type: 'config/entity_registry/get',
              entity_id: entityId,
            })
            .then(
              (entry) => Boolean(entry?.options?.lock?.default_code),
              () => false,
            )
        : Promise.resolve(false);
      this.defaultCode.set(entityId, known);
    }
    return known;
  }

  /** Locking and unlocking come from the slide and go straight out; the latch and any code pass through the sheet. */
  private async request(service: LockService): Promise<void> {
    const view = this.entity();
    if (view.status !== 'ok' && view.status !== 'unknown') return;
    const name = this.config?.name ?? view.name;
    const label = s(this.hass, service);
    const format = view.attr<string | null>('code_format');
    const coded = Boolean(format) && !(await this.hasDefaultCode(view.id));
    if (!coded) {
      if (service !== 'open') {
        void this.send(service).then((done) => {
          if (!done) haptic(this, 'failure');
        });
        return;
      }
      this.keypad?.open({
        title: label,
        sub: `${name} · ${stateText(this.hass, view).toLocaleLowerCase(this.hass?.language)}`,
        primary: { key: service, label, code: false },
        run: () => this.send(service),
      });
      return;
    }
    const numeric = NUMERIC.exec(format ?? '');
    if (!numeric) {
      this.tap(view.id, { action: 'more-info' });
      return;
    } // letters belong in Home Assistant's own dialog, which has a text field
    let pattern: RegExp | null = null;
    try {
      pattern = new RegExp(format ?? '');
    } catch {
      pattern = null;
    }
    const fixed =
      numeric[1] !== undefined && numeric[2] === undefined
        ? Number(numeric[1])
        : numeric[2]
          ? Number(numeric[2])
          : undefined;
    this.keypad?.open({
      title: label,
      sub: name,
      primary: { key: service, label, code: true },
      length: fixed && fixed <= 10 ? fixed : undefined,
      accepts: (code) => (pattern ? pattern.test(code) : code.length > 0),
      run: (_key, code) => this.send(service, code),
    });
  }

  private async send(service: LockService, code?: string): Promise<boolean> {
    const id = this.config?.entity;
    if (!this.hass || !id) return false;
    this.expect(id, service === 'lock' ? 'locked' : service === 'unlock' ? 'unlocked' : 'open');
    try {
      await this.hass.callService('lock', service, code ? { code } : {}, { entity_id: id });
      return true;
    } catch {
      this.expect(id, this.entity(id).state); // Home Assistant said no (and says why in its own toast): back to the truth
      return false;
    }
  }

  private get keypad(): FluvyKeypad | null {
    return this.renderRoot.querySelector('fluvy-keypad');
  }

  /* ---------- render ---------- */

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const track = this.renderRoot.querySelector<HTMLElement>('.dv-slide');
    if (track !== this.track) {
      this.detach?.();
      this.detach = null;
      this.track = track;
      this.knob = track?.querySelector<HTMLElement>('.dv-slide__knob') ?? null;
      this.hint = track?.querySelector<HTMLElement>('.dv-slide__hint') ?? null;
      this.placed = false;
      if (track) this.bind(track);
    }
    if (!this.track || this.dragging) return;
    if (!this.placed || changed.has('width')) {
      this.placed = true;
      this.jumpTo(this.rest);
    } else if (this.goal !== this.rest) this.springTo(this.rest);
  }

  private tone(view: EntityView, state: string): Tone {
    if (!isUsable(view)) return 'off';
    if (view.status === 'unknown') return 'neutral';
    return state === 'locked' || state === 'locking' ? 'accent' : 'warning'; // an open door asks for attention, like an open sensor
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    // out of reach (unavailable, missing) it keeps its anatomy and its size, its controls disabled: only the colours
    // change (1.9)
    const unusable = !isUsable(view);
    const compact = this.compact;
    const state = this.stateOf(view);
    const atStart = this.atStart;
    const frozen = this.frozen;
    const moving = frozen && !unusable;
    const tone = this.tone(view, state);
    const shown =
      view.stateObj && state !== view.state
        ? stateText(this.hass, { ...view, state, stateObj: { ...view.stateObj, state } })
        : stateText(this.hass, view);
    // the latch keeps its place out of reach, disabled
    const latch = view.supports(FEATURE_OPEN);

    const hint = frozen
      ? shown
      : this.confirming_
        ? s(this.hass, atStart ? 'press_again_unlock' : 'press_again_lock')
        : this.t(atStart ? 'lock.slide_unlock' : 'lock.slide_lock');
    // the hint sits between the knob and the end ring: where it would not (a 211 column in German), the track says
    // nothing in words — the glyphs say it, and the status line reads it out
    const hintShown =
      this.headFit.ruler.width('dv-slide__hint', hint) <= this.contentWidth - 2 * KNOB_BOX - 16;

    // the head gives way in its order: the badge first (the circle's glyph says locked or open too), then the sub
    const fitted = this.headFit.fit({
      width: this.contentWidth,
      title: name,
      sub: this.config?.subtitle ?? changedLine(this.hass, view),
      shorter: this.config?.subtitle === undefined ? changedShort(this.hass, view) : [],
      badge: { text: shown, tone },
    });
    return html`<article
        class="fv-card dv-card ${unusable ? 'is-unavailable is-off' : ''}"
        data-card
      >
        ${head({
          icon: fitted.icon ? (this.config?.icon ?? (atStart ? 'lock' : 'unlock')) : null,
          tone,
          title: name,
          name: true,
          sub: fitted.sub,
          trailing: fitted.badge,
          cut: fitted.cut,
          ...this.headActions(view.id),
        })}
        <div
          class="dv-slide ${atStart ? '' : 'dv-slide--reverse'} ${state === 'jammed' ? 'dv-slide--warning' : ''} ${frozen ? 'is-inert' : ''} ${moving ? 'is-moving' : ''}"
          data-control
          data-target
          role="button"
          tabindex=${frozen ? -1 : 0}
          aria-label=${s(this.hass, atStart ? 'unlock_label' : 'lock_label', { name })}
          aria-disabled=${frozen ? 'true' : 'false'}
          @keydown=${(event: KeyboardEvent) => this.onKeydown(event)}
          @click=${(event: MouseEvent) => {
            if (event.detail === 0)
              this.press(); /* a screen reader's activation; a finger has to slide */
          }}
          @blur=${() => this.resetConfirm()}
        >
          <span
            class="fv-knob fv-knob--accent dv-slide__knob"
            data-measure="value"
            style="left:4px;top:4px;width:36px;height:36px"
          ></span>
          <span class="dv-slide__hint ${hintShown ? '' : 'is-hidden'}">${hint}</span>
          ${keyed(atStart, html`<span class="dv-slide__end">${glyph(atStart ? 'unlock' : 'lock')}</span>`)}
        </div>
        <span class="fv-sr" role="status" data-measure="skip">${this.confirming_ ? hint : ''}</span>
        ${
          latch && !compact
            ? html`<div class="dv-open">
                ${button(s(this.hass, 'open'), 'quiet', () => void this.request('open'), true, unusable)}
              </div>`
            : nothing
        }
        ${compact ? nothing : this.renderRows()}
      </article>
      <fluvy-keypad
        ?dark=${this.dark}
        ?no-theme=${this.noTheme}
        .hass=${this.hass}
      ></fluvy-keypad>`;
  }
}
