import {
  haptic,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { clickPress, ico, icon, preventMenu, sheetStyles, startPress } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { keyed } from 'lit/directives/keyed.js';

import { agoShort } from '../helpers/datetime.js';

import { Card, type BaseKey } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';
import { TextRuler } from '../shared/fit.js';
import { FontsSettled } from '../shared/fonts.js';

import {
  actionField,
  boolField,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  textField,
} from '../shared/form.js';
import { configKeys, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const s = strings('scene');

export interface SceneCardConfig extends FluvyCardConfig {
  /** Line under the name. Defaults to the scene's device count, then to when it last ran. */
  subtitle?: string;
  show_subtitle?: boolean;
}

const DOMAINS = ['scene', 'script', 'button', 'input_button', 'automation'] as const;
const DONE_MS = 1200;
/** Below this width (two tiles in a column under ~340) the tile closes its padding. */
const TIGHT = 160;
/** The words' room: the tile less its sides, its 44 circle and the gap after it (16 · 12 on the sheet, 10 · 8 tight). */
const wordsRoom = (width: number, tight: boolean): number =>
  width - (tight ? 20 + 44 + 8 : 32 + 44 + 12);

/** The one call that runs each kind of entity — never a blind `homeassistant.turn_on`. */
const SERVICE: Record<string, readonly [domain: string, service: string]> = {
  scene: ['scene', 'turn_on'],
  script: ['script', 'turn_on'],
  button: ['button', 'press'],
  input_button: ['input_button', 'press'],
  automation: ['automation', 'trigger'],
};

/**
 * A scene, script, button or automation as the sheet's scene tile (76 tall, radius 16, hairline):
 * icon circle, name, and one honest line — how many entities the scene sets, or when it last ran.
 * A scene has no "on", so a press is confirmed by the tile itself: the glyph turns into a check and
 * the line says "Done" for 1.2 s, then both swap back.
 */
export class FluvySceneCard extends Card<SceneCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(): number {
    return 76;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.home,
    css`
      .fv-scene {
        width: 100%;
        min-width: 0;
        animation: fv-enter 420ms var(--fv-ease-out) both;
        animation-delay: var(--fv-enter-delay, 0ms);
      }
      /* out of reach, the scene's own tile wears the off tile's skin: the page fill and the dashed hairline */
      .fv-scene.fv-tile--off {
        background: var(--fluvy-page);
        box-shadow: none;
      }
      /* two-up in a narrow column the tile is ~148 wide: it gives its padding to the words (10 sides, 8 gap — "Unavailable"
         is 74 px at 13/500), and a name takes a second line before it loses its end ("Good night" is 83 px at 15/600; 2 × 20 + 16 sits in the 76) */
      .is-tight.fv-scene {
        gap: 8px;
        padding-left: 10px;
        padding-right: 10px;
      }
      .is-tight .fv-row__title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .fv-ico > span {
        display: flex;
      }
    `,
  ];

  static override properties = { ...Card.properties, done_: { state: true } };

  /** True for 1.2 s after a press. */
  declare done_: boolean;

  private doneTimer: number | undefined;
  /** Swaps animate only once the tile has been pressed: on load the tile's own entrance is the motion. */
  private swaps = false;

  /** The line under the name is measured in its own class, so a state is dropped rather than cut. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);

  constructor() {
    super();
    this.done_ = false;
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  /** A state under the name only while it fits the tile's words column: "Never run" is dropped, never "Never r…". */
  private fitted(line: string, tight: boolean): string {
    return this.ruler.width('fv-row__sub', line) <= wordsRoom(this.width, tight) ? line : '';
  }

  /** A tap on the tile runs the scene: of the base it honours the entity, its name and icon, its colours and a hold. */
  static override base: readonly BaseKey[] = [
    'entity',
    'name',
    'icon',
    'tone',
    'color',
    'card_color',
    'hold_action',
  ];
  static override keys = configKeys<SceneCardConfig>()(['subtitle', 'show_subtitle']);
  static override aliases: AliasSpec = { keys: [{ from: 'meta', to: 'subtitle' }] };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ show_subtitle: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(DOMAINS),
        nameIconFields(),
        fieldRow(textField('subtitle'), boolField('show_subtitle')),
        ...colourFields(),
        actionField('hold_action'),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): SceneCardConfig {
    return {
      type: 'custom:fluvy-scene-card',
      entity: entities.find((id) => id.slice(0, id.indexOf('.')) in SERVICE) ?? '',
    };
  }

  protected override prepare(config: SceneCardConfig): SceneCardConfig {
    if (!config.entity) throw new Error('fluvy-scene-card: "entity" is required');
    if (!(config.entity.slice(0, config.entity.indexOf('.')) in SERVICE))
      throw new Error(`fluvy-scene-card: "entity" must be one of ${DOMAINS.join(', ')}`);
    return config;
  }

  override getCardSize(): number {
    return 2;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 6, rows: 'auto' };
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.doneTimer);
    this.doneTimer = undefined;
    this.done_ = false;
  }

  private run(view: EntityView): void {
    const call = SERVICE[view.domain];
    if (!call || this.done_) return; // a second tap inside the "Done" beat is the same gesture, not a second run
    haptic(this, 'light');
    this.swaps = true;
    this.call(call[0], call[1], {}, view.id);
    this.done_ = true;
    clearTimeout(this.doneTimer);
    this.doneTimer = window.setTimeout(() => {
      this.done_ = false;
    }, DONE_MS);
  }

  /** Config text, else what the scene sets, else when it last ran. A scene that never ran has the state `unknown`: that is not an error. */
  private meta(view: EntityView): string {
    if (this.config?.subtitle !== undefined) return this.config.subtitle;
    const members = view.attr<readonly string[] | null>('entity_id');
    if (Array.isArray(members) && members.length > 0) {
      return members.length === 1
        ? s(this.hass, 'device')
        : s(this.hass, 'devices', { count: members.length });
    }
    // scenes and buttons keep the time they last ran in their state, scripts and automations in an attribute
    const last =
      view.attr<string | null>('last_triggered') ??
      (view.status === 'ok' && view.domain !== 'script' && view.domain !== 'automation'
        ? view.state
        : null);
    const when = last ? new Date(last) : null;
    return when && !Number.isNaN(when.getTime())
      ? agoShort(this.hass, when)
      : s(this.hass, 'never');
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;

    const isTight = this.width < TIGHT;
    const tight = isTight ? 'is-tight' : '';

    if (view.status === 'missing' || view.status === 'unavailable') {
      // "Entity not found" does not fit beside a 44 circle in a half-width tile; the tile says it shorter, and a
      // tile too narrow even for that says it with its dashed skin alone
      const why = this.fitted(
        view.status === 'missing' ? s(this.hass, 'missing') : stateText(this.hass, view),
        isTight,
      );
      return html`<button
        class="fv-scene fv-tile--off fv-tile--tap ${tight}"
        data-card
        data-target
        @click=${() => this.tap(view.id, { action: 'more-info' })}
      >
        ${ico('ban', 'off')}
        <span class="fv-row__text"
          ><span class="fv-row__title" data-name>${name}</span
          >${why ? html`<span class="fv-row__sub">${why}</span>` : nothing}</span
        >
      </button>`;
    }

    const done = this.done_;
    // a typed subtitle is the person's own words: a name, which may end in an ellipsis; a state is fitted or dropped
    const typed = this.config?.subtitle !== undefined;
    const meta = this.config?.show_subtitle === false ? '' : this.meta(view);
    const line = done && meta ? s(this.hass, 'done') : typed ? meta : this.fitted(meta, isTight);
    const swap = this.swaps ? 'fv-swap' : '';

    // the tile is the scene's button: a tap runs it, a still press is the hold action (its details by default)
    return html`<button
        class="fv-scene fv-tile--tap ${tight}"
        data-card
        data-target
        .fvTap=${() => this.run(view)}
        .fvHold=${() => this.hold(view.id)}
        @pointerdown=${startPress}
        @contextmenu=${preventMenu}
        @click=${clickPress}
      >
        <span class="fv-ico fv-ico--${toneOf(this.config, 'accent')}" data-icon>
          ${keyed(done, html`<span class=${swap}>${icon(done ? 'check' : (this.config?.icon ?? glyphFor(view)))}</span>`)}
        </span>
        <span class="fv-row__text">
          <span class="fv-row__title" data-name>${name}</span>
          ${line ? keyed(line, html`<span class="fv-row__sub ${swap}" data-name=${typed && !done ? '' : nothing}>${line}</span>`) : nothing}
        </span>
      </button>
      <!-- read out, not shown: a press is confirmed to a screen reader too -->
      <span class="fv-sr" role="status">${done ? `${name} · ${s(this.hass, 'done')}` : ''}</span>`;
  }
}
