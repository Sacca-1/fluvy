import {
  formatDate,
  formatNumber,
  formatTime,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  houseZone,
  wallClock,
} from '@fluvy/core';
import {
  activateKey,
  clickPress,
  glyph,
  head,
  ico,
  preventMenu,
  readout,
  round,
  sheetStyles,
  startPress,
  type GlyphName,
  type Tone,
} from '@fluvy/ui';
import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit';

import { StreamHolder } from '../camera/stream.js';
import { sharedGap } from '../cover/common.js';
import { CAMERA_RATIOS, cameraRatio, plateHeight, printerHeight } from '../devices-family.js';
import { HeadFit } from '../energy/head.js';
import { Card, type BaseKey } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import { Crossfade } from '../shared/crossfade.js';
import { durationParts } from '../shared/duration.js';
import { fitLine } from '../shared/fit.js';
import {
  accentField,
  actionFields,
  boolField,
  editorLabels,
  editorWord,
  entityField,
  fieldRow,
  nameIconFields,
  orderedField,
  selectField,
  textField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import {
  PRINTER_PLATFORMS,
  PRINTER_ROLES,
  printerDevice,
  printerDevices,
  printerEntities,
  printerTrays,
  type PrinterEntities,
  type PrinterRole,
} from './roles.js';
import {
  busy,
  clockSeconds,
  durationSeconds,
  elapsedSeconds,
  finishedAt,
  printerPhase,
  timeLeft,
  type PrinterPhase,
} from './state.js';

const s = strings('printer');

export type PrinterVariant = 'full' | 'compact' | 'row';
export const PRINTER_VARIANTS: readonly PrinterVariant[] = ['full', 'compact', 'row'];

/** The readouts under the progress, as many as the card names, in its order. */
export type PrinterReadout =
  'nozzle' | 'bed' | 'chamber' | 'layer' | 'speed' | 'filament' | 'elapsed';
export const PRINTER_READOUTS: readonly PrinterReadout[] = [
  'nozzle',
  'bed',
  'chamber',
  'layer',
  'speed',
  'filament',
  'elapsed',
];

/** Which picture the card shows: the camera where there is one (else the job's preview), or either alone. */
export type PrinterImage = 'auto' | 'camera' | 'preview';
export const PRINTER_IMAGES: readonly PrinterImage[] = ['auto', 'camera', 'preview'];

/** Any other entity of the printer as a readout of its own: a fan, the filament unit's humidity, the print's weight. */
export interface PrinterSensor {
  readonly entity: string;
  readonly name?: string;
}

export interface PrinterCardConfig extends FluvyCardConfig {
  /** The printer's device: every entity it has is found on it. */
  device?: string;
  /** `full` (default): the picture, the progress, the readouts and the buttons. `compact`: the head, the progress and the readouts. `row`: one 76 row. */
  variant?: PrinterVariant;
  /** The readouts, in order (default: nozzle, bed, chamber, layer — those the printer has). */
  readouts?: readonly PrinterReadout[];
  /** More readouts from any of the printer's entities, after those. */
  sensors?: ReadonlyArray<string | PrinterSensor>;
  /** The picture above the progress (`full`): `show_image: false` takes it away. */
  show_image?: boolean;
  image?: PrinterImage;
  /** The camera's stills (`auto`) or Home Assistant's own stream (`live`). */
  camera_view?: 'auto' | 'live';
  /** The picture's shape (16:9 by default) and fit, as the camera card's; never taller than 360. */
  aspect_ratio?: string;
  fit_mode?: 'cover' | 'contain';
  /** The filament unit's trays (Bambu Lab's AMS, Creality's CFS, Anycubic's ACE): the filament each holds, the one in use marked. */
  show_filament?: boolean;
  /** Pause / resume, stop and the light (`full`); pause or resume in the row (`row`). */
  show_controls?: boolean;
  /** Entities named by hand for what the card does not find on the device: `{ role, entity }`. */
  roles?: ReadonlyArray<{ readonly role: PrinterRole; readonly entity: string }>;
  /** Test hook: an ISO instant the card takes for "now". */
  _now?: string;
}

/** The readouts a printer shows when the card names none: the ones it has. */
const DEFAULT_READOUTS: readonly PrinterReadout[] = ['nozzle', 'bed', 'chamber', 'layer'];
/** The most readouts a card holds (two rows of three). */
const MOST_READOUTS = 6;
/** A still from the printer's camera while it prints (a job moves slowly), and while it rests. */
const STILL_BUSY = 5_000;
const STILL_IDLE = 30_000;
/** A still that has not answered after this long no longer holds the next one back. */
const STALL_MS = 30_000;
/** The tallest a picture grows on a wide card. */
const PLATE_CAP = 360;
/**
 * A heater reads "now / target" from 3 °C away from its target and its reading alone from 1 °C (5 and 2 °F): no flicker
 * between.
 */
const HEATING_FROM = { c: 3, f: 5 } as const;
const HEATING_UNTIL = { c: 1, f: 2 } as const;
/** What a heater's readout is measured as, so a change of state never moves the layout: its widest form. */
const WIDEST_HEATER = '888 / 888';

/** The editor's role choices, each by its word. */
const ROLE_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: PRINTER_ROLES.map((role) => ({
      value: role,
      label: editorWord(`printer.role_${role}`),
    })),
  },
};

/** What a phase draws in: the accent while working, the warning when it waits or failed (a failure has its own glyph). */
function phaseTone(phase: PrinterPhase): Tone {
  switch (phase) {
    case 'printing':
    case 'preparing':
    case 'finished':
      return 'accent';
    case 'paused':
    case 'error':
      return 'warning';
    case 'offline':
      return 'off';
    default:
      return 'neutral';
  }
}

/** A readout of the card: what it says, what it is measured as (its widest form), the entity a tap opens. */
interface Stat {
  /** Which readout it is (an extra sensor has none). */
  readonly key?: PrinterReadout;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly measure: { readonly value: string; readonly unit: string };
  readonly entity: string | undefined;
  /** A filament's colour, as a swatch before its type (its 12 and 6 measured with the value). */
  readonly swatch?: string;
}

/** A swatch before a filament's type: its 12 and its 6. */
const SWATCH = 18;
/** The narrowest gap the trays' row and the buttons' share: what the trays' columns are decided at. */
const TRAY_GAP = 8;

/** How the filament unit's trays are laid out, and whether a given gap still holds them. */
interface TrayLayout {
  readonly columns: number;
  /** The swatches alone, their types as titles: the names would not fit two a row. */
  readonly bare: boolean;
  readonly holds: (gap: number) => boolean;
}

/** What `renderCard` reads once and the variants draw. */
interface Reading {
  readonly title: string;
  readonly word: string;
  readonly job: string;
  readonly tone: Tone;
  readonly phase: PrinterPhase;
  readonly progress: number | null;
  readonly left: number | null;
  readonly at: number | null;
  readonly elapsed: number | null;
  /** Why a failed print failed, in the integration's words; '' otherwise. */
  readonly failure: string;
  readonly unavailable: boolean;
}

/** A tray of the filament unit: what it holds, in which colour, whether it is the one printing. */
interface Tray {
  readonly id: string;
  readonly type: string;
  readonly color: string | null;
  readonly active: boolean;
  readonly empty: boolean;
}

/** An entity's name without its device's at its head ("X1C Aux fan" on the X1C: "Aux fan"), as Home Assistant says it. */
function ownWords(name: string, device: string): string {
  if (!device || !name.toLowerCase().startsWith(`${device.toLowerCase()} `)) return name;
  const rest = name.slice(device.length + 1).trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : name;
}

