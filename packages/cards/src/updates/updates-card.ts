import {
  formatNumber,
  formatTime,
  plural,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type HomeAssistant,
} from '@fluvy/core';

import { head, icon, listRow, sheetStyles, type IconRef, type Tone } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { rowButton, rowsKeepIcon, rowStacks, type RowEnd } from '../helpers/rows.js';

import { rowStyles } from '../helpers/styles.js';

import { Card, type BaseKey } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  actionField,
  boolField,
  colourFields,
  editorLabels,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { HeadFit } from '../energy/head.js';
import { attrOf, HEAD, ROW } from '../shared/heights.js';
import { EMPTY_KEYS, hideEmpty, idsOf, listOf, type EmptyList } from '../shared/lists.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const s = strings('updates');

export interface UpdatesCardConfig extends FluvyCardConfig, EmptyList {
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
  static override layoutHeight(config: UpdatesCardConfig, hass?: HomeAssistant): number {
    const ids = idsOf(config.entities);
    // the rows 16 under the head: one per update waiting (or that cannot be read; every one with `show_up_to_date`),
    // 76 for one installing; nothing waiting (or nothing listed) is the one quiet row ("Everything is up to date");
    // the switch under the list is a row of its own group (16 + 60). Without the house, every update listed waits.
    const shown = ids.filter((id) => {
      const state = hass?.states?.[id];
      return (
        !hass ||
        config.show_up_to_date === true ||
        !state ||
        state.state === 'on' ||
        state.state === 'unavailable' ||
        state.state === 'unknown'
      );
    });
    const busy = shown.filter((id) => attrOf(hass, id, 'in_progress') === true).length;
    return HEAD + ROW * Math.max(1, shown.length) + 16 * busy + (config.toggle ? 16 + ROW : 0);
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
    'show_icon',
  ];
  static override keys = configKeys<UpdatesCardConfig>()([
    'title',
    'subtitle',
    'show_up_to_date',
    'toggle',
    'toggle_secondary',
    ...EMPTY_KEYS,
  ]);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ show_up_to_date: false });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), showIconField()),
        ...colourFields(),
        boolField('show_up_to_date'),
        entitiesField('entities', ['update'], true),
        fieldRow(
          entityField(['input_boolean', 'switch', 'automation'], 'toggle', false),
          textField('toggle_secondary'),
        ),
        emptyFields(),
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
    listOf(config, 'entities');
    return config;
  }

  protected override watched(): readonly string[] {
    return [...idsOf(this.config?.entities), ...(this.config?.toggle ? [this.config.toggle] : [])];
  }

  override getCardSize(): number {
    return 1 + Math.max(1, idsOf(this.config?.entities).length) + (this.config?.toggle ? 1 : 0);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** The head's fitting; its ruler lays widths out in the card's own classes (whether the rows' ends leave names room). */
  private readonly head = new HeadFit(this);

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

  /** What ends a row that waits for nothing from here: "Up to date", or a dash while it cannot be read. */
  private value(view: EntityView): string {
    return view.status === 'ok' ? s(this.hass, 'up_to_date') : '—';
  }

  /**
   * What ends each row, for the rows' rule: Install's words, a chevron's 44, a state's words; a row installing has
   * its bar and nothing at its end.
   */
  private ends(shown: readonly EntityView[]): RowEnd[] {
    const install = s(this.hass, 'install');
    return shown
      .filter((view) => !this.installing(view))
      .map((view) =>
        this.installable(view)
          ? { name: view.name, button: install }
          : {
              name: view.name,
              end:
                view.state === 'on' ? 44 : this.head.ruler.width('fv-row__value', this.value(view)),
            },
      );
  }

  /** `bare`: the rows have given their circles to their names (what ends one, never cut, squeezed it). */
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
          <span class="fv-row__title" data-name>${view.name}</span>
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
      const word = s(this.hass, 'install');
      const install = rowButton(
        'link',
        word,
        s(this.hass, 'install_named', { name: view.name }),
        () => {
          this.expect(view.id, STARTING); // the row turns into its progress bar under the finger
          this.call('update', 'install', {}, view.id);
        },
      );
      // where even without its circle Install would leave the name under its room, it goes under the name
      const stack =
        bare && rowStacks(this.head.ruler, this.contentWidth, { name: view.name, button: word });
      return html`<div class="fv-row ${bare ? 'fv-row--bare' : ''} ${stack ? 'fv-row--stack' : ''}">
        ${circle('neutral')}
        <span class="fv-row__text"
          ><span class="fv-row__title" data-name>${view.name}</span
          ><span class="fv-row__sub">${this.versions(view)}</span></span
        >
        ${install}
      </div>`;
    }

    // nothing to install from here: the trailing slot says why, or the chevron leads to Home Assistant's own dialog
    return listRow({
      icon: bare ? null : ref,
      tone: unusable ? 'off' : 'neutral',
      title: view.name,
      name: true,
      sub: this.versions(view),
      trailing: view.state === 'on' ? 'chevron' : 'value',
      value: this.value(view),
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
    const views = idsOf(this.config?.entities).map((id) => this.entity(id));
    const waiting = views.filter((view) => view.state === 'on' || this.installing(view));
    // an update that cannot be read — unavailable, unknown, gone — keeps its row, in its order: whether it waits is
    // not known, and the list keeps its size (1.9)
    const away = views.filter((view) => view.status !== 'ok');
    const shown = this.config?.show_up_to_date
      ? views
      : views.filter((view) => waiting.includes(view) || away.includes(view));
    // nothing to show is nothing waiting (or nothing listed): the card says so in its quiet row, or hides when asked
    hideEmpty(this, !shown.length);
    const narrow = this.contentWidth < NARROW;
    const bare = !rowsKeepIcon(this.head.ruler, this.contentWidth, this.ends(shown));

    const stamps = views
      .map((view) => (view.stateObj ? new Date(view.stateObj.last_updated).getTime() : Number.NaN))
      .filter((time) => Number.isFinite(time));
    const checked = stamps.length
      ? s(this.hass, 'checked', { time: formatTime(this.hass, new Date(Math.max(...stamps))) })
      : '';
    // nothing waits that can be read: "Up to date" only where every update can be
    const count =
      waiting.length === 0
        ? away.length
          ? plural(this.hass, 'room.unavailable', away.length, { count: away.length })
          : s(this.hass, 'up_to_date')
        : waiting.length === 1
          ? s(this.hass, 'one_available')
          : s(this.hass, 'available', { count: waiting.length });

    // the head fitted to its column: the badge, then the line's trailing segments, then the circle — never the title
    // cut ("Actualizaciones" at 211)
    const title = this.config?.title ?? s(this.hass, 'title');
    const fitted = this.head.fit({
      width: this.contentWidth,
      title,
      sub: narrow ? count : (this.config?.subtitle ?? checked),
      badge: narrow ? null : { text: count, tone: waiting.length ? 'accent' : 'neutral' },
    });
    return html`<article class="fv-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'update') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        shown.length
          ? html`<div class="in-rows">${shown.map((view) => this.row(view, narrow, bare))}</div>`
          : html`<div class="in-rows in-rows--quiet">
              ${listRow({ icon: 'check', tone: 'neutral', title: this.config?.empty_text ?? s(this.hass, 'all_up_to_date'), trailing: 'none' })}
            </div>`
      }
      ${this.toggleRow(bare)}
    </article>`;
  }
}
