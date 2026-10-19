import {
  formatNumber,
  stateText,
  strings,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type HassEntity,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import {
  activateKey,
  chips,
  clickHead,
  clickPress,
  glyph,
  head,
  headTap,
  ico,
  icon,
  options,
  preventMenu,
  pressCover,
  readout,
  round,
  sheetStyles,
  startPress,
  stepper,
  type GlyphName,
  type IconRef,
  type Tone,
} from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import {
  applianceHeight,
  applianceVariant as variantOf,
  APPLIANCE_VARIANTS,
  type ApplianceVariant,
} from '../appliances-family.js';
import { automationEntity, AutomationStore } from '../automations/store.js';
import { buildNotice, noticeId, type NoticeTrigger } from '../automations/notice.js';
import { sharedGap } from '../cover/common.js';
import { HeadFit } from '../energy/head.js';
import { Card, HEAD_BASE, type HeadConfig } from '../shared/base.js';
import { statusToneOf, toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import { fitLine, type Segment } from '../shared/fit.js';
import { COLUMN, textWidth } from '../shared/heights.js';
import { optionColumnsFor, optionsHold } from '../shared/options.js';
import {
  accentField,
  actionField,
  actionFields,
  boolField,
  editorLabels,
  editorWord,
  entityField,
  fieldRow,
  nameIconFields,
  numberField,
  orderedField,
  selectField,
  showIconField,
  textField,
  toneField,
} from '../shared/form.js';
import { jobWords, when, whenText } from '../shared/job-time.js';
import { statsRow } from '../shared/readouts.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { Ticker, MINUTE } from '../shared/ticker.js';
import {
  fitValueRow,
  sideStacked,
  STEPPER,
  STEPPER_HALVES,
  valueRowClass,
  type Figure,
} from '../shared/value-row.js';
import {
  BLOCKED,
  boostCall,
  callFor,
  COMMAND_NAMES,
  CONFIRM,
  programCall,
  resetCall,
  targetSetter,
  type Action,
  type Command,
  type CommandName,
  type ServiceCall,
} from './commands.js';
import { choiceField, deviceField, kindField, option, sectionField } from './form.js';
import {
  DUE_WORD,
  heroSays,
  hoursMinutes,
  KIND_VALUES,
  PROGRAM_GLYPH,
  kindRows,
  ROW_GLYPH,
  ROW_KEYS,
  rowEntry,
  ROWS_SHOWN,
  type RowEntry,
  type RowKey,
  type RowValues,
} from './full.js';
import {
  applianceDevices,
  APPLIANCE_READOUTS,
  KIND_DEFAULTS,
  type ApplianceKind,
  type ApplianceReadout,
  type Hero,
} from './kinds.js';
import { maintenanceOf, MAINTENANCE_KEYS, type MaintenanceKey } from './maintenance.js';
import { rememberUnloaded, unloadedAt, UNLOADED_EVENT } from './memory.js';
import { noticeTriggers, phoneOf } from './notice.js';
import { Nudges } from './nudge.js';
import {
  artOf,
  headFit,
  imageOf,
  pictureBox,
  pictureStyles,
  type PictureStyle,
} from './picture.js';
import { entityOf, refView, stateOf } from './refs.js';
import {
  cycleOf,
  cycleOfFlag,
  drawn,
  energySince,
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
  type Attention,
} from './reading.js';
import type { ApplianceRole, ApplianceRoles } from './roles.js';
import { busy, stepsOf, wordOf } from './status.js';
import {
  attentionText,
  durationText,
  kindGlyph,
  leftText,
  shownOf,
  spanText,
  statusTone,
  whenParts,
  type ApplianceUnit,
  type Shown,
  type TimeShown,
} from './view.js';
import {
  BOOST_KEYS,
  boostOf,
  burnerOf,
  setpointOf,
  zoneSetter,
  type BoostKey,
  type Setter,
  type Zone,
  type ZoneKind,
} from './zones.js';

const s = strings('appliance');

/** How a cycle's progress is drawn: by the kind (its steps where its integration says them), a bar, or its steps. */
export type ProgressStyle = 'auto' | 'bar' | 'steps';
/** A compartment's setpoint: with its stepper, or as a readout alone. */
export type SetpointStyle = 'stepper' | 'readout';
/** A fridge's quick modes: as chips, or as tiles. */
export type ModesStyle = 'chips' | 'tiles';

/** Another of the appliance's entities as a readout of its own (a counter, a tank's level). */
export interface ApplianceSensor {
  readonly entity: string;
  readonly name?: string;
}

/** A reminder of the card's own: which, and how it is named, drawn and answers. */
export interface MaintenanceEntry {
  readonly key: MaintenanceKey;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
}

/** A compartment of the card's own: its setpoint (or its reading), and how it is named, drawn and answers. */
export interface ZoneEntry {
  readonly entity: string;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
}

export interface ApplianceCardConfig extends FluvyCardConfig, HeadConfig {
  /** The appliance's device: every entity it has is found on it; `entity` names one instead (a plug's switch). */
  device?: string;
  /** What it is; `auto` (default) reads it from its integration, its model, its keys or its name. */
  kind?: ApplianceKind | 'auto';
  /** `full`, `compact`, `ring` (a dial) or `row` (one row); default: the kind's (a big appliance's whole card). */
  variant?: ApplianceVariant;
  /** Its picture (the whole card's and the row's): the kind's drawing (default), its circle, or none. */
  picture?: PictureStyle;
  /** A picture of the person's own instead of the drawing: an address, or an entity whose picture it is. */
  image?: string;
  /** The round that switches it on and off (or says whether it is on), beside its name. */
  show_power?: boolean;
  /** What the round does; default: switch it, where its integration lets a card, else its details. */
  power_action?: ActionConfig;
  /**
   * "Tell me when it's done" (an administrator's): a round beside the hero's figures that writes, turns on and off, and
   * (held) removes the automation that tells them on their phone when the appliance finishes (default: shown).
   */
  show_notify?: boolean;
  /** The hero's figures (the time left, the temperature), its compartments, its plates and its drinks. */
  show_hero?: boolean;
  show_zones?: boolean;
  show_drinks?: boolean;
  /** The drinks offered, in order (a coffee machine's programmes; default: its first three). */
  drinks?: readonly string[];
  show_rows?: boolean;
  /** The rows under the hero, in order: what each says, its name, icon, colour and actions (default: the kind's three). */
  rows?: ReadonlyArray<RowKey | string | RowEntry>;
  /** How a row's value sits: beside its words, at the end, or one phrase with them (default: the kind's). */
  row_values?: RowValues;
  /** A fridge's quick modes as chips under its rows (the compact and ring layouts say them in the line). */
  show_modes?: boolean;
  /** A second drum or cavity: shown as a line under the first (`both`, default), alone (`sub`), or not (`main`). */
  unit?: ApplianceUnit;
  /** The readouts, in order (default: the kind's, those it has). */
  readouts?: readonly ApplianceReadout[];
  /** More readouts from any of the appliance's entities, after those. */
  sensors?: ReadonlyArray<string | ApplianceSensor>;
  show_progress?: boolean;
  progress_style?: ProgressStyle;
  /** The times said: the time left and when it is ready (`both`), the time left, or when. */
  time?: TimeShown;
  /** The reminders in the line (compact, ring). */
  show_maintenance?: boolean;
  /** The reminders, in order, each named, drawn and answering as the card says (default: all it has). */
  maintenance?: ReadonlyArray<MaintenanceKey | MaintenanceEntry>;
  /** The level a tank or a filter is low at, in percent (20). */
  low_level?: number;
  /** The compartments, in order (default: all, the fridge first). */
  zones?: ReadonlyArray<string | ZoneEntry>;
  setpoint_style?: SetpointStyle;
  /** A fridge's quick modes, in order (default: all it has). */
  modes?: readonly BoostKey[];
  modes_style?: ModesStyle;
  /** Seconds a door may stand open before the card says so (a fridge's 60, else never). */
  door_alert?: number;
  /** The buttons (default: the dial's; the whole card's round is its button). */
  show_controls?: boolean;
  /** The buttons, in order (default: the kind's, those it has); start and pause share one. */
  controls?: readonly CommandName[];
  /** The programmes as chips to choose from at rest, where the integration lets a card choose. */
  show_programs?: boolean;
  unload_reminder?: boolean;
  /** Minutes after a finish before it waits to be unloaded (30), and a finish is remembered (120). */
  unload_after?: number;
  done_for?: number;
  /** On a plug: watts from which it runs (5), and minutes under them before its cycle is over (3). */
  running_power?: number;
  finished_after?: number;
  /** Entities named by hand for what the card does not find: `{ role, entity }`. */
  roles?: ReadonlyArray<{ readonly role: ApplianceRole; readonly entity: string }>;
  /** Test hook: an ISO instant the card takes for "now". */
  _now?: string;
}

/** The most readouts a card holds (two rows of three). */
const MOST_READOUTS = 6;
/** A ring's dial: its largest and smallest radius, and its ticks. */
const RING_MAX = 88;
const RING_MIN = 56;
const RING_TICK = 12;
/** The row's ring round its circle (the printer's). */
const ROW_RADIUS = 26.5;
/** Each reminder's glyph, where the card names none. */
const MAINTENANCE_GLYPH: Readonly<Record<MaintenanceKey, string>> = {
  salt: 'box',
  rinse_aid: 'drop',
  detergent: 'drop',
  softener: 'drop',
  filter: 'filter',
  machine_care: 'sparkle',
  descale: 'sparkle',
  clean: 'sparkle',
  water_tank: 'drop',
  beans: 'bean',
  drip_tray: 'drop',
  milk: 'drop',
  water_filter: 'filter',
  air_filter: 'filter',
  grease_filter: 'filter',
  leak: 'warn',
  service: 'wrench',
};

/** Each quick mode's glyph. */
const BOOST_GLYPH: Readonly<Record<BoostKey, GlyphName>> = {
  super_cool: 'snow',
  super_freeze: 'snow',
  eco: 'leaf',
  holiday: 'sun',
  ice_maker: 'snow',
  sabbath: 'moon',
  child_lock: 'lock',
};

/** A compartment's glyph, by what it is (a thermometer where it says nothing). */
const ZONE_GLYPH: Readonly<Partial<Record<ZoneKind, string>>> = {
  fridge: 'fridge',
  freezer: 'snow',
  chiller: 'snow',
  wine: 'drop',
};

/** The editor's role choices: the parts a person names by hand, each by its word. */
const NAMED_ROLES = [
  'state',
  'phase',
  'program',
  'finish',
  'remaining',
  'total',
  'elapsed',
  'progress',
  'start_at',
  'door',
  'remote',
  'power',
  'start',
  'pause',
  'stop',
  'light',
  'error',
  'temperature',
  'target',
  'probe',
  'energy',
  'water',
  'watts',
  'running',
] as const satisfies readonly ApplianceRole[];

/** A readout of the card: which it is, what it says, the entity a tap opens. */
interface Stat {
  readonly key?: ApplianceReadout;
  readonly label: string;
  /** What it says; a programme's words are a name (`renderStat` lets them end in an ellipsis). */
  readonly value: string;
  readonly unit: string;
  readonly entity: string | undefined;
}

/** A reminder as the card draws it: the entity that says it, its reset, how pressing it is, the card's own words. */
interface Reminder {
  readonly key: MaintenanceKey;
  readonly entity: string | undefined;
  readonly reset: string | undefined;
  readonly severity: 'due' | 'soon' | 'ok' | 'unknown';
  readonly level: number | undefined;
  readonly entry: MaintenanceEntry | undefined;
}

/** A compartment as the card draws it. */
interface ZoneShown {
  readonly kind: ZoneKind;
  readonly label: string;
  /** The entity its value is set on, or read from. */
  readonly entity: string;
  readonly current: string | undefined;
  readonly setpoint: string | undefined;
  readonly entry: ZoneEntry | undefined;
}

/** A cell of the action row: its control, what it does now, whether it can. */
interface Cell {
  readonly control: CommandName;
  readonly glyph: GlyphName;
  readonly label: string;
  readonly command: Command | undefined;
  readonly on: boolean;
  readonly primary: boolean;
}

/** A row's circle: a tone, or the success's green (eco, all well). */
type Tint = Tone | 'ok';

/** A line's parts, the first said whole, the rest optional; and the first's shorter forms, longest first. */
interface Words {
  readonly parts: readonly Segment[];
  readonly briefs: readonly string[];
}

/**
 * A line's parts fitted to its room: whole, then its lesser parts given up from the end, then its first part's shorter
 * forms in turn (`briefs`), the whole in the line's title — a figure is never cut, and a word only where it has no
 * shorter form left.
 */
function fitParts(
  parts: readonly Segment[],
  briefs: readonly string[],
  room: number,
  width: (text: string) => number,
): string {
  let line = '';
  for (const first of [parts[0]?.text ?? '', ...briefs]) {
    line = fitLine(
      parts.map((part, index) => (index ? part : { ...part, text: first })),
      room,
      width,
    );
    if (width(line) <= room) break;
  }
  return line;
}

/** A row of the whole card as it draws: its words, its value, its glyph and tint, what it opens and how it answers. */
interface Item {
  /** What it says: a row's key, or a second drum or cavity (`twin`). */
  readonly key: RowKey | 'twin';
  readonly glyph: string;
  readonly tint: Tint;
  readonly label: string;
  /** Its figure (or its words) and its unit, apart: beside the words, the figure is the bold part ("**8.5** l"). */
  readonly value: string;
  readonly unit: string;
  /** Due: its value (or its phrase) in the warning's ink. */
  readonly warn: boolean;
  /** What a reminder due says as one phrase ("Replace the water filter"), where its row is a phrase. */
  readonly phrase?: string;
  readonly entity: string | undefined;
  readonly entry: RowEntry | undefined;
  readonly reminder: Reminder | undefined;
}

/** The kinds whose programme is laundry's. */
const LAUNDRY: readonly ApplianceKind[] = ['washer', 'washer_dryer', 'dryer'];

/** A duration's unit, in seconds. */
const SPAN: Readonly<Record<string, number>> = { s: 1, min: 60, h: 3600 };

/** A drink with milk on it: a wide cup. */
const MILKY = /cappuccino|latte|milk|flat_white|macchiato/i;

/** What a render reads once and the parts draw. */
interface View {
  readonly found: ApplianceFound;
  readonly r: ApplianceReading;
  readonly shown: Shown;
  readonly kind: ApplianceKind;
  /** What its hero draws: its kind's, or a plug's power for an appliance read from its plug. */
  readonly hero: Hero;
  readonly title: string;
  readonly glyph: string;
  readonly tone: Tone;
  readonly headTone: Tone;
  /** The entity a tap on the card opens. */
  readonly entity: string | undefined;
  readonly now: number;
  readonly unavailable: boolean;
  /** What this cycle has used, in kWh, where it can be said. */
  readonly used: number | null;
}

/** An entity's name without its device's at its head ("Waschmaschine Zähler" on the Waschmaschine: "Zähler"). */
function ownWords(name: string, device: string): string {
  if (!device || !name.toLowerCase().startsWith(`${device.toLowerCase()} `)) return name;
  const rest = name.slice(device.length + 1).trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : name;
}

/**
 * An appliance: a washer, a dryer, a dishwasher, an oven, a microwave, a hob, a hood, a fridge, a freezer, a wine
 * cooler, a coffee machine, a kettle, an air fryer, or one on a smart plug. One anatomy for all — a head that says what
 * it is doing, a hero for its kind (a cycle's progress and its steps, a temperature on its way, a hob's plates, a
 * fridge's compartments), a line that says when (or what asks for attention), its readouts, its reminders and its
 * buttons — in four layouts (full, compact, a dial, a row). Given its device it finds the rest: LG ThinQ, Home Connect,
 * Miele, SmartThings, Matter, Whirlpool and Tuya by their own words, hOn, Electrolux and LG's older integration by
 * their ids (read, never written to), and an appliance on a plug by what the plug draws. Its sections are its kind's
 * and its config's, never its state's: an appliance out of reach keeps its card's size, its values a dash.
 */
export class FluvyApplianceCard extends Card<ApplianceCardConfig> {
  /**
   * The card's height at a 360 column, for the automatic dashboard's columns: given the house, what its appliance
   * draws (`houseHeight`); without it, the family's from the config alone (every big kind's 376).
   */
  static override layoutHeight(config: ApplianceCardConfig, hass?: HomeAssistant): number {
    return hass ? houseHeight(config, hass) : applianceHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    pictureStyles,
    css`
      .ap-card {
        width: 100%;
      }
      /* the line under the hero: when, or what asks for attention (the warning's ink); one line, its parts fitted to it,
         the first whole — where it alone runs past the line (an integration's long words for a failure) it ends in an
         ellipsis, the whole in its title: the card keeps its size whatever it says (1.9) */
      .ap-line {
        display: block;
        min-height: 20px;
        margin-top: 12px;
        overflow: hidden;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .ap-bar + .ap-line,
      .ap-steps + .ap-line {
        margin-top: 8px;
      }
      .ap-line.is-warning {
        color: var(--fluvy-warning);
      }
      /* a second drum or cavity: its unit, what it does and when, under the first; one line, as the line is */
      .ap-twin-line {
        display: block;
        min-height: 20px;
        margin-top: 8px;
        overflow: hidden;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        color: var(--fluvy-text);
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .ap-twin-line > .ap-twin-line__unit {
        font-weight: 600;
      }
      /* the side readout on the big value's baseline (its 24 line 3 above the 44's foot) */
      .ap-top__side {
        padding-bottom: 3px;
        text-align: right;
      }
      .ap-top__side .fv-readout__value {
        justify-content: flex-end;
      }
      .ap-bar {
        display: block;
        margin-top: 12px;
      }
      .ap-bar .fv-bar {
        height: 8px;
        margin-top: 0;
        border-radius: 4px;
      }
      .ap-bar .fv-bar__fill,
      .ap-steps__fill {
        height: 8px;
        border-radius: 4px;
        background: var(--tone-ink, var(--fluvy-accent));
        transition: width var(--fv-slow) var(--fv-ease);
      }
      /* the cycle's steps: a segment each on whole pixels, 4 apart, the ones done and the one under way filled; their
         words under them */
      .ap-steps {
        margin-top: 12px;
      }
      .ap-steps__bars,
      .ap-steps__words {
        display: grid;
        grid-template-columns: repeat(var(--ap-steps, 3), var(--ap-cell, minmax(0, 1fr)));
        column-gap: 4px;
      }
      .ap-steps__words {
        margin-top: 4px;
      }
      .ap-steps__bars > .fv-bar {
        height: 8px;
        margin-top: 0;
        border-radius: 4px;
      }
      .ap-steps__fill {
        display: block;
      }
      .ap-steps__label {
        overflow: hidden;
        font-size: 11px;
        font-weight: 600;
        line-height: 16px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        text-align: center;
        color: var(--fluvy-text-secondary);
        white-space: nowrap;
      }
      .ap-steps__label.is-current {
        color: var(--tone-ink, var(--fluvy-accent));
      }
      /* one step's word alone, under its segment, kept inside the column (the row kept where no step is said) */
      .ap-steps__one {
        position: relative;
        display: block;
        height: 16px;
        margin-top: 4px;
      }
      .ap-steps__one > .ap-steps__label {
        position: absolute;
        top: 0;
      }
      .ap-stat {
        display: flex;
        justify-content: center;
        align-items: center;
        min-width: 0;
        /* a readout that opens its entity is a target: 44 tall whatever its size */
        min-height: 44px;
        border-radius: var(--fluvy-radius-control);
        cursor: pointer;
      }
      .ap-stat:focus-visible,
      .ap-zone__read:focus-visible {
        outline: 2px solid var(--fluvy-accent);
        outline-offset: 2px;
      }
      .ap-stat .fv-readout {
        min-width: 0;
      }
      .ap-stat .fv-readout__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ap-stat .fv-readout__value {
        white-space: nowrap;
      }
      /* a programme is a name: in a narrow column it ends in an ellipsis, as names do */
      .ap-stat .fv-readout__value > span {
        min-width: 0;
      }
      .ap-program {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* a hob's plates: a hairline cell each, lit in the heat's tone while it cooks, four a row or two by two */
      .ap-cells {
        display: grid;
        grid-template-columns: repeat(var(--ap-cells, 4), minmax(0, 1fr));
        gap: var(--ap-gap, 8px);
        margin-top: 16px;
      }
      .ap-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        height: 44px;
        padding: 0 8px;
        border-radius: var(--fluvy-radius-control);
        box-shadow: inset 0 0 0 1px var(--fluvy-border);
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
        cursor: pointer;
      }
      .ap-cell.is-on {
        box-shadow: none;
        background: var(--tone-fill, var(--fluvy-accent-fill));
        color: var(--tone-on, var(--fluvy-text));
      }
      .ap-cell > span {
        overflow: hidden;
        white-space: nowrap;
      }
      /* a compartment: its circle, its reading and setpoint, its stepper on the setpoint's line; stacked, the reading
         centred over the stepper */
      .ap-zone {
        align-items: center;
      }
      .fv-value-row--stack > .fv-stepper {
        flex: 0 0 auto;
      }
      .fv-value-row--stack > .ap-zone__read {
        justify-content: center;
        text-align: center;
      }
      .fv-value-row--stack > .ap-zone__read .fv-readout__value {
        justify-content: center;
      }
      .ap-zone + .ap-zone {
        margin-top: 12px;
      }
      .ap-zone__read {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        min-height: 44px;
        border-radius: var(--fluvy-radius-control);
        cursor: pointer;
      }
      .ap-zone__read .fv-readout__label {
        white-space: nowrap;
      }
      .ap-zone__read .fv-readout__value {
        white-space: nowrap;
      }
      .ap-modes,
      .ap-programs {
        margin-top: 16px;
      }
      .ap-actions {
        display: grid;
        grid-template-columns: repeat(var(--ap-actions, 2), minmax(0, 1fr));
        gap: var(--ap-gap, 16px);
        margin-top: 16px;
      }
      /* the dial, centred; two compartments' dials side by side */
      .ap-dial {
        display: flex;
        justify-content: center;
        margin-top: 16px;
      }
      fluvy-dial {
        flex: 0 0 auto;
      }
      /* the row: the compact anatomy (76, 16 in), the appliance's circle ringed by its progress 3 clear of it; the row
         is the button (a cover over it), its round raised beside it */
      .ap-card--row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        height: 76px;
        padding: 16px;
      }
      .ap-card--row .fv-row__text {
        flex: 1 1 auto;
        min-width: 0;
      }
      .ap-card--row > .fv-round {
        position: relative;
        z-index: 1;
      }
      .ap-card--row > .fv-tile__tap {
        border-radius: inherit;
      }
      .ap-ring {
        position: relative;
        display: grid;
        place-items: center;
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
      }
      .ap-ring > svg {
        position: absolute;
        top: -7px;
        left: -7px;
        width: 58px;
        height: 58px;
        transform: rotate(-90deg);
      }
      .ap-ring circle {
        fill: none;
        stroke-width: 2;
      }
      .ap-ring .ap-ring__track {
        stroke: var(--fluvy-border);
      }
      .ap-ring .ap-ring__fill {
        stroke: var(--tone-ink, var(--fluvy-accent));
        stroke-linecap: round;
        transition: stroke-dashoffset var(--fv-slow) var(--fv-ease);
      }
    `,
    css`
      /* ---------- the whole card (#47, the reporter's design) ---------- */
      /* the card's foot is 16: the rows' circles keep 2 of their 44 under them, so it reads as the head's 20 */
      .ap-card--full {
        padding-bottom: 16px;
      }
      .fv-card__head--tap:has(.fv-card__tap:active) > .ap-pic {
        scale: 0.94;
      }
      /* the head: the 64 picture, the name 20/24 over what it does 16/20, the 48 power round */
      .ap-head {
        height: auto;
        min-height: 64px;
        gap: 16px;
      }
      .ap-head__title {
        font-size: 20px;
        font-weight: 700;
        line-height: 24px;
        letter-spacing: -0.01em;
      }
      .ap-head__title--s {
        font-size: 16px;
      }
      .ap-head__sub {
        margin-top: 4px;
        font-size: 16px;
        font-weight: 400;
        line-height: 20px;
      }
      .ap-head__sub.is-warning {
        color: var(--fluvy-warning);
      }
      .ap-head__under > .ap-head__sub {
        margin-top: 4px;
      }
      /* the power round: 48, tinted by what the appliance does */
      .ap-power {
        flex: 0 0 48px;
        width: 48px;
        height: 48px;
      }
      .ap-power--row {
        flex-basis: 44px;
        width: 44px;
        height: 44px;
      }
      .ap-power--quiet {
        color: var(--fluvy-text-secondary);
      }
      .ap-power--accent {
        background: var(--fluvy-accent-fill);
        color: var(--fluvy-accent);
      }
      .ap-power--ok,
      .ap-ok {
        background: var(--fluvy-success-fill);
        color: var(--fluvy-success);
      }
      .ap-power--warning {
        background: var(--fluvy-warning-fill);
        color: var(--fluvy-warning);
      }
      .ap-power--off {
        background: transparent;
        color: var(--fluvy-unavailable);
        outline: 1px dashed var(--fluvy-unavailable-border);
        outline-offset: -1px;
      }
      /* the hero: 108 where it holds, so a dashboard's row of appliances keeps its hairlines level */
      .ap-region {
        margin-top: 16px;
      }
      .ap-region.is-fixed {
        min-height: 108px;
      }
      .ap-figures__label,
      .ap-figures__sub {
        min-height: 20px;
        font-size: 16px;
        font-weight: 400;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
      }
      /* "Tell me when it's done": a 44 bell beside the figures, centred under the power round; the glyph alone, quiet,
         until it is on */
      .ap-figures {
        position: relative;
      }
      .ap-notice {
        position: absolute;
        top: 18px;
        right: 2px;
        width: 44px;
        height: 44px;
      }
      .ap-notice--off {
        color: var(--fluvy-text-secondary);
      }
      .ap-figures__value {
        height: 40px;
        font-size: 32px;
        font-weight: 700;
        line-height: 40px;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      /* the bar: 12, its share in the tone's soft ink, the percentage at its end */
      .ap-progress {
        display: flex;
        align-items: center;
        gap: 16px;
        height: 20px;
        margin-top: 8px;
      }
      .ap-progress__bar {
        flex: 1 1 auto;
        height: 12px;
        overflow: hidden;
        border-radius: 6px;
        background: var(--fluvy-page-alt);
      }
      .ap-progress__fill {
        display: block;
        height: 12px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--tone-ink, var(--fluvy-accent)) 42%, var(--fluvy-card));
        transition: width var(--fv-slow) var(--fv-ease);
      }
      .ap-progress__share {
        flex: 0 0 auto;
        text-align: right;
        font-size: 16px;
        font-weight: 400;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      /* a fridge's compartments: inner tiles (84, radius 12, the page's fill) two a row, 12 apart */
      .ap-tiles {
        display: grid;
        grid-template-columns: repeat(var(--ap-tiles, 2), minmax(0, 1fr));
        gap: 12px;
      }
      .ap-tile {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        height: 84px;
        padding: 0 12px;
        border-radius: var(--fluvy-radius-control);
        background: var(--fluvy-page);
        cursor: pointer;
      }
      .ap-tile .fv-ico {
        flex-basis: 40px;
        width: 40px;
        height: 40px;
      }
      .ap-tile__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .ap-tile__label {
        font-size: 15px;
        font-weight: 400;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
        white-space: nowrap;
      }
      .ap-tile__value {
        margin-top: 4px;
        font-size: 22px;
        font-weight: 700;
        line-height: 28px;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      /* a hob's plates on a soft panel: a 44 ring while it cooks, a disc at rest, its name and level under it */
      .ap-plates {
        display: grid;
        grid-template-columns: repeat(var(--ap-plates, 4), minmax(0, 1fr));
        gap: 8px var(--ap-gap, 8px);
        padding: 12px 12px 8px;
        border-radius: var(--fluvy-radius-lg);
        background: var(--fluvy-page);
      }
      .ap-plate {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        border-radius: var(--fluvy-radius-control);
        cursor: pointer;
      }
      .ap-plate__ring {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--fluvy-page-alt);
        box-shadow: inset 0 0 0 1px var(--fluvy-border);
      }
      .ap-plate.is-on .ap-plate__ring {
        background: transparent;
        box-shadow: inset 0 0 0 3px var(--tone-ink);
      }
      .ap-plate__name,
      .ap-plate__level {
        align-self: stretch;
        font-size: 16px;
        font-weight: 400;
        line-height: 20px;
        text-align: center;
        color: var(--fluvy-text-secondary);
        white-space: nowrap;
      }
      .ap-plate__name {
        margin-top: 4px;
      }
      .ap-plate.is-on .ap-plate__level {
        color: var(--tone-ink);
      }
      /* a coffee machine's drinks: inner tiles (84, radius 12) that fill the row, and a 48 one for the rest */
      .ap-drinks {
        display: flex;
        gap: 8px;
      }
      .ap-drinks__cells {
        display: grid;
        flex: 1 1 auto;
        gap: 8px;
        min-width: 0;
      }
      .ap-drink {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        height: 84px;
        padding: 0 8px;
        border-radius: var(--fluvy-radius-control);
        background: var(--fluvy-page);
        color: var(--fluvy-text-secondary);
      }
      .ap-drink svg {
        width: 24px;
        height: 24px;
      }
      .ap-drink--more {
        flex: 0 0 48px;
        padding: 0;
      }
      .ap-drink__name {
        font-size: 14px;
        font-weight: 400;
        line-height: 20px;
        white-space: nowrap;
      }
      /* the rows under a hairline: a 40 soft circle, the words 16/20, the value in the text's ink */
      .ap-items {
        position: relative;
        margin-top: 20px;
      }
      .ap-items::before {
        content: '';
        position: absolute;
        top: -8px;
        right: 0;
        left: 0;
        height: 1px;
        background: var(--fluvy-border);
      }
      .ap-item {
        display: flex;
        align-items: center;
        gap: 16px;
        min-height: 44px;
        border-radius: var(--fluvy-radius-control);
        cursor: pointer;
      }
      .ap-item:focus-visible,
      .ap-tile:focus-visible,
      .ap-plate:focus-visible {
        outline: 2px solid var(--fluvy-accent);
        outline-offset: 2px;
      }
      .ap-item__ico {
        flex-basis: 40px;
        width: 40px;
        height: 40px;
      }
      .ap-item__text {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 16px;
        font-weight: 400;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
      }
      .ap-items--inline .ap-item__value {
        margin-left: 4px;
      }
      .ap-item__value {
        font-weight: 650;
        color: var(--fluvy-text);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .ap-items--end .ap-item__value {
        flex: 0 0 auto;
        font-size: 16px;
        line-height: 20px;
      }
      /* a row whose words and value would not hold on one line: its value under its words, in the row's 44 */
      .ap-item.is-stacked {
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 0;
      }
      .ap-item.is-stacked .ap-item__text {
        flex: none;
      }
      .ap-item.is-warning .ap-item__value,
      .ap-items--plain .ap-item.is-warning .ap-item__text,
      .ap-item.is-warning .ap-item__text:only-of-type {
        color: var(--fluvy-warning);
      }
      /* the row with its picture: 88 (12 · 64 · 12), the name 15/20 bold over what it does 15/20 */
      .ap-card--picture {
        height: 88px;
        padding-block: 12px;
      }
      .ap-card--picture .fv-row__title {
        font-size: 15px;
        font-weight: 700;
      }
      .ap-card--picture .fv-row__sub {
        display: block;
        margin-top: 4px;
        font-size: 15px;
        font-weight: 400;
        line-height: 20px;
      }
    `,
  ];

  private readonly head = new HeadFit(this);
  /** The setpoints stepped and on their way. */
  private readonly nudges = new Nudges(() => this.requestUpdate());
  /** A plug's power and its meter's history, and this cycle's energy's. */
  private readonly history = new PlugHistory(() => this.requestUpdate());
  /** The appliance, found once per registry and config: the search walks every entity. */
  private found:
    { readonly key: string; readonly at: unknown; readonly found: ApplianceFound } | undefined;
  /** What the last render read: the ticker asks it whether time says anything. */
  private last: View | undefined;
  /** What this render's head says under the name: what the line and the readouts need not say again. */
  private said = '';
  /** Whether this render's dial says when it will be ready (its disc holds it): the line need not. */
  private dialSaid = false;
  /** The readouts this render shows: what the line need not say again. */
  private readoutKeys: ReadonlySet<ApplianceReadout> = new Set();
  /** The moment an open door is to be said (`updated`). */
  private doorTimer = 0;
  /** "Tell me when it's done" written and not listed yet (the round shows it on meanwhile), until when. */
  private noticeSent = 0;
  /** A hold readied the notice's removal, which a tap then does, until when. */
  private noticeArmed = 0;
  /** The next look for the notice Home Assistant is to list, or the end of a readied removal. */
  private noticeTimer = 0;

  constructor() {
    super();
    // a minute's clock while something is under way, waits to start or finished not two hours ago
    new Ticker(this, () => this.timed());
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<ApplianceCardConfig>()([
    'device',
    'kind',
    'variant',
    'unit',
    'picture',
    'image',
    'show_power',
    'power_action',
    'show_notify',
    'show_hero',
    'show_zones',
    'show_drinks',
    'drinks',
    'show_rows',
    'rows',
    'row_values',
    'show_modes',
    'readouts',
    'sensors',
    'show_progress',
    'progress_style',
    'time',
    'show_maintenance',
    'maintenance',
    'low_level',
    'zones',
    'setpoint_style',
    'modes',
    'modes_style',
    'door_alert',
    'show_controls',
    'controls',
    'show_programs',
    'unload_reminder',
    'unload_after',
    'done_for',
    'running_power',
    'finished_after',
    'roles',
  ]);

  static override lists: readonly RowsListSpec[] = [
    {
      key: 'rows',
      idKey: 'key',
      also: ['entity'],
      title: 'appliance.editor_rows',
      keys: ['key', 'entity', 'name', 'icon', 'color', 'tap_action', 'hold_action'],
      computeLabel: (schema) =>
        schema.name === 'key' ? editorWord('appliance.editor_row') : undefined,
      picker: rowPicker(),
      read: (raw) =>
        typeof raw === 'string' || (typeof raw === 'object' && raw !== null)
          ? { ...rowEntry(raw as string | RowEntry) }
          : null,
      schema: [
        rowPicker(),
        entityField(undefined, 'entity', false),
        nameIconFields(),
        accentField(),
        actionField('tap_action'),
        actionField('hold_action'),
      ],
    },
    {
      key: 'sensors',
      title: 'appliance.editor_sensors',
      domains: ['sensor', 'binary_sensor', 'number', 'select'],
      keys: ['entity', 'name'],
      schema: [entityField(undefined, 'entity'), textField('name')],
    },
    {
      key: 'maintenance',
      idKey: 'key',
      title: 'appliance.editor_maintenance',
      keys: ['key', 'name', 'icon', 'color', 'tap_action', 'hold_action'],
      computeLabel: (schema) =>
        schema.name === 'key' ? editorWord('appliance.editor_key') : undefined,
      picker: reminderPicker(),
      schema: [
        reminderPicker(),
        nameIconFields(),
        accentField(),
        actionField('tap_action'),
        actionField('hold_action'),
      ],
    },
    {
      key: 'zones',
      title: 'appliance.editor_zones',
      domains: ['number', 'climate', 'select', 'sensor'],
      keys: ['entity', 'name', 'icon', 'color', 'tap_action', 'hold_action'],
      schema: [
        entityField(undefined, 'entity'),
        nameIconFields(),
        accentField(),
        actionField('tap_action'),
        actionField('hold_action'),
      ],
    },
    {
      key: 'roles',
      idKey: 'role',
      title: 'appliance.editor_roles',
      keys: ['role', 'entity'],
      computeLabel: (schema) =>
        schema.name === 'role' ? editorWord('appliance.editor_role') : undefined,
      picker: rolePicker(),
      schema: [rolePicker(), entityField(undefined, 'entity')],
    },
  ];

  /** What the editor shows where the config says nothing: what the card does then, for the appliance it is about. */
  static override defaults: EditorDefaults = (config, hass) => {
    const c = config as ApplianceCardConfig;
    const kind = kindFor(c, hass);
    const defaults = KIND_DEFAULTS[kind];
    const variant = variantOf(c);
    return {
      kind: 'auto',
      variant,
      unit: 'both',
      picture: 'art',
      show_power: true,
      show_notify: true,
      show_hero: true,
      show_zones: true,
      show_drinks: true,
      show_rows: true,
      row_values: KIND_VALUES[kind],
      show_modes: false,
      readouts: defaults.readouts.filter((key) => key !== 'program'),
      show_progress: true,
      progress_style: 'auto',
      time: 'both',
      show_maintenance: true,
      setpoint_style: 'readout',
      modes_style: 'chips',
      show_controls: variant === 'ring',
      controls: [...defaults.controls],
      show_programs: false,
      unload_reminder: defaults.unload,
      unload_after: 30,
      done_for: 120,
      door_alert: defaults.doorAlert,
      low_level: 20,
      running_power: RUNNING_POWER,
      finished_after: FINISHED_AFTER,
    };
  };

  /** The drinks a coffee machine offers, as its programme select lists them, in its words. */
  static override choices: EditorChoices = (config, hass) => {
    const c = config as ApplianceCardConfig;
    const program = hass
      ? findAppliance(hass, { device: c.device, entity: c.entity, roles: c.roles }).entities.roles
          .program
      : undefined;
    const state = program ? hass?.states[program] : undefined;
    return {
      drinks: optionsOf(state).map((value) => ({ value, label: optionWord(hass, state, value) })),
    };
  };

  static override getConfigForm(): LovelaceConfigForm {
    const word = (key: ApplianceReadout): string =>
      editorWord(key === 'elapsed' ? 'job.elapsed' : `appliance.r_${key}`);
    return {
      schema: [
        deviceField(),
        entityField(undefined, 'entity', false),
        fieldRow(kindField(), selectField('variant', APPLIANCE_VARIANTS)),
        nameIconFields(),
        fieldRow(
          showIconField(),
          choiceField('unit', [
            ['both', 'appliance.o_both_units'],
            ['main', 'appliance.o_main_unit'],
            ['sub', 'appliance.o_sub_unit'],
          ]),
        ),
        fieldRow(
          choiceField('picture', [
            ['art', 'appliance.o_picture'],
            ['icon', 'appliance.o_icon'],
            option('none'),
          ]),
          textField('image'),
        ),
        fieldRow(boolField('show_power'), actionField('power_action')),
        boolField('show_notify'),
        sectionField('appliance.section_show', [
          fieldRow(boolField('show_hero'), boolField('show_progress')),
          fieldRow(
            choiceField('progress_style', [
              option('auto'),
              option('bar'),
              ['steps', 'appliance.o_steps'],
            ]),
            choiceField('time', [
              ['both', 'appliance.o_both'],
              ['left', 'appliance.o_left'],
              ['end', 'appliance.o_end'],
            ]),
          ),
          fieldRow(
            boolField('show_zones'),
            choiceField('setpoint_style', [
              ['readout', 'appliance.o_readout'],
              ['stepper', 'appliance.o_stepper'],
            ]),
          ),
          fieldRow(boolField('show_drinks'), boolField('show_rows')),
          orderedField('drinks', [], { custom: true }),
          choiceField('row_values', [
            ['inline', 'appliance.o_inline'],
            ['end', 'appliance.o_at_end'],
            option('plain'),
          ]),
          orderedField(
            'readouts',
            APPLIANCE_READOUTS.map((key) => ({ value: key, label: word(key) })),
          ),
          boolField('show_maintenance'),
          fieldRow(
            boolField('show_modes'),
            choiceField('modes_style', [option('chips'), option('tiles')]),
          ),
          orderedField(
            'modes',
            BOOST_KEYS.map((key) => ({ value: key, label: editorWord(`appliance.mode_${key}`) })),
          ),
          fieldRow(boolField('show_controls'), boolField('show_programs')),
          orderedField(
            'controls',
            COMMAND_NAMES.map((key) => ({ value: key, label: editorWord(`appliance.${key}`) })),
          ),
        ]),
        sectionField('appliance.section_reminders', [
          fieldRow(boolField('unload_reminder'), numberField('unload_after', 0, 720)),
          fieldRow(numberField('done_for', 0, 1440), numberField('door_alert', 0, 3600)),
          numberField('low_level', 0, 100),
        ]),
        sectionField('appliance.section_plug', [
          fieldRow(numberField('running_power', 1, 3000), numberField('finished_after', 1, 120)),
        ]),
        fieldRow(toneField(), accentField()),
        accentField('card_color', { none: true }),
        actionFields(),
      ],
      ...editorLabels(s, {
        device: 'editor_device',
        kind: 'editor_kind',
        unit: 'editor_unit',
        readouts: 'editor_readouts',
        show_progress: 'editor_show_progress',
        progress_style: 'editor_progress_style',
        time: 'editor_time',
        picture: 'editor_picture',
        image: 'editor_image',
        show_power: 'editor_show_power',
        power_action: 'editor_power_action',
        show_notify: 'editor_show_notify',
        show_hero: 'editor_show_hero',
        show_zones: 'editor_show_zones',
        show_drinks: 'editor_show_drinks',
        drinks: 'editor_drinks',
        show_rows: 'editor_show_rows',
        row_values: 'editor_row_values',
        show_modes: 'editor_show_modes',
        show_maintenance: 'editor_show_maintenance',
        low_level: 'editor_low_level',
        setpoint_style: 'editor_setpoint_style',
        modes: 'editor_modes',
        modes_style: 'editor_modes_style',
        door_alert: 'editor_door_alert',
        show_controls: 'editor_show_controls',
        controls: 'editor_controls',
        show_programs: 'editor_show_programs',
        unload_reminder: 'editor_unload_reminder',
        unload_after: 'editor_unload_after',
        done_for: 'editor_done_for',
        running_power: 'editor_running_power',
        finished_after: 'editor_finished_after',
      }),
    };
  }

  /** A new card takes the house's first appliance. */
  static getStubConfig(hass: HomeAssistant | undefined): ApplianceCardConfig {
    const [device] = applianceDevices(hass);
    return { type: 'custom:fluvy-appliance-card', ...(device ? { device } : {}) };
  }

  override getCardSize(): number {
    const c = this.config;
    if (!c) return 6;
    return Math.round(
      (this.hass ? houseHeight(c, this.hass, this.appliance()) : applianceHeight(c)) / 50,
    );
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'row' || this.variant === 'compact'
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  private get variant(): ApplianceVariant {
    return variantOf(this.config);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(UNLOADED_EVENT, this.onUnloaded);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(UNLOADED_EVENT, this.onUnloaded);
    window.clearTimeout(this.doorTimer);
    window.clearTimeout(this.noticeTimer);
    this.nudges.clear();
  }

  /** A door open now is said the moment it has stood its `door_alert`, not at the next minute. */
  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    window.clearTimeout(this.doorTimer);
    const view = this.last;
    const door = view?.r.door;
    const alert = this.config?.door_alert ?? (view ? KIND_DEFAULTS[view.kind].doorAlert : 0);
    if (!view || !door?.open || door.since === null || alert <= 0 || this.config?._now) return;
    const due = door.since + alert * 1000 - view.now;
    if (due > 0) this.doorTimer = window.setTimeout(() => this.requestUpdate(), due + 50);
  }

  /** An appliance said unloaded on another card: this one draws again. */
  private readonly onUnloaded = (): void => this.requestUpdate();

  /* ---------- reading the appliance ---------- */

  /** The appliance, as found: once per registry and config. */
  private appliance(): ApplianceFound {
    const c = this.config;
    const key = JSON.stringify([c?.device, c?.entity, c?.kind, c?.roles]);
    const at = [this.hass?.entities, this.hass?.devices];
    if (this.found && this.found.key === key && sameAt(this.found.at, at)) return this.found.found;
    const found = findAppliance(this.hass, {
      device: c?.device,
      entity: c?.entity,
      kind: c?.kind,
      roles: c?.roles,
    });
    this.found = { key, at, found };
    return found;
  }

  protected override watched(): readonly string[] {
    const found = this.appliance();
    const { roles, twin, zones, maintenance, boosts, hob, counters } = found.entities;
    return [
      ...Object.values(roles),
      ...Object.values(twin?.roles ?? {}),
      ...zones,
      ...maintenance,
      ...boosts,
      ...hob,
      ...counters,
      ...this.sensors().map((sensor) => sensor.entity),
      ...this.zoneEntries().map((entry) => entry.entity),
      this.noticeAutomation(),
    ]
      .filter((id): id is string => Boolean(id))
      .map(entityOf);
  }

  /** An entity, or an attribute of one (LG's older integration says the cycle in its device sensor's attributes). */
  protected override entity(id: string | undefined = this.config?.entity): EntityView {
    return refView(this.hass, id);
  }

  /** A tap or a hold opens the entity a reference names, never its attribute. */
  protected override tap(entityId?: string, action?: ActionConfig): void {
    super.tap(entityId && entityOf(entityId), action);
  }

  protected override hold(entityId?: string, action?: ActionConfig): void {
    super.hold(entityId && entityOf(entityId), action);
  }

  /** The automation of this appliance's "Tell me when it's done", where an administrator looks at its whole card. */
  private noticeAutomation(): string | undefined {
    const key = this.appliance().device ?? this.config?.entity;
    if (!key || !this.hass?.user?.is_admin || this.variant !== 'full') return undefined;
    return automationEntity(this.hass, noticeId(key))?.entity_id;
  }

  private now(): number {
    const frozen = this.config?._now ? Date.parse(this.config._now) : NaN;
    return Number.isFinite(frozen) ? frozen : Date.now();
  }

  /**
   * Whether the minute's clock has something to say: a job under way, a start to wait for, a finish not 2 h old, how
   * long something has waited, a door open.
   */
  private timed(): boolean {
    const last = this.last;
    if (!last) return false;
    const { status, finishedAt } = last.shown;
    return (
      busy(status) ||
      status === 'scheduled' ||
      (status === 'finished' && finishedAt !== null && Date.now() - finishedAt < 2 * 60 * MINUTE) ||
      last.r.attention.some((item) => item.since !== undefined) ||
      // a door open now is said once it has stood a minute
      (last.r.door?.open ?? false)
    );
  }

  /** The key this appliance's "Unloaded" is remembered by: its device, else its entity. */
  private memoryKey(found: ApplianceFound): string {
    return found.device ?? this.config?.entity ?? '';
  }

  /** A plug's cycle, from its threshold sensor, else its power's history and live states. */
  private cycle(roles: ApplianceRoles, now: number): PlugCycle {
    const doneFor = (this.config?.done_for ?? DONE_FOR) * MINUTE;
    if (roles.running) return cycleOfFlag(this.hass?.states[roles.running], now, doneFor);
    const { watts } = this.history.read(
      this.hass,
      { watts: roles.watts, energy: roles.energy },
      now,
    );
    return cycleOf(watts, now, {
      running: this.config?.running_power ?? RUNNING_POWER,
      finishedAfter: (this.config?.finished_after ?? FINISHED_AFTER) * MINUTE,
      doneFor,
    });
  }

  /** What this cycle has used (kWh): its meter's gain since it started, else what the plug drew. */
  private used(
    r: ApplianceReading,
    shown: Shown,
    cycle: PlugCycle | undefined,
    now: number,
  ): number | null {
    const { energy, watts } = r.roles;
    if (!energy && !watts) return null;
    const end = shown.status === 'finished' ? shown.finishedAt : now;
    const start =
      cycle?.start ??
      (busy(shown.status) && shown.clock.elapsed !== null
        ? now - shown.clock.elapsed * 1000
        : shown.status === 'finished' && shown.finishedAt !== null && shown.clock.total !== null
          ? shown.finishedAt - shown.clock.total * 1000
          : null);
    if (start === null || end === null) return null;
    const readings = this.history.read(this.hass, { watts, energy }, now);
    if (energy) return energySince(readings.energy, start, end);
    return readings.loaded ? drawn(readings.watts, start, end) : null;
  }

  /** The card's view of the appliance now; none where there is no appliance to show. */
  private read(): View | null {
    const found = this.appliance();
    const { roles, zones, hob } = found.entities;
    if (found.verdict && 'excluded' in found.verdict) return null;
    if (!found.device && !this.config?.entity) return null;
    const config = this.config ?? { type: '' };
    const now = this.now();
    const cycle = isPlug(roles) ? this.cycle(roles, now) : undefined;
    const r = readAppliance(
      this.hass,
      found,
      config,
      now,
      unloadedAt(this.memoryKey(found)),
      cycle,
    );
    // out of reach where nothing of it can be read (a fridge has no state of its own to say so): unavailable, or gone
    // from the house
    const read = [...Object.values(roles), ...zones, ...hob];
    const reachable =
      !read.length ||
      read.some((id) => {
        const { status } = this.entity(id);
        return status !== 'unavailable' && status !== 'missing';
      });
    const gone = r.unavailable || !reachable;
    const said = shownOf(this.hass, r, config.unit ?? 'both');
    const kind = r.kind;
    // what keeps food cold is at work while it is on, where nothing else says what it does (on its plug as well)
    const cold = KIND_DEFAULTS[kind].hero === 'cold';
    const shown: Shown = gone
      ? { ...said, status: 'offline', word: s(this.hass, 'status_offline') }
      : cold && said.status === 'idle' && !r.word
        ? { ...said, word: s(this.hass, 'in_operation') }
        : said;
    const tone = statusTone(shown.status, config, kind);
    const resting = shown.status === 'idle' || shown.status === 'off';
    const wantsEnergy = (config.readouts ?? KIND_DEFAULTS[kind].readouts).includes('this_cycle');
    // what keeps food cold has no cycle to have used anything in: its plug's bursts are its compressor's
    return {
      found,
      r,
      shown,
      kind,
      hero: r.plug ? 'plug' : KIND_DEFAULTS[kind].hero,
      title: config.name ?? (r.name || s(this.hass, `kind_${kind}`)),
      glyph: shown.status === 'error' ? 'warn' : (config.icon ?? kindGlyph(kind)),
      tone,
      headTone: resting ? 'neutral' : r.unload ? statusToneOf(config, 'warning') : tone,
      entity:
        config.entity ??
        roles.state ??
        roles.power ??
        roles.watts ??
        roles.running ??
        zones[0] ??
        hob[0],
      now,
      unavailable: gone,
      used: !cold && (wantsEnergy || r.plug) ? this.used(r, shown, cycle, now) : null,
    };
  }

  private sensors(): ApplianceSensor[] {
    return (this.config?.sensors ?? []).map((entry) =>
      typeof entry === 'string' ? { entity: entry } : entry,
    );
  }

  private zoneEntries(): ZoneEntry[] {
    return zoneEntriesOf(this.config);
  }

  private figure(n: number, digits = 0): string {
    return formatNumber(this.hass, n, { digits });
  }

  /** Kilowatt-hours to the hundredth: what a cycle used. */
  private kwh(n: number): string {
    return formatNumber(this.hass, n, { digits: 2, minDigits: 2 });
  }

  /** An entity's value as a readout says it: its figure and unit, else Home Assistant's words; a dash out of reach. */
  private valueText(id: string | undefined): { readonly value: string; readonly unit: string } {
    const v = id ? this.entity(id) : undefined;
    // out of reach, or a word for nothing (LG's older integration's dash and "N/A"): the readout's dash
    if (!v || v.status !== 'ok' || !wordOf(v.state) || wordOf(v.state) === 'n/a')
      return { value: '—', unit: '' };
    const n = v.number;
    if (n === null) return { value: stateText(this.hass, v), unit: '' };
    return {
      value: this.figure(n, Number.isInteger(n) || Math.abs(n) >= 100 ? 0 : 1),
      unit: v.unit ?? '',
    };
  }

  /* ---------- the actions ---------- */

  /** Runs a call the card worked out, its entity in its data. */
  private run(call: ServiceCall): void {
    this.hass?.callService(call.domain, call.service, { ...call.data }).catch(() => undefined);
  }

  /** Runs a call after Home Assistant's own dialog has asked `text`. */
  private ask(call: ServiceCall, text: string): void {
    const { entity_id: entity, ...data } = call.data;
    this.tap(String(entity), {
      action: 'perform-action',
      perform_action: `${call.domain}.${call.service}`,
      target: { entity_id: String(entity) },
      data,
      confirmation: { text },
    });
  }

  private command(command: Command): void {
    if (command.blocked) return;
    if (command.confirm) this.ask(command.call, this.t(CONFIRM[command.confirm]));
    else this.run(command.call);
  }

  /** "Unloaded": the finish is remembered, and the reminder goes. */
  private unloaded(view: View): void {
    if (!view.r.unload) return;
    rememberUnloaded(this.memoryKey(view.found), view.r.unload.since);
    this.requestUpdate();
  }

  /**
   * The action row's cells, by what the appliance can do at all — never by what it does now, so the row keeps its
   * cells: start and pause share the primary (start, resume or pause, as it stands), stop, power, the light; a cell
   * that cannot act now is drawn disabled.
   */
  private cells(view: View): Cell[] {
    const c = this.config;
    const { r } = view;
    const can = (...actions: Action[]): boolean => canDo(this.hass, r, actions);
    const wanted = c?.controls ?? KIND_DEFAULTS[view.kind].controls;
    const cells: Cell[] = [];
    let primary = false;
    for (const control of wanted) {
      if (!can(...CONTROL_ACTIONS[control])) continue;
      if (control === 'start' || control === 'pause') {
        if (primary) continue;
        primary = true;
        const command = r.commands.find(
          (item) => item.control === 'start' || item.control === 'pause',
        );
        const action = command?.action ?? (can('start', 'resume') ? 'start' : 'pause');
        cells.push({
          control: command?.control ?? 'start',
          glyph: action === 'pause' ? 'pause' : 'play',
          label: s(
            this.hass,
            action === 'pause' ? 'pause' : action === 'resume' ? 'resume' : 'start',
          ),
          command,
          on: false,
          primary: true,
        });
      } else if (control === 'stop')
        cells.push({
          control,
          glyph: 'stop',
          label: s(this.hass, 'stop'),
          command: r.commands.find((item) => item.control === 'stop'),
          on: false,
          primary: false,
        });
      else if (control === 'power') {
        const command = r.commands.find((item) => item.control === 'power');
        cells.push({
          control,
          glyph: 'power',
          label: s(this.hass, command?.action === 'power_on' ? 'power_on' : 'power_off'),
          command,
          on: r.status !== 'off' && r.status !== 'offline',
          primary: false,
        });
      } else {
        const light = r.roles.light;
        cells.push({
          control,
          glyph: 'bulb',
          label: s(this.hass, 'light'),
          command: r.commands.find((item) => item.control === 'light'),
          on: light ? this.entity(light).state === 'on' : false,
          primary: false,
        });
      }
    }
    return view.unavailable ? cells.map((cell) => ({ ...cell, command: undefined })) : cells;
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const view = this.read();
    this.last = view ?? undefined;
    if (!view) return this.renderEmpty(s(this.hass, 'no_appliance'));
    if (this.variant === 'row') return this.renderRow(view);
    if (this.variant === 'full') return this.renderFull(view);
    const hero = view.hero;
    const compact = this.variant === 'compact';
    const ring = this.variant === 'ring';
    // the head first, then the readouts: what they say (the programme, how long it has run) the line does not repeat
    const top = this.renderHead(view);
    const stats = ring ? [] : this.stats(view);
    this.readoutKeys = new Set(stats.flatMap((stat) => (stat.key ? [stat.key] : [])));
    this.dialSaid = false;
    return html`<article
      class="fv-card dv-card ap-card ${view.unavailable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${top}
      ${
        ring && (hero === 'cycle' || hero === 'heat' || hero === 'plug' || hero === 'cold')
          ? this.renderDial(view)
          : this.renderHero(view, compact)
      }
      ${this.renderLine(view)} ${this.renderTwin(view)} ${this.renderReadouts(stats, compact)}
      ${this.controlsShown() ? this.renderActions(view) : nothing}
    </article>`;
  }

  /** Whether the card draws its buttons: asked for, else the dial's (the whole card's round is its button). */
  private controlsShown(): boolean {
    return this.config?.show_controls ?? this.variant === 'ring';
  }

  /* ---------- the whole card (#47, the reporter's design) ---------- */

  /**
   * The whole card: its picture, its name over what it does and its power round; the kind's hero — a cycle's time
   * left over its bar, an oven's heat on its way to its target, a fridge's compartments, a hob's plates, a coffee
   * machine's drinks — 108 tall where it holds, so the hairline under it, the rows and the card's foot of a dashboard's
   * row of appliances are level; then three rows. Out of reach, every part keeps its place, its values a dash.
   */
  private renderFull(view: View): TemplateResult {
    const c = this.config;
    const region = this.renderRegion(view);
    const items = c?.show_rows === false ? [] : this.items(view);
    // what asks for attention is the alarm row's to say where the rows have one, the head's otherwise
    const alarm = items.some((item) => item.key === 'alarm');
    this.readoutKeys = new Set();
    return html`<article
      class="fv-card dv-card ap-card ap-card--full ${view.unavailable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${this.renderPictureHead(view, alarm)}
      ${
        region === nothing
          ? nothing
          : html`<div class="ap-region ${region.fixed ? 'is-fixed' : ''}">${region.parts}</div>`
      }
      ${items.length ? this.renderItems(view, items) : nothing}
      ${c?.show_modes && view.hero === 'cold' ? this.renderModes(view) : nothing}
      ${this.controlsShown() ? this.renderActions(view) : nothing} ${this.renderPrograms(view)}
    </article>`;
  }

  /** The picture where the card shows one: the drawing of its kind, the person's own, or the kind's circle. */
  private renderPicture(view: View, size: number): TemplateResult {
    const c = this.config;
    if (c?.picture === 'icon')
      return ico(view.glyph, view.unavailable ? 'off' : view.headTone, { hero: size >= 64 });
    const own = imageOf(this.hass, c?.image);
    return pictureBox(size, own || artOf(view.kind, () => this.requestUpdate()));
  }

  /**
   * The head: the picture (64; 44, then the name at 16, where the whole name would not hold beside it; none before a
   * letter of the name would go: `headFit`), the name over what it does — what asks for attention in the warning's ink,
   * else its phase or its state — and the round, raised beside the head's own button: "Unloaded" while a load waits,
   * else the power. What it does keeps its words: where the column leaves them no room beside the round, they take the
   * card's width under the head.
   */
  private renderPictureHead(view: View, alarm: boolean): TemplateResult {
    const c = this.config;
    const w = this.contentWidth;
    const round = this.powerRound(view);
    // the head's parts are 16 apart (`.ap-head`)
    const trailing = round === nothing ? 0 : 48 + 16;
    const name = (small: boolean): number =>
      this.head.ruler.width(
        `fv-card__title ap-head__title${small ? ' ap-head__title--s' : ''}`,
        view.title,
      );
    const { size, small, under, room } = headFit(
      w,
      trailing,
      c?.picture !== 'none',
      name(false),
      name(true),
    );
    const sub = this.headWords(view, alarm);
    const measure = (text: string): number =>
      this.head.ruler.width('fv-card__sub ap-head__sub', text);
    // under the head where the column leaves the slot beside the name too narrow for a sentence: never by what it says,
    // so the card keeps its size whatever it says (1.9); one line either way, the trailing parts giving way first, then
    // its shorter forms ("1 of 4 on" for a plate's name, a step's status), an ellipsis with the whole in its title only
    // where it has none
    const slot = under ? w : room;
    const line = fitParts(sub.parts, sub.briefs, slot, measure);
    const whole = sub.parts.map((part) => part.text).join(' · ');
    const said = html`<p
      class="fv-card__sub ap-head__sub ${sub.warn ? 'is-warning' : ''}"
      title=${line !== whole || measure(line) > slot ? whole : nothing}
    >
      ${line}
    </p>`;
    const { onTap, onHold } = this.headActions(view.entity, view.title);
    const pressed = onTap ?? onHold;
    return html`<div
        class="fv-card__head ap-head ${onTap ? 'fv-card__head--tap' : ''} ${onHold ? 'fv-card__head--hold' : ''}"
        .fvHold=${onHold}
        @pointerdown=${pressed ? startPress : nothing}
        @contextmenu=${onHold ? preventMenu : nothing}
        @click=${pressed ? clickHead : nothing}
      >
        ${size ? this.renderPicture(view, size) : nothing}
        <div class="fv-card__titles">
          <h3 class="fv-card__title ap-head__title ${small ? 'ap-head__title--s' : ''}" data-name>
            ${onTap ? headTap(view.title, { onTap, onHold, name: true }) : view.title}
          </h3>
          ${under ? nothing : said}
        </div>
        ${round}
      </div>
      ${under ? html`<div class="ap-head__under">${said}</div>` : nothing}`;
  }

  /**
   * What the head says the appliance is doing: what asks for attention first (why it failed, a door left open, a load
   * waiting, with how long — never a reminder, and not where an alarm row says it: the rows say those), in the
   * warning's ink; a hob's plates on ("Zone 1 on", "1 of 4 on" where a plate's name would not hold); a fridge at work
   * is in operation; else its phase while it works, else its state — each with its shorter forms (`briefs`).
   */
  private headWords(view: View, alarm: boolean): Words & { readonly warn: boolean } {
    const { r, shown } = view;
    const need =
      view.unavailable || alarm
        ? undefined
        : r.attention.find((item) => !item.key.startsWith('appliance.m_'));
    if (need) return { ...this.needWords(view, [need]), warn: true };
    if (view.hero === 'hob' && !view.unavailable) {
      const on = r.hob.flatMap((id, index) => (this.plateOn(id) ? [index] : []));
      const count = s(this.hass, 'hob_on', { on: on.length, count: r.hob.length });
      if (on.length === 1)
        return {
          parts: [{ text: s(this.hass, 'plate_on', { plate: this.plateName(view, on[0] ?? 0) }) }],
          briefs: [count],
          warn: false,
        };
      if (on.length > 1) return { parts: [{ text: count }], briefs: [], warn: false };
    }
    if (view.hero === 'cold' && shown.status === 'idle')
      return { parts: [{ text: s(this.hass, 'in_operation') }], briefs: [], warn: false };
    return { ...this.stateWords(view), warn: false };
  }

  /**
   * What it is doing in a word: its phase while it works, else its state; its status's word the shorter form (none
   * for what keeps food cold, in operation while it rests).
   */
  private stateWords(view: View): Words {
    const { shown, r } = view;
    const word = busy(shown.status) && shown.phase ? shown.phase : shown.word;
    const status = this.t(r.statusWord);
    return {
      parts: [{ text: word }],
      briefs: word === status || word === s(this.hass, 'in_operation') ? [] : [status],
    };
  }

  /**
   * What asks for attention, most pressing first, each with how long (which may go): the first's shorter forms its
   * thing and what to do for a reminder ("Rinse aid", "Refill"), "Empty" for a load, "Error" for a failure (the
   * integration's own words for it are the line's title then).
   */
  private needWords(view: View, items: readonly Attention[]): Words {
    const parts = items.flatMap((item, index) => {
      const said = item.text || this.t(item.key);
      const full = attentionText(this.hass, item, view.now);
      const age = full.startsWith(`${said} · `) ? full.slice(said.length + 3) : '';
      return [{ text: said, optional: index > 0 }, ...(age ? [{ text: age, optional: true }] : [])];
    });
    const first = items[0];
    const key = first?.key ?? '';
    const reminder = key.startsWith('appliance.m_') ? (key.slice(12) as MaintenanceKey) : undefined;
    const briefs = reminder
      ? [this.reminderNoun(view, reminder), this.t(DUE_WORD[reminder])]
      : key === 'appliance.unload' || key === 'appliance.anti_crease'
        ? [s(this.hass, 'do_empty')]
        : key === 'appliance.failure' || key === 'appliance.aborted'
          ? [s(this.hass, 'status_error')]
          : [];
    return { parts, briefs };
  }

  /**
   * The power round (48, the head's), tinted by what the appliance does: the accent (the card's colour) while it works
   * or waits to start, the success's green while it is on and ready, the warning's while it needs a hand, quiet while
   * off, the dashed skin out of reach. It switches the appliance where its integration lets a card (`power_action`
   * stands in for it), else opens its details; "Unloaded" takes its place while a load waits.
   */
  private powerRound(view: View, extra = ''): TemplateResult | typeof nothing {
    const { r, shown } = view;
    if (r.unload && !view.unavailable)
      return round(
        'check',
        'accent',
        s(this.hass, 'unloaded'),
        () => this.unloaded(view),
        false,
        'ap-power',
      );
    if (this.config?.show_power === false) return nothing;
    const command = r.commands.find((item) => item.control === 'power');
    const action = this.config?.power_action;
    const entity = r.roles.power ?? view.entity;
    const status = shown.status;
    const tint = view.unavailable
      ? 'off'
      : status === 'off'
        ? 'quiet'
        : status === 'attention' || status === 'error' || status === 'paused'
          ? 'warning'
          : busy(status) || status === 'scheduled'
            ? 'accent'
            : 'ok';
    const label =
      command && !command.blocked
        ? this.t(command.label)
        : s(this.hass, status === 'off' || view.unavailable ? 'power_on' : 'power_off');
    return round(
      'power',
      '',
      label,
      () => {
        if (action) this.tap(entity, action);
        else if (command && !command.blocked) this.command(command);
        else this.tap(entity, { action: 'more-info' });
      },
      view.unavailable,
      `ap-power ap-power--${tint} ${extra}`,
    );
  }

  /** The kind's hero, and whether it keeps the hero's 108 (a bar alone does not). */
  private renderRegion(
    view: View,
  ): { readonly parts: TemplateResult; readonly fixed: boolean } | typeof nothing {
    const c = this.config;
    switch (view.hero) {
      case 'cold':
        if (c?.show_zones === false) return nothing;
        return {
          parts:
            c?.setpoint_style === 'stepper'
              ? this.renderZones(view)
              : this.renderCompartments(view),
          fixed: true,
        };
      case 'hob':
        return c?.show_zones === false ? nothing : { parts: this.renderPlates(view), fixed: true };
      case 'state':
        return view.kind === 'coffee' && c?.show_drinks !== false
          ? { parts: this.renderDrinks(view), fixed: true }
          : nothing;
      default: {
        // the target's row where its stepper is asked for and the integration lets a card set it: out of reach too
        const setter =
          view.hero === 'heat' && c?.setpoint_style === 'stepper'
            ? targetSetter(this.hass, view.r.platform, view.r.roles)
            : undefined;
        if (setter && c?.show_hero !== false)
          return { parts: this.renderHeat(view, false), fixed: true };
        const figures = c?.show_hero === false ? nothing : this.renderFigures(view);
        const bar =
          view.hero === 'plug' || c?.show_progress === false ? nothing : this.renderProgress(view);
        if (figures === nothing && bar === nothing) return nothing;
        return { parts: html`${figures}${bar}`, fixed: figures !== nothing };
      }
    }
  }

  /** A span as the hero writes it, hours and minutes: "1:12 h". */
  private hoursMinutes(seconds: number): string {
    return s(this.hass, 'hours_minutes', hoursMinutes(seconds));
  }

  /**
   * The hero's figures: what they are over the figure and a line under it — a cycle's time left "of" its whole (or when
   * it ends), when it starts, when it finished; an oven's temperature and its target; a plug's power and what this
   * cycle used. The line under the figure is kept where it says nothing, so the bar never moves.
   */
  private renderFigures(view: View): TemplateResult {
    const { shown, r, now } = view;
    const { clock } = shown;
    const dash = '—';
    let label = s(this.hass, 'remaining');
    let value = dash;
    let sub = '';
    if (view.hero === 'heat') {
      const heat = view.unavailable ? null : r.heat;
      const unit = heat?.unit ?? this.hass?.config.unit_system.temperature ?? '°C';
      label = s(this.hass, 'r_temperature');
      if (heat?.current !== null && heat?.current !== undefined)
        value = `${this.figure(heat.current)} ${unit}`;
      if (heat?.target !== null && heat?.target !== undefined)
        sub = s(this.hass, 'target_value', { value: `${this.figure(heat.target)} ${unit}` });
    } else if (view.hero === 'plug') {
      const watts = this.valueText(r.roles.watts);
      label = s(this.hass, 'r_power');
      value =
        view.unavailable || watts.value === dash ? dash : `${watts.value} ${watts.unit}`.trim();
      if (view.used !== null && !view.unavailable)
        sub = `${s(this.hass, 'r_this_cycle')} ${this.kwh(view.used)} kWh`;
    } else if (view.unavailable) {
      // out of reach: the time left's place, a dash
    } else if (shown.status === 'scheduled' && r.startAt !== null) {
      label = s(this.hass, 'starts');
      value = this.moment(r.startAt, now);
    } else if (shown.status === 'finished') {
      label = s(this.hass, 'finished');
      if (shown.finishedAt !== null) value = this.moment(shown.finishedAt, now);
      if (clock.total !== null)
        sub = jobWords(this.hass, 'total_text', { time: spanText(this.hass, clock.total) });
    } else if ((this.config?.time ?? 'both') === 'end') {
      label = s(this.hass, 'end');
      if (busy(shown.status) && clock.at !== null) value = this.moment(clock.at, now);
      if (busy(shown.status) && clock.left !== null) sub = leftText(this.hass, clock.left);
    } else if (busy(shown.status) && clock.left !== null) {
      value = this.hoursMinutes(clock.left);
      sub =
        clock.total !== null
          ? s(this.hass, 'of_total', { time: this.hoursMinutes(clock.total) })
          : clock.at !== null
            ? whenText(this.hass, 'ready', clock.at, now)
            : '';
    }
    const notice = this.renderNotice(view, [label, value, sub]);
    return html`<div class="ap-figures">
      <p class="ap-figures__label">${label}</p>
      <p class="ap-figures__value">${value}</p>
      <p class="ap-figures__sub">${sub}</p>
      ${notice}
    </div>`;
  }

  /**
   * "Tell me when it's done" (an administrator's, where something says the appliance finished): a bell beside the
   * figures, under the power round — the glyph alone, quiet, until it is on, then the accent's round. A tap writes the
   * automation (on at once), then turns it off and on again; a hold readies its removal — the round the warning's, its
   * glyph the bin — which a tap does within four seconds. Out of reach it keeps its place, disabled; it gives way where
   * the figures' words would not hold beside it.
   */
  private renderNotice(view: View, words: readonly string[]): TemplateResult | typeof nothing {
    const hass = this.hass;
    const key = view.found.device ?? this.config?.entity;
    if (!hass?.user?.is_admin || this.config?.show_notify === false || !key) return nothing;
    const room = this.contentWidth - 44 - 12;
    const fits = words.every(
      (text, index) =>
        this.head.ruler.width(index === 1 ? 'ap-figures__value' : 'ap-figures__label', text) <=
        room,
    );
    const triggers = fits
      ? noticeTriggers(hass, view.found, view.kind, {
          running: this.config?.running_power ?? RUNNING_POWER,
          finishedAfter: this.config?.finished_after ?? FINISHED_AFTER,
        })
      : [];
    if (!triggers.length) return nothing;
    const id = noticeId(key);
    const automation = automationEntity(hass, id)?.entity_id;
    const now = Date.now();
    const sent = !automation && this.noticeSent > now;
    const armed = automation !== undefined && this.noticeArmed > now;
    const on = sent || (automation !== undefined && this.stateOf(this.entity(automation)) === 'on');
    const label = s(hass, armed ? 'notify_remove' : 'notify');
    // readied to remove, the warning's round; on, the power round's working tint; else the glyph alone
    const tint = armed
      ? 'ap-power--warning'
      : on
        ? 'ap-power--accent'
        : 'fv-round--bare ap-notice--off';
    const tap = (): void => {
      if (!automation) return void this.writeNotice(view, id, triggers);
      if (armed) return void this.removeNotice(id);
      this.expect(automation, on ? 'off' : 'on');
      this.call('automation', on ? 'turn_off' : 'turn_on', {}, automation);
    };
    const hold = automation ? (): void => this.armNotice() : undefined;
    return html`<button
      class="fv-round ap-notice ${tint}"
      data-control
      data-target
      aria-label=${label}
      title=${label}
      aria-pressed=${armed ? nothing : String(on)}
      ?disabled=${view.unavailable || sent}
      .fvTap=${tap}
      .fvHold=${hold}
      @pointerdown=${startPress}
      @click=${clickPress}
      @contextmenu=${hold ? preventMenu : nothing}
    >
      ${icon(armed ? 'trash' : 'bell')}
    </button>`;
  }

  /** Writes the notice in the administrator's words, to their phone where they have the app; on until it is listed. */
  private async writeNotice(
    view: View,
    id: string,
    triggers: readonly NoticeTrigger[],
  ): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const phone = phoneOf(hass);
    const config = buildNotice({
      id,
      alias: s(hass, 'notice_alias', { name: view.title }),
      triggers,
      ...(phone ? { phone } : {}),
      title: view.title,
      message: s(hass, 'done_message', { name: view.title }),
    });
    this.noticeSent = Date.now() + 15_000;
    this.requestUpdate();
    try {
      await AutomationStore.for(hass).save(id, config);
    } catch {
      this.noticeSent = 0; // refused: the round says so by staying off
    }
    this.lookForNotice(id);
  }

  /** Draws again once Home Assistant lists the notice written (or once it is given up on). */
  private lookForNotice(id: string): void {
    window.clearTimeout(this.noticeTimer);
    if (this.noticeSent <= Date.now() || (this.hass && automationEntity(this.hass, id))) {
      this.noticeSent = 0;
      this.requestUpdate();
      return;
    }
    this.noticeTimer = window.setTimeout(() => this.lookForNotice(id), 400);
  }

  /** A hold: the round removes the notice if tapped within four seconds. */
  private armNotice(): void {
    this.noticeArmed = Date.now() + 4000;
    this.requestUpdate();
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.requestUpdate(), 4050);
  }

  private async removeNotice(id: string): Promise<void> {
    this.noticeArmed = 0;
    this.requestUpdate();
    if (this.hass)
      await AutomationStore.for(this.hass)
        .remove(id)
        .catch(() => undefined);
  }

  /**
   * The bar under the figures, 12 tall, its share in the card's colour softened and its percentage at its end: a
   * cycle's progress (all of it once done, none at rest), an oven's programme's (or its heat on its way to its
   * target); a cycle's steps instead where asked.
   */
  private renderProgress(view: View): TemplateResult {
    if (this.config?.progress_style === 'steps' && KIND_DEFAULTS[view.kind].steps.length)
      return this.renderSteps(view);
    const { shown, r } = view;
    const working = busy(shown.status);
    const heat = view.hero === 'heat';
    // an oven's programme, where it says how far it is, else its heat on its way to its target
    const heating = heat && working && shown.clock.progress === null;
    const said = view.unavailable
      ? null
      : heating
        ? r.heat
          ? r.heat.ready
            ? 100
            : r.heat.progress
          : null
        : shown.status === 'finished'
          ? 100
          : working
            ? shown.clock.progress
            : null;
    const progress = said ?? 0;
    const label = heating ? s(this.hass, 'status_preheating') : jobWords(this.hass, 'progress');
    // the percentage's room is its widest ("100 %"), on the 4 grid: the bar keeps its length whatever it says
    const widest = this.head.ruler.width('ap-progress__share', `${this.figure(100)} %`);
    const share = Math.ceil(widest / 4) * 4;
    return html`<div class="ap-progress fv-tone--${toneOf(this.config, 'accent')}">
      <span
        class="ap-progress__bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${Math.round(progress)}
        aria-label=${label}
        ><span class="ap-progress__fill" data-measure="value" style="width:${progress}%"></span
      ></span>
      <span class="ap-progress__share" style="flex-basis:${share}px"
        >${said === null ? '—' : `${this.figure(said)} %`}</span
      >
    </div>`;
  }

  /**
   * A fridge's compartments as tiles side by side: a soft circle, the compartment's name over its setpoint (its
   * reading where it has none); a tap opens it (or does the card's own for it). Two a row where they hold their words
   * with their circles, then without them, else one a row — a word is never cut. One none of whose compartments is
   * found keeps its kind's tiles (a fridge its fridge's and freezer's), a dash each.
   */
  private renderCompartments(view: View): TemplateResult {
    const found = this.zonesShown(view);
    const zones: ZoneShown[] = found.length
      ? found
      : (view.kind === 'fridge' ? ['fridge', 'freezer'] : [view.kind]).map((kind) => ({
          kind: kind as ZoneKind,
          label: s(this.hass, `zone_${kind as 'fridge'}`),
          entity: '',
          current: '',
          setpoint: undefined,
          entry: undefined,
        }));
    const w = this.contentWidth;
    const items = zones.map((zone) => {
      const value = view.unavailable ? null : this.zoneValue(zone);
      const unit = this.zoneUnit(zone);
      const said = (n: number | string): string =>
        `${this.zoneText(zone, n)}${unit ? ` ${unit}` : ''}`;
      // the room a tile needs is measured in every form its value takes — its range's ends, a level's words —
      // never by what it says now: out of reach it keeps its columns
      const setter = zone.setpoint
        ? zoneSetter(this.hass, view.r.platform, stateOf(this.hass, zone.setpoint))
        : undefined;
      const forms = setter?.options ?? [setter?.min ?? -24, setter?.max ?? 8];
      return { zone, value: value === null ? '—' : said(value), forms: forms.map(said) };
    });
    const widest = Math.max(
      0,
      ...items.flatMap(({ zone, forms }) => [
        this.head.ruler.width('ap-tile__label', zone.label),
        ...forms.map((form) => this.head.ruler.width('ap-tile__value', form)),
      ]),
    );
    const n = Math.max(1, Math.min(2, items.length));
    const each = (columns: number): number => (w - 12 * (columns - 1)) / columns;
    const columns = each(n) >= 12 + widest + 12 ? n : 1;
    const circles = each(columns) >= 12 + 40 + 8 + widest + 12;
    return html`<div class="ap-tiles" style="--ap-tiles:${columns}" data-fill-row>
      ${items.map(({ zone, value }) => {
        const { tap, hold } = this.zoneActions(zone);
        const accent = this.accents.item(zone.entry?.color);
        const tone: Tone = view.unavailable ? 'off' : accent ? 'accent' : 'cool';
        return html`<div
          class="ap-tile"
          data-accent=${accent ?? nothing}
          role="button"
          tabindex="0"
          aria-label=${`${zone.label} · ${value}`}
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          ${circles ? ico(zone.entry?.icon ?? (zone.kind === 'wine' ? 'drop' : 'snow'), tone) : nothing}
          <span class="ap-tile__text"
            ><span class="ap-tile__label">${zone.label}</span
            ><span class="ap-tile__value">${value}</span></span
          >
        </div>`;
      })}
    </div>`;
  }

  private plateName(view: View, index: number): string {
    return plateNameOf(this.hass, this.config, view.r.hob[index], index);
  }

  /**
   * A hob's plates on a soft panel: a circle each — a ring in the heat's ink while it cooks, a disc at rest — over its
   * name and its level in Home Assistant's words; all on one row where each holds its words (four at most), else
   * three, two (four two by two) or one a row (`plateColumns`). A hob none of whose plates is found keeps the panel:
   * four, a dash each.
   */
  private renderPlates(view: View): TemplateResult {
    const plates = view.r.hob.length ? view.r.hob : ['', '', '', ''];
    const words = plates.map((id) => {
      const v = this.entity(id);
      return v.status === 'ok' && !view.unavailable ? stateText(this.hass, v) : '—';
    });
    const names = plates.map((_, index) => this.plateName(view, index));
    const inner = this.contentWidth - 24;
    const columns = plateColumns(
      [
        ...words.map((word) => this.head.ruler.width('ap-plate__level', word)),
        ...names.map((name) => this.head.ruler.width('ap-plate__name', name)),
      ],
      plates.length,
      inner,
    );
    // the plates on whole pixels: 8 apart where that keeps them so, else 4 (three a row in a 360 column)
    const gap =
      [8, 4, 12].find((n) => Number.isInteger((inner - n * (columns - 1)) / columns)) ?? 8;
    return html`<div
      class="ap-plates fv-tone--heat"
      style="--ap-plates:${columns};--ap-gap:${gap}px"
      data-fill-row
    >
      ${plates.map((id, index) => {
        const on = !view.unavailable && this.plateOn(id);
        const entry = this.zoneEntries().find((item) => item.entity === id);
        const tap = (): void => this.tap(id, entry?.tap_action ?? { action: 'more-info' });
        const hold = (): void => this.hold(id, entry?.hold_action ?? { action: 'more-info' });
        return html`<div
          class="ap-plate ${on ? 'is-on' : ''}"
          data-accent=${this.accents.item(entry?.color) ?? nothing}
          role="button"
          tabindex="0"
          aria-label=${`${names[index] ?? ''} · ${words[index] ?? ''}`}
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          <span class="ap-plate__ring"></span>
          <span class="ap-plate__name">${names[index]}</span>
          <span class="ap-plate__level">${words[index]}</span>
        </div>`;
      })}
    </div>`;
  }

  /**
   * A coffee machine's drinks: tiles of its programmes (the card's, else its first three), a cup over each name, and
   * one more ("…") for the rest; a tap starts the drink where its integration lets a card, else opens the programme.
   * The tiles are as even as their words allow: the row's room shared equally (on the 4 grid), a tile whose words need
   * more (8 a side) taking only what they need, so the row ends on the column's edge; as many as hold their words. Out
   * of reach, or where it says no programme, the slots stay, their words a dash.
   */
  private renderDrinks(view: View): TemplateResult {
    const { r } = view;
    const id = r.roles.program;
    const state = stateOf(this.hass, id);
    const listed = optionsOf(state);
    const drinks = (this.config?.drinks ?? listed).slice(0, 3);
    const off = view.unavailable || !id;
    const slots = off || !drinks.length ? ['', '', ''] : drinks;
    const words = slots.map((option) => (option ? optionWord(this.hass, state, option) : '—'));
    const room = this.contentWidth - 48 - 8;
    const sizes = words.map((word) =>
      Math.max(64, Math.ceil((this.head.ruler.width('ap-drink__name', word) + 16) / 4) * 4),
    );
    const span = (count: number): number =>
      sizes.slice(0, count).reduce((sum, size) => sum + size, 0) + 8 * (count - 1);
    let n = slots.length;
    while (n > 1 && span(n) > room) n--;
    // the room shared equally among the tiles whose words hold in a share; the others take what their words need
    const needs = sizes.slice(0, n);
    let even = needs;
    let left = room - 8 * (n - 1);
    for (;;) {
      const share = left / even.length;
      const wide = even.filter((size) => size > share);
      if (!wide.length || wide.length === even.length) break;
      left -= wide.reduce((sum, size) => sum + size, 0);
      even = even.filter((size) => size <= share);
    }
    const share = Math.max(...even, Math.floor(left / even.length / 4) * 4);
    const widths = needs.map((size) => (even.includes(size) ? share : size));
    // the room the 4 grid leaves over goes to the last tile
    widths[n - 1] =
      (widths[n - 1] ?? 0) + Math.max(0, room - 8 * (n - 1) - widths.reduce((a, b) => a + b, 0));
    const open = (): void => this.tap(id, { action: 'more-info' });
    return html`<div class="ap-drinks">
      <div
        class="ap-drinks__cells"
        style="grid-template-columns:${widths.map((w) => `${w}px`).join(' ')}"
      >
        ${slots.slice(0, n).map((option, index) => {
          const word = words[index] ?? '—';
          const pour = (): void => {
            if (option && r.programs && listed.includes(option))
              this.run(programCall(r.programs, option));
            else open();
          };
          return html`<button
            class="ap-drink"
            data-target
            aria-label=${word}
            ?disabled=${off}
            @click=${pour}
          >
            ${icon(MILKY.test(option) ? 'cappuccino' : 'cup')}
            <span class="ap-drink__name">${word}</span>
          </button>`;
        })}
      </div>
      <button
        class="ap-drink ap-drink--more"
        data-target
        aria-label=${s(this.hass, 'more_drinks')}
        title=${s(this.hass, 'more_drinks')}
        ?disabled=${off}
        @click=${open}
      >
        ${icon('dots')}
      </button>
    </div>`;
  }

  /* ---------- the rows ---------- */

  /** Whether the appliance has what a row says: its registry's, never its state's (out of reach, it has them still). */
  private has(view: View, key: RowKey, reminders: readonly Reminder[]): boolean {
    const { r } = view;
    switch (key) {
      case 'program':
        return Boolean(r.roles.program);
      case 'temperature':
      case 'spin':
      case 'dryness':
      case 'water':
        return Boolean(r.readouts[key]);
      case 'energy':
        return Boolean(r.readouts.energy ?? r.roles.energy);
      case 'power':
        return Boolean(r.roles.watts);
      case 'target':
        return Boolean(r.roles.target);
      case 'remaining':
        // a plug says when a cycle started and when it finished, never when it will end
        return !r.plug && Boolean(r.roles.remaining ?? r.roles.finish ?? r.roles.state);
      case 'end':
      case 'elapsed':
        return r.plug || Boolean(r.roles.remaining ?? r.roles.finish ?? r.roles.state);
      case 'mode':
        return view.hero === 'cold';
      case 'alarm':
        return true;
      case 'last_brew':
        return r.counters.length > 0;
      case 'zones':
        return r.hob.length > 0;
      case 'entity':
        return false;
      default:
        return reminders.some((item) => item.key === key);
    }
  }

  /**
   * The rows: a second drum or cavity first (`unit: both`); then the card's own, in its order, else the kind's three
   * — two beside a second drum, which holds its place in the slot as the reporter's oven holds its second cavity —
   * among those the appliance has and its hero does not already say (a cycle's time left, a plug's power), a dash in
   * the place of one it lacks; where a reminder is due that they do not say, it takes the place of the last it lacks,
   * else the last one's (the count is the kind's, whatever is due).
   */
  private items(view: View): Item[] {
    const twin =
      view.r.twin && (this.config?.unit ?? 'both') === 'both' ? [this.twinItem(view)] : [];
    const reminders = this.reminders(view);
    const own = this.config?.rows;
    if (own)
      return [
        ...twin,
        ...own
          .map(rowEntry)
          .map((entry) => this.item(view, entry.key ?? 'entity', reminders, entry)),
      ];
    const has = (key: RowKey): boolean => this.has(view, key, reminders);
    const keys = kindRows(view.kind, has, ROWS_SHOWN - twin.length, heroSays(view.hero));
    const due = view.unavailable
      ? undefined
      : reminders.find(
          (item) =>
            (item.severity === 'due' || item.severity === 'soon') && !keys.includes(item.key),
        );
    if (due) {
      const lacking = keys.map(has).lastIndexOf(false);
      keys[lacking < 0 ? keys.length - 1 : lacking] = due.key;
    }
    return [...twin, ...keys.map((key) => this.item(view, key, reminders))];
  }

  /** A second drum or cavity, as a row: its unit, what it does and its time left (or when it finished). */
  private twinItem(view: View): Item {
    const twin = view.r.twin;
    const off = view.unavailable || !twin;
    const word = twin ? twin.word || s(this.hass, `status_${twin.status}`) : '';
    const value = off
      ? '—'
      : [
          busy(twin.status) && twin.phase ? twin.phase : word,
          busy(twin.status) && twin.clock.left !== null ? this.hoursMinutes(twin.clock.left) : '',
          twin.status === 'finished' && twin.finishedAt !== null
            ? this.moment(twin.finishedAt, view.now)
            : '',
        ]
          .filter(Boolean)
          .join(' · ');
    return {
      key: 'twin',
      glyph: view.glyph,
      tint: !off && busy(twin.status) ? toneOf(this.config, 'accent') : 'neutral',
      label: s(this.hass, `unit_${twin?.unit ?? 'second'}`),
      value,
      unit: '',
      warn: false,
      entity: view.found.entities.twin?.roles.state ?? view.entity,
      entry: undefined,
      reminder: undefined,
    };
  }

  /** A reminder's noun in a row ("Rinse aid", a dryer's "Lint filter"). */
  private reminderNoun(view: View, key: MaintenanceKey): string {
    return key === 'filter' && (view.kind === 'dryer' || view.kind === 'washer_dryer')
      ? s(this.hass, 'n_lint_filter')
      : s(this.hass, `n_${key}`);
  }

  /** What one row says: its words, its value, its glyph and tint, the entity it opens. */
  private item(view: View, key: RowKey, reminders: readonly Reminder[], entry?: RowEntry): Item {
    const { r, shown, now } = view;
    const dash = '—';
    const off = view.unavailable;
    let unit = '';
    // a reading's figure, its unit kept apart
    const joined = (v: { readonly value: string; readonly unit: string }): string => {
      unit = v.value === dash ? '' : v.unit;
      return v.value;
    };
    let label: string;
    let value = '';
    let glyphName: string = key in ROW_GLYPH ? ROW_GLYPH[key as keyof typeof ROW_GLYPH] : 'list';
    let tint: Tint = 'neutral';
    let warn = false;
    let entity: string | undefined;
    let reminder: Reminder | undefined;
    let phrase: string | undefined;
    switch (key) {
      case 'program': {
        label = (off ? '' : r.program) || dash;
        entity = r.roles.program;
        const temperature = r.readouts.temperature;
        // a washer's programme with its temperature, as its panel says it ("Cottons **40 °C**")
        if (!off && temperature && (view.kind === 'washer' || view.kind === 'washer_dryer')) {
          const said = this.valueText(temperature);
          if (said.value !== dash) value = joined(said);
        }
        const eco = /\beco/i.test(r.program);
        glyphName = eco ? 'leaf' : (PROGRAM_GLYPH[view.kind] ?? 'list');
        // an eco programme in the success's green, laundry's in the water's blue, the rest quiet
        tint = off ? 'neutral' : eco ? 'ok' : LAUNDRY.includes(view.kind) ? 'cool' : 'neutral';
        break;
      }
      case 'temperature':
      case 'spin':
      case 'dryness':
      case 'water':
        entity = r.readouts[key];
        label = s(this.hass, `r_${key}`);
        value = off ? dash : joined(this.valueText(entity));
        if (key === 'water') tint = 'cool';
        break;
      case 'energy':
        entity = r.readouts.energy ?? r.roles.energy;
        label = s(this.hass, 'electricity');
        // an appliance's own reading of its programme's energy; a plug's meter counts the house's years, so what
        // this cycle used
        value = off
          ? dash
          : r.readouts.energy && !r.plug
            ? joined(this.valueText(r.readouts.energy))
            : view.used !== null
              ? joined({ value: this.kwh(view.used), unit: 'kWh' })
              : dash;
        break;
      case 'power':
        entity = r.roles.watts;
        label = s(this.hass, 'r_power');
        value = off ? dash : joined(this.valueText(entity));
        break;
      case 'target': {
        entity = r.roles.target;
        label = s(this.hass, 'target');
        const degrees = r.heat?.unit ?? this.hass?.config.unit_system.temperature ?? '°C';
        value = off
          ? dash
          : r.heat?.target !== null && r.heat?.target !== undefined
            ? joined({ value: this.figure(r.heat.target), unit: degrees })
            : joined(this.valueText(entity));
        break;
      }
      case 'remaining':
        entity = r.roles.remaining ?? r.roles.finish ?? r.roles.state;
        label = s(this.hass, 'remaining');
        value =
          !off && busy(shown.status) && shown.clock.left !== null
            ? this.hoursMinutes(shown.clock.left)
            : dash;
        break;
      case 'end':
        entity = r.roles.finish ?? r.roles.remaining ?? r.roles.state ?? r.roles.watts;
        label = s(this.hass, 'end');
        value =
          !off && busy(shown.status) && shown.clock.at !== null
            ? this.moment(shown.clock.at, now)
            : !off && shown.status === 'finished' && shown.finishedAt !== null
              ? this.moment(shown.finishedAt, now)
              : dash;
        break;
      case 'elapsed':
        entity = r.roles.elapsed ?? r.roles.state ?? r.roles.watts;
        label = jobWords(this.hass, 'elapsed');
        value =
          !off && busy(shown.status) && shown.clock.elapsed !== null
            ? spanText(this.hass, shown.clock.elapsed)
            : dash;
        break;
      case 'mode': {
        const on = off ? [] : r.boosts.filter((id) => this.entity(id).state === 'on');
        entity = on[0] ?? r.boosts[0] ?? view.entity;
        label = off
          ? dash
          : on.length
            ? on.map((id) => this.boostWord(view, id)).join(' · ')
            : s(this.hass, 'normal');
        const boost = on[0] ? view.found.candidates.find((item) => item.id === on[0]) : undefined;
        const which = boost ? boostOf(boost) : undefined;
        glyphName = which ? BOOST_GLYPH[which] : 'leaf';
        tint = off ? 'neutral' : on.length ? 'cool' : 'ok';
        break;
      }
      case 'alarm': {
        const need = off
          ? undefined
          : r.attention.find((item) => !item.key.startsWith('appliance.m_'));
        entity = r.roles.error ?? r.roles.door ?? view.entity;
        if (need) {
          label = attentionText(this.hass, need, now);
          glyphName = 'warn';
          tint = 'warning';
          warn = true;
        } else label = off ? dash : s(this.hass, 'no_alarm');
        break;
      }
      case 'last_brew': {
        const last = r.counters
          .map((id) => ({ id, at: Date.parse(this.hass?.states[id]?.last_changed ?? '') }))
          .filter((item) => Number.isFinite(item.at))
          .sort((a, b) => b.at - a.at)[0];
        entity = last?.id ?? r.counters[0];
        label = s(this.hass, 'last_brew');
        value = !off && last ? this.moment(last.at, now) : dash;
        break;
      }
      case 'zones': {
        const on = r.hob.filter((id) => this.plateOn(id)).length;
        entity = r.hob[0];
        label = off || !r.hob.length ? dash : s(this.hass, 'hob_on', { on, count: r.hob.length });
        break;
      }
      case 'entity': {
        entity = entry?.entity;
        const v = this.entity(entity);
        label = v.name;
        // a span (a timer's, a duration sensor's) in hours and minutes, as the hero says the time left
        const unit = SPAN[v.unit ?? ''];
        value = off
          ? dash
          : v.number !== null && unit !== undefined
            ? this.hoursMinutes(v.number * unit)
            : joined(this.valueText(entity));
        break;
      }
      default: {
        reminder = reminders.find((item) => item.key === key);
        entity = reminder?.entity;
        label = reminder?.entry?.name ?? this.reminderNoun(view, key);
        const due = reminder?.severity === 'due' || reminder?.severity === 'soon';
        value =
          off || !reminder || reminder.severity === 'unknown'
            ? dash
            : reminder.level !== undefined && !due
              ? `${this.figure(reminder.level)} %`
              : due
                ? this.t(DUE_WORD[key])
                : s(this.hass, 'ok');
        glyphName = reminder?.entry?.icon ?? MAINTENANCE_GLYPH[key];
        // due, what to do says so in the warning's ink; its circle stays quiet, as the other rows'
        warn = due && !off;
        if (warn && !reminder?.entry?.name) phrase = s(this.hass, `m_${key}`);
      }
    }
    // the card's own words for it (an empty name leaves the value to say it alone), its icon and its colour
    if (entry?.name !== undefined) label = entry.name;
    if (!label && !value) label = dash;
    return {
      key,
      glyph: entry?.icon ?? glyphName,
      tint: entry?.color ? 'accent' : tint,
      label,
      value,
      unit,
      warn,
      entity,
      entry,
      reminder,
      ...(phrase && entry?.name === undefined ? { phrase } : {}),
    };
  }

  /**
   * The rows under a hairline: a soft circle (where every row's words hold beside one; else none, together), the words
   * and the value — bold beside them, at the row's end, or one phrase with them — what is due in the warning's ink. A
   * tap opens what it says (or does the card's own for it); a reminder's hold resets it where its integration lets a
   * card, after asking.
   */
  private renderItems(view: View, items: readonly Item[]): TemplateResult {
    const style = this.config?.row_values ?? KIND_VALUES[view.kind];
    const ruler = this.head.ruler;
    const said = (item: Item): string => [item.value, item.unit].filter(Boolean).join(' ');
    const phrase = (item: Item): string =>
      (style === 'end' ? undefined : item.phrase) ??
      [item.label, said(item)].filter(Boolean).join(' ');
    const width = (item: Item): number =>
      style === 'plain' || !item.value || (item.phrase && style !== 'end')
        ? ruler.width('ap-item__text', phrase(item))
        : style === 'end'
          ? ruler.width('ap-item__text', item.label) +
            12 +
            ruler.width('ap-item__text > ap-item__value', said(item))
          : ruler.width('ap-item__text', item.label) +
            8 +
            ruler.width('ap-item__text > ap-item__value', item.value) +
            (item.unit ? ruler.width('ap-item__text', ` ${item.unit}`) : 0);
    const circles = items.every((item) => width(item) <= this.contentWidth - 40 - 16);
    // at the row's end, a value that would not hold beside its words goes under them (the circles have gone)
    const stacked = (item: Item): boolean =>
      style === 'end' && !circles && Boolean(item.value) && width(item) > this.contentWidth;
    return html`<div class="ap-items ap-items--${style}">
      ${items.map((item) => {
        const tap = (): void =>
          this.tap(item.entity, item.entry?.tap_action ?? { action: 'more-info' });
        const reset = item.reminder ? this.reminderActions(view, item.reminder).hold : undefined;
        const hold = (): void => {
          if (item.entry?.hold_action) this.hold(item.entity, item.entry.hold_action);
          else if (reset) reset();
          else this.hold(item.entity, { action: 'more-info' });
        };
        const tone = view.unavailable ? 'off' : item.tint;
        return html`<div
          class="ap-item ${item.warn ? 'is-warning' : ''} ${stacked(item) ? 'is-stacked' : ''}"
          data-accent=${this.accents.item(item.entry?.color) ?? nothing}
          role="button"
          tabindex="0"
          aria-label=${[item.label, said(item)].filter(Boolean).join(' · ')}
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          ${
            circles
              ? html`<span
                  class="fv-ico ap-item__ico ${tone === 'ok' ? 'ap-ok' : `fv-ico--${tone}`}"
                  data-icon
                  >${icon(item.glyph)}</span
                >`
              : nothing
          }
          ${
            style === 'plain' || !item.value || (item.phrase && style !== 'end')
              ? html`<span class="ap-item__text">${phrase(item)}</span>`
              : style === 'end'
                ? html`<span class="ap-item__text">${item.label}</span
                    ><span class="ap-item__value">${said(item)}</span>`
                : html`<span class="ap-item__text"
                    >${item.label} <span class="ap-item__value">${item.value}</span>${
                      item.unit ? ` ${item.unit}` : nothing
                    }</span
                  >`
          }
        </div>`;
      })}
    </div>`;
  }

  /**
   * The head: the appliance, its programme (or, for a hob, its plates on), and what it is doing in the badge — the
   * phase while it works ("Spülen"), else its state — which gives way first, and is then said at the head of the sub:
   * the state is never left unsaid. Waiting to be unloaded, the badge's place is "Unloaded"'s round.
   */
  private renderHead(view: View): TemplateResult {
    const { r, shown } = view;
    const w = this.contentWidth;
    const holds = (text: string): boolean => this.head.ruler.width('fv-card__sub', text) <= w;
    let word = busy(shown.status) && shown.phase ? shown.phase : shown.word;
    // a hob's plate on that would not hold even alone says how many are on ("1 of 4 on"); a programme or a quick mode
    // that would not gives way (the hero and the rows say it): never cut
    if (view.hero === 'hob' && r.hob.length && !holds(word))
      word = s(this.hass, 'hob_on', {
        on: r.hob.filter((id) => this.plateOn(id)).length,
        count: r.hob.length,
      });
    let detail = this.headDetail(view);
    if (!holds(detail.split(' · ')[0] ?? '')) detail = '';
    const unload = r.unload && !view.unavailable;
    // a fridge at work is what a fridge does (its state is said only when it is not that); a coffee machine's state is
    // its line's
    const quiet = (view.hero === 'cold' && shown.status === 'idle') || view.hero === 'state';
    let fitted = this.head.fit({
      width: w,
      title: view.title,
      sub: detail,
      ...(unload ? { trailing: 44 } : quiet ? {} : { badge: { text: word, tone: view.headTone } }),
    });
    if (unload || (!quiet && fitted.badge === nothing))
      fitted = this.head.fit({
        width: w,
        title: view.title,
        sub: [word, detail].filter(Boolean).join(' · '),
        ...(unload ? { trailing: 44 } : {}),
      });
    this.said = fitted.sub;
    return head({
      icon: fitted.icon ? view.glyph : null,
      small: fitted.small,
      tone: view.headTone,
      title: view.title,
      sub: fitted.sub,
      trailing: unload
        ? round('check', 'accent', s(this.hass, 'unloaded'), () => this.unloaded(view))
        : fitted.badge,
      name: true,
      cut: fitted.cut,
      ...this.headActions(view.entity, view.title),
    });
  }

  /** What the head says under the name: the programme; a fridge's quick modes on. */
  private headDetail(view: View): string {
    const { r } = view;
    switch (view.hero) {
      case 'hob':
        return '';
      case 'cold':
        return r.boosts
          .filter((id) => this.entity(id).state === 'on')
          .map((id) => this.boostWord(view, id))
          .join(' · ');
      default:
        return r.program;
    }
  }

  /** The hero of the appliance's kind. */
  private renderHero(view: View, compact: boolean): TemplateResult | typeof nothing {
    switch (view.hero) {
      case 'cycle':
        return this.renderCycle(view, compact);
      case 'heat':
        return this.renderHeat(view, compact);
      case 'plug':
        return compact ? nothing : this.renderPlug(view);
      case 'hob':
        return this.renderHob(view);
      case 'cold':
        return compact ? this.renderZoneReadouts(view) : this.renderZones(view);
      default:
        return nothing;
    }
  }

  /* ---------- the cycle ---------- */

  /** The cycle's figures as the hero says them: its progress and its time left, when it starts, when it finished. */
  private cycleFigures(view: View): { readonly main: Figure; readonly side: Figure | null } {
    const { shown, r, now } = view;
    const { clock } = shown;
    const left = durationText(this.hass, clock.left);
    const time = this.config?.time ?? 'both';
    const progress: Figure = {
      label: jobWords(this.hass, 'progress'),
      value: clock.progress !== null ? this.figure(clock.progress) : '—',
      unit: clock.progress !== null ? '%' : '',
    };
    const at = (moment: number): string => this.moment(moment, now);
    if (shown.status === 'scheduled' && r.startAt !== null)
      return {
        main: { label: s(this.hass, 'starts'), value: at(r.startAt), unit: '' },
        side: null,
      };
    if (shown.status === 'finished')
      return {
        main: { ...progress, value: this.figure(100), unit: '%' },
        side:
          shown.finishedAt !== null
            ? { label: s(this.hass, 'finished'), value: at(shown.finishedAt), unit: '' }
            : null,
      };
    if (time === 'end')
      return {
        main: progress,
        side: {
          label: s(this.hass, 'ready'),
          value: clock.at !== null && busy(shown.status) ? at(clock.at) : '—',
          unit: '',
        },
      };
    return {
      main: progress,
      side: {
        label: jobWords(this.hass, 'left'),
        value: busy(shown.status) ? left.value : '—',
        unit: busy(shown.status) ? left.unit : '',
      },
    };
  }

  /**
   * A moment as a readout says it: its time today, "Fri 05:27" another day this week or next, "yesterday" for a
   * finish before today — by the house's calendar.
   */
  private moment(at: number, now: number): string {
    const { time, days, day, ago } = when(this.hass, at, now);
    if (days === 0) return time;
    return days < 0 && ago ? ago : `${day} ${time}`;
  }

  /** Whether the hero's side readout goes under its main one: measured in every form either takes, never by state. */
  private heroStacked(): boolean {
    const time = this.config?.time ?? 'both';
    const clock = `${when(this.hass, 0, 0).day} ${when(this.hass, Date.UTC(2026, 0, 1, 23, 58), 0).time}`;
    return sideStacked(
      this.head.ruler,
      this.contentWidth,
      [
        { label: jobWords(this.hass, 'progress'), value: '100', unit: '%' },
        { label: s(this.hass, 'starts'), value: clock, unit: '' },
      ],
      [
        time === 'end'
          ? { label: s(this.hass, 'ready'), value: clock, unit: '' }
          : {
              label: jobWords(this.hass, 'left'),
              value: `88 ${this.t('time.unit_h')} 88`,
              unit: this.t('time.unit_min'),
            },
        { label: s(this.hass, 'finished'), value: clock, unit: '' },
      ],
    );
  }

  /** The cycle: its progress and time left over the bar (or its steps), its line under them. */
  private renderCycle(view: View, compact: boolean): TemplateResult | typeof nothing {
    if (this.config?.show_progress === false) return nothing;
    const { main, side } = this.cycleFigures(view);
    return html`${
      compact
        ? nothing
        : html`<div class="fv-value-row ap-top ${this.heroStacked() ? 'is-stacked' : ''}">
            ${readout({ ...main, size: 'l' })}
            ${side ? html`<div class="ap-top__side">${readout({ ...side, size: 's' })}</div>` : nothing}
          </div>`
    }
    ${this.stepsShown(view) ? this.renderSteps(view) : this.renderBar(view, this.progressOf(view))}`;
  }

  /** How far the cycle is (0–100): done is all of it, at rest none. */
  private progressOf(view: View): number {
    const { shown } = view;
    if (shown.status === 'finished') return 100;
    return busy(shown.status) ? (shown.clock.progress ?? 0) : 0;
  }

  private renderBar(
    view: View,
    progress: number,
    label = jobWords(this.hass, 'progress'),
  ): TemplateResult {
    return html`<div class="ap-bar fv-tone--${view.tone}">
      <span
        class="fv-bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${Math.round(progress)}
        aria-label=${label}
        ><span class="fv-bar__fill" data-measure="value" style="width:${progress}%"></span
      ></span>
    </div>`;
  }

  /** Whether the cycle draws its steps: asked for, or by the kind where its integration says the phase. */
  private stepsShown(view: View): boolean {
    const style = this.config?.progress_style ?? 'auto';
    const steps = KIND_DEFAULTS[view.kind].steps;
    if (!steps.length || style === 'bar') return false;
    return style === 'steps' || (!view.r.plug && Boolean(view.r.roles.phase ?? view.r.roles.state));
  }

  /**
   * The cycle's steps: a segment each, the ones done and the one under way filled (the one under way marked for a
   * reader); their words under them where every one holds its cell, else the one under way's alone, under its own
   * segment and kept inside the column — never cut.
   */
  private renderSteps(view: View): TemplateResult {
    const { r, shown } = view;
    const steps = stepsOf(view.kind, r.step);
    const current = busy(shown.status) && r.step ? steps.indexOf(r.step) : -1;
    const progress = this.progressOf(view);
    const done = shown.status === 'finished';
    const words = steps.map((step) => s(this.hass, `step_${step}`));
    const w = this.contentWidth;
    // whole pixels a segment, the pixels a division leaves over at the row's end
    const cell = Math.floor((w - 4 * (steps.length - 1)) / steps.length);
    const all = words.every((word) => this.head.ruler.width('ap-steps__label', word) <= cell);
    const fillOf = (index: number): number => {
      if (done) return 100;
      if (current >= 0) return index <= current ? 100 : 0;
      // under way with no step said: the progress across the segments
      const share = (progress / 100) * steps.length - index;
      return Math.round(Math.min(1, Math.max(0, share)) * 100);
    };
    const one = (index: number): TemplateResult => {
      const word = words[index];
      if (index < 0 || !word) return html`<span class="ap-steps__one"></span>`;
      const width = this.head.ruler.width('ap-steps__label', word);
      const centre = index * (cell + 4) + cell / 2;
      const left = Math.round(Math.min(Math.max(0, centre - width / 2), Math.max(0, w - width)));
      return html`<span class="ap-steps__one"
        ><span class="ap-steps__label is-current" style="left:${left}px">${word}</span></span
      >`;
    };
    return html`<div
      class="ap-steps fv-tone--${view.tone}"
      style="--ap-steps:${steps.length};--ap-cell:${cell}px"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${Math.round(progress)}
      aria-valuetext=${current >= 0 ? (words[current] ?? '') : `${Math.round(progress)} %`}
      aria-label=${jobWords(this.hass, 'progress')}
    >
      <div class="ap-steps__bars" data-fill-row>
        ${steps.map(
          (_step, index) =>
            html`<span class="fv-bar" aria-current=${index === current ? 'step' : nothing}
              ><span
                class="ap-steps__fill"
                data-measure="value"
                style="width:${fillOf(index)}%"
              ></span
            ></span>`,
        )}
      </div>
      ${
        all
          ? html`<div class="ap-steps__words">
              ${words.map(
                (word, index) =>
                  html`<span class="ap-steps__label ${index === current ? 'is-current' : ''}"
                    >${word}</span
                  >`,
              )}
            </div>`
          : one(current)
      }
    </div>`;
  }

  /* ---------- an oven's, a kettle's heat ---------- */

  /**
   * The heat: where the target can be set, the target with its stepper (its label says where it is now); else the
   * temperature now, the target beside it. The bar under it fills from the room's temperature to the target.
   */
  private renderHeat(view: View, compact: boolean): TemplateResult {
    const { r, shown } = view;
    const heat = r.heat;
    const unit = heat?.unit ?? this.hass?.config.unit_system.temperature ?? '°C';
    const shownValue = (n: number | null | undefined): string =>
      n === null || n === undefined ? '—' : this.figure(n);
    // what it can do, out of reach too: the stepper keeps its row (disabled, its value a dash)
    const setter = targetSetter(this.hass, r.platform, r.roles);
    const working = busy(shown.status);
    const progress = heat?.ready && working ? 100 : working ? (heat?.progress ?? 0) : 0;
    if (compact) return this.renderBar(view, progress, s(this.hass, 'status_preheating'));
    const target = r.roles.target;
    if (setter && target) {
      const value = this.nudges.shown(target, heat?.target ?? null);
      const now = heat?.current !== null && heat?.current !== undefined;
      const label = s(this.hass, 'target');
      const labels = now
        ? [
            `${label} · ${s(this.hass, 'zone_now', { value: `${shownValue(heat?.current)}°` })}`,
            label,
          ]
        : [label];
      const figures = [setter.min, setter.max]
        .filter((n): n is number => n !== undefined)
        .map((n) => ({ value: this.figure(n), unit }));
      const fit = fitValueRow(this.head.ruler, {
        width: this.contentWidth,
        control: STEPPER,
        narrow: STEPPER_HALVES,
        labels,
        figures: figures.length ? figures : [{ value: '888', unit }],
      });
      return html`<div class="${valueRowClass(fit.layout)} ap-top">
          ${readout({ label: fit.label, value: typeof value === 'number' ? this.figure(value) : '—', unit: typeof value === 'number' ? unit : '', size: fit.size })}
          ${fit.layout === 'alone' ? nothing : this.stepperFor(target, setter, value, label)}
        </div>
        ${this.renderBar(view, progress, s(this.hass, 'status_preheating'))}`;
    }
    const main: Figure = {
      label: s(this.hass, 'r_temperature'),
      value: shownValue(heat?.current),
      unit: heat?.current !== null && heat?.current !== undefined ? unit : '',
    };
    const side: Figure = {
      label: s(this.hass, 'target'),
      value: shownValue(heat?.target),
      unit: heat?.target !== null && heat?.target !== undefined ? unit : '',
    };
    const stacked = sideStacked(
      this.head.ruler,
      this.contentWidth,
      [{ ...main, value: '888', unit }],
      [{ ...side, value: '888', unit }],
    );
    return html`<div class="fv-value-row ap-top ${stacked ? 'is-stacked' : ''}">
        ${readout({ ...main, size: 'l' })}
        <div class="ap-top__side">${readout({ ...side, size: 's' })}</div>
      </div>
      ${this.renderBar(view, progress, s(this.hass, 'status_preheating'))}`;
  }

  /**
   * A setpoint's stepper: a step shown at once and held, the setpoint sent once the taps settle (one call, the
   * appliance's cloud counts them); a level select steps through its levels.
   */
  private stepperFor(
    entity: string,
    setter: Setter,
    value: number | string | null,
    name: string,
  ): TemplateResult {
    const step = (direction: 1 | -1): void => {
      const next = stepped(setter, value, direction);
      if (next === null || next === value) return;
      this.nudges.step(entity, next, (settled) => this.run(callOf(setter, entity, settled)));
    };
    return stepper(step, {
      disabled: value === null,
      decrease: `${name} · ${this.t('common.decrease')}`,
      increase: `${name} · ${this.t('common.increase')}`,
    });
  }

  /* ---------- a plug ---------- */

  /** A plug's appliance: what it draws now, and what this cycle has used. */
  private renderPlug(view: View): TemplateResult {
    const watts = this.valueText(view.r.roles.watts);
    const main: Figure = { label: s(this.hass, 'r_power'), value: watts.value, unit: watts.unit };
    const side: Figure = {
      label: s(this.hass, 'r_this_cycle'),
      value: view.used !== null && !view.unavailable ? this.kwh(view.used) : '—',
      unit: view.used !== null && !view.unavailable ? 'kWh' : '',
    };
    const stacked = sideStacked(
      this.head.ruler,
      this.contentWidth,
      [{ ...main, value: '8888', unit: 'W' }],
      [{ ...side, value: '88.88', unit: 'kWh' }],
    );
    return html`<div class="fv-value-row ap-top ${stacked ? 'is-stacked' : ''}">
      ${readout({ ...main, size: 'l' })}
      <div class="ap-top__side">${readout({ ...side, size: 's' })}</div>
    </div>`;
  }

  /* ---------- a hob ---------- */

  /** Whether a plate cooks: a level above none, in any integration's words. */
  private plateOn(id: string): boolean {
    const v = this.entity(id);
    if (v.status !== 'ok') return false;
    if (v.number !== null) return v.number > 0;
    return !/^(off|0|none|plate_step_0|power_off|inactive)$/i.test(v.state);
  }

  /** A hob's plates: a hairline cell each, lit while it cooks, as many a row as hold their words (`plateColumns`). */
  private renderHob(view: View): TemplateResult | typeof nothing {
    const plates = view.r.hob;
    if (!plates.length) return nothing;
    const words = plates.map((id) => {
      const v = this.entity(id);
      return v.status === 'ok' ? stateText(this.hass, v) : '—';
    });
    const { columns, gap } = hobCells(
      words.map((word) => this.head.ruler.width('ap-cell', word)),
      this.contentWidth,
    );
    return html`<div
      class="ap-cells fv-tone--heat"
      data-fill-row
      style="--ap-cells:${columns};--ap-gap:${gap}px"
    >
      ${plates.map((id, index) => {
        const on = this.plateOn(id);
        const name = `${s(this.hass, 'plate', { n: index + 1 })} · ${words[index] ?? ''}`;
        return html`<button
          class="ap-cell ${on ? 'is-on' : ''}"
          data-target
          aria-label=${name}
          title=${name}
          @click=${() => this.tap(id, { action: 'more-info' })}
        >
          <span>${words[index]}</span>
        </button>`;
      })}
    </div>`;
  }

  /* ---------- a fridge's compartments ---------- */

  /** The compartments, as the card lists them (its own, in its order), else as found, the fridge first. */
  private zonesShown(view: View): ZoneShown[] {
    const found = view.r.zones;
    const entries = this.zoneEntries();
    const shownOf = (zone: Zone, entry?: ZoneEntry): ZoneShown => ({
      kind: zone.kind,
      label:
        entry?.name ?? `${s(this.hass, `zone_${zone.kind}`)}${zone.index ? ` ${zone.index}` : ''}`,
      entity: zone.setpoint ?? zone.current ?? '',
      current: zone.current !== zone.setpoint ? zone.current : undefined,
      setpoint: zone.setpoint,
      entry,
    });
    if (!entries.length) return found.map((zone) => shownOf(zone));
    return entries.map((entry) => {
      const zone = found.find((item) =>
        [item.setpoint, item.current, item.door].includes(entry.entity),
      );
      if (zone) return shownOf(zone, entry);
      const domain = entry.entity.slice(0, entry.entity.indexOf('.'));
      const setting = domain === 'number' || domain === 'climate' || domain === 'select';
      return shownOf(
        {
          kind: 'zone',
          ...(setting ? { setpoint: entry.entity } : { current: entry.entity }),
        },
        entry,
      );
    });
  }

  /** A compartment's reading now ("4.2°"), from its sensor, or its climate's own; none where it has none. */
  private zoneNow(zone: ZoneShown): string {
    const id = zone.current ?? (zone.setpoint?.startsWith('climate.') ? zone.setpoint : undefined);
    if (!id) return '';
    const v = this.entity(id);
    const n = v.domain === 'climate' ? v.attr<number | null>('current_temperature') : v.number;
    return v.status === 'ok' && typeof n === 'number' ? `${this.figure(n, 1)}°` : '';
  }

  /** A compartment's setpoint as it shows: the value stepped to while it is on its way, else the one reported. */
  private zoneValue(zone: ZoneShown): number | string | null {
    if (!zone.setpoint) {
      const v = this.entity(zone.current);
      return v.status === 'ok' ? (v.number ?? null) : null;
    }
    return this.nudges.shown(zone.setpoint, setpointOf(this.hass?.states[zone.setpoint]));
  }

  private zoneUnit(zone: ZoneShown): string {
    const v = this.entity(zone.setpoint ?? zone.current);
    return v.domain === 'climate' || v.domain === 'select'
      ? v.domain === 'climate'
        ? (this.hass?.config.unit_system.temperature ?? '°C')
        : ''
      : (v.unit ?? '');
  }

  /** A compartment's value as the readout writes it: a temperature's figure, a level's word. */
  private zoneText(zone: ZoneShown, value: number | string | null): string {
    if (value === null) return '—';
    if (typeof value === 'number') return this.figure(value, Number.isInteger(value) ? 0 : 1);
    return optionWord(this.hass, this.hass?.states[zone.setpoint ?? ''], value);
  }

  /** A compartment's tap and hold: the card's own for it, else its details. */
  private zoneActions(zone: ZoneShown): { readonly tap: () => void; readonly hold: () => void } {
    return {
      tap: () => this.tap(zone.entity, zone.entry?.tap_action ?? { action: 'more-info' }),
      hold: () => this.hold(zone.entity, zone.entry?.hold_action ?? { action: 'more-info' }),
    };
  }

  /**
   * The compartments, one row each: its circle (where the row holds it), its name with its reading now, its setpoint
   * at m, and its stepper on the setpoint's line; a narrow column stacks them as every value row does. A fridge whose
   * integration only says its setpoints (LG's, Home Connect's) says them alone.
   */
  private renderZones(view: View): TemplateResult {
    const zones = this.zonesShown(view);
    // the steppers stay out of reach (disabled, their values a dash): the rows stack alike, live or not
    const steppers = this.config?.setpoint_style !== 'readout';
    return html`${zones.map((zone, index) => {
      const value = this.zoneValue(zone);
      const unit = this.zoneUnit(zone);
      const now = this.zoneNow(zone);
      const setter =
        steppers && zone.setpoint
          ? zoneSetter(this.hass, view.r.platform, stateOf(this.hass, zone.setpoint))
          : undefined;
      const labels = now
        ? [`${zone.label} · ${s(this.hass, 'zone_now', { value: now })}`, zone.label]
        : [zone.label];
      const figures = setter?.options
        ? setter.options.map((level) => ({ value: this.zoneText(zone, level), unit }))
        : [setter?.min ?? -24, setter?.max ?? 8].map((n) => ({ value: this.figure(n), unit }));
      const spec = (width: number) =>
        fitValueRow(this.head.ruler, {
          width,
          control: setter ? STEPPER : 0,
          narrow: STEPPER_HALVES,
          labels,
          figures,
        });
      // the circle where the row keeps its value beside its stepper with it, else the row's room to the value
      const withCircle = spec(this.contentWidth - 56);
      const circle = withCircle.layout === 'beside' && this.showIcon !== 'never';
      const fit = circle ? withCircle : spec(this.contentWidth);
      const { tap, hold } = this.zoneActions(zone);
      const accent = this.accents.item(zone.entry?.color);
      return html`<div
        class="${valueRowClass(fit.layout)} ap-zone ${index ? '' : 'is-first'}"
        data-accent=${accent ?? nothing}
      >
        <div
          class="ap-zone__read"
          data-align=${fit.layout === 'stack' || fit.layout === 'halves' ? 'center' : nothing}
          role="button"
          tabindex="0"
          aria-label=${`${zone.label} · ${this.zoneText(zone, value)}${value === null ? '' : ` ${unit}`}`}
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          ${circle ? ico(zone.entry?.icon ?? ZONE_GLYPH[zone.kind] ?? 'thermo', accent ? 'accent' : 'cool') : nothing}
          ${readout({ label: fit.label, value: this.zoneText(zone, value), unit: value === null ? '' : unit, size: fit.size })}
        </div>
        ${setter && zone.setpoint && fit.layout !== 'alone' ? this.stepperFor(zone.setpoint, setter, value, zone.label) : nothing}
      </div>`;
    })}`;
  }

  /** The compartments as readouts side by side (compact): each its setpoint, centred, a tap opening it. */
  private renderZoneReadouts(view: View): TemplateResult | typeof nothing {
    const zones = this.zonesShown(view);
    if (!zones.length) return nothing;
    const items = zones.map((zone) => {
      const value = this.zoneValue(zone);
      return {
        zone,
        label: zone.label,
        value: this.zoneText(zone, value),
        unit: value === null ? '' : this.zoneUnit(zone),
      };
    });
    const row = statsRow(this.head.ruler, this.contentWidth, items);
    return html`<div
      class="fv-cols ap-zones-row ${row.odd ? 'fv-cols--odd' : ''}"
      style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
    >
      ${items.map(({ zone, label, value, unit }) => {
        const { tap, hold } = this.zoneActions(zone);
        return html`<div
          class="ap-stat"
          role="button"
          tabindex="0"
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          ${readout({ label, value, unit, size: 'xs', name: true })}
        </div>`;
      })}
    </div>`;
  }

  /** A quick mode's word: the card's, by the switch's key. */
  private boostWord(view: View, id: string): string {
    const candidate = view.found.candidates.find((item) => item.id === id);
    const key = candidate ? boostOf(candidate) : undefined;
    return key ? s(this.hass, `mode_${key}`) : this.entity(id).name;
  }

  /** A fridge's quick modes: chips that fill the row (or tiles), on in the cold's fill; a tap switches one. */
  private renderModes(view: View): TemplateResult | typeof nothing {
    const { r } = view;
    if (!r.boosts.length) return nothing;
    const keyed = r.boosts.map((id) => {
      const candidate = view.found.candidates.find((item) => item.id === id);
      return { id, key: candidate ? boostOf(candidate) : undefined };
    });
    const wanted = this.config?.modes;
    const shown = wanted
      ? wanted.flatMap((key) => keyed.filter((item) => item.key === key))
      : keyed;
    if (!shown.length) return nothing;
    const toggle = (id: string): void => {
      const on = this.entity(id).state === 'on';
      const call = boostCall(r.platform, id, !on);
      if (!call) {
        this.tap(id, { action: 'more-info' });
        return;
      }
      this.expect(id, on ? 'off' : 'on');
      this.run(call);
    };
    const items = shown.map(({ id, key }) => {
      const v = this.entity(id);
      return {
        key: id,
        label: key ? s(this.hass, `mode_${key}`) : v.name,
        glyph: key ? BOOST_GLYPH[key] : 'snow',
        active: this.stateOf(v) === 'on',
        unavailable: v.status !== 'ok',
        tone: 'cool' as const,
      };
    });
    const labels = items.map((item) => item.label);
    const measure = (label: string): number =>
      this.head.ruler.width('fv-option > fv-option__label', label);
    if (this.config?.modes_style === 'tiles' && optionsHold(labels, this.contentWidth, 4, measure))
      return html`<div class="ap-modes fv-tone--cool">
        ${options(items, toggle, 4, 84, optionColumnsFor(labels, this.contentWidth, 4, measure))}
      </div>`;
    const columns = this.chipColumns(labels);
    return html`<div class="ap-modes">
      ${chips(
        items.map((item) => ({ ...item, short: columns.short })),
        toggle,
        '',
        true,
        columns.columns,
      )}
    </div>`;
  }

  /**
   * The columns of a full chip row, measured: as many a row as hold their words with their glyphs (a chip's 14 sides,
   * its glyph and gap), from four a row down to one; where not even one holds them, the glyphs alone, as many a row as
   * keep each a finger's 44 — a word is never cut.
   */
  private chipColumns(labels: readonly string[]): ChipFit {
    return chipFit(
      labels.map((label) => this.head.ruler.width('fv-chip', label)),
      this.contentWidth,
    );
  }

  /* ---------- the line, the second unit ---------- */

  /**
   * The line under the hero: what asks for attention, most pressing first, in the warning's ink — why it failed, a
   * door left open, a load to take out, what to look after (where the reminders are the line's); else when it will
   * be ready, starts or finished, how long it has run, its programme; else what it is doing. Its parts after the first
   * are left out whole where they do not fit, then the first says its shorter form ("76 %" for "Preheating 76 %",
   * "Machine care" for "Run machine care"): a figure is never cut.
   */
  private renderLine(view: View): TemplateResult {
    const { r } = view;
    const reminders = this.config?.show_maintenance !== false;
    const attention = view.unavailable
      ? []
      : r.attention.filter((item) => reminders || !item.key.startsWith('appliance.m_'));
    const warning = attention.length > 0;
    const { parts, briefs } = warning ? this.needWords(view, attention) : this.statusParts(view);
    const width = (text: string): number => this.head.ruler.width('ap-line', text);
    const line = fitParts(parts, briefs, this.contentWidth, width);
    // one line, whatever it says: cut, the whole is its title
    const whole = parts.map((part) => part.text).join(' · ');
    return html`<span
      class="ap-line ${warning ? 'is-warning' : ''}"
      title=${line !== whole || width(line) > this.contentWidth ? whole : nothing}
      >${line}</span
    >`;
  }

  /**
   * What the line says when nothing asks for attention: a cycle's when (and, compact, its progress and time left);
   * an oven's heat on its way; a hob's plates on; a fridge's door; what a plug's appliance has done — the programme
   * where the head does not say it, how long it has run where no readout does. The first part said whole, the rest
   * optional; the first's shorter form its status's word.
   */
  private statusParts(view: View): Words {
    const said = this.statusSaid(view);
    const [first = ''] = said;
    const { shown } = view;
    const status = this.t(view.r.statusWord);
    // an oven's heat on its way says how far it is, whole ("76 %": the head says it heats), what it does its status's
    // word
    const preheating = `${s(this.hass, 'status_preheating')} `;
    const briefs = first.startsWith(preheating)
      ? [first.slice(preheating.length)]
      : first === shown.word || first === shown.phase
        ? [status].filter((word) => word !== first)
        : [];
    return { parts: said.map((text, index) => ({ text, optional: index > 0 })), briefs };
  }

  private statusSaid(view: View): string[] {
    const { r, shown, now } = view;
    const time = this.config?.time ?? 'both';
    const compact = this.variant === 'compact';
    const ring = this.variant === 'ring';
    const program = r.program && !this.said.includes(r.program) ? r.program : '';
    const elapsed = !this.readoutKeys.has('elapsed');
    switch (view.hero) {
      case 'hob': {
        const on = r.hob.filter((id) => this.plateOn(id)).length;
        return [r.hob.length ? s(this.hass, 'hob_on', { on, count: r.hob.length }) : shown.word];
      }
      case 'cold':
        return [r.door ? s(this.hass, r.door.open ? 'door_open' : 'door_closed') : shown.word];
      case 'state':
        return [shown.word, program].filter(Boolean);
      default:
        break;
    }
    // a ring's dial says when it will be ready where its disc holds it
    const when = whenParts(
      this.hass,
      shown,
      r.startAt,
      now,
      ring && this.dialSaid ? 'left' : time,
      elapsed,
    );
    const left =
      busy(shown.status) && shown.clock.left !== null && (compact || time === 'left')
        ? leftText(this.hass, shown.clock.left)
        : '';
    if (view.hero === 'heat' && busy(shown.status) && r.heat) {
      const heat = r.heat.ready
        ? s(this.hass, 'status_at_temperature')
        : r.heat.progress !== null
          ? `${s(this.hass, 'status_preheating')} ${this.figure(r.heat.progress)} %`
          : shown.word;
      return [heat, left, ...when, program].filter(Boolean);
    }
    const progress =
      busy(shown.status) && shown.clock.progress !== null && (compact || ring)
        ? `${this.figure(shown.clock.progress)} %`
        : '';
    const parts = [progress, left, ...when].filter(Boolean);
    return parts.length
      ? [...parts, program].filter(Boolean)
      : [shown.word, program].filter(Boolean);
  }

  /**
   * A second drum or cavity, as a line under the first: its unit, what it does, its time. Where it would not hold, its
   * time gives way, then what it does says its status's word, then the dot after its unit goes and last its unit
   * (its title says it): never cut.
   */
  private renderTwin(view: View): TemplateResult | typeof nothing {
    const twin = view.r.twin;
    if (!twin || (this.config?.unit ?? 'both') !== 'both') return nothing;
    const status = s(this.hass, `status_${twin.status}`);
    const word = twin.word || status;
    const parts = [
      busy(twin.status) && twin.phase ? twin.phase : word,
      busy(twin.status) && twin.clock.left !== null ? leftText(this.hass, twin.clock.left) : '',
      twin.status === 'finished' && twin.finishedAt !== null
        ? whenText(this.hass, 'done', twin.finishedAt, view.now)
        : '',
    ].filter(Boolean);
    const segments = parts.map((text, index) => ({ text, optional: index > 0 }));
    const briefs = parts[0] === status ? [] : [status];
    const name = s(this.hass, `unit_${twin.unit}`);
    const width = (text: string): number => this.head.ruler.width('ap-twin-line', text);
    // its unit and the dot, measured with the space after them (a no-break one: a line's last space is not laid)
    let unit = '';
    let room = 0;
    let line = '';
    for (unit of [`${name} ·\u00a0`, `${name}\u00a0`, '']) {
      room =
        this.contentWidth -
        (unit ? this.head.ruler.width('ap-twin-line > ap-twin-line__unit', unit) : 0);
      line = fitParts(segments, briefs, room, width);
      if (width(line) <= room) break;
    }
    const whole = parts.join(' · ');
    return html`<span
      class="ap-twin-line"
      title=${
        line !== whole || !unit.includes('·') || width(line) > room ? `${name} · ${whole}` : nothing
      }
      >${unit ? html`<b class="ap-twin-line__unit">${unit}</b>` : nothing}${line}</span
    >`;
  }

  /* ---------- the dial ---------- */

  /** A dial's radius in its share of the column, on the 4 grid. */
  private radius(width: number): number {
    return Math.min(RING_MAX, Math.max(RING_MIN, Math.floor((width / 2 - RING_TICK - 12) / 4) * 4));
  }

  /**
   * The dial: the time left in its disc, how far the cycle is as its lit ticks, when it will be ready under; an
   * oven's temperature on its way to its target; what a plug draws. A fridge's compartments each a dial, side by
   * side where two hold their smallest, else its rows.
   */
  private renderDial(view: View): TemplateResult | typeof nothing {
    const hero = view.hero;
    if (hero === 'cold') return this.renderZoneDials(view);
    const { r, shown, now } = view;
    const radius = this.radius(this.contentWidth);
    const tone = view.tone;
    let label = jobWords(this.hass, 'left');
    let text = '—';
    let unit = '';
    let sub = '';
    let fill = 0;
    if (hero === 'cycle') {
      fill = this.progressOf(view) / 100;
      if (busy(shown.status) && shown.clock.left !== null) {
        const left = durationText(this.hass, shown.clock.left);
        text = left.value;
        unit = left.unit;
        sub = shown.clock.at !== null ? whenText(this.hass, 'ready', shown.clock.at, now) : '';
      } else if (shown.status === 'scheduled' && r.startAt !== null) {
        label = s(this.hass, 'starts');
        text = this.moment(r.startAt, now);
      } else if (shown.status === 'finished' && shown.finishedAt !== null) {
        label = s(this.hass, 'finished');
        text = this.moment(shown.finishedAt, now);
      } else sub = shown.word;
    } else if (hero === 'heat') {
      const heat = r.heat;
      label = s(this.hass, 'r_temperature');
      text =
        heat?.current !== null && heat?.current !== undefined ? this.figure(heat.current) : '—';
      unit = text === '—' ? '' : (heat?.unit ?? '');
      fill = busy(shown.status) ? (heat?.ready ? 1 : (heat?.progress ?? 0) / 100) : 0;
      sub =
        heat?.target !== null && heat?.target !== undefined
          ? `${s(this.hass, 'target')} ${this.figure(heat.target)} ${heat.unit}`
          : shown.word;
    } else {
      const watts = this.valueText(r.roles.watts);
      label = s(this.hass, 'r_power');
      text = watts.value;
      unit = watts.unit;
      sub =
        view.used !== null
          ? `${s(this.hass, 'r_this_cycle')} ${this.kwh(view.used)} kWh`
          : shown.word;
    }
    // the sub inside the disc while it holds it, else said by the line under the dial
    const disc = Math.floor((radius - 10) / 4) * 8 - 16;
    const inside = this.head.ruler.width('fv-dial__sub', sub) <= disc;
    this.dialSaid = inside && hero === 'cycle' && sub !== '' && sub !== shown.word;
    return html`<div class="ap-dial">
      ${this.dial(radius, tone, fill, label, text, unit, inside ? sub : '', view.unavailable)}
    </div>`;
  }

  /**
   * A gauge dial: its ticks lit to `fill`, `label` over the figure (its unit beside it, as the dial draws a value's),
   * `sub` under it; a dash alone where there is no figure.
   */
  private dial(
    radius: number,
    tone: Tone,
    fill: number,
    label: string,
    text: string,
    unit: string,
    sub: string,
    off: boolean,
  ): TemplateResult {
    const dash = text === '—';
    return html`<fluvy-dial
      gauge
      .radius=${radius}
      .tick=${RING_TICK}
      .large=${true}
      .stepper=${false}
      .tone=${off ? 'neutral' : tone}
      .min=${0}
      .max=${1}
      .fill=${Math.min(1, Math.max(0, fill))}
      .value=${dash ? undefined : fill}
      .format=${dash ? undefined : () => text}
      .text=${dash ? text : undefined}
      .unit=${dash ? '' : unit}
      .label=${label}
      .sub=${sub}
      ?disabled=${off}
    ></fluvy-dial>`;
  }

  /** A fridge's compartments as dials, side by side where two hold their smallest, else its rows. */
  private renderZoneDials(view: View): TemplateResult {
    const zones = this.zonesShown(view).slice(0, 2);
    const w = this.contentWidth;
    const each = zones.length > 1 ? Math.floor(w / zones.length) : w;
    const box = (r: number): number => Math.ceil((r + RING_TICK + 12) / 4) * 8;
    if (zones.length > 1 && box(RING_MIN) > each) return this.renderZones(view);
    const radius = this.radius(each);
    return html`<div class="ap-dial">
      ${zones.map((zone) => {
        const value = this.zoneValue(zone);
        const setter = zone.setpoint
          ? zoneSetter(this.hass, view.r.platform, stateOf(this.hass, zone.setpoint))
          : undefined;
        const min = setter?.min ?? -24;
        const max = setter?.max ?? 8;
        const fill = typeof value === 'number' && max > min ? (value - min) / (max - min) : 0;
        const now = this.zoneNow(zone);
        return this.dial(
          radius,
          'cool',
          fill,
          zone.label,
          this.zoneText(zone, value),
          value === null ? '' : this.zoneUnit(zone),
          now ? s(this.hass, 'zone_now', { value: now }) : '',
          view.unavailable,
        );
      })}
    </div>`;
  }

  /* ---------- the readouts ---------- */

  /** The readouts the card names (or its kind's), those the appliance has; its counters; the card's own sensors. */
  private stats(view: View): Stat[] {
    const { r, shown } = view;
    const wanted =
      this.config?.readouts ??
      (r.plug
        ? this.variant === 'compact'
          ? (['power', 'this_cycle'] as const)
          : []
        : KIND_DEFAULTS[view.kind].readouts.filter((key) => key !== 'program'));
    const out: Stat[] = [];
    const add = (
      key: ApplianceReadout,
      label: string,
      value: { value: string; unit: string },
      entity?: string,
    ): void => {
      out.push({ key, label, value: value.value, unit: value.unit, entity });
    };
    for (const key of wanted) {
      const id = r.readouts[key];
      switch (key) {
        case 'elapsed':
          // how long it has run: its own count, else what its job's times say (a dash at rest)
          if (id || r.roles.state || r.roles.finish || r.roles.remaining || r.roles.start_at)
            add(
              key,
              jobWords(this.hass, 'elapsed'),
              durationText(this.hass, busy(shown.status) ? shown.clock.elapsed : null),
              id,
            );
          break;
        case 'total':
          if (id)
            add(
              key,
              s(this.hass, 'r_total'),
              durationText(this.hass, shown.clock.total ?? null),
              id,
            );
          break;
        case 'this_cycle':
          if (id)
            add(
              key,
              s(this.hass, 'r_this_cycle'),
              view.used !== null && !view.unavailable
                ? { value: this.kwh(view.used), unit: 'kWh' }
                : { value: '—', unit: '' },
              id,
            );
          break;
        case 'program':
          if (id) add(key, s(this.hass, 'r_program'), { value: r.program || '—', unit: '' }, id);
          break;
        case 'probe':
          if (id) {
            const probe = this.valueText(id);
            const target = r.roles.probe_target ? this.valueText(r.roles.probe_target) : null;
            add(
              key,
              s(this.hass, 'r_probe'),
              target && target.value !== '—' && probe.value !== '—'
                ? { value: `${probe.value} / ${target.value}`, unit: probe.unit }
                : probe,
              id,
            );
          }
          break;
        default:
          if (id) add(key, s(this.hass, `r_${key}`), this.valueText(id), id);
      }
    }
    // the device's own name, as Home Assistant puts it at the head of its entities' names
    const device = view.found.device ? this.hass?.devices?.[view.found.device] : undefined;
    const deviceName = device?.name_by_user || device?.name || '';
    for (const id of r.counters)
      out.push({
        label: ownWords(this.entity(id).name, deviceName),
        ...this.valueText(id),
        entity: id,
      });
    for (const sensor of this.sensors())
      out.push({
        label: sensor.name ?? ownWords(this.entity(sensor.entity).name, deviceName),
        ...this.valueText(sensor.entity),
        entity: sensor.entity,
      });
    return out.slice(0, MOST_READOUTS);
  }

  /** The readouts in equal columns, as many a row as hold every label and figure; compact at the extra-small size. */
  private renderReadouts(
    stats: readonly Stat[],
    compact: boolean,
  ): TemplateResult | typeof nothing {
    if (!stats.length) return nothing;
    const row = statsRow(this.head.ruler, this.contentWidth, stats);
    const size = compact ? 'xs' : row.size;
    return html`<div
      class="fv-cols ap-cols ${row.odd ? 'fv-cols--odd' : ''}"
      style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
    >
      ${stats.map((stat) => this.renderStat(stat, size))}
    </div>`;
  }

  /** A readout that opens its entity on a tap. */
  private renderStat(stat: Stat, size: 's' | 'xs'): TemplateResult {
    const open = (): void => {
      if (stat.entity) this.tap(stat.entity, { action: 'more-info' });
    };
    return html`<div
      class="ap-stat"
      role=${stat.entity ? 'button' : nothing}
      tabindex=${stat.entity ? 0 : nothing}
      data-readout=${stat.key ?? nothing}
      @click=${open}
      @keydown=${activateKey(open)}
    >
      ${readout({
        label: stat.label,
        value:
          stat.key === 'program'
            ? html`<span class="ap-program" data-name title=${stat.value}>${stat.value}</span>`
            : stat.value,
        unit: stat.unit,
        size,
        name: !stat.key,
      })}
    </div>`;
  }

  /* ---------- the reminders ---------- */

  /**
   * The reminders: one a thing (salt, rinse aid, a filter), each by the entity that says it — so the list is the
   * appliance's, never its state's — in the card's order and words where it names them, with the reset its integration
   * lets a card press.
   */
  private reminders(view: View): Reminder[] {
    const { found, r } = view;
    const entities = new Map<MaintenanceKey, string>();
    const resets = new Map<MaintenanceKey, string>();
    for (const candidate of found.candidates) {
      if (!found.entities.maintenance.includes(candidate.id)) continue;
      const spec = maintenanceOf(candidate);
      if (!spec) continue;
      if (spec.form === 'reset') {
        if (resetCall(r.platform, candidate.id)) resets.set(spec.key, candidate.id);
      } else if (!entities.has(spec.key)) entities.set(spec.key, candidate.id);
    }
    const entries = (this.config?.maintenance ?? []).map((entry) =>
      typeof entry === 'string' ? { key: entry } : entry,
    );
    const keys = entries.length
      ? entries.map((entry) => entry.key).filter((key) => entities.has(key))
      : MAINTENANCE_KEYS.filter((key) => entities.has(key));
    return keys.map((key) => {
      const item = r.maintenance.find((said) => said.key === key);
      return {
        key,
        entity: entities.get(key),
        reset: resets.get(key),
        severity: view.unavailable ? 'unknown' : (item?.severity ?? 'unknown'),
        level: item?.level,
        entry: entries.find((entry) => entry.key === key),
      };
    });
  }

  /** A reminder's tap (its details, unless the card says otherwise) and hold (its reset, after asking, where pinned). */
  private reminderActions(
    view: View,
    item: Reminder,
  ): { readonly tap: () => void; readonly hold: () => void } {
    const reset = item.reset ? resetCall(view.r.platform, item.reset) : undefined;
    return {
      tap: () => this.tap(item.entity, item.entry?.tap_action ?? { action: 'more-info' }),
      hold: () => {
        if (item.entry?.hold_action) this.hold(item.entity, item.entry.hold_action);
        else if (reset) this.ask(reset, s(this.hass, 'confirm_reset'));
        else this.hold(item.entity, { action: 'more-info' });
      },
    };
  }

  /* ---------- the programmes, the buttons ---------- */

  /** The programmes to choose from, as chips (asked for): the one chosen on; chosen at rest only. */
  private renderPrograms(view: View): TemplateResult | typeof nothing {
    if (!this.config?.show_programs) return nothing;
    const { r } = view;
    const id = r.roles.program;
    if (!id || !id.startsWith('select.')) return nothing;
    const state = stateOf(this.hass, id);
    const list = state?.attributes['options'];
    const choices = Array.isArray(list)
      ? list.filter((item): item is string => typeof item === 'string')
      : [];
    if (!choices.length) return nothing;
    const choice = r.programs;
    const words = choices.map((option) => optionWord(this.hass, state, option));
    const columns = this.chipColumns(words);
    return html`<div class="ap-programs">
      ${chips(
        choices.map((option, index) => ({
          key: option,
          label: words[index] ?? option,
          active: (choice?.current ?? state?.state) === option,
          disabled: !choice || view.unavailable,
        })),
        (option) => {
          if (choice) this.run(programCall(choice, option));
        },
        '',
        true,
        columns.columns,
      )}
    </div>`;
  }

  /** The action row: its cells on whole pixels, 44 at least; four go two by two where one row would go under 44. */
  private renderActions(view: View): TemplateResult | typeof nothing {
    const cells = this.cells(view);
    if (!cells.length) return nothing;
    const { gap, columns } = sharedGap(this.contentWidth, [cells.length], [16, 12, 8, 4]);
    return html`<div
      class="ap-actions"
      data-fill-row
      style="--ap-actions:${columns[0] ?? cells.length};--ap-gap:${gap}px"
    >
      ${cells.map((cell) => {
        const command = cell.command;
        const blocked = command?.blocked ? this.t(BLOCKED[command.blocked]) : '';
        const label = command ? this.t(command.label) : cell.label;
        const title = blocked ? `${label} · ${blocked}` : label;
        return html`<button
          class="fv-action ${cell.primary && command && !command.blocked ? 'fv-action--accent' : ''} ${cell.on ? 'is-on' : ''}"
          data-control
          data-target
          data-action=${cell.control}
          aria-label=${title}
          title=${title}
          ?disabled=${!command || Boolean(command.blocked)}
          @click=${() => {
            if (command) this.command(command);
          }}
        >
          ${glyph(command?.action === 'pause' ? 'pause' : cell.glyph)}
        </button>`;
      })}
    </div>`;
  }

  /* ---------- the row ---------- */

  /** What a row says of its hero: a fridge's setpoints ("4° · −18°"), an oven's heat ("142° → 180°"), a plug's watts. */
  private rowSummary(view: View): string {
    const degrees = (n: number | null | undefined): string =>
      n === null || n === undefined ? '—' : `${this.figure(n)}°`;
    switch (view.hero) {
      case 'cold':
        return this.zonesShown(view)
          .map((zone) => this.zoneValue(zone))
          .filter((value): value is number => typeof value === 'number')
          .map((value) => degrees(value))
          .join(' · ');
      case 'heat':
        return view.r.heat && busy(view.shown.status)
          ? `${degrees(view.r.heat.current)} → ${degrees(view.r.heat.target)}`
          : '';
      case 'plug': {
        const watts = this.valueText(view.r.roles.watts);
        return busy(view.shown.status) && watts.value !== '—' ? `${watts.value} ${watts.unit}` : '';
      }
      default:
        return '';
    }
  }

  /**
   * The row's round, the one that matters now: "Unloaded" while a load waits; start, resume or pause where the
   * appliance runs cycles a card can start; else its power round (what a toaster or a kettle on a plug has).
   */
  private rowRound(view: View): TemplateResult | typeof nothing {
    const { r } = view;
    if (this.config?.show_power === false) return nothing;
    if (r.unload && !view.unavailable)
      return round('check', 'accent', s(this.hass, 'unloaded'), () => this.unloaded(view));
    const cell = this.cells(view).find((item) => item.primary);
    if (!cell)
      return r.roles.power || r.plug || KIND_DEFAULTS[view.kind].controls.includes('power')
        ? this.powerRound(view, 'ap-power--row')
        : nothing;
    const primary = cell.command && !cell.command.blocked ? cell.command : undefined;
    return round(
      primary?.action === 'pause' ? 'pause' : 'play',
      primary ? 'accent' : 'quiet',
      primary ? this.t(primary.label) : cell.label,
      () => {
        if (primary) this.command(primary);
      },
      !primary,
    );
  }

  /**
   * One row: the appliance's picture (or its circle ringed by its progress), its name over what it does, and the round
   * that matters now. The row is the card's button (the head's rule), the round raised beside it. What gives way in a
   * narrow row, in order: the line's trailing parts, the round, then the picture (the circle and its ring); the state
   * is never cut.
   */
  private renderRow(view: View): TemplateResult {
    const { r, shown } = view;
    const word = busy(shown.status) && shown.phase ? shown.phase : shown.word;
    const art = (this.config?.picture ?? 'art') === 'art';
    // the picture's box: 64, 44 before a letter of the name would go, none before the state would
    let picture = 64;
    let control = this.rowRound(view);
    const summary = this.rowSummary(view);
    const attention = view.unavailable ? undefined : r.attention[0];
    // what the row must say whole: what asks for attention (how long, after it, may go), else what it is doing — a
    // fridge at work says its setpoints instead
    const quiet = view.hero === 'cold' && shown.status === 'idle' && summary !== '';
    // the row with its picture says its words larger (15 and 15): they are measured as they are drawn
    const words = art ? 'ap-card--picture > ' : '';
    const width = (text: string): number => this.head.ruler.width(`${words}fv-row__sub`, text);
    // what asks for attention says it in its own words where the bare row holds them, else in its state's (the warning
    // ink, the ring's tone and the row's name say the rest)
    const need = attention ? attention.text || this.t(attention.key) : '';
    const first = need && width(need) <= this.contentWidth ? need : quiet ? summary : word;
    const said =
      attention && first === need ? attentionText(this.hass, attention, view.now) : first;
    const age = said.startsWith(`${first} · `) ? said.slice(first.length + 3) : '';
    const state = width(first);
    // the name whole; for what else may go (the round, the ring) a long one counts 96: it is cut before they are lost
    const whole = this.head.ruler.width(`${words}fv-row__title`, view.title);
    const name = Math.min(96, whole);
    let ring = this.config?.picture !== 'none';
    const roomWith = (): number =>
      this.contentWidth - (ring ? (art ? picture + 12 : 56) : 0) - (control !== nothing ? 56 : 0);
    if (control !== nothing && (state > roomWith() || name > roomWith())) control = nothing;
    // the picture gives way for the name whole, against the row's own room (16 in, where the card counts 20)
    if (art && whole > roomWith() + 8) picture = 44;
    if (state > roomWith() || (art && name > roomWith())) ring = false;
    const progress = busy(shown.status) ? shown.clock.progress : null;
    // the ring says how far it is; without it (a picture has none) the line says so, where it holds it after the state
    const percent = progress !== null ? `${this.figure(progress)} %` : '';
    const percentOptional = (ring && !art) || width(`${first} · ${percent}`) > roomWith();
    const line = fitLine(
      [
        { text: first },
        age ? { text: age, optional: true } : null,
        attention && !quiet && first !== word ? { text: word, optional: true } : null,
        summary && summary !== first ? { text: summary, optional: true } : null,
        percent ? { text: percent, optional: percentOptional } : null,
        busy(shown.status) && shown.clock.left !== null
          ? { text: leftText(this.hass, shown.clock.left), optional: true }
          : null,
        shown.status === 'finished' && shown.finishedAt !== null
          ? { text: whenText(this.hass, 'done', shown.finishedAt, view.now), optional: true }
          : null,
      ].filter((segment): segment is { text: string; optional?: boolean } => segment !== null),
      roomWith(),
      width,
    );
    const length = 2 * Math.PI * ROW_RADIUS;
    const { onTap, onHold } = this.headActions(view.entity, view.title);
    return html`<article
      class="fv-card dv-card ap-card ap-card--row ${art ? 'ap-card--picture' : ''} ${view.unavailable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${
        ring && art
          ? pictureBox(
              picture,
              imageOf(this.hass, this.config?.image) ||
                artOf(view.kind, () => this.requestUpdate()),
            )
          : ring
            ? html`<span class="ap-ring fv-tone--${attention ? 'warning' : view.tone}">
                ${
                  progress !== null
                    ? svg`<svg viewBox="0 0 58 58" aria-hidden="true" data-measure="drawn"><circle class="ap-ring__track" cx="29" cy="29" r=${ROW_RADIUS} /><circle class="ap-ring__fill" cx="29" cy="29" r=${ROW_RADIUS} stroke-dasharray=${length.toFixed(2)} stroke-dashoffset=${(length * (1 - progress / 100)).toFixed(2)} /></svg>`
                    : nothing
                }
                ${ico(view.glyph as IconRef, view.headTone)}
              </span>`
            : nothing
      }
      <span class="fv-row__text"
        ><span class="fv-row__title" data-name>${view.title}</span
        ><span class="fv-row__sub ${attention ? 'fv-row__sub--warning' : ''}">${line}</span></span
      >
      ${control} ${onTap || onHold ? pressCover(`${view.title} · ${line}`, onTap, onHold) : nothing}
    </article>`;
  }
}

/* ---------- helpers ---------- */

/** The compartments a config names, each as an entry. */
const zoneEntriesOf = (config: ApplianceCardConfig | undefined): ZoneEntry[] =>
  (config?.zones ?? []).map((entry) => (typeof entry === 'string' ? { entity: entry } : entry));

/** A plate's short name: the card's own for it, where it sits ("Left front") where its id says, else "Zone 1". */
function plateNameOf(
  hass: HomeAssistant | undefined,
  config: ApplianceCardConfig | undefined,
  id: string | undefined,
  index: number,
): string {
  const burner = id ? burnerOf(id) : undefined;
  return (
    zoneEntriesOf(config).find((item) => item.entity === id)?.name ??
    (burner ? s(hass, `burner_${burner}`) : s(hass, 'hob_zone', { n: index + 1 }))
  );
}

/**
 * A hob's plates a row, by the widths their words take in `room`: all of them on one row where each holds its words
 * (four at most), else three, else two (four two by two), else one — so a hob of two, three or four plates keeps the
 * standard slot.
 */
function plateColumns(widths: readonly number[], count: number, room: number): number {
  const widest = Math.max(44, ...widths);
  return (
    [4, 3, 2].find(
      (n) => n <= count && !(n === 3 && count === 4) && (room - 8 * (n - 1)) / n >= widest,
    ) ?? 1
  );
}

/** A hob's cells (compact, the dial): as many a row as hold their words (8 a side), on a gap that keeps them whole. */
function hobCells(widths: readonly number[], w: number): { columns: number; gap: number } {
  const columns = plateColumns(
    widths.map((width) => width + 16),
    widths.length,
    w,
  );
  return { columns, gap: sharedGap(w, [columns], [16, 12, 8, 4]).gap };
}

/** What each button of the action row does: start and pause share one (start, resume or pause), power either way. */
const CONTROL_ACTIONS: Readonly<Record<CommandName, readonly Action[]>> = {
  start: ['start', 'resume', 'pause'],
  pause: ['start', 'resume', 'pause'],
  stop: ['stop'],
  power: ['power_on', 'power_off'],
  light: ['light'],
};

/** Whether the appliance takes any of `actions`, as its integration lets a card. */
const canDo = (
  hass: HomeAssistant | undefined,
  r: ApplianceReading,
  actions: readonly Action[],
): boolean => actions.some((action) => callFor(hass, r.platform, r.roles, action) !== undefined);

/** A full chip row's columns, and whether its chips say their glyphs alone. */
interface ChipFit {
  readonly columns: number;
  readonly short: boolean;
}

/**
 * The columns of a full chip row, by its labels' widths: as many a row as hold their words with their glyphs (a chip's
 * 14 sides, its glyph and gap), from four a row down to one; where not even one holds them, the glyphs alone, as many
 * a row as keep each a finger's 44 — a word is never cut.
 */
function chipFit(widths: readonly number[], w: number): ChipFit {
  const widest = Math.max(0, ...widths) + 28 + 26;
  for (let n = Math.min(widths.length, 4); n >= 1; n--)
    if ((w - 8 * (n - 1)) / n >= widest) return { columns: n, short: false };
  return { columns: Math.max(1, Math.min(widths.length, Math.floor((w + 8) / 52))), short: true };
}

/** Rows a set of `count` things takes, `perRow` a row. */
const rowsOf = (count: number, perRow: number): number => Math.ceil(count / perRow);

/** A row of chips at a 360 column (filled, the rows touching), its words estimated. */
const chipRows = (labels: readonly string[]): number =>
  rowsOf(
    labels.length,
    chipFit(
      labels.map((label) => textWidth(label, 'chip')),
      COLUMN,
    ).columns,
  );

/**
 * The card's height at a 360 column with the house in hand (the automatic dashboard's, `heights.mjs`'): the family's
 * (`applianceHeight`) for the kind its device says (one read from its plug as a plug's), and what its appliance draws
 * beyond it — a second drum's row beside the card's own rows (among the kind's three it holds a row's place), or its
 * line under a compact or dial hero; a fridge's compartments and a hob's plates in as many rows as theirs take (a
 * hob's as their words take); the quick modes, buttons and programmes asked for, in as many rows as their words take,
 * or none where it has none. Out of reach the same: what an appliance has is its registry's.
 */
function houseHeight(
  config: ApplianceCardConfig,
  hass: HomeAssistant,
  found = findAppliance(hass, config),
): number {
  if ((found.verdict && 'excluded' in found.verdict) || (!found.device && !config.entity))
    return applianceHeight(config);
  const r = readAppliance(hass, found, config, Date.now());
  const variant = variantOf(config);
  const hero = r.plug ? 'plug' : KIND_DEFAULTS[r.kind].hero;
  const twin = r.twin && (config.unit ?? 'both') === 'both' ? 1 : 0;
  let height = applianceHeight({ ...config, variant, kind: r.plug ? 'appliance' : r.kind });
  const said = (id: string): string => {
    const v = refView(hass, id);
    return v.status === 'ok' ? stateText(hass, v) : '—';
  };
  if (variant === 'compact' || variant === 'ring') {
    if (twin) height += 8 + 20;
    if (hero === 'hob') {
      const n = r.hob.length;
      const cells = hobCells(
        r.hob.map((id) => (textWidth(said(id), 'title') * 13) / 16),
        COLUMN,
      );
      height += n ? (rowsOf(n, cells.columns) - 1) * (44 + cells.gap) : -(16 + 44);
    }
    return height;
  }
  if (variant !== 'full') return height;
  // the rows: the card's own and a second drum's over them (the kind's three hold it)
  const rows = (n: number): number => (n ? 20 + n * 44 : 0);
  const listed = config.rows;
  if (listed && config.show_rows !== false)
    height += rows(listed.length + twin) - rows(listed.length);
  // the compartments' tiles two a row, or their steppers' rows; a hob's plates as many a row as hold their words
  if (config.show_zones !== false && (hero === 'cold' || hero === 'hob')) {
    const stepper = hero === 'cold' && config.setpoint_style === 'stepper';
    const zones = zoneEntriesOf(config).length || r.zones.length;
    const plates = r.hob.length ? r.hob : ['', '', '', ''];
    const words = (text: string): number => (textWidth(text, 'legend') * 16) / 14;
    const region =
      hero === 'hob'
        ? 12 +
          rowsOf(
            plates.length,
            plateColumns(
              plates.flatMap((id, index) => [
                words(said(id)),
                words(plateNameOf(hass, config, id, index)),
              ]),
              plates.length,
              COLUMN - 24,
            ),
          ) *
            96
        : stepper
          ? zones * 76 - 12
          : rowsOf(zones || (r.kind === 'fridge' ? 2 : 1), 2) * 96 - 12;
    height += Math.max(108, region) - (stepper ? 140 : 108);
  }
  // the quick modes it has (chips, or tiles), the buttons it can press, the programmes it can be started on
  if (config.show_modes && hero === 'cold') {
    const keys = r.boosts.map((id) => {
      const candidate = found.candidates.find((item) => item.id === id);
      return { id, key: candidate ? boostOf(candidate) : undefined };
    });
    const labels = (
      config.modes ? config.modes.flatMap((key) => keys.filter((item) => item.key === key)) : keys
    ).map(({ id, key }) => (key ? s(hass, `mode_${key}`) : refView(hass, id).name));
    height +=
      (labels.length
        ? 16 +
          (config.modes_style === 'tiles'
            ? rowsOf(
                labels.length,
                optionColumnsFor(labels, COLUMN, 4, (label) => textWidth(label, 'option')),
              ) *
                88 -
              4
            : chipRows(labels) * 44)
        : 0) -
      (16 + 44);
  }
  const wanted = config.controls ?? KIND_DEFAULTS[r.kind].controls;
  if (config.show_controls && !wanted.some((control) => canDo(hass, r, CONTROL_ACTIONS[control])))
    height -= 16 + 44;
  if (config.show_programs) {
    const id = r.roles.program;
    const state = id?.startsWith('select.') ? stateOf(hass, id) : undefined;
    const labels = optionsOf(state).map((option) => optionWord(hass, state, option));
    height += (labels.length ? 16 + chipRows(labels) * 44 : 0) - (16 + 44 + 8 + 44);
  }
  return height;
}

/** Whether two registry snapshots are the same objects. */
const sameAt = (a: unknown, b: readonly unknown[]): boolean =>
  Array.isArray(a) && a.length === b.length && a.every((item, index) => item === b[index]);

/** A select's option in Home Assistant's words (its translation of that state), as the select would say it. */
function optionWord(
  hass: HomeAssistant | undefined,
  state: HassEntity | undefined,
  option: string,
): string {
  const said = state ? hass?.formatEntityState?.({ ...state, state: option }, option) : undefined;
  if (said) return said.charAt(0).toUpperCase() + said.slice(1);
  const raw = option.replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** The setpoint a step goes to: a temperature by its step within its range, a level to the next of its levels. */
function stepped(
  setter: Setter,
  value: number | string | null,
  direction: 1 | -1,
): number | string | null {
  if (value === null) return null;
  if (setter.options) {
    const index = setter.options.indexOf(String(value));
    const next =
      setter.options[Math.min(setter.options.length - 1, Math.max(0, index + direction))];
    return next ?? null;
  }
  if (typeof value !== 'number') return null;
  const step = setter.step && setter.step > 0 ? setter.step : 1;
  const digits = (String(step).split('.')[1] ?? '').length;
  const next = Number((Math.round((value + direction * step) / step) * step).toFixed(digits));
  return Math.min(setter.max ?? Infinity, Math.max(setter.min ?? -Infinity, next));
}

/** The call that sets a setpoint. */
const callOf = (setter: Setter, entity: string, value: number | string): ServiceCall => ({
  domain: setter.domain,
  service: setter.service,
  data: { entity_id: entity, [setter.field]: value },
});

/** The reminder picker: what the card may remind of, by its word. */
function reminderPicker() {
  return choiceField(
    'key',
    MAINTENANCE_KEYS.map((key) => [key, `appliance.m_${key}`] as const),
  );
}

/** The row picker: what a row may say, each by its word (a reminder by its noun). */
function rowPicker() {
  return choiceField(
    'key',
    ROW_KEYS.map(
      (key) =>
        [
          key,
          (MAINTENANCE_KEYS as readonly string[]).includes(key)
            ? `appliance.n_${key as MaintenanceKey}`
            : `appliance.row_${key as Exclude<RowKey, MaintenanceKey>}`,
        ] as const,
    ),
  );
}

/** A select's options, as its state lists them. */
function optionsOf(state: HassEntity | undefined): string[] {
  const list = state?.attributes['options'];
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
}

/** The role picker: the parts a person names by hand, each by its word. */
function rolePicker() {
  return choiceField(
    'role',
    NAMED_ROLES.map((role) => [role, `appliance.role_${role}`] as const),
  );
}

/** What the appliance a config names is, for the editor's defaults: the card's word, else the house's. */
function kindFor(config: ApplianceCardConfig, hass: HomeAssistant | undefined): ApplianceKind {
  if (config.kind && config.kind !== 'auto') return config.kind;
  if (!hass) return 'washer';
  const found = findAppliance(hass, {
    device: config.device,
    entity: config.entity,
    roles: config.roles,
  });
  return found.verdict && 'kind' in found.verdict ? found.verdict.kind : 'appliance';
}
