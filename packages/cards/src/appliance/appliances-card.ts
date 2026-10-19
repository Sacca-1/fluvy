import {
  plural,
  selfHide,
  strings,
  type ActionConfig,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';
import { activateKey, clickPress, head, icon, preventMenu, startPress, type Tone } from '@fluvy/ui';
import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  APPLIANCES_MAX_ROWS,
  appliancesHeight,
  applianceVariant,
  type ApplianceVariant,
} from '../appliances-family.js';
import { HeadFit } from '../energy/head.js';
import { Card, type BaseKey, type HeadConfig } from '../shared/base.js';
import { fitLine, type Segment } from '../shared/fit.js';
import { configKeys } from '../shared/config.js';
import {
  accentField,
  actionField,
  actionFields,
  boolField,
  editorLabels,
  editorWord,
  entityField,
  fieldRow,
  iconField,
  nameIconFields,
  numberField,
  showIconField,
  textField,
  titleFields,
  toneField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { Ticker, MINUTE } from '../shared/ticker.js';
import { FluvyApplianceCard, type ApplianceCardConfig } from './appliance-card.js';
import { choiceField, deviceField, kindField, option } from './form.js';
import { DUE_WORD } from './full.js';
import { applianceDevices, KIND_DEFAULTS, type ApplianceKind } from './kinds.js';
import type { MaintenanceKey } from './maintenance.js';
import { unloadedAt, UNLOADED_EVENT } from './memory.js';
import { artOf, pictureBox, pictureStyles, type PictureStyle } from './picture.js';
import {
  cycleOf,
  cycleOfFlag,
  FINISHED_AFTER,
  PlugHistory,
  RUNNING_POWER,
  type PlugCycle,
} from './plug.js';
import {
  DONE_FOR,
  findAppliance,
  isPlug,
  readAppliance,
  type ApplianceFound,
  type ApplianceReading,
} from './reading.js';
import { busy, type ApplianceStatus } from './status.js';
import {
  attentionText,
  durationText,
  kindGlyph,
  shownOf,
  spanText,
  statusTone,
  whenParts,
  type Shown,
} from './view.js';
import { entityOf, refState } from './refs.js';
import { setpointOf } from './zones.js';

const s = strings('appliance');

export type AppliancesVariant = 'rows' | 'compact' | 'tiles' | 'cards';

/**
 * An appliance of the list: its device (or a plug's entity), and how it is named, drawn and answers; as a whole card
 * (`cards`), any other key of the appliance card too (its layout, its rows, its picture), handed to it as written.
 */
export interface ApplianceItem {
  readonly device?: string;
  readonly entity?: string;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly kind?: ApplianceKind | 'auto';
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
  readonly variant?: ApplianceVariant;
  readonly [key: string]: unknown;
}

export interface AppliancesCardConfig extends FluvyCardConfig, HeadConfig {
  title?: string;
  /** The head's line, in place of its count. */
  subtitle?: string;
  /**
   * `rows` (default, 76 rows with a bar), `compact` (48 rows), `tiles` (two a row), or `cards`: each appliance its
   * whole card, side by side as many as hold (the automatic dashboard's band, #47), with no head or surface of its own.
   */
  variant?: AppliancesVariant;
  /** A tile's picture: the kind's drawing (default), its circle ringed by its progress, or none. */
  picture?: PictureStyle;
  /** The appliances, in order: devices, or items naming one (default: every appliance of the house, busiest first). */
  appliances?: ReadonlyArray<string | ApplianceItem>;
  /** Rows before a "{count} more" row takes the others (6). */
  max_rows?: number;
  /** Every appliance (default), or only those under way, waiting or done. */
  show?: 'all' | 'active';
  /**
   * By what each is doing (what needs a hand, then what runs, ending soonest: the rows' and the tiles' default), by
   * name, or as listed (`none`: the whole cards' default, which never trade places under a finger).
   */
  sort?: 'state' | 'name' | 'none';
  /** The head's line counts what runs, what is done, what rests. */
  show_count?: boolean;
  /** What the card says with no appliance to list; and whether it hides itself then. */
  empty_text?: string;
  hide_empty?: boolean;
  /** Test hook: an ISO instant the card takes for "now". */
  _now?: string;
}

/** The order of what each is doing: what needs a hand first, then what runs, waits to start, is done, rests. */
const RANK: Readonly<Record<ApplianceStatus, number>> = {
  error: 0,
  attention: 0,
  paused: 1,
  running: 2,
  preheating: 2,
  scheduled: 3,
  finished: 4,
  idle: 5,
  off: 6,
  offline: 7,
};

/** An appliance as the list draws it. */
interface Line {
  readonly key: string;
  readonly item: ApplianceItem;
  readonly found: ApplianceFound;
  readonly r: ApplianceReading;
  readonly shown: Shown;
  readonly title: string;
  readonly tone: Tone;
  readonly entity: string | undefined;
  /** It needs a hand: waits to be unloaded, a door left open, it failed (with how long, where it says). */
  readonly attention: string;
  /** The same, without how long: what a narrow tile must say whole. */
  readonly need: string;
  /** Its shorter forms, longest first, where a row cannot hold it: the thing to look after ("Rinse aid"), then what
   * to do ("Refill"); "Empty" for a load. */
  readonly briefs: readonly string[];
}

/**
 * The house's appliances: what each is doing in a live row — a bar row with its progress, its circle in its status's
 * tone, what it does and when ("Rinsing · Ready at 14:32"), the time left or its state at the end — what needs a hand
 * first (waiting to be unloaded, a door left open, a failure), then what runs (ending soonest), waits to start, is
 * done, rests. Every appliance the house has by default (found as the appliance card finds one), or those it names,
 * each with its own name, glyph, colour and actions; as rows, compact rows or tiles.
 */
export class FluvyAppliancesCard extends Card<AppliancesCardConfig> {
  /**
   * The card's height at a 360 column: its whole cards, given the house, one a row 16 apart, each what its appliance
   * draws (the appliance card's), the house's where it names none; else the family's, from the config alone.
   */
  static override layoutHeight(config: AppliancesCardConfig, hass?: HomeAssistant): number {
    const listed = config.appliances;
    const items =
      hass && config.variant === 'cards'
        ? (listed
            ? listed.map((entry): ApplianceItem =>
                typeof entry === 'string' ? { device: entry } : entry,
              )
            : applianceDevices(hass).map((device): ApplianceItem => ({ device }))
          ).filter((item) => item.device || item.entity)
        : [];
    if (!items.length) return appliancesHeight(config);
    return items.reduce(
      (sum, item, index) =>
        sum +
        (index ? 16 : 0) +
        FluvyApplianceCard.layoutHeight(
          {
            type: '',
            ...(config.picture ? { picture: config.picture } : {}),
            ...item,
          } as ApplianceCardConfig,
          hass,
        ),
      0,
    );
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    pictureStyles,
    css`
      .al-rows {
        margin-top: 4px;
      }
      .al-rows .fv-row__sub--warning {
        color: var(--fluvy-warning);
      }
      /* two tiles a row, 8 apart: the circle ringed by its progress, the name over what it does */
      .al-tiles {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 16px;
      }
      .al-tiles--one {
        grid-template-columns: minmax(0, 1fr);
      }
      .al-tile {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        height: 84px;
        padding: 0 12px;
        border-radius: var(--fluvy-radius-control);
        background: var(--fluvy-page-alt);
        cursor: pointer;
      }
      .al-tile .fv-row__text {
        flex: 1 1 auto;
        min-width: 0;
      }
      /* with its picture: 88 (12 · 64 · 12), the name bold over what it does, as the appliance card's row */
      .al-tile--picture {
        height: 88px;
      }
      .al-tile--picture .fv-row__title {
        font-size: 15px;
        font-weight: 700;
      }
      .al-tile--picture .fv-row__sub {
        display: block;
        margin-top: 4px;
        font-size: 15px;
        font-weight: 400;
        line-height: 20px;
      }

      .al-ring {
        position: relative;
        display: grid;
        place-items: center;
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
      }
      .al-ring > svg {
        position: absolute;
        top: -5px;
        left: -5px;
        width: 54px;
        height: 54px;
        transform: rotate(-90deg);
      }
      .al-ring circle {
        fill: none;
        stroke-width: 2;
      }
      .al-ring .al-ring__track {
        stroke: var(--fluvy-border);
      }
      .al-ring .al-ring__fill {
        stroke: var(--tone-ink, var(--fluvy-accent));
        stroke-linecap: round;
      }
      .al-empty {
        margin-top: 16px;
      }
      /* each appliance its whole card, side by side as many as hold — a whole card 300 at least (four across a
         desktop's band, 360 each), a row 240 (five) — spaced as Home Assistant's section spaces its cards */
      .al-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--al-least)), 1fr));
        gap: var(--ha-section-grid-row-gap, 16px) var(--ha-section-grid-column-gap, 16px);
        align-items: start;
      }
    `,
  ];

  private readonly head = new HeadFit(this);
  /** Each plug's power history, by appliance. */
  private readonly histories = new Map<string, PlugHistory>();
  /** The appliances found, once per registry and list. */
  private found:
    | {
        readonly key: string;
        readonly at: unknown;
        readonly list: Array<readonly [string, ApplianceItem, ApplianceFound]>;
      }
    | undefined;
  private lines: readonly Line[] = [];
  /** The fold opened: every appliance listed. */
  private open = false;
  /** Each appliance's whole card (`cards`), kept while it is listed, with the config it was last given. */
  private readonly wholes = new Map<string, { readonly card: LovelaceCard; config: string }>();

  constructor() {
    super();
    // a minute's clock while one is under way, waits to start or finished not two hours ago
    new Ticker(this, () => this.timed());
  }

  static override base: readonly BaseKey[] = [
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<AppliancesCardConfig>()([
    'title',
    'subtitle',
    'variant',
    'picture',
    'appliances',
    'max_rows',
    'show',
    'sort',
    'show_count',
    'empty_text',
    'hide_empty',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'appliances',
      idKey: 'device',
      also: ['entity'],
      title: 'appliance.editor_appliances',
      keys: ['device', 'entity', 'name', 'icon', 'color', 'kind', 'tap_action', 'hold_action'],
      computeLabel: (schema) =>
        schema.name === 'device'
          ? editorWord('appliance.editor_device')
          : schema.name === 'kind'
            ? editorWord('appliance.editor_kind')
            : undefined,
      picker: deviceField(),
      schema: [
        deviceField(),
        entityField(undefined, 'entity', false),
        nameIconFields(),
        fieldRow(accentField(), kindField()),
        actionField('tap_action'),
        actionField('hold_action'),
      ],
    },
  ];
  static override defaults: EditorDefaults = (config) => ({
    variant: 'rows',
    picture: 'art',
    max_rows: APPLIANCES_MAX_ROWS,
    show: 'all',
    sort: config['variant'] === 'cards' ? 'none' : 'state',
    show_count: true,
    hide_empty: false,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), showIconField()),
        fieldRow(
          choiceField('variant', [
            option('rows'),
            option('compact'),
            option('tiles'),
            ['cards', 'appliance.o_cards'],
          ]),
          numberField('max_rows', 1, 30),
        ),
        choiceField('picture', [
          ['art', 'appliance.o_picture'],
          ['icon', 'appliance.o_icon'],
          option('none'),
        ]),
        fieldRow(
          choiceField('show', [option('all'), ['active', 'appliance.o_busy']]),
          choiceField('sort', [
            ['state', 'appliance.o_status'],
            option('name'),
            ['none', 'appliance.o_listed'],
          ]),
        ),
        fieldRow(boolField('show_count'), boolField('hide_empty')),
        textField('empty_text'),
        fieldRow(toneField(), accentField()),
        accentField('card_color', { none: true }),
        actionFields(),
      ],
      ...editorLabels(s, {
        show: 'editor_show',
        sort: 'editor_sort',
        empty_text: 'editor_empty_text',
        hide_empty: 'editor_hide_empty',
        picture: 'editor_picture',
      }),
    };
  }

  /** A new card lists the house's appliances. */
  static getStubConfig(): AppliancesCardConfig {
    return { type: 'custom:fluvy-appliances-card' };
  }

  override getCardSize(): number {
    return this.config ? Math.round(appliancesHeight(this.config) / 50) : 4;
  }
  /** The whole cards take the section's width: they share it out themselves. */
  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'cards'
      ? { columns: 'full', rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  private get variant(): AppliancesVariant {
    const v = this.config?.variant;
    return v === 'compact' || v === 'tiles' || v === 'cards' ? v : 'rows';
  }

  /** Every change of the house reaches the whole cards, as Home Assistant's reaches its own: they read more of it. */
  override get hass(): HomeAssistant | undefined {
    return super.hass;
  }
  override set hass(value: HomeAssistant | undefined) {
    super.hass = value;
    for (const { card } of this.wholes.values()) card.hass = value;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(UNLOADED_EVENT, this.onUnloaded);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(UNLOADED_EVENT, this.onUnloaded);
  }

  private readonly onUnloaded = (): void => this.requestUpdate();

  /* ---------- reading the house ---------- */

  /** The appliances listed (the card's, else the house's), each found: once per registry and list. */
  private appliances(): ReadonlyArray<readonly [string, ApplianceItem, ApplianceFound]> {
    const listed = this.config?.appliances;
    const key = JSON.stringify(listed ?? null);
    const at = [this.hass?.entities, this.hass?.devices];
    if (
      this.found &&
      this.found.key === key &&
      Array.isArray(this.found.at) &&
      this.found.at.every((item, index) => item === at[index])
    )
      return this.found.list;
    const items: ApplianceItem[] = listed
      ? listed.map((entry) => (typeof entry === 'string' ? { device: entry } : entry))
      : applianceDevices(this.hass).map((device) => ({ device }));
    const list = items
      .filter((item) => item.device || item.entity)
      .map((item) => {
        const found = findAppliance(this.hass, {
          device: item.device,
          entity: item.entity,
          kind: item.kind,
        });
        return [item.device ?? item.entity ?? '', item, found] as const;
      });
    this.found = { key, at, list };
    return list;
  }

  protected override watched(): readonly string[] {
    return this.appliances()
      .flatMap(([, , found]) => [
        ...Object.values(found.entities.roles),
        ...Object.values(found.entities.twin?.roles ?? {}),
        ...found.entities.zones,
        ...found.entities.maintenance,
      ])
      .filter((id): id is string => Boolean(id))
      .map(entityOf);
  }

  private now(): number {
    const frozen = this.config?._now ? Date.parse(this.config._now) : NaN;
    return Number.isFinite(frozen) ? frozen : Date.now();
  }

  /** Whether the minute's clock has something to say: one under way, waiting to start, finished not 2 h ago. */
  private timed(): boolean {
    return this.lines.some(
      ({ shown, r }) =>
        busy(shown.status) ||
        shown.status === 'scheduled' ||
        (shown.status === 'finished' &&
          shown.finishedAt !== null &&
          Date.now() - shown.finishedAt < 2 * 60 * MINUTE) ||
        r.attention.some((item) => item.since !== undefined),
    );
  }

  /** An appliance on a plug: its cycle, from its threshold sensor or its power's history. */
  private cycle(key: string, found: ApplianceFound, now: number): PlugCycle | undefined {
    const roles = found.entities.roles;
    if (!isPlug(roles)) return undefined;
    const doneFor = DONE_FOR * MINUTE;
    if (roles.running) return cycleOfFlag(this.hass?.states[roles.running], now, doneFor);
    let history = this.histories.get(key);
    if (!history) {
      history = new PlugHistory(() => this.requestUpdate());
      this.histories.set(key, history);
    }
    const { watts } = history.read(this.hass, { watts: roles.watts, energy: roles.energy }, now);
    return cycleOf(watts, now, {
      running: RUNNING_POWER,
      finishedAfter: FINISHED_AFTER * MINUTE,
      doneFor,
    });
  }

  /** The appliances as the list draws them, in its order. */
  private read(): Line[] {
    const now = this.now();
    const lines = this.appliances().flatMap(([key, item, found]): Line[] => {
      if (found.verdict && 'excluded' in found.verdict && !item.kind) return [];
      const r = readAppliance(
        this.hass,
        found,
        { device: item.device, entity: item.entity, kind: item.kind },
        now,
        unloadedAt(found.device ?? item.entity ?? ''),
        this.cycle(key, found, now),
      );
      const shown = shownOf(this.hass, r, 'main');
      const roles = found.entities.roles;
      const first = r.unavailable ? undefined : r.attention[0];
      // what a tap opens: the entity a role names (never an attribute of it)
      const opens =
        item.entity ?? roles.state ?? roles.power ?? roles.watts ?? found.entities.zones[0];
      return [
        {
          key,
          item,
          found,
          r,
          shown,
          title: item.name ?? (r.name || s(this.hass, `kind_${r.kind}`)),
          tone: first ? 'warning' : statusTone(shown.status, item, r.kind),
          entity: opens && entityOf(opens),
          attention: first ? attentionText(this.hass, first, now) : '',
          need: first ? first.text || this.t(first.key) : '',
          briefs: first?.key.startsWith('appliance.m_')
            ? [
                this.t(first.key.replace('.m_', '.n_') as MessageKey),
                this.t(DUE_WORD[first.key.slice(12) as MaintenanceKey]),
              ]
            : first?.key === 'appliance.unload'
              ? [s(this.hass, 'do_empty')]
              : [],
        },
      ];
    });
    const sort = this.config?.sort ?? (this.variant === 'cards' ? 'none' : 'state');
    if (sort === 'none') return lines;
    if (sort === 'name')
      return lines.sort((a, b) => a.title.localeCompare(b.title, this.hass?.language));
    return lines.sort(
      (a, b) =>
        Number(!a.attention) - Number(!b.attention) ||
        RANK[a.shown.status] - RANK[b.shown.status] ||
        (a.shown.clock.at ?? Infinity) - (b.shown.clock.at ?? Infinity),
    );
  }

  /* ---------- render ---------- */

  /** What a row says at its end: the time left, when it starts, its compartments' setpoints, else its state. */
  private value(line: Line): string {
    const { shown, r } = line;
    if (busy(shown.status) && shown.clock.left !== null) {
      const { value, unit } = durationText(this.hass, shown.clock.left);
      return `${value} ${unit}`;
    }
    if (KIND_DEFAULTS[r.kind].hero === 'cold' && r.zones.length) {
      const values = r.zones
        .map((zone) => setpointOf(refState(this.hass, zone.setpoint ?? zone.current ?? '')))
        .filter((value): value is number => typeof value === 'number')
        .map((value) => `${Math.round(value)}°`);
      if (values.length) return values.join(' · ');
    }
    return shown.word;
  }

  /** What a row says under its name: what needs a hand, else what it does and when. */
  private sub(line: Line, now: number): string {
    return this.segments(line, now)
      .map((segment) => segment.text)
      .join(' · ');
  }

  /**
   * The same in its segments, the first whole and the rest optional, each with its short form: what needs a hand
   * ("Rinse aid" for "Add rinse aid", "Empty" for "Waiting to be unloaded"), how long it has run ("42 min").
   */
  private segments(line: Line, now: number, room = Infinity): Segment[] {
    const { shown, r } = line;
    if (line.attention) {
      const age = line.attention.startsWith(`${line.need} · `)
        ? line.attention.slice(line.need.length + 3)
        : '';
      const short =
        line.briefs.find((brief) => this.head.ruler.width('fv-row__sub', brief) <= room) ??
        line.briefs.at(-1);
      return [
        { text: line.need, ...(short ? { short } : {}) },
        ...(age ? [{ text: age, optional: true }] : []),
      ];
    }
    const word = busy(shown.status) && shown.phase ? shown.phase : shown.word;
    const [when = ''] = whenParts(this.hass, shown, r.startAt, now, 'both');
    const elapsed =
      busy(shown.status) && shown.clock.at === null && shown.clock.elapsed !== null
        ? spanText(this.hass, shown.clock.elapsed)
        : '';
    const said = this.value(line) === word ? '' : word;
    return [
      ...(said ? [{ text: said }] : []),
      ...(when
        ? [{ text: when, optional: Boolean(said), ...(elapsed ? { short: elapsed } : {}) }]
        : []),
    ].concat(said || when ? [] : [{ text: word }]);
  }

  /** How far a row's cycle is (0–1): done is all of it, at rest none. */
  private fraction(line: Line): number {
    const { shown } = line;
    if (shown.status === 'finished') return 1;
    return busy(shown.status) ? (shown.clock.progress ?? 0) / 100 : 0;
  }

  /** A row's tap and hold: the card's own for it, else its details. */
  private actions(line: Line): { readonly tap: () => void; readonly hold: () => void } {
    return {
      tap: () => this.tap(line.entity, line.item.tap_action ?? { action: 'more-info' }),
      hold: () => this.hold(line.entity, line.item.hold_action ?? { action: 'more-info' }),
    };
  }

  protected renderCard(): TemplateResult {
    const now = this.now();
    const all = this.read();
    this.lines = all;
    const active = all.filter(
      ({ shown, attention }) =>
        attention ||
        (shown.status !== 'idle' && shown.status !== 'off' && shown.status !== 'offline'),
    );
    const listed = this.config?.show === 'active' ? active : all;
    selfHide(this, listed.length === 0 && this.config?.hide_empty === true);
    if (this.variant === 'cards' && listed.length) return this.renderWholes(listed);
    const asked = Math.round(Number(this.config?.max_rows));
    const max = Number.isFinite(asked) ? Math.min(30, Math.max(1, asked)) : APPLIANCES_MAX_ROWS;
    // one appliance over the fold is a row of its own, not a "1 more" row
    const folded = !this.open && listed.length > max + 1;
    const shown = folded ? listed.slice(0, max) : listed;
    const running = all.filter(({ shown }) => busy(shown.status)).length;
    const done = all.filter(({ shown }) => shown.status === 'finished').length;
    const resting =
      all.length - running - done - all.filter(({ shown }) => shown.status === 'scheduled').length;
    const count = [
      running ? plural(this.hass, 'appliance.running_count', running, { count: running }) : '',
      done ? plural(this.hass, 'appliance.done_count', done, { count: done }) : '',
      resting ? plural(this.hass, 'appliance.rest_count', resting, { count: resting }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const title = this.config?.title ?? s(this.hass, 'appliances');
    const fitted = this.head.fit({
      width: this.contentWidth,
      title,
      sub: this.config?.subtitle ?? (this.config?.show_count === false ? '' : count),
    });
    const tone: Tone = running ? 'accent' : 'neutral';
    const empty =
      this.config?.empty_text ?? s(this.hass, all.length ? 'nothing_running' : 'no_appliance');
    return html`<article class="fv-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'washer') : null,
        tone,
        title,
        name: this.config?.title !== undefined,
        sub: fitted.sub,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        listed.length === 0
          ? html`<div class="al-empty">
              ${this.head.empty('washer', empty, '', this.contentWidth)}
            </div>`
          : this.variant === 'tiles'
            ? this.renderTiles(shown, now)
            : this.renderRows(shown, now)
      }
      ${folded ? this.renderMore(listed.length - max) : nothing}
    </article>`;
  }

  private renderRows(lines: readonly Line[], now: number): TemplateResult {
    const compact = this.variant === 'compact';
    // the circles stay while every name keeps its least and every line under it holds its first words whole
    const keep =
      this.head.rowsKeepIcon(
        this.contentWidth,
        lines.map((line) => ({ title: line.title, value: this.value(line) })),
        compact,
      ) &&
      (compact ||
        lines.every(
          (line) =>
            this.head.ruler.width('fv-row__sub', this.segments(line, now)[0]?.text ?? '') <=
            this.head.rowRoom(this.contentWidth, this.value(line)),
        ));
    return html`<div class="al-rows fv-rows">
      ${lines.map((line) => {
        const { tap, hold } = this.actions(line);
        const value = this.value(line);
        const room = this.head.rowRoom(this.contentWidth, value, { compact, icon: keep });
        const sub = this.head.fitRowSegments(this.segments(line, now, room), room);
        const pct = Math.round(this.fraction(line) * 100);
        const accent = this.accents.item(line.item.color);
        return html`<div
          class="fv-row fv-row--bar fv-row--tap ${line.r.unavailable ? 'is-unavailable' : ''} ${compact ? 'fv-row--compact' : ''} ${keep ? '' : 'fv-row--bare'}"
          data-accent=${accent ?? nothing}
          role="button"
          tabindex="0"
          aria-label=${`${line.title} · ${sub || value}`}
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          ${keep ? html`<span class="fv-ico fv-ico--${line.tone}" data-icon>${icon(line.item.icon ?? kindGlyph(line.r.kind))}</span>` : nothing}
          <span class="fv-row__text"
            ><span class="fv-row__title" data-name>${line.title}</span
            >${compact ? nothing : html`<span class="fv-row__sub ${line.attention ? 'fv-row__sub--warning' : ''}">${sub}</span>`}</span
          >
          <span class="fv-row__value ${line.attention ? 'fv-row__value--warning' : ''}"
            >${value}</span
          >
          <span class="fv-bar"
            ><span
              class="fv-bar__fill fv-bar--${line.tone === 'off' ? 'neutral' : line.tone}"
              data-measure="value"
              style="width:${pct}%"
            ></span
          ></span>
        </div>`;
      })}
    </div>`;
  }

  /**
   * Two tiles a row: each appliance's picture (its kind's drawing; or its circle ringed by its progress), its name over
   * what matters most — what needs a hand, else the time left or its state — whole: the pictures give way (every
   * tile's together) before a word would be cut, and a need too long for a tile says its short state instead, in the
   * warning's ink.
   */
  private renderTiles(lines: readonly Line[], now: number): TemplateResult {
    const radius = 24.5;
    const length = 2 * Math.PI * radius;
    const style = this.config?.picture ?? 'art';
    const art = style === 'art';
    const lead = style === 'none' ? 0 : art ? 64 + 12 : 56;
    // a tile with its picture says its words larger: they are measured as they are drawn
    const drawn = art ? 'al-tile--picture > ' : '';
    const width = (text: string): number => this.head.ruler.width(`${drawn}fv-row__sub`, text);
    const name = (title: string): number =>
      art
        ? Math.min(96, this.head.ruler.width(`${drawn}fv-row__title`, title))
        : this.head.rowNameRoom(title);
    // two a row where each tile holds its state whole without its picture, else one a row
    const one = lines.some((line) => width(this.value(line)) > (this.contentWidth - 8) / 2 - 24);
    const words = one ? this.contentWidth - 24 : (this.contentWidth - 8) / 2 - 24;
    const keep =
      lead > 0 &&
      lines.every(
        (line) =>
          width(line.need || this.value(line)) <= words - lead && name(line.title) <= words - lead,
      );
    const room = words - (keep ? lead : 0);
    return html`<div class="al-tiles ${one ? 'al-tiles--one' : ''}">
      ${lines.map((line) => {
        const { tap, hold } = this.actions(line);
        const fraction = this.fraction(line);
        const first = line.need && width(line.need) <= room ? line.need : this.value(line);
        const rest = line.need ? '' : this.sub(line, now);
        const sub = fitLine(
          rest && rest !== first
            ? [{ text: first }, { text: rest, optional: true }]
            : [{ text: first }],
          room,
          width,
        );
        const accent = this.accents.item(line.item.color);
        return html`<div
          class="al-tile ${art ? 'al-tile--picture' : ''} ${line.r.unavailable ? 'is-unavailable' : ''}"
          data-accent=${accent ?? nothing}
          role="button"
          tabindex="0"
          aria-label=${`${line.title} · ${line.attention || sub}`}
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          ${
            keep && art
              ? pictureBox(
                  64,
                  artOf(line.r.kind, () => this.requestUpdate()),
                )
              : keep
                ? html`<span class="al-ring fv-tone--${line.tone}">
                    ${
                      fraction > 0 && fraction < 1
                        ? svg`<svg viewBox="0 0 54 54" aria-hidden="true" data-measure="drawn"><circle class="al-ring__track" cx="27" cy="27" r=${radius} /><circle class="al-ring__fill" cx="27" cy="27" r=${radius} stroke-dasharray=${length.toFixed(2)} stroke-dashoffset=${(length * (1 - fraction)).toFixed(2)} /></svg>`
                        : nothing
                    }
                    <span class="fv-ico fv-ico--${line.tone}" data-icon
                      >${icon(line.item.icon ?? kindGlyph(line.r.kind))}</span
                    >
                  </span>`
                : nothing
          }
          <span class="fv-row__text"
            ><span class="fv-row__title" data-name>${line.title}</span
            ><span class="fv-row__sub ${line.attention ? 'fv-row__sub--warning' : ''}"
              >${sub}</span
            ></span
          >
        </div>`;
      })}
    </div>`;
  }

  /**
   * Each appliance its whole card (its item as the appliance card's config, the list's picture where it names none),
   * side by side as many as hold: no head and no surface of the list's own, so the cards stand in the band as the
   * section's own would. A row (a small appliance) holds in less than a whole card.
   */
  private renderWholes(lines: readonly Line[]): TemplateResult {
    const keep = new Set(lines.map((line) => line.key));
    for (const key of this.wholes.keys()) if (!keep.has(key)) this.wholes.delete(key);
    const rows = lines.every(
      ({ item, r }) => applianceVariant({ type: '', ...item, kind: item.kind ?? r.kind }) === 'row',
    );
    return html`<div class="al-cards" style="--al-least:${rows ? 240 : 300}px" data-card>
      ${repeat(
        lines,
        (line) => line.key,
        (line) => this.whole(line),
      )}
    </div>`;
  }

  /** An appliance's whole card, made once and given its config again only when it changed. */
  private whole(line: Line): LovelaceCard {
    const config: LovelaceCardConfig = {
      ...(this.config?.picture ? { picture: this.config.picture } : {}),
      ...(this.config?._now ? { _now: this.config._now } : {}),
      ...line.item,
      type: 'custom:fluvy-appliance-card',
    };
    const text = JSON.stringify(config);
    let entry = this.wholes.get(line.key);
    if (!entry) {
      entry = {
        card: document.createElement('fluvy-appliance-card') as LovelaceCard,
        config: '',
      };
      this.wholes.set(line.key, entry);
    }
    if (entry.config !== text) {
      entry.card.setConfig(config);
      entry.config = text;
    }
    entry.card.hass = this.rawHass;
    return entry.card;
  }

  /** The fold: "{count} more", opening the whole list. */
  private renderMore(count: number): TemplateResult {
    const open = (): void => {
      this.open = true;
      this.requestUpdate();
    };
    return html`<div class="al-rows fv-rows">
      <div
        class="fv-row fv-row--tap fv-row--compact"
        role="button"
        tabindex="0"
        @click=${open}
        @keydown=${activateKey(open)}
      >
        <span class="fv-ico fv-ico--neutral" data-icon>${icon('dots')}</span>
        <span class="fv-row__text"
          ><span class="fv-row__title">${s(this.hass, 'more', { count })}</span></span
        >
      </div>
    </div>`;
  }
}
