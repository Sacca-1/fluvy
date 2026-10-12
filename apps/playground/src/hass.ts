import type { HassEntity, HomeAssistant, UnsubscribeFunc } from '@fluvy/core';
import { simulate } from '@fluvy/demo-home/simulate';
import { renderTemplate } from './template.js';

/**
 * A small, honest stand-in for Home Assistant's `hass`: a state store, service calls that change it
 * after a network-like delay, the formatting hooks, canned answers for the WebSocket reads the
 * cards make (history, statistics, forecasts, to-do items, calendar events), and templates rendered
 * live by a small Jinja of its own.
 */

/** A sample of Home Assistant's Spanish state words (its `es` translations), by domain, device class and state. */
/** Home Assistant's own words for an opening and for motion (its 2025.1 translations): [on, off]. */
/**
 * Home Assistant's words for a sensor's measure (`component.sensor.entity_component.<class>.name`), for the classes the
 * sheets chart: a readout under a shared chart is called by its measure where nothing names it.
 */
const MEASURE_WORDS: Record<string, Record<string, string>> = {
  en: {
    temperature: 'Temperature',
    humidity: 'Humidity',
    power: 'Power',
    atmospheric_pressure: 'Atmospheric pressure',
  },
  es: {
    temperature: 'Temperatura',
    humidity: 'Humedad',
    power: 'Potencia',
    atmospheric_pressure: 'Presión atmosférica',
  },
  de: {
    temperature: 'Temperatur',
    humidity: 'Luftfeuchtigkeit',
    power: 'Leistung',
    atmospheric_pressure: 'Luftdruck',
  },
  fr: {
    temperature: 'Température',
    humidity: 'Humidité',
    power: 'Puissance',
    atmospheric_pressure: 'Pression atmosphérique',
  },
  it: {
    temperature: 'Temperatura',
    humidity: 'Umidità',
    power: 'Potenza',
    atmospheric_pressure: 'Pressione atmosferica',
  },
  nl: {
    temperature: 'Temperatuur',
    humidity: 'Luchtvochtigheid',
    power: 'Vermogen',
    atmospheric_pressure: 'Luchtdruk',
  },
  'pt-BR': {
    temperature: 'Temperatura',
    humidity: 'Umidade',
    power: 'Potência',
    atmospheric_pressure: 'Pressão atmosférica',
  },
  tr: {
    temperature: 'Sıcaklık',
    humidity: 'Nem',
    power: 'Güç',
    atmospheric_pressure: 'Atmosfer basıncı',
  },
};
const MEASURE_KEY = /^component\.sensor\.entity_component\.([a-z_]+)\.name$/;

/** Home Assistant's words for an opening, open and closed, in every language the sheets speak: a state a row must hold. */
const OPENING_WORDS: Record<string, readonly [string, string]> = {
  en: ['Open', 'Closed'],
  de: ['Geöffnet', 'Geschlossen'],
  es: ['Abierto', 'Cerrado'],
  fr: ['Ouvert', 'Fermé'],
  it: ['Aperto/a', 'Chiuso/a'],
  nl: ['Open', 'Gesloten'],
  'pt-BR': ['Aberto', 'Fechado'],
  tr: ['Açık', 'Kapalı'],
};
/** Home Assistant's words for motion, detected and clear, in the same languages. */
const MOTION_WORDS: Record<string, readonly [string, string]> = {
  en: ['Detected', 'Clear'],
  de: ['Erkannt', 'Keine'],
  es: ['Detectado', 'No detectado'],
  fr: ['Détecté', 'Non détecté'],
  it: ['Rilevato', 'Assente'],
  nl: ['Gedetecteerd', 'Niet gedetecteerd'],
  'pt-BR': ['Detectado', 'Não detectado'],
  tr: ['Algılandı', 'Temiz'],
};

/** Home Assistant's own Spanish state words, by domain, device class and state: the longest of them are what a pill has to hold. */
const SPANISH: Record<string, string> = {
  on: 'Encendido',
  off: 'Apagado',
  'light.on': 'Encendida',
  'light.off': 'Apagada',
  'binary_sensor.door.on': 'Abierta',
  'binary_sensor.door.off': 'Cerrada',
  'binary_sensor.window.on': 'Abierta',
  'binary_sensor.window.off': 'Cerrada',
  'binary_sensor.motion.on': 'Detectado',
  'binary_sensor.motion.off': 'Despejado',
  'alarm_control_panel.disarmed': 'Desarmada',
  'alarm_control_panel.armed_night': 'Armada noche',
  'alarm_control_panel.armed_home': 'Armada en casa',
  'alarm_control_panel.armed_away': 'Armada ausente',
  'media_player.playing': 'Reproduciendo',
  'media_player.paused': 'En pausa',
  'media_player.idle': 'Inactivo',
  'cover.open': 'Abierta',
  'cover.closed': 'Cerrada',
  'cover.opening': 'Abriendo',
  'cover.closing': 'Cerrando',
  'lock.locked': 'Bloqueada',
  'lock.unlocked': 'Desbloqueada',
  'vacuum.cleaning': 'Limpiando',
  'vacuum.docked': 'En la base',
  'vacuum.returning': 'Volviendo a la base',
  'person.home': 'En casa',
  'person.not_home': 'Fuera',
  'climate.heat': 'Calor',
  'climate.off': 'Apagado',
};
export type StateSeed = [
  entityId: string,
  state: string,
  attributes?: Record<string, unknown>,
  /** How long ago it was last reported, in seconds (a reading that went quiet). */
  ago?: number,
];

