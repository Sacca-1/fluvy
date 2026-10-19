import {
  isTimeZone,
  reducedMotion,
  strings,
  wallClock,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type HomeAssistant,
} from '@fluvy/core';
import { isoWeek, sheetStyles, type Tone } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { Card, type BaseKey } from '../shared/base.js';
import { FontsSettled } from '../shared/fonts.js';
import {
  accentField,
  actionField,
  boolField,
  entityField,
  formLabels,
  selectField,
  textField,
} from '../shared/form.js';
import { TextRuler } from '../shared/fit.js';
import { heroAnalog, heroDigital, side, tile, type ClockModel } from './layouts.js';
import { ForecastFeed, offersDaily, readSky, type Forecast, type Sky } from './sky.js';
import {
  calendarDate,
  clockParts,
  dateLocale,
  dateText,
  faceDate,
  resolveHour12,
  resolveTimeZone,
  untilNext,
  type ClockFormat,
  type ClockParts,
} from './time.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import { configKeys, type AliasSpec } from '../shared/config.js';

const s = strings('clock', 'weather');

export interface ClockCardConfig extends FluvyCardConfig {
  /** The analog face, or big tabular digits. */
  face?: 'analog' | 'digital';
  /** hero = the big face / big digits · side = the compact face with the time beside it · tile = the 172 × 168 tile. */
  variant?: 'hero' | 'side' | 'tile';
  numerals?: 'none' | 'quarters' | 'all';
  /** Analog: the second hand (default: on the hero face). Digital: the seconds as the unit on the baseline. */
  show_seconds?: boolean;
  /** Undefined follows Home Assistant's time format. AM / PM is set as the unit. */
  hour12?: boolean;
  /** A `weather.*` entity: the condition, the temperature, and the sky's tone on the face. */
  weather?: string;
  /** The Outside · Tonight · Tomorrow row from the daily forecast (default true). Off: glyph and temperature beside the date. */
  show_forecast?: boolean;
  /** The ISO week after the date. */
  show_week?: boolean;
  /** IANA name, e.g. `America/New_York`. Default: Home Assistant's zone or the browser's, as the profile says. */
  time_zone?: string;
  /** A label for this clock: a second city, a room. */
  title?: string;
  show_date?: boolean;
  /** Test hook (undocumented): an ISO instant that freezes the clock, so a render can be held against the sheet. */
  _now?: string;
}

const CORE_LABELS = {
  weather: 'editor.weather',
  show_seconds: 'editor.seconds',
} as const;
const OWN_LABELS = {
  numerals: 'editor.numerals',
  show_week: 'editor.week',
  hour12: 'editor.hour12',
  time_zone: 'editor.time_zone',
} as const;

const isOwnLabel = (name: string): name is keyof typeof OWN_LABELS => name in OWN_LABELS;

/** A time that cannot be read: its slot, a dash. */
const NO_TIME: ClockParts = { time: '—', seconds: '', period: '' };

/**
 * One clock, every look of the sheet: the analog face (plain, quarters, all numerals) or the digital
 * digits, as a hero card, a compact side card or a tile, each with or without its weather.
 *
 * The hands are swept by CSS from the angle they are drawn at, so a running face costs no JavaScript.
 * ONE timer, aligned to the next minute (to the next second only while digital seconds show),
 * re-renders the text; it stops with the tab and with the element.
 */
