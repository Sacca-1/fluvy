import {
  formatNumber,
  formatTime,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { badge, head, icon, listRow, sheetStyles, type IconRef, type Tone } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { actionsKeepIcon, rowButton } from '../helpers/rows.js';

import { rowStyles } from '../helpers/styles.js';

import { Card, type BaseKey } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  actionField,
  boolField,
  colourFields,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  textField,
  titleFields,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { TextRuler } from '../shared/fit.js';
import { FontsSettled } from '../shared/fonts.js';
import { listLength, ROW } from '../shared/heights.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const s = strings('updates');

export interface UpdatesCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** Keep the entities that are already current in the list instead of hiding them. */
  show_up_to_date?: boolean;
  /** A switch shown under the list, as the sheet's "Auto-update at night" (an `input_boolean`, `switch` or `automation`). */
  toggle?: string;
  /** Context line of that switch ("03:00 · backup first"). Defaults to its area. */
  toggle_secondary?: string;
}

/** `UpdateEntityFeature.INSTALL` */
const INSTALL = 1;
/** The state a row is expected to reach once Install is tapped, until `in_progress` says so itself. */
const STARTING = 'installing';
/** Below this content width the count badge gives its place to the title and moves into the sub line. */
const NARROW = 300;

/**
 * What is waiting to be installed: one row per update entity with the version step in the sub, an
 * Install button, and — while an install runs — the 4 px progress bar under the text, exactly as the
 * sheet draws it. Entities that are current are hidden unless asked for; an empty card says so.
 */
