import { printerDevices } from '../printer/roles.js';
import {
  areaOf,
  areasInOrder,
  floorsInOrder,
  localize,
  usableEntity,
  type AreaRegistryEntry,
  type FloorRegistryEntry,
  type HomeAssistant,
  type MessageKey,
} from '@fluvy/core';
import {
  BATTERY_POWER,
  CHARGER,
  GENERIC,
  GRID,
  GRID_EXPORT,
  HOME_POWER,
  LIGHT_WORDS,
  NOT_APPLIANCE,
  OUTDOOR,
  PLACE_NOISE,
  SOLAR,
  TODAY,
} from './words.generated.js';

/*
 * What a house looks like to the automatic dashboard: the entity, device and area registries read
 * through word rules (the way people name things, in every language Fluvy ships: `words.generated.ts`, from
 * the catalogues) and device classes. Pure queries, no cards — the views (`views/`) turn them into cards.
 */

export {
  BATTERY_POWER,
  CHARGER,
  GRID,
  GRID_EXPORT,
  HOME_POWER,
  LIGHT_WORDS,
  OUTDOOR,
  SOLAR,
  TODAY,
};
const WEATHER_PLATFORMS =
  /aemet|met\b|met_|openweather|accuweather|forecast|weather|tomorrow|pirate|ecowitt|buienradar|nws/i;
/** Covers that are a way in, not a window's shade. */
const GATEWAYS = new Set(['garage', 'gate', 'door']);
const OPENINGS = new Set([
  'door',
  'window',
  'garage_door',
  'opening',
  'motion',
  'occupancy',
  'moisture',
  'smoke',
  'gas',
  'carbon_monoxide',
  'vibration',
  'tamper',
  'lock',
  'safety',
  'presence',
  'sound',
]);
/** A plug's second switch (USB, child lock…): the plain outlet sorts first. */
const TWIN_SWITCH = /outlet|usb|child|lock/i;

export type Registry = Pick<
  HomeAssistant,
  'states' | 'entities' | 'devices' | 'areas' | 'language' | 'user'
> &
  Partial<Pick<HomeAssistant, 'floors'>>;

export class HomeRegistry {
  /** Entity ids by domain, sorted: every query starts from one domain's list. */
  private readonly byDomain = new Map<string, string[]>();
  /** Answers already computed: the registries do not change while a dashboard is generated. */
  private readonly cache = new Map<string, unknown>();

  /** The registries as core's readers take them (`areaEntities`, `areaClimate`). */
  get registries(): Registry {
    return this.hass;
  }

  constructor(private readonly hass: Registry) {
    for (const id of Object.keys(hass.states).sort()) {
      const domain = id.slice(0, id.indexOf('.'));
      const list = this.byDomain.get(domain);
      if (list) list.push(id);
      else this.byDomain.set(domain, [id]);
    }
  }