type Listener = (hass: HomeAssistant) => void;

/** A `render_template` subscription: rendered once, then again on every state change, sent when it changed. */
interface Watch {
  readonly message: Record<string, unknown>;
  readonly callback: (event: unknown) => void;
  /** The last event sent, as JSON: Home Assistant only speaks when the result changes. */
  last?: string;
}

const LATENCY = 140;

export interface MockOptions {
  readonly dark?: boolean;
  readonly language?: string;
  readonly now?: Date;
  /** The registries a sheet needs beyond its states (areas, floors, devices, entity entries). */
  readonly registry?: Partial<Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'floors'>>;
  readonly history?: Record<string, readonly number[]>;
  readonly ws?: Record<string, (message: Record<string, unknown>) => unknown>;
  readonly api?: (method: string, path: string) => unknown;
  /** How long Home Assistant takes to answer a template, in ms (30: before the first paint; a real socket 50–200). */
  readonly templateDelay?: number;
  /** The house's units: metric (°C, km), or imperial (°F, mi) as a house in the US keeps them. */
  readonly units?: 'metric' | 'imperial';
}

const iso = (date: Date): string => date.toISOString();

export function createHass(
  seeds: readonly StateSeed[],
  options: MockOptions = {},
): {
  hass: () => HomeAssistant;
  subscribe: (l: Listener) => () => void;
  calls: Array<{ domain: string; service: string; data: unknown; target: unknown }>;
  /** Changes a state (and attributes) at once and tells every listener, as a recorder update would. */
  set: (id: string, state?: string, attributes?: Record<string, unknown>) => void;
  /** How many `render_template` subscriptions are open: what the cards hold, and must let go of. */
  templates: () => number;
} {
  const now = options.now ?? new Date();
  const states: Record<string, HassEntity> = {};
  for (const [entity_id, state, attributes, ago] of seeds) {
    const reported = new Date(now.getTime() - (ago ?? 0) * 1000);
    states[entity_id] = {
      entity_id,
      state,
      attributes: { friendly_name: entity_id, ...attributes },
      last_changed: iso(new Date(reported.getTime() - (ago === undefined ? 2 * 3600_000 : 0))),
      last_updated: iso(reported),
      ...(ago === undefined ? {} : { last_reported: iso(reported) }),
    } as HassEntity;
  }
  const listeners = new Set<Listener>();
  const calls: Array<{ domain: string; service: string; data: unknown; target: unknown }> = [];
  let current: HomeAssistant;

  const watches = new Set<Watch>();
  /** Renders one watched template against the states as they are now; an error is an event too, as Home Assistant reports it. */
  const answer = (watch: Watch): void => {
    if (!watches.has(watch)) return;
    let event: Record<string, unknown>;
    try {
      const result = renderTemplate(
        String(watch.message['template']),
        states,
        (watch.message['variables'] as Record<string, unknown> | undefined) ?? {},
      );
      event = { result, listeners: { all: false, domains: [], entities: [], time: false } };
    } catch (error) {
      event = { error: error instanceof Error ? error.message : String(error), level: 'ERROR' };
    }
    const sent = JSON.stringify(event);
    if (sent === watch.last) return;
    watch.last = sent;
    watch.callback(event);
  };
  const watch = (
    message: Record<string, unknown>,
    callback: (event: unknown) => void,
  ): UnsubscribeFunc => {
    const entry: Watch = { message, callback };
    watches.add(entry);
    setTimeout(() => answer(entry), options.templateDelay ?? 30);
    return () => {
      watches.delete(entry);
    };
  };

  const set = (
    id: string,
    state: string | undefined,
    attrs: Record<string, unknown> = {},
  ): void => {
    const previous = states[id];
    if (!previous) return;
    states[id] = {
      ...previous,
      state: state ?? previous.state,
      attributes: { ...previous.attributes, ...attrs },
      last_changed: iso(new Date()),
      last_updated: iso(new Date()),
    };
  };

  const build = (): HomeAssistant =>
    ({
      states: { ...states },
      entities: options.registry?.entities ?? {},
      devices: options.registry?.devices ?? {},
      areas: options.registry?.areas ?? {},
      ...(options.registry?.floors ? { floors: options.registry.floors } : {}),
      themes: {
        default_theme: 'Fluvy',
        themes: {},
        darkMode: options.dark ?? false,
        theme: 'Fluvy',
      },
      locale: { language: options.language ?? 'en', number_format: 'language', time_format: '24' },
      language: options.language ?? 'en',
      config: {
        unit_system:
          options.units === 'imperial'
            ? { temperature: '°F', length: 'mi' }
            : { temperature: '°C', length: 'km' },
        currency: 'EUR',
        time_zone: 'Europe/Madrid',
      },
      user: { id: 'u1', name: 'Marta', is_admin: true },
      connection: {
        subscribeMessage: async <T>(
          callback: (message: T) => void,
          message: { type: string; [k: string]: unknown },
        ) => {
          if (message.type === 'render_template')
            return watch(message, callback as (event: unknown) => void);
          const handler = options.ws?.[message.type];
          if (handler) setTimeout(() => callback(handler(message) as T), 30);
          return () => undefined;
        },
      },
      callService: async (domain, service, data = {}, target) => {
        calls.push({ domain, service, data, target });
        const ids = ([] as string[]).concat(
          (target?.entity_id as string | string[] | undefined) ??
            (data['entity_id'] as string | string[] | undefined) ??
            [],
        );
        setTimeout(() => {
          Object.assign(
            states,
            simulate(states, { domain, service, data, target: { entity_id: ids } }, new Date()),
          );
          notify();
        }, LATENCY);
        return undefined;
      },
      callWS: async <T>(message: { type: string; [k: string]: unknown }): Promise<T> => {
        if (message.type === 'history/history_during_period') {
          const id = (message['entity_ids'] as string[])[0] ?? '';
          const series = options.history?.[id] ?? [];
          const start = new Date(String(message['start_time'])).getTime();
          const end = new Date(String(message['end_time'])).getTime();
          return {
            [id]: series.map((v, i) => ({
              s: String(v),
              lu: (start + (i / Math.max(1, series.length - 1)) * (end - start)) / 1000,
            })),
          } as T;
        }
        const handler = options.ws?.[message.type];
        if (handler) return handler(message) as T;
        throw new Error(`mock hass: unhandled WS message ${message.type}`);
      },
      callApi: async <T>(method: string, path: string): Promise<T> =>
        options.api ? (options.api(method, path) as T) : ([] as unknown as T),
      hassUrl: (path = '') => path,
      localize: (key) => {
        const measure = MEASURE_KEY.exec(key)?.[1];
        return (measure && MEASURE_WORDS[options.language ?? 'en']?.[measure]) || key;
      },
      formatEntityState: (stateObj) => {
        const raw = stateObj.state;
        const unit = stateObj.attributes.unit_of_measurement;
        if (unit && Number.isFinite(Number(raw))) return `${raw} ${unit}`;
        // an opening and motion in Home Assistant's own words, in every language; a leak sensor in its English ones
        if (stateObj.entity_id.startsWith('binary_sensor.') && (raw === 'on' || raw === 'off')) {
          const language = options.language ?? 'en';
          const kind = stateObj.attributes['device_class'];
          const pair =
            kind === 'window' || kind === 'door' || kind === 'garage_door' || kind === 'opening'
              ? OPENING_WORDS[language]
              : kind === 'motion' || kind === 'occupancy'
                ? MOTION_WORDS[language]
                : undefined;
          if (pair) return raw === 'on' ? pair[0] : pair[1];
          if (language === 'en' && kind === 'moisture') return raw === 'on' ? 'Wet' : 'Dry';
        }
        // Home Assistant's own words in Spanish (the longest of them are what a pill has to hold)
        if ((options.language ?? 'en') === 'es') {
          const domain = stateObj.entity_id.split('.')[0] ?? '';
          const kind = stateObj.attributes['device_class'];
          const word =
            SPANISH[`${domain}.${String(kind)}.${raw}`] ??
            SPANISH[`${domain}.${raw}`] ??
            SPANISH[raw];
          if (word) return word;
        }
        const text = raw.replace(/_/g, ' ');
        return text.charAt(0).toUpperCase() + text.slice(1);
      },
    }) as HomeAssistant;

  /** The states changed: a new `hass` for every listener, and every watched template rendered again. */
  const notify = (): void => {
    current = build();
    listeners.forEach((l) => l(current));
    watches.forEach(answer);
  };

  current = build();
  return {
    hass: () => current,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    calls,
    set: (id, state, attributes) => {
      set(id, state, attributes);
      notify();
    },
    templates: () => watches.size,
  };
}