export class FluvyUpdatesCard extends Card<UpdatesCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: UpdatesCardConfig): number {
    return 84 + ROW * listLength(config, ['entities']) + (config.toggle ? 48 : 0);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.inputs,
    rowStyles,
    css`
      /* the sheet's 76 progress row, free to grow by a line like every other row; laid out as the bar rows are: the circle
         on the title / sub pair (8 from the top), the text 12 down, the bar under it — not centred on the taller row */
      .in-row--progress {
        height: auto;
        min-height: 76px;
        align-items: flex-start;
        padding: 0 0 12px;
      }

      .in-row--progress .fv-ico {
        margin-top: 8px;
      }

      .in-row--progress .fv-row__text {
        margin-top: 12px;
      }

      /* in progress without a percentage: the empty track breathes, so it does not read as "0 %" */
      .in-progress--busy {
        animation: fv-shimmer 1400ms ease-in-out infinite;
      }

      .in-rows--quiet .fv-row__title {
        color: var(--fluvy-text-secondary);
        font-weight: 500;
      }
    `,
  ];

  /** A card of many updates has no entity of its own: its head's icon, tone and colour, and a hold on the head. */
  static override base: readonly BaseKey[] = [
    'entities',
    'icon',
    'tone',
    'color',
    'card_color',
    'hold_action',
  ];
  static override keys = configKeys<UpdatesCardConfig>()([
    'title',
    'subtitle',
    'show_up_to_date',
    'toggle',
    'toggle_secondary',
  ]);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ show_up_to_date: false });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        iconField(),
        ...colourFields(),
        boolField('show_up_to_date'),
        entitiesField('entities', ['update'], true),
        fieldRow(
          entityField(['input_boolean', 'switch', 'automation'], 'toggle', false),
          textField('toggle_secondary'),
        ),
        actionField('hold_action'),
      ],
      // this card's own options are worded by its own strings
      ...editorLabels(
        s,
        {
          show_up_to_date: 'show_up_to_date',
          toggle: 'toggle',
          toggle_secondary: 'toggle_secondary',
        },
        {},
      ),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): UpdatesCardConfig {
    return {
      type: 'custom:fluvy-updates-card',
      entities: entities.filter((id) => id.startsWith('update.')).slice(0, 4),
    };
  }

  protected override prepare(config: UpdatesCardConfig): UpdatesCardConfig {
    if (!config.entities?.length) throw new Error('fluvy-updates-card: add at least one entity');
    return config;
  }

  protected override watched(): readonly string[] {
    return [...(this.config?.entities ?? []), ...(this.config?.toggle ? [this.config.toggle] : [])];
  }

  override getCardSize(): number {
    return 1 + (this.config?.entities?.length ?? 0) + (this.config?.toggle ? 1 : 0);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** Widths laid out by the browser in the card's own classes: whether an Install leaves the names their room. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);

  constructor() {
    super();
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  /* ---------- rows ---------- */

  /** 0–100 while Home Assistant reports a percentage, null while it only says "in progress" (or nothing). */
  private percent(view: EntityView): number | null {
    const raw = view.attr<unknown>('update_percentage');
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : null;
  }

  private installing(view: EntityView): boolean {
    if (view.status !== 'ok') return false;
    return (
      view.attr<unknown>('in_progress') === true ||
      this.percent(view) !== null ||
      this.stateOf(view) === STARTING
    );
  }

  private versions(view: EntityView): string {
    const from = view.attr<string | null>('installed_version');
    const to = view.attr<string | null>('latest_version');
    if (from && to && from !== to) return s(this.hass, 'versions', { from, to });
    return to ?? from ?? '';
  }

  /** An update that Install starts from here: not running, waiting, and installable by Home Assistant. */
  private installable(view: EntityView): boolean {
    return !this.installing(view) && view.state === 'on' && view.supports(INSTALL);
  }

  /** `bare`: the rows have given their circles to their names (an Install, never cut, squeezed one of them). */
  private row(view: EntityView, narrow: boolean, bare: boolean): TemplateResult {
    const unusable = view.status === 'unavailable' || view.status === 'missing';
    const ref: IconRef | string = view.attr<string>('icon') ?? glyphFor(view);
    const circle = (tone: Tone): TemplateResult | typeof nothing =>
      bare ? nothing : html`<span class="fv-ico fv-ico--${tone}" data-icon>${icon(ref)}</span>`;

    if (this.installing(view)) {
      const percent = this.percent(view);
      const progress =
        percent === null
          ? s(this.hass, 'working')
          : s(this.hass, 'installing', {
              percent: formatNumber(this.hass, percent, { digits: 0 }),
            });
      // a narrow column keeps what is happening and lets go of the version step it cannot hold beside it
      const sub = narrow
        ? progress.charAt(0).toLocaleUpperCase() + progress.slice(1)
        : [this.versions(view), progress].filter(Boolean).join(' · ');
      return html`<div class="fv-row in-row--progress ${bare ? 'fv-row--bare' : ''}">
        ${circle('accent')}
        <span class="fv-row__text">
          <span class="fv-row__title">${view.name}</span>
          <span class="fv-row__sub">${sub}</span>
          <span
            class="in-progress ${percent === null ? 'in-progress--busy' : ''}"
            role="progressbar"
            aria-label=${view.name}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${percent ?? nothing}
            ><span
              class="in-progress__fill"
              data-measure="value"
              style="width:${percent ?? 0}%"
            ></span
          ></span>
        </span>
      </div>`;
    }

    if (this.installable(view)) {
      const install = rowButton(
        'link',
        s(this.hass, 'install'),
        s(this.hass, 'install_named', { name: view.name }),
        () => {
          this.expect(view.id, STARTING); // the row turns into its progress bar under the finger
          this.call('update', 'install', {}, view.id);
        },
      );
      return html`<div class="fv-row ${bare ? 'fv-row--bare' : ''}">
        ${circle('neutral')}
        <span class="fv-row__text"
          ><span class="fv-row__title">${view.name}</span
          ><span class="fv-row__sub">${this.versions(view)}</span></span
        >
        ${install}
      </div>`;
    }

    // nothing to install from here: the trailing slot says why, or the chevron leads to Home Assistant's own dialog
    const pending = view.state === 'on';
    return listRow({
      icon: bare ? null : ref,
      tone: unusable ? 'off' : 'neutral',
      title: view.name,
      sub: this.versions(view),
      trailing: pending ? 'chevron' : 'value',
      value: view.status === 'ok' ? s(this.hass, 'up_to_date') : '—',
      unavailable: unusable,
      onTap:
        view.status === 'missing' ? undefined : () => this.tap(view.id, { action: 'more-info' }),
    });
  }

  /** The switch under the list, in the list's column: without its circle when the rows gave theirs to their names. */
  private toggleRow(bare: boolean): TemplateResult | typeof nothing {
    const id = this.config?.toggle;
    if (!id) return nothing;
    const view = this.entity(id);
    const unusable = view.status === 'unavailable' || view.status === 'missing';
    const on = this.stateOf(view) === 'on';
    return html`<div class="in-rows">
      ${listRow({
        icon: bare ? null : (view.attr<string>('icon') ?? 'clock'),
        tone: unusable ? 'off' : on ? 'accent' : 'neutral',
        title: view.name,
        sub:
          this.config?.toggle_secondary ??
          (view.status === 'ok' ? view.areaName : stateText(this.hass, view)),
        trailing: 'switch',
        on,
        switchTone: 'accent',
        unavailable: unusable,
        onToggle: (next) => {
          this.expect(view.id, next ? 'on' : 'off');
          this.call('homeassistant', next ? 'turn_on' : 'turn_off', {}, view.id);
        },
      })}
    </div>`;
  }

  protected renderCard(): TemplateResult {
    const views = (this.config?.entities ?? []).map((id) => this.entity(id));
    const waiting = views.filter((view) => view.state === 'on' || this.installing(view));
    const shown = this.config?.show_up_to_date ? views : waiting;
    const narrow = this.contentWidth < NARROW;
    const install = s(this.hass, 'install');
    const bare = !actionsKeepIcon(
      this.ruler,
      this.contentWidth,
      shown
        .filter((view) => this.installable(view))
        .map((view) => ({ name: view.name, action: install })),
    );

    const stamps = views
      .map((view) => (view.stateObj ? new Date(view.stateObj.last_updated).getTime() : Number.NaN))
      .filter((time) => Number.isFinite(time));
    const checked = stamps.length
      ? s(this.hass, 'checked', { time: formatTime(this.hass, new Date(Math.max(...stamps))) })
      : '';
    const count =
      waiting.length === 0
        ? s(this.hass, 'up_to_date')
        : waiting.length === 1
          ? s(this.hass, 'one_available')
          : s(this.hass, 'available', { count: waiting.length });

    return html`<article class="fv-card" data-card>
      ${head({
        icon: this.config?.icon ?? 'update',
        tone: toneOf(this.config, 'accent'),
        title: this.config?.title ?? s(this.hass, 'title'),
        sub: narrow ? count : (this.config?.subtitle ?? checked),
        trailing: narrow ? nothing : badge(count, waiting.length ? 'accent' : 'neutral'),
        onHold: () => this.hold(),
      })}
      ${
        shown.length
          ? html`<div class="in-rows">${shown.map((view) => this.row(view, narrow, bare))}</div>`
          : html`<div class="in-rows in-rows--quiet">
              ${listRow({ icon: 'check', tone: 'neutral', title: s(this.hass, 'all_up_to_date'), trailing: 'none' })}
            </div>`
      }
      ${this.toggleRow(bare)}
    </article>`;
  }
}