  private memo<T>(key: string, compute: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, compute());
    return this.cache.get(key) as T;
  }

  t(key: MessageKey): string {
    return localize(this.hass, key);
  }
  /** The entity's state now (`playing`, `on`…). */
  state(id: string): string | undefined {
    return this.hass.states[id]?.state;
  }
  hasState(id: string): boolean {
    return Boolean(this.hass.states[id]);
  }

  /* ---------- one entity ---------- */

  private reg(id: string) {
    return this.hass.entities?.[id];
  }
  private attr<T>(id: string, name: string): T | undefined {
    return this.hass.states[id]?.attributes[name] as T | undefined;
  }
  private name(id: string): string {
    return String(this.attr<string>(id, 'friendly_name') ?? id);
  }
  private platform(id: string): string {
    return this.reg(id)?.platform ?? '';
  }
  private deviceOf(id: string): string | undefined {
    return this.reg(id)?.device_id;
  }
  deviceClass(id: string): string {
    return String(this.attr<string>(id, 'device_class') ?? '');
  }
  stateClass(id: string): string {
    return String(this.attr<string>(id, 'state_class') ?? '');
  }
  /** The id and the name together: what the word rules look at. */
  label(id: string): string {
    return `${id} ${this.name(id)}`;
  }

  deviceName(id: string): string | undefined {
    const deviceId = this.deviceOf(id);
    const device = deviceId ? this.hass.devices?.[deviceId] : undefined;
    return (device?.name_by_user ?? device?.name) || undefined;
  }
  /** The entity's own words: the friendly name without the device's name in front of it. */
  ownName(id: string): string {
    const full = this.name(id);
    const device = this.deviceName(id);
    const own =
      device && full.toLowerCase().startsWith(device.toLowerCase())
        ? full.slice(device.length).replace(/^[\s:·-]+/, '')
        : full;
    return own || full;
  }
  /** What a tile or a row calls the entity: its own name, or its device's when the own name only says the kind of reading. */
  displayName(id: string): string {
    const own = this.ownName(id);
    return GENERIC.test(own.trim()) ? (this.deviceName(id) ?? own) : own;
  }
  /** What a list row calls a device's reading (a battery, a phone): the device, else the display name. */
  deviceLabel(id: string): string {
    return this.deviceName(id) ?? this.displayName(id);
  }
  /** Where a reading is: the area, else the device's name without the sensor words, else the entity's name. */
  placeName(id: string): string {
    const area = this.areaName(this.areaOf(id));
    if (area) return area;
    const device = (this.deviceName(id) ?? '')
      .replace(PLACE_NOISE, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return device || this.displayName(id);
  }
  /** `name` for a card only when it improves on what the card would show by itself. */
  named(id: string, name = this.displayName(id)): Record<string, string> {
    return name && name !== this.name(id) ? { name } : {};
  }

  areaOf(id: string): string | undefined {
    return areaOf(this.hass, id);
  }
  /** The areas floor by floor, the ones on no floor last. */
  get areas(): readonly AreaRegistryEntry[] {
    return this.memo('areas', () => areasInOrder(this.hass));
  }
  get floors(): readonly FloorRegistryEntry[] {
    return this.memo('floors', () => floorsInOrder(this.hass));
  }
  get zones(): readonly string[] {
    return this.domain('zone');
  }
  areaName(areaId: string | undefined): string | undefined {
    return areaId ? this.hass.areas?.[areaId]?.name : undefined;
  }

  /** An entity a dashboard should show: known, not hidden, not a config or diagnostic entity unless asked for. */
  usable(id: string, allowDiagnostic = false): boolean {
    return usableEntity(this.hass, id, { diagnostic: allowDiagnostic });
  }

  dimmable(id: string): boolean {
    return (
      id.startsWith('light.') &&
      (this.attr<string[]>(id, 'supported_color_modes') ?? []).some((m) => m !== 'onoff')
    );
  }
  outdoor(id: string): boolean {
    return OUTDOOR.test(`${this.label(id)} ${this.areaName(this.areaOf(id)) ?? ''}`);
  }
  private isLightSwitch(id: string): boolean {
    return id.startsWith('switch.') && LIGHT_WORDS.test(this.label(id));
  }
  private fromWeather(id: string): boolean {
    return (
      WEATHER_PLATFORMS.test(this.platform(id)) || this.label(id).toLowerCase().includes('forecast')
    );
  }

  /** The power and energy readings beside an entity: the same device's (or the same name stem's) power, and its energy — today's first. */
  readoutsOf(id: string): readonly string[] {
    const device = this.deviceOf(id);
    const stem = id.slice(id.indexOf('.') + 1);
    const siblings = this.domain('sensor', true).filter(
      (s) => (device && this.deviceOf(s) === device) || s.startsWith(`sensor.${stem}_`),
    );
    const power = siblings.find((s) => this.deviceClass(s) === 'power');
    const energy = siblings
      .filter((s) => this.deviceClass(s) === 'energy')
      .sort((a, b) => Number(TODAY.test(b)) - Number(TODAY.test(a)))[0];
    return [power, energy].filter((s): s is string => Boolean(s));
  }
  /** The sensors of a device class beside an entity: the same device, or the same name before its `_power`. */
  beside(id: string, deviceClass: string): readonly string[] {
    const device = this.deviceOf(id);
    const stem = id.slice(id.indexOf('.') + 1).replace(/_power$/, '');
    return this.domain('sensor', true).filter(
      (s) =>
        s !== id &&
        this.deviceClass(s) === deviceClass &&
        ((device !== undefined && this.deviceOf(s) === device) || s.startsWith(`sensor.${stem}_`)),
    );
  }
  /** The temperature sensor of the same device as a humidity sensor, for the humidity card's dew point. */
  temperatureBeside(humidity: string): string | undefined {
    const device = this.deviceOf(humidity);
    const stem = humidity.replace(/_humidity.*$/, '');
    return this.temperatures.find(
      (t) => (device && this.deviceOf(t) === device) || t.startsWith(stem),
    );
  }
  pick(list: readonly string[], pattern: RegExp): string | undefined {
    return list.find((id) => pattern.test(this.label(id)));
  }

  /* ---------- lists ---------- */

  domain(domain: string, allowDiagnostic = false): readonly string[] {
    return this.memo(`domain:${domain}:${allowDiagnostic}`, () =>
      (this.byDomain.get(domain) ?? []).filter((id) => this.usable(id, allowDiagnostic)),
    );
  }
  sensors(deviceClass: string, allowDiagnostic = false): readonly string[] {
    return this.domain('sensor', allowDiagnostic).filter(
      (id) => this.deviceClass(id) === deviceClass,
    );
  }
  first(domain: string): string | undefined {
    return this.domain(domain)[0];
  }

  get lights(): readonly string[] {
    return this.memo('lights', () => [
      ...this.domain('light'),
      ...this.domain('switch').filter((id) => this.isLightSwitch(id)),
    ]);
  }
  /** Switches that are appliances (not lights, not a device's settings), one per device, the plain outlet before its twin. */
  get appliances(): readonly string[] {
    return this.memo('appliances', () => {
      const all = this.domain('switch').filter(
        (id) =>
          !this.isLightSwitch(id) &&
          (this.deviceClass(id) === 'outlet' || !NOT_APPLIANCE.test(this.label(id))),
      );
      const seen = new Set<string>();
      return all
        .sort((a, b) => Number(TWIN_SWITCH.test(a)) - Number(TWIN_SWITCH.test(b)))
        .filter((id) => {
          const device = this.deviceOf(id) ?? id;
          if (seen.has(device)) return false;
          seen.add(device);
          return true;
        })
        .sort();
    });
  }
  /** Thermostats and heaters, the ones running first (a running heat pump is the house's thermostat, not the idle AC). */
  get climate(): readonly string[] {
    return this.memo('climate', () =>
      [...this.domain('climate'), ...this.domain('water_heater'), ...this.domain('humidifier')]
        .map((id, index) => ({ id, index, idle: this.hass.states[id]?.state === 'off' }))
        .sort((a, b) => Number(a.idle) - Number(b.idle) || a.index - b.index)
        .map(({ id }) => id),
    );
  }
  /** Weather services, the home's own forecast first (`weather.forecast_home`, `…casa`). */
  get weather(): readonly string[] {
    return this.memo('weather', () =>
      [...this.domain('weather')].sort(
        (a, b) => Number(!/home|casa|hogar/i.test(a)) - Number(!/home|casa|hogar/i.test(b)),
      ),
    );
  }
  /** Updates: HA files most of them as config entities, yet they are what a Sensors view lists. */
  get updates(): readonly string[] {
    return this.memo('updates', () =>
      (this.byDomain.get('update') ?? []).filter(
        (id) => this.hass.states[id] && !this.reg(id)?.hidden,
      ),
    );
  }
  get temperatures(): readonly string[] {
    return this.memo('temperatures', () =>
      this.sensors('temperature').filter((id) => !this.fromWeather(id)),
    );
  }
  get humidities(): readonly string[] {
    return this.memo('humidities', () =>
      this.sensors('humidity').filter((id) => !this.fromWeather(id)),
    );
  }
  get powers(): readonly string[] {
    return this.sensors('power');
  }
  get energies(): readonly string[] {
    return this.sensors('energy', true);
  }
  get batteries(): readonly string[] {
    return this.memo('batteries', () =>
      this.sensors('battery', true).filter((id) => this.platform(id) !== 'mobile_app'),
    );
  }
  get phones(): readonly string[] {
    return this.memo('phones', () =>
      this.sensors('battery', true).filter((id) => this.platform(id) === 'mobile_app'),
    );
  }
  get people(): readonly string[] {
    return this.domain('person');
  }
  get openings(): readonly string[] {
    return this.memo('openings', () =>
      this.domain('binary_sensor').filter((id) => OPENINGS.has(this.deviceClass(id))),
    );
  }
  get plants(): readonly string[] {
    return this.memo('plants', () => [
      ...this.sensors('moisture', true),
      ...this.domain('sensor').filter(
        (id) => /soil|planta|plant/i.test(this.label(id)) && this.deviceClass(id) !== 'moisture',
      ),
    ]);
  }
  get helpers(): readonly string[] {
    return this.memo('helpers', () => [
      ...this.domain('input_number'),
      ...this.domain('input_boolean'),
      ...this.domain('input_select'),
      ...this.domain('input_datetime'),
    ]);
  }
  get automations(): readonly string[] {
    return this.domain('automation');
  }
  /** Blinds, curtains, awnings: what a room opens to the light (garage doors and gates are security). */
  get covers(): readonly string[] {
    return this.memo('covers', () =>
      this.domain('cover').filter((id) => !GATEWAYS.has(this.deviceClass(id))),
    );
  }
  /** Garage doors and gates. */
  get gateways(): readonly string[] {
    return this.memo('gateways', () =>
      this.domain('cover').filter((id) => GATEWAYS.has(this.deviceClass(id))),
    );
  }
  get fans(): readonly string[] {
    return this.domain('fan');
  }
  get locks(): readonly string[] {
    return this.domain('lock');
  }
  get alarms(): readonly string[] {
    return this.domain('alarm_control_panel');
  }
  get cameras(): readonly string[] {
    return this.domain('camera');
  }
  /**
   * The house's 3D printers: the devices of a printer integration (OctoPrint, PrusaLink, Bambu Lab, Moonraker,
   * Creality, Elegoo, Anycubic, Snapmaker, FlashForge), and any other device with a printer's signature.
   */
  get printers(): readonly string[] {
    return this.memo('printers', () => printerDevices(this.hass));
  }
  get players(): readonly string[] {
    return this.domain('media_player');
  }
  get calendars(): readonly string[] {
    return this.domain('calendar');
  }
  get lists(): readonly string[] {
    return this.domain('todo');
  }
  get timers(): readonly string[] {
    return this.domain('timer');
  }
  get scenes(): readonly string[] {
    return this.domain('scene');
  }
  /** What a person runs by hand: scripts and buttons. */
  get runnables(): readonly string[] {
    return this.memo('runnables', () => [...this.domain('script'), ...this.domain('input_button')]);
  }
}
