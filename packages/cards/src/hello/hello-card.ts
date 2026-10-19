import {
  formatNumber,
  languageOf,
  LANGUAGES,
  personOf,
  stateText,
  strings,
  type DayParts,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';

import {
  clickPress,
  glyph,
  holdKey,
  pressCover,
  preventMenu,
  sheetStyles,
  startPress,
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

import { dateLine } from '../helpers/datetime.js';

import { Card, type BaseKey } from '../shared/base.js';

import { FontsSettled } from '../shared/fonts.js';

import {
  accentField,
  actionFields,
  boolField,
  editorWord,
  entityField,
  fieldRow,
  formLabels,
  textField,
} from '../shared/form.js';

import { overflows } from './fit.js';

import { conditionGlyph, isCondition, isNight } from '../shared/weather.js';
import { configKeys } from '../shared/config.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const weatherWord = strings('weather');
const s = strings('hello');

export interface HelloCardConfig extends FluvyCardConfig {
  /** Who is greeted. Falls back to the first word of the greeted person's name, else the signed-in user's. */
  name?: string;
  /**
   * The person greeted, whoever looks: its picture fills the avatar, and tapping the avatar opens its more-info. Left
   * out (the default), the card greets whoever is signed in — their person's name and picture.
   */
  person?: string;
  /** Weather entity: condition glyph + temperature + condition at the right of the date. */
  weather?: string;
  show_weather?: boolean;
  show_date?: boolean;
  show_avatar?: boolean;
  /** Test hook — freezes "now" at this ISO instant. Not part of the documented config. */
  _now?: string;
}

/**
 * When the day's parts begin is the language's (the registry's `dayParts`): English greets the evening until 22:00
 * and only then says "night"; Spanish has no evening, "buenas noches" greets from 20:00.
 */
function greetingKey(hour: number, { morning, afternoon, evening, night }: DayParts): MessageKey {
  if (hour >= morning && hour < afternoon) return 'greeting.morning';
  if (hour >= afternoon && hour < (evening ?? night)) return 'greeting.afternoon';
  if (evening !== undefined && hour >= evening && hour < night) return 'greeting.evening';
  return 'greeting.night';
}

/** Up to two initials of a display name; an empty name gives none (the gradient disc stands alone). */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toLocaleUpperCase() ?? '')
    .join('');
}

/** Dates come lower-case in Spanish ("jueves, 17 de septiembre"); a line of its own starts with a capital. */
const sentence = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * The greeting at the top of a dashboard: "Good evening, Marta", the date, the weather of the
 * moment and a 44 avatar. It is not a card surface — no box, no hairline: it sits on the page as
 * the sheet draws it. One timer aligned to the hour re-renders it; nothing runs per second.
 *
 * The block never clips what it says: after each render `fit()` steps the greeting from 28 to 22
 * when the name is long, then to the greeting alone, and where even that would be cut (a phone at the
 * largest sizes) to the language's short hello; the date from "Thursday, September 17" to
 * "Thu, Sep 17" when the weather needs the room, and in the narrowest columns the weather to glyph +
 * degrees, then away, then the date too. Nothing is ever cut.
 */
