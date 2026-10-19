import {
  formatNumber,
  languageOf,
  localize,
  numberAttr,
  speaks,
  stateText,
  strings,
  type EntityView,
  type HassEntity,
  type HomeAssistant,
  type UnsubscribeFunc,
} from '@fluvy/core';
import type { GlyphName } from '@fluvy/ui';
import { compassKey, conditionGlyph, isCondition, isNight } from '../shared/weather.js';

const s = strings('clock', 'weather');
/** The weather card's words: a condition's shorter name where the clock's own is longer. */
const weather = strings('weather');

/** What a clock shows of the weather: the sky's state in words and as a glyph, and the air outside. */
export interface Sky {
  /** False when the entity is unavailable, unknown or missing: `text` then says which. */
  readonly ok: boolean;
  readonly text: string;
  /**
   * `text` where room is short: the weather card's own word ("Clear" for the clock's "Clear night"); out of reach, the
   * house's word for it.
   */
  readonly short: string;
  /** `text` as a segment after "·": lowercase where fluvy owns the copy, untouched where Home Assistant translated it. */
  readonly inline: string;
  readonly glyph: GlyphName;
  readonly night: boolean;
  readonly temperature: number | null;
  readonly unit: string;
  readonly feels: number | null;
  readonly wind: string;
}

export const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function windText(hass: HomeAssistant | undefined, view: EntityView): string {
  const speed = numberAttr(view, 'wind_speed');
  if (speed === null) return '';
  const unit = view.attr<string>('wind_speed_unit') ?? '';
  const bearing = view.attr<number | string | null>('wind_bearing');
  const direction =
    typeof bearing === 'string'
      ? bearing.trim().toUpperCase()
      : finite(bearing) === null
        ? ''
        : s(hass, compassKey(bearing as number));
  return [formatNumber(hass, speed, { digits: 0 }), unit, direction].filter(Boolean).join(' ');
}

export function readSky(hass: HomeAssistant | undefined, view: EntityView): Sky {
  if (view.status !== 'ok') {
    const text = stateText(hass, view);
    return {
      ok: false,
      text,
      // "Entity not found" is the longest thing a weather can say: a narrow line says the house's word ("Offline")
      short: localize(hass, 'state.unavailable'),
      inline: lowerFirst(text),
      glyph: 'ban',
      night: isNight(hass),
      temperature: null,
      unit: '',
      feels: null,
      wind: '',
    };
  }
  const condition = view.state;
  const night = isNight(hass, condition);
  // the approved copy in the languages Fluvy speaks; Home Assistant's own translation in every other
  const known = isCondition(condition) && speaks(languageOf(hass));
  const text = known ? s(hass, condition) : stateText(hass, view);
  return {
    ok: true,
    text,
    short: known ? weather(hass, condition) : text,
    inline: known ? lowerFirst(text) : text,
    glyph: conditionGlyph(condition, night),
    night,
    temperature: numberAttr(view, 'temperature'),
    unit: view.attr<string>('temperature_unit') ?? hass?.config?.unit_system?.temperature ?? '',
    feels: numberAttr(view, 'apparent_temperature'),
    wind: windText(hass, view),
  };
}

/* ---------- the daily forecast ---------- */

interface ForecastItem {
  readonly temperature?: number | null;
  readonly templow?: number | null;
}

/** pending: asked, not answered yet (the row keeps its place) · none: this entity has no usable daily forecast. */
export type Forecast =
  | { readonly status: 'pending' | 'none' }
  | { readonly status: 'ready'; readonly tonight: number; readonly tomorrow: number };

const FORECAST_DAILY = 1;

/**
 * Whether a weather offers the daily forecast, as its features say (they stay written while it is out of reach); an
 * entity that writes none is asked, and one gone from the house is taken at the card's word: its row keeps its place.
 */
export function offersDaily(state: HassEntity | undefined): boolean {
  const features = state?.attributes.supported_features;
  return typeof features !== 'number' || (features & FORECAST_DAILY) !== 0;
}

/** `forecast[0].templow` is tonight, `forecast[1].temperature` is tomorrow — both, or there is no row. */
function summarise(items: readonly ForecastItem[] | null | undefined): Forecast {
  const tonight = finite(items?.[0]?.templow);
  const tomorrow = finite(items?.[1]?.temperature);
  return tonight === null || tomorrow === null
    ? { status: 'none' }
    : { status: 'ready', tonight, tomorrow };
}

/**
 * One `weather/subscribe_forecast` subscription, owned: `sync()` on every update (it only acts when
 * the entity changes), `stop()` on disconnect. The last answer survives a stop, so a card that is
 * moved in the DOM comes back with its row instead of rebuilding it.
 */
export class ForecastFeed {
  forecast: Forecast = { status: 'none' };

  private entity = '';
  private subscribed = '';
  private unsubscribe: UnsubscribeFunc | undefined;

  constructor(private readonly onChange: () => void) {}

  sync(hass: HomeAssistant | undefined, entityId: string): void {
    const state = entityId ? hass?.states[entityId] : undefined;
    const wanted = state && offersDaily(state) ? entityId : '';
    if (entityId !== this.entity) {
      this.entity = entityId;
      this.forecast = { status: wanted ? 'pending' : 'none' };
    }
    if (wanted === this.subscribed) return;
    this.stop();
    this.subscribed = wanted;
    if (!wanted || !hass) {
      this.forecast = { status: 'none' };
      return;
    }
    hass.connection
      .subscribeMessage<{ forecast?: readonly ForecastItem[] | null }>(
        (message) => {
          if (this.subscribed === wanted) this.set(summarise(message.forecast));
        },
        { type: 'weather/subscribe_forecast', forecast_type: 'daily', entity_id: wanted },
      )
      .then((unsubscribe) => {
        if (this.subscribed === wanted && !this.unsubscribe) this.unsubscribe = unsubscribe;
        else unsubscribe(); // stopped or re-targeted while the socket was answering
      })
      .catch(() => {
        if (this.subscribed === wanted) this.set({ status: 'none' });
      }); // no daily forecast here: the row is quietly not there
  }

  stop(): void {
    this.subscribed = '';
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    // Home Assistant's unsubscribe is async and rejects when the socket is already gone
    try {
      void Promise.resolve(unsubscribe?.()).catch(() => undefined);
    } catch {
      /* same, thrown */
    }
  }

  private set(next: Forecast): void {
    if (JSON.stringify(next) === JSON.stringify(this.forecast)) return;
    this.forecast = next;
    this.onChange();
  }
}