/** A filament's colour as the integration says it ("#FF6A13FF", with its alpha) as CSS can draw it. */
const filamentColour = (value: unknown): string | null =>
  typeof value === 'string' && /^#?[0-9a-f]{6}/i.test(value)
    ? `#${value.replace('#', '').slice(0, 6)}`
    : null;

/** What a filament sensor says where it says nothing: no type, no spool. */
const NO_FILAMENT = /^(unknown|none|-|empty)$/i;

/**
 * A filament's type from the first of its words that says one — the attributes the integrations use (Bambu Lab's and
 * Creality's `type`, Anycubic's `material`, a tray's `name`), then the sensor's own state — '' where none does.
 */
function filamentType(words: readonly unknown[]): string {
  for (const word of words)
    if (typeof word === 'string' && word.trim() && !NO_FILAMENT.test(word.trim()))
      return word.trim();
  return '';
}

/** A filament's swatch: its colour as the integrations name it (`color`, Creality's `color_hex`). */
const filamentSwatch = (v: EntityView): string | null =>
  filamentColour(v.attr('color') ?? v.attr('color_hex'));

/** What a status or an error says where there is no failure. */
const NO_FAILURE = /^(unknown|none|ok|no error|0)$/i;

/**
 * A 3D printer: the job it prints and how far it is, when it will be done and how long it has run, its heaters,
 * layers, speed and filament, the camera or the job's preview, and the buttons to pause, resume and stop it (stop asks
 * first, in Home Assistant's own dialog). Given its device (or any of its entities) it finds the rest: OctoPrint,
 * PrusaLink, Bambu Lab, Moonraker, Creality, Elegoo, Anycubic, Snapmaker and FlashForge by their own words (with
 * the trays of a filament unit — an AMS, a CFS, an ACE), any other by what it has and by `roles`.
 */