export class FluvyHelloCard extends Card<HelloCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(): number {
    return 60;
  }

  static override still = true;

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.home,
    css`
      /* the sheet stacks the block under a status bar; on a dashboard the view's own gap does the spacing */
      .hm-hello {
        margin-top: 0;
        animation: fv-enter 420ms var(--fv-ease-out) both;
        animation-delay: var(--fv-enter-delay, 0ms);
      }
      .hm-hello__title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* the greeting as the card's button (no avatar to be one): laid over its words, which stay in place */
      .hm-hello__text {
        position: relative;
      }
      .hm-hello__meta {
        gap: 12px;
        white-space: nowrap;
      }
      .hm-hello__date {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hm-hello__date--short,
      .is-short .hm-hello__date--full {
        display: none;
      }
      .is-short .hm-hello__date--short {
        display: block;
      }
      .hm-hello__weather {
        flex: 0 0 auto;
        max-width: 100%;
        min-width: 0;
      }
      .hm-hello__condition {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .is-compact .hm-hello__word {
        display: none;
      }
      /* the narrowest columns: the weather leaves the date its line, then the date leaves too */
      .is-dateonly .hm-hello__weather,
      .is-nodate .hm-hello__date {
        display: none;
      }
      /* even the small tier cannot hold the name: the greeting alone (the avatar says who) */
      .is-bare .hm-hello__name {
        display: none;
      }
      /* nor the greeting at the small tier (a phone's column at a large size): the language's short hello */
      .hm-hello__greet--short,
      .is-hi .hm-hello__greet {
        display: none;
      }
      .is-hi .hm-hello__greet--short {
        display: inline;
      }

      /* the fit measures right after it flips a tier: nothing here may be mid-transition (reduced motion gives
         every property a 1 ms one, and a measurement taken inside it reads the previous size) */
      .hm-hello,
      .hm-hello * {
        transition-property: none;
      }

      /* a long name takes the 22 tier (the wall greeting of the language) and the block closes to 52 */
      .is-small.hm-hello {
        height: 52px;
      }
      .is-small .hm-hello__title {
        font-size: 22px;
        line-height: 28px;
        letter-spacing: -0.01em;
      }

      .hm-avatar {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        font-size: 15px;
        font-weight: 600;
        line-height: 20px;
        color: var(
          --fluvy-on-mark,
          color-mix(
            in srgb,
            var(--fluvy-on-primary) var(--fluvy-solid, 0%),
            var(--fluvy-text-on-accent)
          )
        );
      }
      .hm-avatar__img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transition: opacity var(--fv-slow) var(--fv-ease);
      }
      .hm-avatar__img.is-loaded {
        opacity: 1;
      }
      /* the sheet's 2 px ring is an inset shadow; over a picture it has to be drawn above it */
      .hm-avatar::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        box-shadow: inset 0 0 0 2px var(--fluvy-card);
        pointer-events: none;
      }
    `,
  ];

  constructor() {
    super();
    // the size tier is fitted to laid-out text: fitted again once a web font is in use
    new FontsSettled(this);
  }

  /** The greeting names who it greets; its avatar answers a tap and a hold; its colour is its mark's. */
  static override base: readonly BaseKey[] = ['name', 'tap_action', 'hold_action', 'color'];
  static override keys = configKeys<HelloCardConfig>()([
    'person',
    'weather',
    'show_weather',
    'show_date',
    'show_avatar',
  ]);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    show_avatar: true,
    show_weather: true,
    show_date: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        textField('name'),
        fieldRow(
          entityField(['person'], 'person', false),
          entityField(['weather'], 'weather', false),
        ),
        fieldRow(boolField('show_weather'), boolField('show_date')),
        boolField('show_avatar'),
        accentField(),
        actionFields(),
      ],
      ...formLabels({ person: 'editor.entity', weather: 'editor.weather' }),
      computeHelper: (schema) =>
        schema.name === 'person' ? editorWord('hello.person_helper') : undefined,
    };
  }

  /** A new card greets whoever looks at it: it names no person of its own. */
  static getStubConfig(_hass: unknown, entities: readonly string[]): HelloCardConfig {
    const weather = entities.find((id) => id.startsWith('weather.'));
    return { type: 'custom:fluvy-hello-card', ...(weather ? { weather } : {}) };
  }

  override getCardSize(): number {
    return 2;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    const ids = ['sun.sun'];
    if (this.config?.weather) ids.push(this.config.weather);
    const person = this.personId();
    if (person) ids.push(person);
    return ids;
  }

  /** The person greeted: the card's own, else the signed-in user's (none for an account that is no one's person). */
  private personId(): string | undefined {
    return this.config?.person || personOf(this.hass, this.hass?.user?.id);
  }

  /* ---------- the hour tick ---------- */

  private hourTimer: number | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.scheduleHour();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.hourTimer);
    this.hourTimer = undefined;
  }

  /** One timer, aligned to the next whole hour: the greeting and the date can only change there. */
  private scheduleHour(): void {
    clearTimeout(this.hourTimer);
    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours() + 1,
      0,
      0,
      500,
    );
    this.hourTimer = window.setTimeout(() => {
      this.requestUpdate();
      this.scheduleHour();
    }, next.getTime() - now.getTime());
  }

  /* ---------- fit ---------- */

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.fit();
  }

  /**
   * Chooses the tiers from the laid-out text, the way `fitPills` sizes a badge: the classes live on
   * the section outside Lit's bindings, so nothing re-renders and nothing is painted in between.
   */
  private fit(): void {
    const block = this.renderRoot.querySelector<HTMLElement>('.hm-hello');
    const title = block?.querySelector<HTMLElement>('.hm-hello__title');
    if (!block || !title) return;
    block.classList.remove(
      'is-small',
      'is-bare',
      'is-hi',
      'is-short',
      'is-compact',
      'is-dateonly',
      'is-nodate',
    );
    // the greeting gives way in steps: the small tier, then the greeting without the name — which takes the
    // full tier back when it fits alone, since the small one exists for a long name
    if (overflows(title)) block.classList.add('is-small');
    if (overflows(title)) {
      block.classList.add('is-bare');
      block.classList.remove('is-small');
      if (overflows(title)) block.classList.add('is-small');
      if (overflows(title)) block.classList.add('is-hi');
    }
    // the date too (when it is shown): the short form first, then the weather drops its word and keeps glyph +
    // degrees, then leaves the line to the date, and a column too narrow even for the short date shows neither
    const date = block.querySelector<HTMLElement>('.hm-hello__date--full');
    const short = block.querySelector<HTMLElement>('.hm-hello__date--short');
    if (!date || !short) return;
    if (overflows(date)) block.classList.add('is-short');
    if (overflows(short)) block.classList.add('is-compact');
    if (overflows(short)) block.classList.add('is-dateonly');
    if (overflows(short)) block.classList.add('is-nodate');
  }

  /* ---------- content ---------- */

  private now(): Date {
    const frozen = this.config?._now ? new Date(this.config._now) : null;
    return frozen && !Number.isNaN(frozen.getTime()) ? frozen : new Date();
  }

  /** The configured name, else the first name of the person greeted (the avatar's), else the signed-in user's. */
  private who(): string {
    const configured = this.config?.name?.trim();
    if (configured) return configured;
    const id = this.personId();
    const person = id ? this.entity(id) : null;
    const named =
      person && person.status !== 'missing' ? person.name : (this.hass?.user?.name ?? '');
    return named.trim().split(/\s+/)[0] ?? '';
  }

  /** Condition glyph + "18° Clear". An unreachable weather entity says so; it never shows a number it does not have. */
  private weather(view: EntityView): TemplateResult {
    if (view.status !== 'ok') {
      return html`<span class="hm-hello__weather"
        >${glyph('ban')}<span class="hm-hello__condition">${stateText(this.hass, view)}</span></span
      >`;
    }
    const night = isNight(this.hass, view.state);
    const known = isCondition(view.state) ? view.state : null;
    const icon = conditionGlyph(view.state, night, night ? 'moon' : 'cloud');
    // a clear sky after dark is "Clear" beside its moon, whatever the integration calls it
    const word = known
      ? weatherWord(this.hass, known === 'sunny' && night ? 'clear-night' : known)
      : stateText(this.hass, view);
    const temperature = view.attr<number | null>('temperature');
    const degrees =
      typeof temperature === 'number' && Number.isFinite(temperature)
        ? `${formatNumber(this.hass, temperature, { digits: 0 })}°`
        : '';
    return html`<span class="hm-hello__weather"
      >${glyph(icon)}<span class="hm-hello__condition"
        >${degrees}<span class="hm-hello__word">${degrees ? ' ' : ''}${word}</span></span
      ></span
    >`;
  }

  private avatar(name: string): TemplateResult {
    const id = this.personId();
    const person = id ? this.entity(id) : null;
    const path = person?.attr<string | null>('entity_picture');
    const picture = path && this.hass ? this.hass.hassUrl(path) : '';
    const label =
      person && person.status !== 'missing' ? person.name : name || s(this.hass, 'profile');
    const loaded = (event: Event): void =>
      (event.currentTarget as HTMLElement).classList.add('is-loaded');
    // a picture that fails to load leaves the gradient disc of the sheet, never a broken image
    const body = picture
      ? keyed(
          picture,
          html`<img
            class="hm-avatar__img"
            src=${picture}
            alt=""
            draggable="false"
            @load=${loaded}
          />`,
        )
      : html`<span data-align="center"
          >${initialsOf(person && person.status !== 'missing' ? person.name : name)}</span
        >`;

    const { onTap, onHold } = id ? this.headActions(id) : {};
    if (!onTap && !onHold)
      return html`<span class="hm-avatar" data-icon role="img" aria-label=${label}>${body}</span>`;
    // the avatar is the greeting's icon: a tap is the tap action, a still press the hold action
    return html`<button
      class="hm-avatar fv-ico--tap"
      data-icon
      data-target
      aria-label=${label}
      .fvTap=${onTap}
      .fvHold=${onHold}
      @pointerdown=${startPress}
      @contextmenu=${onHold ? preventMenu : nothing}
      @click=${clickPress}
      @keydown=${holdKey(onHold)}
    >
      ${body}
    </button>`;
  }

  /**
   * The greeting as the card's button, where the avatar is not one (hidden, or no person to be): the card's tap and
   * hold over the whole block of words, which stay where they are.
   */
  private greetingTap(said: string): TemplateResult | typeof nothing {
    const id = this.personId();
    if (this.config?.show_avatar !== false && id) return nothing;
    const { onTap, onHold } = this.headActions(id);
    return onTap || onHold ? pressCover(said, onTap, onHold) : nothing;
  }

  protected renderCard(): TemplateResult {
    const now = this.now();
    const name = this.who();
    const greeting = this.t(greetingKey(now.getHours(), LANGUAGES[languageOf(this.hass)].dayParts));
    const weatherId = this.config?.show_weather === false ? undefined : this.config?.weather;
    const showDate = this.config?.show_date !== false;

    // "Good morning" and ", Marta" as two spans: the name (with what joins it) is what leaves a narrow column first
    const said = name ? s(this.hass, 'greeting', { greeting, name }) : greeting;
    const at = name ? said.indexOf(name) : -1;
    const greet = at > 0 ? said.slice(0, at).replace(/[\s,]+$/, '') : said;
    return html`<section class="hm-hello">
      <div class="hm-hello__text">
        ${this.greetingTap(said)}
        <h1 class="hm-hello__title">
          <span class="hm-hello__greet">${greet}</span
          >${at > 0 ? html`<span class="hm-hello__name">${said.slice(greet.length)}</span>` : nothing}<span
            class="hm-hello__greet hm-hello__greet--short"
            >${this.t('greeting.hello')}</span
          >
        </h1>
        <p class="hm-hello__meta">
          ${
            showDate
              ? html`<span class="hm-hello__date hm-hello__date--full"
                    >${sentence(dateLine(this.hass, now, 'full'))}</span
                  >
                  <span class="hm-hello__date hm-hello__date--short"
                    >${sentence(dateLine(this.hass, now, 'short'))}</span
                  >`
              : nothing
          }
          ${weatherId ? this.weather(this.entity(weatherId)) : nothing}
        </p>
      </div>
      ${this.config?.show_avatar === false ? nothing : this.avatar(name)}
    </section>`;
  }
}
