import {
  haptic,
  isUsable,
  resolveEntity,
  stateText,
  strings,
  type EntityView,
  type HassEntity,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';

import {
  head,
  label,
  options,
  sheetStyles,
  type GlyphName,
  type ChipItem,
  type OptionItem,
  type Tone,
} from '@fluvy/ui';

import { css, html, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit';

import { changedLine, ROW_KEYS, RowsCard, rowSchema, type RowsCardConfig } from '../lock/rows.js';

import { Card } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorWord,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  textField,
} from '../shared/form.js';

import './keypad.js';
import type { FluvyKeypad, KeypadAction } from './keypad.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { chipRow, fitsOneRow } from '../shared/chips.js';
import { optionCell, optionColumnsFor, optionsHold, valuesHold } from '../shared/options.js';
import { TextRuler } from '../shared/fit.js';
import { FontsSettled } from '../shared/fonts.js';
import { alarmHeight } from '../devices-family.js';

const s = strings('alarm');

export interface AlarmCardConfig extends RowsCardConfig {
  subtitle?: string;
  /** The modes to offer, in this order (`['disarm', 'arm_home', 'arm_away']`). Default: every mode the panel has. */
  modes?: readonly string[];
  /** `tiles` (default): the modes as option tiles, then the rows. `compact`: the head and the modes as chips. */
  variant?: 'tiles' | 'compact';
}

type SKey = Parameters<typeof s>[1];
type ModeKey =
  'disarm' | 'arm_home' | 'arm_away' | 'arm_night' | 'arm_vacation' | 'arm_custom_bypass';

interface Mode {
  readonly key: ModeKey;
  /** The state the panel reports once this mode is in force. */
  readonly state: string;
  readonly service: string;
  /** `supported_features` bit; 0 for disarm, which every panel can do. */
  readonly bit: number;
  readonly glyph: GlyphName;
  readonly tile: SKey;
  readonly value: SKey;
}

const DISARM: Mode = {
  key: 'disarm',
  state: 'disarmed',
  service: 'alarm_disarm',
  bit: 0,
  glyph: 'unlock',
  tile: 'disarmed',
  value: 'v_off',
};
const MODES: readonly Mode[] = [
  DISARM,
  {
    key: 'arm_home',
    state: 'armed_home',
    service: 'alarm_arm_home',
    bit: 1,
    glyph: 'home',
    tile: 'home',
    value: 'v_perimeter',
  },
  {
    key: 'arm_away',
    state: 'armed_away',
    service: 'alarm_arm_away',
    bit: 2,
    glyph: 'away',
    tile: 'away',
    value: 'v_all',
  },
  {
    key: 'arm_night',
    state: 'armed_night',
    service: 'alarm_arm_night',
    bit: 4,
    glyph: 'moon',
    tile: 'night',
    value: 'v_night',
  },
  {
    key: 'arm_vacation',
    state: 'armed_vacation',
    service: 'alarm_arm_vacation',
    bit: 32,
    glyph: 'map',
    tile: 'vacation',
    value: 'v_extended',
  },
  {
    key: 'arm_custom_bypass',
    state: 'armed_custom_bypass',
    service: 'alarm_arm_custom_bypass',
    bit: 16,
    glyph: 'shield',
    tile: 'custom',
    value: 'v_bypass',
  },
];

/** A panel that reports no features at all still arms home and away — the two every integration has. */
const DEFAULT_FEATURES = 1 | 2;
/** How long the chosen tile stays lit while the panel has not answered yet. */
const PENDING_MS = 4000;

/**
 * The card picker shows a live preview built from `getStubConfig`. A home without an alarm panel would
 * get no preview at all (only the description), so the stub names this placeholder, which the card draws
 * as a disarmed panel arming home, away and night until an entity is chosen.
 */
const PREVIEW_ENTITY = 'alarm_control_panel.fluvy_preview';

function previewState(hass: HomeAssistant): HassEntity {
  const now = new Date().toISOString();
  return {
    entity_id: PREVIEW_ENTITY,
    state: 'disarmed',
    last_changed: now,
    last_updated: now,
    attributes: {
      friendly_name: s(hass, 'preview'),
      supported_features: 1 | 2 | 4,
      code_format: null,
    },
  };
}

/**
 * The alarm panel: state in the head, the modes the panel really supports as option tiles, sensors
 * as rows. Arming without a code is one tap. Disarming never is: it goes through the sheet — the
 * keypad when the panel wants a code, a confirmation when it does not. The card never pretends:
 * the badge shows what the panel reports, only the chosen tile lights up while it answers.
 */
export class FluvyAlarmCard extends RowsCard<AlarmCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: AlarmCardConfig): number {
    return alarmHeight(config);
  }

  /** Widths laid out by the browser in the row's own classes: the compact card's chips are measured with it. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    css`
      .dv-card {
        width: auto;
      }
      .fv-options {
        row-gap: 4px;
      }
      /* a tile too narrow for "Perimeter" keeps the glyph and the mode, and gives the empty line back */
      .is-compact .fv-option__value {
        display: none;
      }
      /* the compact card's one row: the modes as chips, 44 under the head's 16 (more where even the words wrap) */
      .dv-alarm__row {
        display: flex;
        align-items: center;
        min-height: 44px;
        margin-top: 16px;
      }
      .dv-alarm__row > .fv-chips {
        flex: 1;
        margin-top: 0;
      }
    `,
  ];

  static override properties = { ...Card.properties, pending_: { state: true } };

  /** The mode the user just chose, lit until the panel's state moves (or a few seconds pass). */
  declare pending_: ModeKey | '';

  private pendingTimer = 0;

  constructor() {
    super();
    this.pending_ = '';
    // the mode tiles' columns and the chips are measured: a web font arriving changes every width
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  static override keys = configKeys<AlarmCardConfig>()([
    'rows',
    'show_rows',
    'subtitle',
    'modes',
    'variant',
  ]);
  static override lists: readonly RowsListSpec[] = [
    { key: 'rows', title: 'editor.rows', keys: ROW_KEYS, schema: rowSchema() },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ variant: 'tiles', show_rows: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['alarm_control_panel']),
        nameIconFields(),
        fieldRow(textField('subtitle'), selectField('variant', ['tiles', 'compact'])),
        {
          name: 'modes',
          selector: {
            select: {
              multiple: true,
              mode: 'list',
              options: MODES.map((mode) => ({
                value: mode.key,
                label: editorWord(`alarm.${mode.tile}` as MessageKey),
              })),
            },
          },
        },
        boolField('show_rows'),
        entitiesField('rows'),
        ...colourFields(),
        actionFields(),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): AlarmCardConfig {
    return {
      type: 'custom:fluvy-alarm-card',
      entity: entities.find((id) => id.startsWith('alarm_control_panel.')) ?? PREVIEW_ENTITY,
    };
  }

  protected override entity(id: string | undefined = this.config?.entity): EntityView {
    const hass = this.hass;
    if (id !== PREVIEW_ENTITY || !hass || hass.states[id]) return super.entity(id);
    return resolveEntity({ ...hass, states: { ...hass.states, [id]: previewState(hass) } }, id);
  }

  protected override prepare(config: AlarmCardConfig): AlarmCardConfig {
    if (!config.entity) throw new Error('fluvy-alarm-card: "entity" is required');
    return super.prepare(config);
  }

  private get compact(): boolean {
    return this.config?.variant === 'compact';
  }

  override getCardSize(): number {
    return this.compact ? 3 : 4 + this.rowCount;
  }
  /** The full card takes a section, the compact one half of it: three chips need the whole half. */
  override getGridOptions(): LovelaceGridOptions {
    return this.compact
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clearPending();
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const previous = changed.get('hass') as HomeAssistant | undefined;
    const id = this.config?.entity ?? '';
    if (this.pending_ && previous && previous.states[id]?.state !== this.hass?.states[id]?.state)
      this.clearPending(); // the panel answered
  }

  /* ---------- model ---------- */

  /**
   * The compact card's chips, one row whatever the width: the modes with their glyphs while those stand on one
   * line, the words alone when they do not, the glyphs alone (each named for a reader) when even the words wrap.
   */
  private chips(tiles: readonly OptionItem[]): ChipItem[] {
    const fit = { ruler: this.ruler, width: this.contentWidth };
    const words = tiles.map((tile) => ({
      key: tile.key,
      label: tile.label,
      active: tile.active ?? false,
    }));
    const glyphed: ChipItem[] = words.map((chip, i) => {
      const glyph = tiles[i]?.glyph;
      return glyph ? { ...chip, glyph } : chip;
    });
    if (fitsOneRow(glyphed, fit)) return glyphed;
    if (fitsOneRow(words, fit)) return words;
    return glyphed.map((chip) => (chip.glyph ? { ...chip, short: true } : chip));
  }

  /** The modes the panel has, in the order the card was given them (all of them, in ours, when it was given none). */
  private modes(view: EntityView): Mode[] {
    const features = view.attr<number | null>('supported_features') || DEFAULT_FEATURES;
    const has = MODES.filter((mode) => mode.bit === 0 || (features & mode.bit) !== 0);
    const asked = this.config?.modes;
    if (!asked?.length) return has;
    return asked
      .map((key) => has.find((mode) => mode.key === key))
      .filter((mode): mode is Mode => mode !== undefined);
  }

  /** Disarming always carries the code when the panel has one; arming only when the panel says so. */
  private needsCode(view: EntityView, key: ModeKey): boolean {
    if (!view.attr<string | null>('code_format')) return false;
    return key === 'disarm' || view.attr<boolean | null>('code_arm_required') !== false;
  }

  private actionLabel(key: ModeKey): string {
    switch (key) {
      case 'disarm':
        return this.t('alarm.disarm');
      case 'arm_home':
        return this.t('alarm.arm_home');
      case 'arm_away':
        return this.t('alarm.arm_away');
      case 'arm_night':
        return this.t('alarm.arm_night');
      case 'arm_vacation':
        return s(this.hass, 'arm_vacation');
      case 'arm_custom_bypass':
        return s(this.hass, 'arm_custom');
    }
  }

  /** The tile to light: the user's choice while it is pending, else the mode in force, else the one the panel is heading to or came from. */
  private activeState(view: EntityView): string {
    const state = view.state;
    if (state === 'arming') return view.attr<string | null>('next_state') ?? '';
    if (state === 'pending' || state === 'triggered')
      return view.attr<string | null>('previous_state') ?? '';
    return state;
  }

  /** The quiet button beside the sheet's main action: the other thing one does with a code in hand. */
  private alternative(view: EntityView, chosen: Mode, modes: readonly Mode[]): Mode | undefined {
    const arms = modes.filter(
      (mode) => mode.bit !== 0 && mode.key !== chosen.key && mode.state !== view.state,
    );
    if (chosen.key !== 'disarm' && view.state !== 'disarmed') return DISARM;
    return arms.find((mode) => mode.key === 'arm_away') ?? arms[0];
  }

  /* ---------- actions ---------- */

  private clearPending(): void {
    clearTimeout(this.pendingTimer);
    this.pendingTimer = 0;
    if (this.pending_) this.pending_ = '';
  }

  private choose(view: EntityView, key: string): void {
    const modes = this.modes(view);
    const mode = modes.find((m) => m.key === key);
    if (!mode || view.status !== 'ok' || view.state === mode.state) return;
    const coded = this.needsCode(view, mode.key);
    if (coded && view.attr<string | null>('code_format') !== 'number') {
      this.tap(view.id, { action: 'more-info' });
      return;
    } // letters belong in Home Assistant's own dialog, which has a text field
    if (!coded && mode.key !== 'disarm') {
      haptic(this, 'light');
      void this.send(mode).then((done) => haptic(this, done ? 'success' : 'failure'));
      return;
    }
    const action = (m: Mode): KeypadAction => ({
      key: m.key,
      label: this.actionLabel(m.key),
      code: this.needsCode(view, m.key),
    });
    const other = coded ? this.alternative(view, mode, modes) : undefined;
    this.keypad?.open({
      title: this.actionLabel(mode.key),
      sub: `${this.config?.name ?? view.name} · ${stateText(this.hass, view).toLocaleLowerCase(this.hass?.language)}`,
      primary: action(mode),
      secondary: other ? action(other) : undefined,
      run: (chosen, code) => this.send(modes.find((m) => m.key === chosen) ?? mode, code),
    });
  }

  /** No optimistic state here: a wrong code must never read "Disarmed", not even for a second. */
  private async send(mode: Mode, code?: string): Promise<boolean> {
    const id = this.config?.entity;
    if (!this.hass || !id) return false;
    this.clearPending();
    this.pending_ = mode.key;
    this.pendingTimer = window.setTimeout(() => this.clearPending(), PENDING_MS);
    try {
      await this.hass.callService('alarm_control_panel', mode.service, code ? { code } : {}, {
        entity_id: id,
      });
      return true;
    } catch {
      this.clearPending(); // Home Assistant says why in its own toast
      return false;
    }
  }

  private get keypad(): FluvyKeypad | null {
    return this.renderRoot.querySelector('fluvy-keypad');
  }

  /* ---------- render ---------- */

  /** The gap that leaves every option tile a whole multiple of 4 px wide in this column. */
  private tileGap(width: number, columns: number): number {
    for (const gap of [4, 8, 12, 16])
      if ((width - (columns - 1) * gap) % (4 * columns) === 0) return gap;
    return 4;
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (view.status === 'missing')
      return this.renderEmpty(`${name} · ${stateText(this.hass, view)}`);

    const unusable = !isUsable(view);
    const compact = this.compact;
    const state = view.state;
    const alerting = state === 'triggered' || state === 'arming' || state === 'pending';
    const tone: Tone = unusable
      ? 'off'
      : alerting
        ? 'warning'
        : state.startsWith('armed_')
          ? 'accent'
          : 'neutral';
    const modes = this.modes(view);
    const lit = this.pending_
      ? MODES.find((mode) => mode.key === this.pending_)?.state
      : this.activeState(view);

    const columns = optionColumnsFor(
      modes.map((mode) => s(this.hass, mode.tile)),
      this.contentWidth,
      (n) => this.tileGap(this.contentWidth, n),
      (text) => this.ruler.width('fv-option__label', text),
    );
    const gap = this.tileGap(this.contentWidth, columns);
    const narrow = (this.contentWidth - (columns - 1) * gap) / columns < 104;
    // tiles only while every mode's word holds its cell (fr's "Personnalisé" in a 211 column does not): else the
    // compact layout's chips, which give way in their order and never cut a word
    const tiled = optionsHold(
      modes.map((mode) => s(this.hass, mode.tile)),
      this.contentWidth,
      (n) => this.tileGap(this.contentWidth, n),
      (text) => this.ruler.width('fv-option__label', text),
    );
    // the modes' meanings under their names: every tile's or none — not in a narrow cell, nor where a word of one
    // would be cut (nl's "Overbrugging" in a 266 column)
    const described =
      !narrow &&
      valuesHold(
        modes.map((mode) => s(this.hass, mode.value)),
        optionCell(this.contentWidth, gap, columns),
        (text) => this.ruler.width('fv-option__value', text),
      );
    const tiles: OptionItem[] = modes.map((mode) => ({
      key: mode.key,
      label: s(this.hass, mode.tile),
      value: described ? s(this.hass, mode.value) : '',
      glyph: mode.glyph,
      tone: mode.bit === 0 ? 'neutral' : alerting && !this.pending_ ? 'warning' : 'accent',
      active: !unusable && lit === mode.state,
    }));

    // the head gives way in its order: the badge first (the armed mode is the lit tile's too), then the sub, the circle
    const fitted = this.headFit.fit({
      width: this.contentWidth,
      title: name,
      sub: this.config?.subtitle ?? changedLine(this.hass, view),
      badge: {
        text: state.startsWith('armed_') ? s(this.hass, 'armed') : stateText(this.hass, view),
        tone,
      },
    });
    return html`<article
        class="fv-card dv-card ${unusable ? 'is-unavailable' : ''} ${narrow ? 'is-compact' : ''}"
        data-card
      >
        ${head({
          icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
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
          compact
            ? html`<div class="dv-alarm__row">
                ${chipRow(
                  this.chips(tiles),
                  (key) => {
                    if (!unusable) this.choose(view, key);
                  },
                  'full',
                  { ruler: this.ruler, width: this.contentWidth },
                )}
              </div>`
            : html`${label(s(this.hass, 'mode'))}
              ${
                tiled
                  ? options(
                      tiles,
                      unusable ? null : (key) => this.choose(view, key),
                      gap,
                      narrow ? 64 : 84,
                      columns,
                    )
                  : html`<div class="dv-alarm__row">
                      ${chipRow(
                        this.chips(tiles),
                        (key) => {
                          if (!unusable) this.choose(view, key);
                        },
                        'full',
                        { ruler: this.ruler, width: this.contentWidth },
                      )}
                    </div>`
              }
              ${this.renderRows()}`
        }
      </article>
      <fluvy-keypad .hass=${this.hass}></fluvy-keypad>`;
  }
}