export class FluvyClockCard extends Card<ClockCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: ClockCardConfig, hass?: HomeAssistant): number {
    const weather = Boolean(config.weather);
    // the Outside · Tonight · Tomorrow row (16 + 44): asked for, and offered by the weather (its daily forecast)
    const forecast =
      weather &&
      config.show_forecast !== false &&
      (!hass || !config.weather || offersDaily(hass.states[config.weather]));
    if (config.variant === 'tile') return 168;
    if (config.variant === 'side')
      return (config.face === 'digital' ? 132 : 208) + (forecast ? 60 : 0);
    if (config.face === 'digital') return forecast ? 196 : 136;
    return forecast ? 352 : weather ? 292 : 340;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.clocks,
    css`
      /* the sheet fixes 360 and three 96 columns; a dashboard column decides both here */
      .ck-card {
        width: auto;
      }
      .ck-card--tap {
        cursor: pointer;
      }
      .ck-cols {
        grid-template-columns: repeat(var(--ck-cols, 3), minmax(0, 1fr));
      }
      /* the sheet's 64 + 76 foot while there is room; a narrower tile closes the gap, never the labels */
      .ck-tile .fv-tile__foot {
        grid-template-columns: minmax(max-content, 64px) minmax(max-content, 1fr);
      }
      .ck-tile .fv-tile__foot > :first-child {
        padding-right: 4px;
      }
      /* the state too long for the tile's line ("Partiellement nuageux") takes the slack above the foot, a second line */
      .ck-tile .fv-tile__state {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
      }
      .ck-side__face {
        flex: none;
      }
      .ck-side__text,
      .ck-split > :first-child {
        min-width: 0;
      }
      /* a time is one word; its day period takes the readout family's large unit: 16 on the same baseline */
      .ck-big,
      .ck-time,
      .ck-tile__time {
        white-space: nowrap;
      }
      .ck-time .fv-unit,
      .ck-tile__time .fv-unit {
        margin-left: 6px;
        font-size: 16px;
      }
      /* captions are fitted before they are drawn; this only guards the beat before a web font lands */
      .ck-caption {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];

  private timer = 0;
  private faceLabel = '';
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined); // undefined until the first connect
  private readonly feed = new ForecastFeed(() => this.requestUpdate());

  /* ---------- Lovelace ---------- */

  constructor() {
    super();
    // what was measured before a face arrived is measured again once it is in use
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  /** A clock has no entity: it honours a tap and the card's colour (the face's accent). */
  static override base: readonly BaseKey[] = ['tap_action', 'color', 'card_color'];
  static override keys = configKeys<ClockCardConfig>()([
    'face',
    'variant',
    'numerals',
    'show_seconds',
    'hour12',
    'weather',
    'show_forecast',
    'show_week',
    'time_zone',
    'title',
    'show_date',
  ]);
  /**
   * The older names: `variant` said analog or digital (now `face`) and `layout` the look (now `variant`, read by
   * the shared aliases after these); `seconds`, `date`, `week` and `forecast` are the `show_*` toggles.
   */
  static override aliases: AliasSpec = {
    keys: [
      { from: 'variant', to: 'face', when: (value) => value === 'analog' || value === 'digital' },
      { from: 'seconds', to: 'show_seconds' },
      { from: 'date', to: 'show_date' },
      { from: 'week', to: 'show_week' },
      { from: 'forecast', to: 'show_forecast' },
    ],
  };
  static override defaults: EditorDefaults = (config, hass) => {
    const analog = config['face'] !== 'digital';
    const hero = config['variant'] !== 'side' && config['variant'] !== 'tile';
    return {
      face: 'analog',
      variant: 'hero',
      numerals: 'none',
      show_seconds: analog && hero,
      hour12: resolveHour12(hass, undefined),
      show_date: true,
      show_week: false,
      show_forecast: Boolean(config['weather']),
    };
  };
  static override getConfigForm(): LovelaceConfigForm {
    const core = formLabels(CORE_LABELS);
    const grid = (...schema: HaFormSchemaItem[]): HaFormSchemaItem => ({
      type: 'grid',
      name: '',
      flatten: true,
      schema,
    });
    return {
      schema: [
        grid(
          selectField('face', ['analog', 'digital']),
          selectField('variant', ['hero', 'side', 'tile']),
        ),
        grid(selectField('numerals', ['none', 'quarters', 'all']), textField('title')),
        boolField('show_seconds'),
        boolField('hour12'),
        boolField('show_date'),
        boolField('show_week'),
        entityField(['weather'], 'weather', false),
        boolField('show_forecast'),
        textField('time_zone'),
        accentField(),
        accentField('card_color', { none: true }),
        actionField(),
      ],
      computeLabel: (schema, localize) =>
        core.computeLabel?.(schema, localize) ??
        (isOwnLabel(schema.name)
          ? s({ language: document.documentElement.lang || 'en' }, OWN_LABELS[schema.name])
          : undefined),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): ClockCardConfig {
    const weather = entities.find((id) => id.startsWith('weather.'));
    return {
      type: 'custom:fluvy-clock-card',
      face: 'analog',
      layout: 'hero',
      numerals: 'quarters',
      ...(weather ? { weather } : {}),
    };
  }

  protected override prepare(config: ClockCardConfig): ClockCardConfig {
    if (config.time_zone && !isTimeZone(config.time_zone))
      throw new Error(
        `fluvy-clock-card: unknown time zone "${config.time_zone}" (use an IANA name such as Europe/Madrid)`,
      );
    return config;
  }

  override getCardSize(): number {
    const look = this.look;
    if (look === 'tile') return 4;
    const row = this.config?.weather && this.config.show_forecast !== false ? 1 : 0;
    if (look === 'side') return (this.analog ? 4 : 3) + row;
    return (this.analog ? 7 : 3) + row;
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.look === 'tile'
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return [this.config?.weather ?? '', 'sun.sun'].filter(Boolean);
  }

  /* ---------- lifecycle: one aligned timer, one forecast subscription, two listeners ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.feed.sync(this.hass, this.forecastEntity);
    this.arm();
    if (this.hasUpdated) this.requestUpdate(); // re-attached: the minutes that passed meanwhile
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.feed.stop();
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has('config') || changed.has('hass'))
      this.feed.sync(this.hass, this.forecastEntity);
    if (changed.has('config')) this.arm();
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    // `clockFace` marks the face `role="img"`; only the card knows the time it shows
    this.renderRoot.querySelector('.ck-face')?.setAttribute('aria-label', this.faceLabel);
  }

  /** Waits for the next boundary — never an interval, which drifts and piles up behind a sleeping tab. */
  private arm(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    if (!this.isConnected || document.hidden || this.frozen) return;
    const period = !this.analog && this.seconds ? 1000 : 60_000;
    this.timer = window.setTimeout(this.onTick, untilNext(period) + 16); // just past the boundary, so the new minute is read
  }

  private readonly onTick = (): void => {
    if (Date.now() % 60_000 < 1000) this.ruler.clear(); // once a minute: a font that landed without an event is measured again
    this.requestUpdate();
    this.arm();
  };

  private readonly onVisibility = (): void => {
    if (!document.hidden) this.requestUpdate();
    this.arm();
  };

  /* ---------- the configuration, resolved ---------- */

  private get analog(): boolean {
    return this.config?.face !== 'digital';
  }

  /** The config's `variant` (the look) — not the `layout` property Lovelace sets on the element. */
  private get look(): 'hero' | 'side' | 'tile' {
    const value = this.config?.variant;
    return value === 'side' || value === 'tile' ? value : 'hero';
  }

  /** The sheet's defaults: a second hand on the hero face only; digital seconds on request, never in a tile. */
  private get seconds(): boolean {
    if (this.analog) return this.config?.show_seconds ?? this.look === 'hero';
    return (this.config?.show_seconds ?? false) && this.look !== 'tile';
  }

  private get frozen(): Date | undefined {
    const date = this.config?._now ? new Date(this.config._now) : undefined;
    return date && !Number.isNaN(date.getTime()) ? date : undefined;
  }

  private get forecastEntity(): string {
    return this.config?.weather && this.config.show_forecast !== false ? this.config.weather : '';
  }

  private get tappable(): boolean {
    const action = this.config?.tap_action;
    return action ? action.action !== 'none' : Boolean(this.config?.weather); // a weather clock opens its weather
  }

  /* ---------- render ---------- */

  /**
   * The Outside · Tonight · Tomorrow row: the feed's answer while the weather can be read; while it cannot, the row
   * keeps its place where it was asked for and the weather offers it, its figures a dash (1.9: a card keeps its size).
   */
  private forecast(sky: Sky | null): Forecast {
    const id = this.forecastEntity;
    if (!sky || !id) return { status: 'none' };
    if (sky.ok) return this.feed.forecast;
    return offersDaily(this.hass?.states[id]) ? { status: 'pending' } : { status: 'none' };
  }

  /** `sun.sun` is the sun over the house: a clock set to another city's zone does not borrow its sunrise. */
  private sun(format: ClockFormat): ClockModel['sun'] {
    const home = this.hass?.config?.time_zone;
    const abroad = Boolean(this.config?.time_zone) && this.config?.time_zone !== home;
    const attributes = abroad ? undefined : this.hass?.states['sun.sun']?.attributes;
    const read = (key: string): Date | null => {
      const raw: unknown = attributes?.[key];
      const date = typeof raw === 'string' ? new Date(raw) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    };
    const rising = read('next_rising');
    const setting = read('next_setting');
    // the house's sun out of reach keeps its place, its times a dash: "Sunrise —" (1.9: a card keeps its size)
    if (!abroad && (rising === null || setting === null))
      return { next: { kind: 'sunrise', at: NO_TIME }, rising: NO_TIME, setting: NO_TIME };
    const parts = (date: Date | null): ClockParts | null =>
      date ? clockParts(date, format) : null;
    // the next event is the one that has not happened yet — whichever comes first
    const sunrise = rising !== null && (setting === null || rising.getTime() <= setting.getTime());
    const at = parts(sunrise ? rising : setting);
    return {
      next: at ? { kind: sunrise ? 'sunrise' : 'sunset', at } : null,
      rising: parts(rising),
      setting: parts(setting),
    };
  }

  private model(): ClockModel {
    const config = this.config ?? { type: '' };
    const frozen = this.frozen;
    const now = frozen ?? new Date();
    const timeZone = resolveTimeZone(this.hass, config.time_zone);
    const hour12 = resolveHour12(this.hass, config.hour12);
    const format: ClockFormat = { language: this.hass?.language ?? 'en', hour12, timeZone };
    const wall = wallClock(now, timeZone);
    const sky = config.weather ? readSky(this.hass, this.entity(config.weather)) : null;
    const tone: Tone = sky?.ok && !sky.night ? 'solar' : 'accent'; // the sky's tone: solar by day, accent at night; plain clocks are accent
    const calm = reducedMotion();
    const dates = {
      language: this.hass?.locale?.language ?? format.language,
      locale: dateLocale(this.hass, hour12),
      timeZone,
    };
    return {
      hass: this.hass,
      analog: this.analog,
      numerals:
        config.numerals === 'quarters' || config.numerals === 'all' ? config.numerals : 'none',
      // placed hands move once a minute: a second hand would stand still and lie (a frozen test instant is meant to)
      seconds: this.analog && this.seconds && (frozen !== undefined || !calm),
      still: frozen !== undefined || calm,
      tone,
      face: faceDate(wall, now.getMilliseconds()),
      clock: clockParts(now, format, !this.analog && this.seconds),
      title: config.title ?? '',
      date:
        config.show_date === false
          ? null
          : {
              full: dateText(now, dates, 'full'),
              short: dateText(now, dates, 'short'),
              tiny: dateText(now, dates, 'tiny'),
            },
      week: config.show_week && config.show_date !== false ? isoWeek(calendarDate(wall)) : null,
      sky,
      forecast: this.forecast(sky),
      sun: this.sun(format),
      width: this.look === 'tile' ? Math.max(72, this.width - 32) : this.contentWidth,
      ruler: this.ruler,
    };
  }

  protected renderCard(): TemplateResult {
    const m = this.model();
    const look = this.look;
    const spoken = [m.clock.time, m.clock.period].filter(Boolean).join(' ');
    this.faceLabel = spoken;
    const body =
      look === 'tile'
        ? tile(m)
        : look === 'side'
          ? side(m)
          : m.analog
            ? heroAnalog(m)
            : heroDigital(m);
    const tappable = this.tappable;
    const surface =
      look === 'tile'
        ? `fv-tile ck-tile${m.analog ? ' ck-tile--analog' : ''}${tappable ? ' fv-tile--tap' : ''}`
        : `fv-card ck-card${tappable ? ' ck-card--tap' : ''}`;
    // A clock is a read-out: it is a button only when a tap does something, and then the keyboard reaches it too.
    return html`<article
      class=${surface}
      data-card
      role=${tappable ? 'button' : nothing}
      tabindex=${tappable ? 0 : nothing}
      aria-label=${tappable ? [m.title, spoken, m.date?.full, m.sky?.text].filter(Boolean).join(', ') : nothing}
      @click=${tappable ? this.onTap : nothing}
      @keydown=${tappable ? this.onKey : nothing}
    >
      ${body}
    </article>`;
  }

  private readonly onTap = (): void => this.tap(this.config?.weather);

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.onTap();
  };
}