export class FluvyPrinterCard extends Card<PrinterCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: PrinterCardConfig): number {
    return printerHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    css`
      .pr-card {
        width: 100%;
      }
      .pr-plate {
        position: relative;
        margin-top: 16px;
        cursor: pointer;
      }
      /* why it failed, in the integration's words: under the head, in the warning's ink, two lines at most */
      .pr-note {
        display: -webkit-box;
        margin: 12px 0 0;
        overflow: hidden;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        color: var(--fluvy-warning);
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      /* the job's preview is a render of the part: the whole of it, on the page's fill */
      .pr-plate.is-preview {
        background: var(--fluvy-page);
      }
      .pr-plate.is-preview .fv-plate__img,
      .pr-plate.is-contain .fv-plate__img {
        object-fit: contain;
      }
      .pr-plate.is-contain:not(.is-preview) {
        background: var(--fluvy-neutral-05);
      }
      .pr-stream {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
      }
      /* the side readout on the big value's baseline (its 24 line 3 above the 44's foot) */
      .pr-top__side {
        padding-bottom: 3px;
        text-align: right;
      }
      .pr-top__side .fv-readout__value {
        justify-content: flex-end;
      }
      /* a column too narrow for the time left beside the progress: it goes under it, on the column's start, 12 below */
      .pr-top.is-stacked {
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 12px;
        height: auto;
      }
      .pr-top.is-stacked .pr-top__side {
        padding-bottom: 0;
        text-align: left;
      }
      .pr-top.is-stacked .pr-top__side .fv-readout__value {
        justify-content: flex-start;
      }
      .pr-progress {
        margin-top: 12px;
      }
      .pr-progress .fv-bar {
        height: 8px;
        margin-top: 0;
        border-radius: 4px;
      }
      .pr-progress .fv-bar__fill {
        height: 8px;
        border-radius: 4px;
        background: var(--tone-ink, var(--fluvy-accent));
        transition: width var(--fv-slow) var(--fv-ease);
      }
      .pr-meta {
        display: block;
        height: 20px;
        margin-top: 8px;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
        white-space: nowrap;
      }
      /* the readouts: equal columns, rows that fill; a last row that cannot fill is centred under the others */
      .pr-cols {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        column-gap: 16px;
        row-gap: 12px;
        margin-top: 16px;
      }
      .pr-stat {
        display: flex;
        justify-content: center;
        align-items: center;
        flex: 0 0 calc((100% - 16px * (var(--pr-cols, 3) - 1)) / var(--pr-cols, 3));
        min-width: 0;
        /* a readout that opens its entity is a target: 44 tall whatever its size */
        min-height: 44px;
        border-radius: var(--fluvy-radius-control);
        cursor: pointer;
      }
      .pr-stat:focus-visible {
        outline: 2px solid var(--fluvy-accent);
        outline-offset: 2px;
      }
      .pr-stat .fv-readout {
        min-width: 0;
      }
      .pr-stat .fv-readout__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pr-stat .fv-readout__value {
        white-space: nowrap;
      }
      .pr-swatch {
        flex: none;
        align-self: center;
        width: 12px;
        height: 12px;
        margin-inline-end: 6px;
        border-radius: 50%;
        /* a ring in the text's ink at about half: black filament on a dark card, white on a light one, still shows */
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fluvy-text) 48%, transparent);
      }
      /* the filament unit, a state and not a set of buttons: a hairline cell a tray, its colour and its type; the one
         printing ringed in the accent (its hairline and words), never filled, so the action row keeps the one loud fill */
      .pr-trays {
        display: grid;
        grid-template-columns: repeat(var(--pr-trays, 4), minmax(0, 1fr));
        gap: var(--pr-tray-gap, 8px);
        margin-top: 16px;
      }
      .pr-tray {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 0;
        height: 44px;
        padding: 0 8px;
        border-radius: var(--fluvy-radius-control);
        box-shadow: inset 0 0 0 1px var(--fluvy-border);
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        color: var(--fluvy-text);
        cursor: pointer;
      }
      .pr-tray > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pr-tray.is-active {
        box-shadow: inset 0 0 0 2px var(--fluvy-accent);
        color: var(--fluvy-accent-text, var(--fluvy-accent));
      }
      .pr-tray.is-empty {
        color: var(--fluvy-text-secondary);
      }
      .pr-tray .pr-swatch {
        margin: 0;
      }
      /* an empty tray: a dashed ring, a shape of its own (a black filament's swatch is never taken for it) */
      .pr-tray.is-empty .pr-swatch {
        box-shadow: none;
        border: 1.5px dashed var(--fluvy-text-secondary);
        box-sizing: border-box;
      }
      .pr-actions {
        display: grid;
        grid-template-columns: repeat(var(--pr-actions, 2), minmax(0, 1fr));
        gap: var(--pr-gap, 16px);
        margin-top: 16px;
      }
      /* the row: the compact anatomy (76, 16 in), the printer's circle ringed by its progress 3 clear of it */
      .pr-card--row {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 76px;
        padding: 16px;
      }
      .pr-ring {
        position: relative;
        display: grid;
        place-items: center;
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
      }
      .pr-ring > svg {
        position: absolute;
        top: -7px;
        left: -7px;
        width: 58px;
        height: 58px;
        transform: rotate(-90deg);
      }
      .pr-ring circle {
        fill: none;
        stroke-width: 2;
      }
      .pr-ring .pr-ring__track {
        stroke: var(--fluvy-border);
      }
      .pr-ring .pr-ring__fill {
        stroke: var(--tone-ink, var(--fluvy-accent));
        stroke-linecap: round;
        transition: stroke-dashoffset var(--fv-slow) var(--fv-ease);
      }
      /* a row too narrow for the state beside the circle: the row is the button, its words the whole width */
      .pr-card--row.is-bare {
        cursor: pointer;
      }
      .pr-card--row .fv-row__text {
        flex: 1 1 auto;
        min-width: 0;
      }
    `,
  ];

  static override properties = { ...Card.properties, stamp_: { state: true } };
  declare stamp_: number;

  private readonly head = new HeadFit(this);
  /** The camera's stills (or the preview's), cross-faded as they land. */
  private readonly frames = new Crossfade(
    this,
    () => {
      this.inFlight = 0;
      this.stamp_ = Date.now();
    },
    () => {
      this.inFlight = 0;
    },
  );
  private timer = 0;
  private period = 0;
  /** When the still in flight was asked for (0: none). */
  private inFlight = 0;
  /** The job's preview last fetched (its picture's path): fetched again only when it changes. */
  private previewPath = '';
  /** Home Assistant's stream, held as the camera card holds its own: one element, kept while the card is near. */
  private readonly holder = new StreamHolder(this, () => this.sync());
  /** Whether the last render drew the stream. */
  private shownStream = false;
  /** Whether each heater reads "now / target": kept between renders so a reading near its target does not flicker. */
  private readonly heating = new Map<'nozzle' | 'bed', boolean>();
  /** The device, its roles and its trays, found once per registry and config: the search walks every entity. */
  private found: PrinterFound | undefined;

  constructor() {
    super();
    this.stamp_ = 0;
  }

  /** A printer has no entity of its own to show: its device does; `entity` names one of its entities instead. */
  static override base: readonly BaseKey[] = [
    'entity',
    'name',
    'icon',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
  ];
  static override keys = configKeys<PrinterCardConfig>()([
    'device',
    'variant',
    'readouts',
    'sensors',
    'show_image',
    'image',
    'camera_view',
    'aspect_ratio',
    'fit_mode',
    'show_filament',
    'show_controls',
    'roles',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'sensors',
      title: 'printer.editor_sensors',
      domains: ['sensor', 'binary_sensor', 'number', 'select', 'fan'],
      keys: ['entity', 'name'],
      schema: [entityField(undefined, 'entity'), textField('name')],
    },
    {
      key: 'roles',
      idKey: 'role',
      title: 'printer.editor_roles',
      keys: ['role', 'entity'],
      computeLabel: (schema) =>
        schema.name === 'role' ? editorWord('printer.editor_role') : undefined,
      picker: { name: 'role', selector: ROLE_SELECTOR },
      schema: [{ name: 'role', selector: ROLE_SELECTOR }, entityField(undefined, 'entity')],
    },
  ];
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'full',
    readouts: [...DEFAULT_READOUTS],
    show_image: true,
    image: 'auto',
    camera_view: 'auto',
    aspect_ratio: '16:9',
    fit_mode: 'cover',
    show_filament: true,
    show_controls: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        {
          name: 'device',
          selector: {
            device: { filter: PRINTER_PLATFORMS.map((integration) => ({ integration })) },
          },
        },
        entityField(undefined, 'entity', false),
        nameIconFields(),
        selectField('variant', PRINTER_VARIANTS),
        orderedField(
          'readouts',
          PRINTER_READOUTS.map((key) => ({ value: key, label: editorWord(`printer.${key}`) })),
        ),
        fieldRow(boolField('show_image'), selectField('image', PRINTER_IMAGES)),
        fieldRow(
          selectField('camera_view', ['auto', 'live']),
          selectField('fit_mode', ['cover', 'contain']),
        ),
        selectField('aspect_ratio', CAMERA_RATIOS),
        fieldRow(boolField('show_filament'), boolField('show_controls')),
        accentField(),
        accentField('card_color', { none: true }),
        actionFields(),
      ],
      ...editorLabels(
        s,
        {
          device: 'editor_device',
          readouts: 'editor_readouts',
          show_image: 'editor_show_image',
          image: 'editor_image',
          show_filament: 'editor_show_filament',
        },
        { show_controls: 'editor.show_actions' },
      ),
    };
  }

  /** A new card takes the house's first printer: a device with a job, never the filament unit hung on one. */
  static getStubConfig(hass: HomeAssistant | undefined): PrinterCardConfig {
    const [device] = printerDevices(hass);
    return { type: 'custom:fluvy-printer-card', ...(device ? { device } : {}) };
  }

  override getCardSize(): number {
    return this.config ? Math.round(printerHeight(this.config) / 50) : 6;
  }
  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'row'
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  private get variant(): PrinterVariant {
    const v = this.config?.variant;
    return v === 'compact' || v === 'row' ? v : 'full';
  }

  /** The printer: its device, its roles (found on it, then the ones named by hand) and its filament trays. */
  private printer(): PrinterFound {
    const registry = this.hass?.entities;
    const key = JSON.stringify([this.config?.device, this.config?.entity, this.config?.roles]);
    if (this.found && this.found.registry === registry && this.found.key === key) return this.found;
    const device = printerDevice(this.hass, this.config?.device, this.config?.entity);
    this.found = {
      registry,
      key,
      device,
      entities: printerEntities(this.hass, device, this.config?.roles ?? [], this.config?.entity),
      trays: printerTrays(this.hass, device),
    };
    return this.found;
  }

  private roles(): PrinterEntities {
    return this.printer().entities;
  }

  /** The card's own extra readouts, as entries. */
  private sensors(): PrinterSensor[] {
    return (this.config?.sensors ?? []).map((entry) =>
      typeof entry === 'string' ? { entity: entry } : entry,
    );
  }

  protected override watched(): readonly string[] {
    const { entities, trays } = this.printer();
    return [
      ...Object.values(entities).filter((id): id is string => Boolean(id)),
      ...trays,
      ...this.sensors().map((sensor) => sensor.entity),
    ];
  }

  private now(): number {
    const frozen = this.config?._now ? Date.parse(this.config._now) : NaN;
    return Number.isFinite(frozen) ? frozen : Date.now();
  }

  private view(role: PrinterRole): EntityView | undefined {
    const id = this.roles()[role];
    return id ? this.entity(id) : undefined;
  }

  private number(role: PrinterRole): number | null {
    const v = this.view(role);
    return v && v.status === 'ok' ? v.number : null;
  }

  /** A timestamp sensor's moment (ms), or null. */
  private moment(role: PrinterRole): number | null {
    const v = this.view(role);
    if (!v || v.status !== 'ok') return null;
    const at = Date.parse(v.state);
    return Number.isFinite(at) ? at : null;
  }

  /**
   * A duration a role holds, in seconds: a figure in its sensor's unit (Bambu Lab's and Anycubic's minutes, Elegoo's
   * milliseconds, seconds elsewhere), else a clock's "01:02:03" (the older Snapmaker's); null when unknown.
   */
  private seconds(role: 'remaining' | 'elapsed'): number | null {
    const v = this.view(role);
    if (!v || v.status !== 'ok') return null;
    return durationSeconds(v.number, v.unit) ?? clockSeconds(v.state);
  }

  private figure(n: number): string {
    return formatNumber(this.hass, n, { digits: 0 });
  }

  /** A temperature's unit: its sensor's own, else the house's (Celsius or Fahrenheit). */
  private degrees(v: EntityView): string {
    return v.unit || this.hass?.config.unit_system.temperature || '°C';
  }

  /**
   * Whether the readouts take their narrow forms (a heater alone, the layer's total as its unit): where a heater's
   * widest pair ("888 / 888 °F") would not hold half the column at the extra-small size, so two still hold a row —
   * measured, so a language, a unit or the face decides, never a fixed width.
   */
  private get narrowForms(): boolean {
    const v = this.view('nozzle') ?? this.view('bed');
    const unit = v ? this.degrees(v) : (this.hass?.config.unit_system.temperature ?? '°C');
    const pair = this.head.ruler.width(
      'fv-readout fv-readout--xs > fv-readout__value',
      WIDEST_HEATER,
      'fv-unit',
      unit,
    );
    return pair > (this.contentWidth - 16) / 2;
  }

  /* ---------- the picture ---------- */

  /** The picture the card shows, as `image` asks: the camera, the job's preview (a camera or an image entity). */
  private picture(): { readonly view: EntityView; readonly preview: boolean } | null {
    if (this.config?.show_image === false || this.variant !== 'full') return null;
    const shown = (role: 'camera' | 'preview'): EntityView | null => {
      const v = this.view(role);
      return v && v.status === 'ok' && v.attr<string | null>('entity_picture') ? v : null;
    };
    const image = this.config?.image ?? 'auto';
    const camera = image === 'preview' ? null : shown('camera');
    if (camera) return { view: camera, preview: false };
    const preview = image === 'camera' ? null : shown('preview');
    return preview ? { view: preview, preview: true } : null;
  }

  /** The camera live: asked for, a camera shown, and Home Assistant's stream element there. */
  private get streaming(): boolean {
    const picture = this.picture();
    return (
      this.config?.camera_view === 'live' &&
      picture !== null &&
      !picture.preview &&
      picture.view.domain === 'camera' &&
      this.holder.playing
    );
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.onTabChange);
    this.sync();
  }

  /** Back in front: a preview put off while the page was hidden is fetched now. */
  private readonly onTabChange = (): void => {
    if (document.visibilityState !== 'hidden') this.sync();
  };

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this.onTabChange);
    window.clearInterval(this.timer);
    this.timer = 0;
    this.period = 0;
    this.previewPath = '';
  }

  /**
   * The picture's upkeep: the stream asked for once when the card wants it live; a camera's still now and then while
   * the card is up — every five seconds while it prints, every thirty at rest; a job's preview, which changes with the
   * job, fetched again only when its picture does.
   */
  private sync(): void {
    const picture = this.picture();
    // the stream comes and goes with the screen, which is not the card's state: draw it again
    const streaming = this.streaming;
    if (streaming !== this.shownStream) {
      this.shownStream = streaming;
      this.requestUpdate();
    }
    if (picture?.preview) {
      window.clearInterval(this.timer);
      this.timer = 0;
      this.period = 0;
      const path = picture.view.attr<string | null>('entity_picture') ?? '';
      // remembered once its fetch has started (a hidden page or a still in flight puts it off to the next look)
      if (path !== this.previewPath && this.isConnected && this.pull()) this.previewPath = path;
      return;
    }
    this.previewPath = '';
    if (this.config?.camera_view === 'live' && picture && picture.view.domain === 'camera')
      this.holder.ask(picture.view.id);
    const period = !picture || streaming ? 0 : busy(this.phase()) ? STILL_BUSY : STILL_IDLE;
    if (period === this.period) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.period = period;
    if (period && this.isConnected) {
      this.timer = window.setInterval(() => this.pull(), period);
      this.pull();
    }
  }

  /** A still asked for now; false where none could be (no picture, one in flight, a hidden page). */
  private pull(): boolean {
    const picture = this.picture();
    const path = picture?.view.attr<string | null>('entity_picture');
    if (!this.hass || !path || document.visibilityState === 'hidden') return false;
    const now = Date.now();
    if (this.inFlight && now - this.inFlight < STALL_MS) return false;
    this.inFlight = now;
    const base = this.hass.hassUrl(path);
    const width = Math.ceil(this.contentWidth * (window.devicePixelRatio || 1));
    this.frames.show(
      base.startsWith('data:')
        ? `${base}#${Date.now()}`
        : `${base}${base.includes('?') ? '&' : '?'}width=${width}&_=${Date.now()}`,
    );
    return true;
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    // another printer, or stills instead of the stream: the stream goes, and its session with it
    const previous = changed.get('config') as PrinterCardConfig | undefined;
    if (
      previous &&
      (previous.camera_view !== this.config?.camera_view ||
        previous.device !== this.config?.device ||
        previous.entity !== this.config?.entity)
    )
      this.holder.teardown();
    if (changed.has('hass') || changed.has('config')) this.sync();
  }

  /* ---------- reading the printer ---------- */

  private phase(): PrinterPhase {
    const status = this.view('status');
    const printing = this.view('printing');
    if (status && status.status !== 'ok') return status.status === 'missing' ? 'idle' : 'offline';
    return printerPhase(status?.state, printing?.state === 'on');
  }

  /**
   * A heater as a readout: "215 / 220 °C" while it heats to a target (from 3° away, back to its reading alone within
   * 1°), "24 °C" at its target or off — always measured as its widest form, so the card never reflows as it drifts.
   */
  private heater(role: 'nozzle' | 'bed'): Stat | null {
    const v = this.view(role);
    if (!v) return null;
    const unit = this.degrees(v);
    const scale = unit === '°F' ? 'f' : 'c';
    const now = this.number(role);
    const target = role === 'nozzle' ? 'nozzle_target' : 'bed_target';
    const goal = this.number(target);
    const away = goal !== null && goal > 0 && now !== null ? Math.abs(goal - now) : 0;
    // a narrow card reads every heater alone: two columns hold its reading, not "now / target"
    const both = this.roles()[target] !== undefined && !this.narrowForms;
    const heading =
      both &&
      (away >= HEATING_FROM[scale] ||
        ((this.heating.get(role) ?? false) && away > HEATING_UNTIL[scale]));
    this.heating.set(role, heading);
    return {
      label: s(this.hass, role),
      value:
        now === null
          ? '—'
          : heading && goal !== null
            ? `${this.figure(now)} / ${this.figure(goal)}`
            : this.figure(now),
      unit: now === null ? '' : unit,
      measure: { value: both ? WIDEST_HEATER : '888', unit },
      entity: v.id,
    };
  }

  /**
   * The filament printing now: its type ("PLA"), with its colour where the integration gives one — by its attributes,
   * else by its state (FlashForge's type; Elegoo's state is the colour itself, a swatch and no type).
   */
  private filament(): Stat | null {
    const v = this.view('filament');
    if (!v) return null;
    const state = v.status === 'ok' ? v.state : '';
    const stated = filamentColour(state);
    const type = filamentType([
      v.attr('type'),
      v.attr('filament'),
      v.attr('material'),
      v.attr('name'),
      stated ? '' : state,
    ]);
    const value = type || '—';
    const swatch = filamentSwatch(v) ?? stated;
    return {
      label: s(this.hass, 'filament'),
      value,
      unit: '',
      measure: { value, unit: '' },
      entity: v.id,
      ...(swatch ? { swatch } : {}),
    };
  }

  private stats(r: Reading): Stat[] {
    const wanted = this.config?.readouts ?? DEFAULT_READOUTS;
    const out: Stat[] = [];
    const plain = (label: string, value: string, unit: string, entity?: string): Stat => ({
      label,
      value,
      unit,
      measure: { value, unit },
      entity,
    });
    for (const key of wanted) {
      if (key === 'nozzle' || key === 'bed') {
        const stat = this.heater(key);
        if (stat) out.push(stat);
      } else if (key === 'chamber') {
        const v = this.view('chamber');
        const n = this.number('chamber');
        if (v)
          out.push({
            ...plain(
              s(this.hass, 'chamber'),
              n === null ? '—' : this.figure(n),
              n === null ? '' : this.degrees(v),
              v.id,
            ),
            // a chamber's air: two figures in Celsius, three in Fahrenheit (a hot chamber passes 100 °F)
            measure: { value: this.degrees(v) === '°F' ? '888' : '88', unit: this.degrees(v) },
          });
      } else if (key === 'layer') {
        const layer = this.number('layer');
        const layers = this.number('layers');
        // layers belong to a job: at rest there are none to count; a narrow card writes "112" with "/ 240" as its unit
        if (this.view('layer') && busy(r.phase)) {
          const narrow = this.narrowForms && layer !== null && layers;
          out.push(
            plain(
              s(this.hass, 'layer'),
              layer === null
                ? '—'
                : layers && !narrow
                  ? `${this.figure(layer)} / ${this.figure(layers)}`
                  : this.figure(layer),
              narrow && layers ? `/ ${this.figure(layers)}` : '',
              this.roles().layer,
            ),
          );
        }
      } else if (key === 'speed') {
        const v = this.view('speed');
        if (v) {
          const n = v.number;
          out.push(
            plain(
              s(this.hass, 'speed'),
              v.status !== 'ok' ? '—' : n !== null ? this.figure(n) : stateText(this.hass, v),
              v.status === 'ok' && n !== null ? (v.unit ?? '%') : '',
              v.id,
            ),
          );
        }
      } else if (key === 'filament') {
        // a filament unit's trays say it better: the readout is for a printer with one spool
        const stat = this.trays().length ? null : this.filament();
        if (stat) out.push(stat);
      } else if (key === 'elapsed' && r.elapsed !== null) {
        const parts = this.durationText(r.elapsed);
        out.push({
          ...plain(s(this.hass, 'elapsed'), parts.value, parts.unit, this.roles().elapsed),
          key: 'elapsed',
        });
      }
    }
    // the device's own name, as Home Assistant puts it at the head of its entities' names
    const entry = this.printer().device
      ? this.hass?.devices?.[this.printer().device ?? '']
      : undefined;
    const device = entry?.name_by_user || entry?.name || '';
    for (const sensor of this.sensors()) {
      const v = this.entity(sensor.entity);
      const n = v.status === 'ok' ? v.number : null;
      out.push(
        plain(
          sensor.name ?? ownWords(v.name, device),
          v.status !== 'ok'
            ? '—'
            : n !== null
              ? formatNumber(this.hass, n, {
                  digits: Number.isInteger(n) || Math.abs(n) >= 100 ? 0 : 1,
                })
              : stateText(this.hass, v),
          v.status === 'ok' && n !== null ? (v.unit ?? '') : '',
          v.id,
        ),
      );
    }
    return out.slice(0, MOST_READOUTS);
  }

  /**
   * The readouts' columns and size: as many a row as hold every label and every value (each heater in its widest
   * form) — at the small size, else the extra-small — among the counts that leave no readout alone on its row (four
   * as two by two, five as three and two).
   */
  private readoutLayout(
    stats: readonly Stat[],
    compact: boolean,
  ): { columns: number; size: 's' | 'xs' } {
    const w = this.contentWidth;
    const fits = (n: number, size: 's' | 'xs'): boolean => {
      const column = (w - 16 * (n - 1)) / n;
      return stats.every(
        (stat) =>
          this.head.ruler.width('fv-readout > fv-readout__label', stat.label) <= column &&
          this.head.ruler.width(
            `fv-readout fv-readout--${size} > fv-readout__value`,
            stat.measure.value,
            'fv-unit',
            stat.measure.unit,
          ) +
            (stat.swatch ? SWATCH : 0) <=
            column,
      );
    };
    const count = stats.length;
    const counts = [4, 3, 2, 1].filter((n) => {
      if (n > count) return false;
      const rest = count % n;
      return rest === 0 || rest >= n - 1;
    });
    // more a row first: two at the extra-small size before one at the small (a readout alone on its row is the last resort)
    for (const n of counts)
      for (const size of compact ? (['xs'] as const) : (['s', 'xs'] as const))
        if (fits(n, size)) return { columns: n, size };
    return { columns: 1, size: 'xs' };
  }

  /** "1 h 12 min", "45 min", "2 d 3 h": a duration as a readout's value and its last unit. */
  private durationText(seconds: number | null): { value: string; unit: string } {
    const parts = seconds === null ? null : durationParts(seconds);
    const last = parts?.[parts.length - 1];
    if (!parts || !last) return { value: '—', unit: '' };
    const word = (unit: 'd' | 'h' | 'min'): string =>
      this.t(unit === 'd' ? 'time.unit_d' : unit === 'h' ? 'time.unit_h' : 'time.unit_min');
    const lead = parts.slice(0, -1).map((p) => `${p.value} ${word(p.unit)} `);
    return { value: `${lead.join('')}${last.value}`, unit: word(last.unit) };
  }

  /** How far the job is (0–100), from its progress sensor; null when it says nothing. */
  private progress(phase: PrinterPhase): number | null {
    if (phase === 'finished') return 100;
    const n = this.number('progress');
    return n === null ? null : Math.min(100, Math.max(0, n));
  }

  /** The filament unit's trays, in their order. */
  private trays(): Tray[] {
    if (this.config?.show_filament === false) return [];
    return this.printer().trays.map((id) => this.trayOf(this.entity(id)));
  }

  /**
   * A tray as its sensor says it: what it holds (by the words the units use, else its state), its colour, whether it
   * is the one printing (Bambu Lab's `active`, Creality's `selected`, Anycubic's `loaded`), whether it is empty (said
   * so, or holding no type).
   */
  private trayOf(v: EntityView): Tray {
    const type = filamentType([
      v.attr('type'),
      v.attr('filament'),
      v.attr('material'),
      v.attr('name'),
      v.status === 'ok' ? v.state : '',
    ]);
    const empty = v.attr<boolean | null>('empty') === true || (!type && v.status === 'ok');
    return {
      id: v.id,
      type: empty ? s(this.hass, 'empty') : type || '—',
      color: empty ? null : filamentSwatch(v),
      active: (v.attr('active') ?? v.attr('selected') ?? v.attr('loaded')) === true,
      empty,
    };
  }

  /**
   * Why it failed, in the integration's words (Bambu Lab's error and HMS messages, FlashForge's code); where the
   * printer has no error of its own, the code its status carries (Creality's); '' when it says nothing.
   */
  private failure(): string {
    const v = this.view('error');
    if (!v) {
      const code = this.view('status')?.attr<string | number | null>('error_code');
      const text = code === undefined || code === null ? '' : String(code).trim();
      return NO_FAILURE.test(text) ? '' : text;
    }
    if (v.status !== 'ok') return '';
    if (v.domain === 'binary_sensor') {
      if (v.state !== 'on') return '';
      for (const [key, value] of Object.entries(v.stateObj?.attributes ?? {}))
        if (
          typeof value === 'string' &&
          value.trim() &&
          /error|description|message/i.test(key) &&
          !/wiki|url|count|code/i.test(key)
        )
          return value.replace(/^HMS_[0-9A-F_]+:\s*/i, '').trim();
      return '';
    }
    return NO_FAILURE.test(v.state) ? '' : stateText(this.hass, v);
  }

  /** While it prepares, the stage it is at ("Heatbed preheating"), as Home Assistant words it. */
  private stage(word: string): string {
    const v = this.view('stage');
    if (!v || v.status !== 'ok') return '';
    const text = stateText(this.hass, v);
    return text.toLowerCase() === word.toLowerCase() ? '' : text;
  }

  /* ---------- actions ---------- */

  private press(role: 'pause' | 'resume' | 'stop'): void {
    const id = this.roles()[role];
    if (!id) return;
    if (role === 'stop') {
      // stopping cannot be undone: Home Assistant's own dialog asks first
      this.tap(id, {
        action: 'perform-action',
        perform_action: 'button.press',
        target: { entity_id: id },
        confirmation: { text: s(this.hass, 'stop_confirm') },
      });
      return;
    }
    void this.call('button', 'press', { entity_id: id });
  }

  private toggleLight(): void {
    const id = this.roles().light;
    if (!id) return;
    void this.call(id.slice(0, id.indexOf('.')), 'toggle', { entity_id: id });
  }

  /** A cell of the action row: a glyph, its word for the reader, what it does. */
  private cell(
    key: string,
    name: GlyphName,
    label: string,
    onTap: () => void,
    state = '',
  ): TemplateResult {
    return html`<button
      class="fv-action ${state}"
      data-control
      data-target
      data-action=${key}
      aria-label=${label}
      title=${label}
      @click=${onTap}
    >
      ${glyph(name)}
    </button>`;
  }

  /** What can be pressed now: pause or resume while a job runs (the primary), stop, and the light. */
  private actionItems(phase: PrinterPhase): TemplateResult[] {
    if (this.config?.show_controls === false) return [];
    const roles = this.roles();
    const items: TemplateResult[] = [];
    if (busy(phase)) {
      if (phase === 'paused' && roles.resume)
        items.push(
          this.cell(
            'resume',
            'play',
            s(this.hass, 'resume'),
            () => this.press('resume'),
            'fv-action--accent',
          ),
        );
      else if (phase !== 'paused' && roles.pause)
        items.push(
          this.cell(
            'pause',
            'pause',
            s(this.hass, 'pause'),
            () => this.press('pause'),
            'fv-action--accent',
          ),
        );
      if (roles.stop)
        items.push(this.cell('stop', 'stop', s(this.hass, 'stop'), () => this.press('stop')));
    }
    if (roles.light) {
      const on = this.view('light')?.state === 'on';
      items.push(
        this.cell(
          'light',
          'bulb',
          s(this.hass, 'light'),
          () => this.toggleLight(),
          on ? 'is-on' : '',
        ),
      );
    }
    return items;
  }

  /** The action row: its cells on the gap the trays above it share, `columns` a row. */
  private controls(
    items: readonly TemplateResult[],
    gap: number,
    columns: number,
  ): TemplateResult | typeof nothing {
    if (!items.length) return nothing;
    return html`<div
      class="pr-actions"
      data-fill-row
      style="--pr-actions:${columns};--pr-gap:${gap}px"
    >
      ${items}
    </div>`;
  }

  /* ---------- render ---------- */

  private printerName(): string {
    if (this.config?.name) return this.config.name;
    const device = this.printer().device;
    const entry = device ? this.hass?.devices?.[device] : undefined;
    return entry?.name_by_user || entry?.name || this.view('status')?.name || s(this.hass, 'title');
  }

  /**
   * The job: its file's name without the slicer's extension ("benchy.gcode" → "benchy") — from the file sensor, else
   * from the status's own attributes (Creality's); a "None" (FlashForge's at rest) is no job.
   */
  private job(): string {
    const file = this.view('file');
    const status = this.view('status');
    const name = file
      ? file.status === 'ok'
        ? file.state
        : ''
      : (status?.attr<unknown>('file') ?? status?.attr<unknown>('filename'));
    if (typeof name !== 'string' || !name.trim() || /^(none|n\/a)$/i.test(name.trim())) return '';
    return name.trim().replace(/\.(gcode|bgcode|3mf|gco|g)$/i, '');
  }

  protected renderCard(): TemplateResult {
    const roles = this.roles();
    if (!Object.keys(roles).length) return this.renderEmpty(s(this.hass, 'no_printer'));
    const phase = this.phase();
    const status = this.view('status');
    const now = this.now();
    const time = timeLeft(this.seconds('remaining'), this.moment('finish'), now);
    const changed = status?.stateObj ? Date.parse(status.stateObj.last_changed) : NaN;
    const reading: Reading = {
      title: this.printerName(),
      word: status ? stateText(this.hass, status) : s(this.hass, `phase_${phase}`),
      job: busy(phase) || phase === 'finished' || phase === 'error' ? this.job() : '',
      // the card's colour stands in for the accent, never for a status: paused and failed stay the warning's
      tone:
        phase === 'offline'
          ? 'off'
          : phase === 'paused' || phase === 'error'
            ? 'warning'
            : toneOf(this.config, phaseTone(phase)),
      phase,
      progress: this.progress(phase),
      left: busy(phase) ? time.left : null,
      at:
        phase === 'finished'
          ? finishedAt(this.moment('finish'), Number.isFinite(changed) ? changed : null, now)
          : busy(phase)
            ? time.at
            : null,
      elapsed: busy(phase)
        ? elapsedSeconds(this.seconds('elapsed'), this.moment('start'), now)
        : null,
      failure: phase === 'error' ? this.failure() : '',
      unavailable: phase === 'offline',
    };
    return this.variant === 'row' ? this.renderRow(reading) : this.renderFull(reading);
  }

  /** The head's tone: neutral at rest, the phase's otherwise. */
  private headTone(r: Reading): Tone {
    return r.phase === 'idle' || r.phase === 'stopped' ? 'neutral' : r.tone;
  }

  /** The printer's glyph, or the warning's when it failed (its tone alone would read as a pause). */
  private headGlyph(r: Reading): string {
    return r.phase === 'error' ? 'warn' : (this.config?.icon ?? 'printer3d');
  }

  /**
   * The head: the printer, what it prints (or the stage it prepares at), and its state in the badge
   * — which gives way first on a narrow card, as badges do, and is then said at the head of the sub: the state is
   * never left unsaid.
   */
  private renderHead(r: Reading): TemplateResult {
    const w = this.contentWidth;
    // what it prints, or the stage it prepares at (why a job failed has a line of its own under the head)
    const detail = r.phase === 'preparing' ? this.stage(r.word) || r.job : r.job;
    let fitted = this.head.fit({
      width: w,
      title: r.title,
      sub: detail,
      badge: { text: r.word, tone: this.headTone(r) },
    });
    if (fitted.badge === nothing)
      fitted = this.head.fit({
        width: w,
        title: r.title,
        sub: [r.word, detail].filter(Boolean).join(' · '),
      });
    return head({
      icon: fitted.icon ? this.headGlyph(r) : null,
      tone: this.headTone(r),
      title: r.title,
      sub: fitted.sub,
      trailing: fitted.badge,
      name: true,
      onIconTap: () => this.tap(this.roles().status),
      onHold: () => this.hold(this.roles().status),
      iconLabel: r.title,
    });
  }

  /** The picture: the camera's stills or its stream, else the job's preview, in its shape, never taller than 360. */
  private renderPicture(): TemplateResult | typeof nothing {
    const picture = this.picture();
    if (!picture) return nothing;
    const ratio = cameraRatio(this.config?.aspect_ratio);
    const height = Math.min(PLATE_CAP, plateHeight(this.contentWidth, ratio));
    // capped on a wide card, the picture keeps its shape: as wide as its height asks, centred on the page's fill
    const width = height === PLATE_CAP ? Math.round((PLATE_CAP * ratio) / 4) * 4 : 0;
    const contain = this.config?.fit_mode === 'contain';
    const stream = this.streaming
      ? this.holder.draw({
          hass: this.hass,
          stateObj: picture.view.stateObj,
          fitMode: contain ? 'contain' : 'cover',
          aspectRatio: ratio,
          className: 'pr-stream',
        })
      : undefined;
    return html`<div
      class="pr-plate dv-cam fv-plate ${picture.preview ? 'is-preview' : ''} ${
        contain ? 'is-contain' : ''
      }"
      style="height:${height}px${width && width < this.contentWidth ? `;width:${width}px;margin-inline:auto` : ''}"
      role="button"
      tabindex="0"
      aria-label=${picture.view.name}
      .fvTap=${() => this.tap(picture.view.id, { action: 'more-info' })}
      @pointerdown=${startPress}
      @click=${clickPress}
      @contextmenu=${preventMenu}
    >
      ${stream ?? this.frames.render()}
      ${stream || this.stamp_ ? nothing : html`<span class="fv-skeleton dv-cam__skeleton"></span>`}
    </div>`;
  }

  /** Whether the time left goes under the progress: the two readouts (label or figure, the wider) and 16 do not fit. */
  private stacked(r: Reading, left: { value: string; unit: string }): boolean {
    if (r.left === null || r.progress === null) return false;
    const ruler = this.head.ruler;
    const block = (label: string, size: 'l' | 's', value: string, unit: string): number =>
      Math.max(
        ruler.width('fv-readout > fv-readout__label', label),
        ruler.width(`fv-readout fv-readout--${size} > fv-readout__value`, value, 'fv-unit', unit),
      );
    return (
      block(s(this.hass, 'progress'), 'l', this.figure(r.progress), '%') +
        16 +
        block(s(this.hass, 'left'), 's', left.value, left.unit) >
      this.contentWidth
    );
  }

  /**
   * When it will be ready, or when it finished: the time today; another day's with its weekday ("Ready Fri at 05:27");
   * a job finished before today by how long ago ("Finished 2 d ago" — a printer stays finished until its next job).
   */
  private whenText(phase: PrinterPhase, at: Date): string {
    const now = new Date(this.now());
    const time = formatTime(this.hass, at);
    // calendar days apart on the house's calendar, the one its times are written in (a job finished yesterday morning
    // finished yesterday, whatever the hours say; and a viewer away from home reads the house's days)
    const zone = houseZone(this.hass);
    const midnight = (d: Date): number => {
      const wall = wallClock(d, zone);
      return Date.UTC(wall.year, wall.month - 1, wall.day);
    };
    const days = Math.round((midnight(at) - midnight(now)) / 86_400_000);
    if (phase === 'finished')
      return days === 0
        ? s(this.hass, 'done_at', { time })
        : s(this.hass, 'done_ago', {
            when:
              days === -1
                ? this.t('time.yesterday')
                : this.t('time.days_ago', { n: Math.abs(days) }),
          });
    if (!busy(phase)) return '';
    if (days === 0) return s(this.hass, 'ready_at', { time });
    // within the week its weekday; further out its date, so a job eight days long never reads like tomorrow's
    const day = formatDate(this.hass, at, days < 6 ? 'weekday' : 'short');
    return s(this.hass, 'ready_on', { day, time });
  }

  /** The line under the bar: its parts by importance, the last ones left out whole where they do not fit. */
  private meta(parts: readonly string[]): string {
    return fitLine(
      parts.filter(Boolean).map((text, index) => ({ text, optional: index > 0 })),
      this.contentWidth,
      (text) => this.head.ruler.width('pr-meta', text),
    );
  }

  private renderFull(r: Reading): TemplateResult {
    const compact = this.variant === 'compact';
    // a failed job keeps its bar where it stopped (in the warning's tone), and says why under the head
    const working = busy(r.phase) || r.phase === 'finished' || r.phase === 'error';
    const failure = r.failure;
    const at = r.at !== null ? new Date(r.at) : null;
    const left = this.durationText(r.left);
    const stats = r.unavailable ? [] : this.stats(r);
    // the layer said once: by its readout when it has one, else in the line under the bar
    const layerShown = stats.some((stat) => stat.entity && stat.entity === this.roles().layer);
    const layer = this.number('layer');
    const layers = this.number('layers');
    const when = at ? this.whenText(r.phase, at) : '';
    const elapsedShown = stats.some((stat) => stat.key === 'elapsed');
    const elapsed =
      r.elapsed !== null && !elapsedShown
        ? s(this.hass, 'elapsed_text', {
            time: Object.values(this.durationText(r.elapsed)).join(' '),
          })
        : '';
    const layerText =
      !layerShown && busy(r.phase) && layer !== null && layers
        ? s(this.hass, 'layer_of', { layer: this.figure(layer), layers: this.figure(layers) })
        : '';
    // compact: the progress and the time left lead its one line; full: they are the row above the bar
    const line = compact
      ? this.meta([
          `${this.figure(r.progress ?? 0)} %`,
          r.left !== null ? s(this.hass, 'left_text', { time: `${left.value} ${left.unit}` }) : '',
          when,
          elapsed,
          layerText,
        ])
      : this.meta([when, elapsed, layerText]);
    const { columns, size } = this.readoutLayout(stats, compact);
    const trays = r.unavailable || compact ? [] : this.trays();
    const items = compact || r.unavailable ? [] : this.actionItems(r.phase);
    // the trays over the buttons share one gap, 8 to 16 (never wider than the 16 between the two groups): both rows'
    // cells on whole pixels; 4 only where nothing wider keeps every cell 44 (three buttons in half a phone's column)
    const layout: TrayLayout = trays.length
      ? this.trayLayout(trays)
      : { columns: 0, bare: false, holds: () => true };
    // three buttons that would be under 44 even 4 apart (a card under 180) go two a row, the third under them
    const cell = (g: number, n: number): number => (this.contentWidth - g * (n - 1)) / n;
    const buttons = items.length === 3 && cell(4, 3) < 44 ? 2 : items.length;
    const counts = [layout.columns, buttons].filter((n) => n > 0);
    const touchable = (g: number): boolean => counts.every((n) => cell(g, n) >= 44);
    // the trays' columns were decided at the narrowest gap: a wider one is taken only where they still hold
    const wide = sharedGap(this.contentWidth, counts, [16, 12, 8].filter(layout.holds));
    const narrow = sharedGap(this.contentWidth, counts, [4]);
    const gap = touchable(wide) && layout.holds(wide) ? wide : touchable(narrow) ? narrow : 4;
    return html`<article
      class="fv-card dv-card pr-card ${r.unavailable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${this.renderHead(r)} ${failure ? html`<p class="pr-note">${failure}</p>` : nothing}
      ${this.renderPicture()}
      ${
        working && r.progress !== null
          ? html`${
                compact
                  ? nothing
                  : html`<div
                      class="fv-value-row pr-top ${this.stacked(r, left) ? 'is-stacked' : ''}"
                    >
                      ${readout({ label: s(this.hass, 'progress'), value: this.figure(r.progress), unit: '%', size: 'l' })}
                      ${r.left !== null ? html`<div class="pr-top__side">${readout({ label: s(this.hass, 'left'), value: left.value, unit: left.unit, size: 's' })}</div>` : nothing}
                    </div>`
              }
              <div class="pr-progress fv-tone--${r.tone}">
                <span
                  class="fv-bar"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow=${Math.round(r.progress)}
                  aria-label=${s(this.hass, 'progress')}
                  ><span
                    class="fv-bar__fill"
                    data-measure="value"
                    style="width:${r.progress}%"
                  ></span
                ></span>
              </div>
              ${line ? html`<span class="pr-meta">${line}</span>` : nothing}`
          : nothing
      }
      ${
        stats.length
          ? html`<div class="pr-cols" style="--pr-cols:${columns}">
              ${stats.map((stat) => this.renderStat(stat, size))}
            </div>`
          : nothing
      }
      ${trays.length ? this.renderTrays(trays, layout, gap) : nothing}
      ${compact || r.unavailable ? nothing : this.controls(items, gap, buttons)}
    </article>`;
  }

  /** A readout that opens its entity (a heater, the layer, a sensor of the card's) on a tap. */
  private renderStat(stat: Stat, size: 's' | 'xs'): TemplateResult {
    const open = (): void => {
      if (stat.entity) this.tap(stat.entity, { action: 'more-info' });
    };
    return html`<div
      class="pr-stat"
      role=${stat.entity ? 'button' : nothing}
      tabindex=${stat.entity ? 0 : nothing}
      @click=${open}
      @keydown=${activateKey(open)}
    >
      ${readout({
        label: stat.label,
        value: stat.swatch
          ? html`<i class="pr-swatch" style="background:${stat.swatch}"></i>${stat.value}`
          : stat.value,
        unit: stat.unit,
        size,
      })}
    </div>`;
  }

  /**
   * How the trays lay out: four a row where every type fits its cell (with its swatch and its sides), else two, else
   * one; where not even two hold their words, the swatches alone (the type is each one's label and its tip), four
   * across where each cell keeps its 44, else two by two.
   */
  private trayLayout(trays: readonly Tray[]): TrayLayout {
    const w = this.contentWidth;
    const widest = Math.max(...trays.map((tray) => this.head.ruler.width('pr-tray', tray.type)));
    const needs = widest + SWATCH + 16;
    // decided at the narrowest gap the rows share (8), never at the gap a width happens to land on: the columns
    // then only grow as the card widens (a 4 ↔ 2 flip between 380 and 404 was the gap's doing, not the room's)
    const fits = (n: number, room: number, gap = TRAY_GAP): boolean =>
      n <= trays.length && (w - gap * (n - 1)) / n >= room;
    const bare = !fits(2, needs);
    const room = bare ? 44 : needs;
    const columns = bare
      ? ([4, 2].find((n) => fits(n, room)) ?? 2)
      : ([4, 2, 1].find((n) => fits(n, room)) ?? 1);
    return { columns, bare, holds: (gap) => fits(columns, room, gap) };
  }

  /**
   * The filament unit: a cell a tray, its colour and its type, the one printing in the accent, laid out as
   * `trayLayout` says, at the gap it shares with the buttons.
   */
  private renderTrays(
    trays: readonly Tray[],
    { columns, bare }: { columns: number; bare: boolean },
    gap: number,
  ): TemplateResult {
    return html`<div
      class="pr-trays"
      data-fill-row
      style="--pr-trays:${columns};--pr-tray-gap:${gap}px"
    >
      ${trays.map(
        (tray) =>
          html`<button
            class="pr-tray ${tray.active ? 'is-active' : ''} ${tray.empty ? 'is-empty' : ''}"
            data-target
            aria-current=${tray.active ? 'true' : nothing}
            aria-label=${tray.type}
            title=${bare ? tray.type : nothing}
            @click=${() => this.tap(tray.id, { action: 'more-info' })}
          >
            <i class="pr-swatch" style=${tray.color ? `background:${tray.color}` : ''}></i
            >${bare ? nothing : html`<span>${tray.type}</span>`}
          </button>`,
      )}
    </div>`;
  }

  /** One row: the printer's circle ringed by the job's progress, its name over what it does, pause or resume. */
  private renderRow(r: Reading): TemplateResult {
    const left = this.durationText(r.left);
    const roles = this.roles();
    // one primary rule with the full card: pause or resume is the accent round
    let control =
      this.config?.show_controls === false
        ? nothing
        : r.phase === 'paused' && roles.resume
          ? round('play', 'accent', s(this.hass, 'resume'), () => this.press('resume'))
          : busy(r.phase) && r.phase !== 'paused' && roles.pause
            ? round('pause', 'accent', s(this.hass, 'pause'), () => this.press('pause'))
            : nothing;
    // what gives way in a narrow row, in order: the line's trailing segments (the ring says the progress), then the
    // round — where the state, or a name's 96 (the rows' rule), would not hold beside it — then the circle and its ring
    // (the row itself takes the circle's tap, and the progress comes back into the line) where the state alone would
    // still be cut; the name takes an ellipsis, as names may; the state is never cut
    const state = this.head.ruler.width('fv-row__sub', r.word);
    const name = Math.min(96, this.head.ruler.width('fv-row__title', r.title));
    const roomWith = (): number =>
      this.contentWidth - (ring ? 56 : 0) - (control !== nothing ? 56 : 0);
    let ring = true;
    if (control !== nothing && (state > roomWith() || name > roomWith())) control = nothing;
    if (state > roomWith()) ring = false;
    const room = roomWith();
    const line = this.head.fitRowSegments(
      [
        { text: r.word },
        busy(r.phase) && r.progress !== null
          ? { text: `${this.figure(r.progress)} %`, optional: ring }
          : null,
        r.failure ? { text: r.failure, optional: true } : null,
        r.left !== null
          ? {
              text: s(this.hass, 'left_text', { time: `${left.value} ${left.unit}` }),
              optional: true,
            }
          : null,
      ].filter((segment): segment is { text: string; optional?: boolean } => segment !== null),
      room,
    );
    const radius = 26.5;
    const length = 2 * Math.PI * radius;
    const tap = (): void => this.tap(roles.status);
    const hold = (): void => this.hold(roles.status);
    if (!ring)
      return html`<article
        class="fv-card dv-card pr-card pr-card--row is-bare ${r.unavailable ? 'is-unavailable is-off' : ''}"
        data-card
        role="button"
        tabindex="0"
        aria-label=${`${r.title} · ${line}`}
        .fvTap=${tap}
        .fvHold=${hold}
        @pointerdown=${startPress}
        @click=${clickPress}
        @contextmenu=${preventMenu}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          tap();
        }}
      >
        <span class="fv-row__text"
          ><span class="fv-row__title" data-name>${r.title}</span
          ><span class="fv-row__sub">${line}</span></span
        >
      </article>`;
    return html`<article
      class="fv-card dv-card pr-card pr-card--row ${r.unavailable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      <span class="pr-ring fv-tone--${r.tone}">
        ${
          r.progress !== null && busy(r.phase)
            ? svg`<svg viewBox="0 0 58 58" aria-hidden="true" data-measure="drawn"><circle class="pr-ring__track" cx="29" cy="29" r=${radius} /><circle class="pr-ring__fill" cx="29" cy="29" r=${radius} stroke-dasharray=${length.toFixed(2)} stroke-dashoffset=${(length * (1 - r.progress / 100)).toFixed(2)} /></svg>`
            : nothing
        }
        ${ico(this.headGlyph(r), this.headTone(r), { onTap: tap, onHold: hold, label: r.title })}
      </span>
      <span class="fv-row__text"
        ><span class="fv-row__title" data-name>${r.title}</span
        ><span class="fv-row__sub">${line}</span></span
      >
      ${control}
    </article>`;
  }
}

/** The printer the card is about, as found. */
interface PrinterFound {
  readonly registry: unknown;
  readonly key: string;
  readonly device: string | undefined;
  readonly entities: PrinterEntities;
  readonly trays: string[];
}
