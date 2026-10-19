import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { allFixtures, houseOf } from './fixtures/index.js';
import { applianceEntities, candidatesOf, entriesOf, type Candidate } from './roles.js';
import {
  boostOf,
  celsius,
  hobOf,
  setpointOf,
  setterCall,
  zoneByRange,
  zoneOf,
  zonesOf,
  zoneSetter,
} from './zones.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const HOUSE = houseOf(allFixtures(NOW), NOW);

/** A device's compartments, as the reading reads them. */
const zones = (device: string) => {
  const gathered = applianceEntities(HOUSE, device).zones;
  const entry = HOUSE.devices[device];
  return zonesOf(
    HOUSE,
    candidatesOf(HOUSE, entriesOf(HOUSE, device), entry?.name).filter((candidate) =>
      gathered.includes(candidate.id),
    ),
  );
};
const candidate = (
  id: string,
  platform: string,
  key?: string,
  more: Partial<Candidate> = {},
): Candidate => ({
  id,
  domain: id.slice(0, id.indexOf('.')),
  key,
  platform,
  object: id.slice(id.indexOf('.') + 1),
  ...more,
});

describe('a fridge’s compartments', () => {
  it('knows each by its integration’s key, LG’s raw location, an id, or its range', () => {
    expect(zones('hc-fridge')).toEqual([
      {
        kind: 'fridge',
        setpoint: 'number.kuhl_gefrier_kombination_kuhlschranktemperatur',
        door: 'binary_sensor.kuhl_gefrier_kombination_kuhlschranktur',
      },
      {
        kind: 'freezer',
        setpoint: 'number.kuhl_gefrier_kombination_gefrierschranktemperatur',
        door: 'binary_sensor.kuhl_gefrier_kombination_gefrierschranktur',
      },
    ]);
    // LG names the location as it is, "fridge" and "freezer", in a German house too
    expect(zones('lg-fridge')).toEqual([
      { kind: 'fridge', setpoint: 'number.kuhlschrank_fridge_temperatur' },
      { kind: 'freezer', setpoint: 'number.kuhlschrank_freezer_temperatur' },
    ]);
    // a climate is its own setpoint and reading
    expect(zones('miele-fridge')).toEqual([
      {
        kind: 'fridge',
        setpoint: 'climate.kuhl_gefrierkombination_kuhlschrank',
        current: 'climate.kuhl_gefrierkombination_kuhlschrank',
      },
      {
        kind: 'freezer',
        setpoint: 'climate.kuhl_gefrierkombination_gefrierschrank',
        current: 'climate.kuhl_gefrierkombination_gefrierschrank',
      },
    ]);
    expect(zones('st-fridge')).toEqual([
      {
        kind: 'fridge',
        setpoint: 'number.samsung_kuhlschrank_kuhlschranktemperatur',
        current: 'sensor.samsung_kuhlschrank_kuhlschranktemperatur',
        door: 'binary_sensor.samsung_kuhlschrank_kuhlschranktur',
      },
      {
        kind: 'freezer',
        setpoint: 'number.samsung_kuhlschrank_gefrierschranktemperatur',
        current: 'sensor.samsung_kuhlschrank_gefrierschranktemperatur',
        door: 'binary_sensor.samsung_kuhlschrank_gefrierschranktur',
      },
    ]);
    // Matter says nothing of what a compartment is: its range does
    expect(zones('matter-fridge')).toEqual([
      { kind: 'fridge', setpoint: 'number.kuhlschrank_garage' },
      { kind: 'freezer', setpoint: 'number.kuhlschrank_garage_2' },
    ]);
    expect(zones('wp-fridge')).toEqual([
      { kind: 'fridge', setpoint: 'select.whirlpool_kuhlschrank_temperaturstufe' },
    ]);
    expect(zones('elx-fridge')).toEqual([
      { kind: 'fridge', setpoint: 'number.electrolux_kuhlschrank_fridge_targettemperaturec' },
      { kind: 'freezer', setpoint: 'number.electrolux_kuhlschrank_freezer_targettemperaturec' },
    ]);
  });

  it('tells a compartment by its range: a freezer’s below −5 °C, a chiller’s below 3, a wine cooler’s from 14', () => {
    expect(zoneByRange(-15, '°C')).toBe('freezer');
    expect(zoneByRange(3, '°C')).toBe('chiller');
    expect(zoneByRange(8, '°C')).toBe('fridge');
    expect(zoneByRange(20, '°C')).toBe('wine');
    // a house in Fahrenheit: 5 °F is −15 °C, 46 °F is 8 °C
    expect(zoneByRange(5, '°F')).toBe('freezer');
    expect(zoneByRange(46, '°F')).toBe('fridge');
    expect(celsius(212, '°F')).toBe(100);
    // Matter's oven setpoint is no compartment's
    expect(
      zoneOf(candidate('number.o', 'matter', 'temperature_setpoint', { max: 250 })),
    ).toBeUndefined();
    expect(
      zoneOf(candidate('number.f', 'matter', 'temperature_setpoint', { max: 46, unit: '°F' })),
    ).toEqual({
      part: 'setpoint',
    });
  });

  it('reads Miele’s zones by their climates alone, by their ranges where no key names them', () => {
    const climate = (id: string, max: number) => ({
      entity_id: id,
      state: 'cool',
      attributes: { max_temp: max, min_temp: max - 10, temperature: max - 4 },
      last_changed: '',
      last_updated: '',
    });
    const wine = {
      states: {
        'climate.wein_zone_1': climate('climate.wein_zone_1', 20),
        'climate.wein_zone_2': climate('climate.wein_zone_2', 18),
      },
      entities: {},
    } as unknown as HomeAssistant;
    expect(
      zonesOf(wine, [
        candidate('climate.wein_zone_1', 'miele', 'zone_1', { object: 'zone_1' }),
        candidate('climate.wein_zone_2', 'miele', 'zone_2', { object: 'zone_2' }),
        // its zone's temperature sensor says what the climate already does
        candidate('sensor.wein_temperatur_zone_2', 'miele', 'temperature_zone_2', {
          object: 'temperatur_zone_2',
        }),
      ]),
    ).toEqual([
      { kind: 'wine', setpoint: 'climate.wein_zone_1', current: 'climate.wein_zone_1' },
      { kind: 'wine', index: 2, setpoint: 'climate.wein_zone_2', current: 'climate.wein_zone_2' },
    ]);
  });

  it('numbers the second of a kind: Home Connect’s right-hand chiller, its wine compartments', () => {
    expect(
      zoneOf(candidate('number.c', 'home_connect', 'chiller_right_setpoint_temperature')),
    ).toEqual({
      part: 'setpoint',
      kind: 'chiller',
      index: 2,
    });
    expect(
      zoneOf(candidate('number.w', 'home_connect', 'wine_compartment_3_setpoint_temperature')),
    ).toEqual({
      part: 'setpoint',
      kind: 'wine',
      index: 3,
    });
  });
});

describe('setting a compartment', () => {
  const at = (
    entity_id: string,
    value: string,
    attributes: Record<string, unknown>,
  ): HassEntity => ({
    entity_id,
    state: value,
    attributes,
    last_changed: '',
    last_updated: '',
  });
  const hass = {
    config: { unit_system: { temperature: '°F', length: 'mi' } },
  } as unknown as HomeAssistant;

  it('sets a number, a climate and a level select each its own way, in its own unit', () => {
    const number = at('number.f', '4', { min: 1, max: 7, step: 0.5, unit_of_measurement: '°C' });
    const setter = zoneSetter(hass, 'home_connect', number);
    expect(setter).toEqual({
      domain: 'number',
      service: 'set_value',
      field: 'value',
      min: 1,
      max: 7,
      step: 0.5,
      unit: '°C',
    });
    expect(setter && setterCall(setter, 'number.f', 5)).toEqual({
      domain: 'number',
      service: 'set_value',
      data: { entity_id: 'number.f', value: 5 },
    });
    // a climate's temperatures are the house's unit
    const climate = at('climate.f', 'cool', {
      temperature: 38,
      min_temp: 33,
      max_temp: 46,
      target_temp_step: 1,
    });
    expect(zoneSetter(hass, 'miele', climate)).toEqual({
      domain: 'climate',
      service: 'set_temperature',
      field: 'temperature',
      min: 33,
      max: 46,
      step: 1,
      unit: '°F',
    });
    const level = at('select.f', '3', { options: ['1', '2', '3', '4', '5'] });
    const levels = zoneSetter(hass, 'whirlpool', level);
    expect(levels).toEqual({
      domain: 'select',
      service: 'select_option',
      field: 'option',
      options: ['1', '2', '3', '4', '5'],
    });
    expect(levels && setterCall(levels, 'select.f', '4').data).toEqual({
      entity_id: 'select.f',
      option: '4',
    });
    expect(setpointOf(number)).toBe(4);
    expect(setpointOf(climate)).toBe(38);
    expect(setpointOf(level)).toBe('3');
  });

  it('sets nothing of an integration whose setpoints are not pinned, nor a reading; an unavailable one keeps what it can do', () => {
    const number = at('number.f', '4', { min: 1, max: 7 });
    expect(zoneSetter(hass, 'electrolux_status', number)).toBeUndefined();
    expect(zoneSetter(hass, 'smartthinq_sensors', number)).toBeUndefined();
    expect(zoneSetter(hass, 'smartthings', at('sensor.f', '3.4', {}))).toBeUndefined();
    // out of reach its range stays (Home Assistant keeps it): the card draws the stepper disabled, so its row stacks alike
    expect(
      zoneSetter(hass, 'home_connect', at('number.f', 'unavailable', { min: 1, max: 7 })),
    ).toMatchObject({ domain: 'number', service: 'set_value', min: 1, max: 7 });
  });
});

describe('quick modes and plates', () => {
  it('knows a fridge’s quick modes by their switches’ keys', () => {
    expect(boostOf(candidate('switch.a', 'lg_thinq', 'express_fridge'))).toBe('super_cool');
    expect(boostOf(candidate('switch.a', 'home_connect', 'vacation_mode'))).toBe('holiday');
    expect(boostOf(candidate('switch.a', 'miele', 'superfreezing'))).toBe('super_freeze');
    expect(boostOf(candidate('switch.a', 'smartthings', 'ice_maker_2'))).toBe('ice_maker');
    expect(boostOf(candidate('switch.e_freezer_fastmode', 'electrolux_status'))).toBe(
      'super_freeze',
    );
    // a binary sabbath flag is not a switch to toggle
    expect(boostOf(candidate('binary_sensor.a', 'lg_thinq', 'sabbath_mode'))).toBeUndefined();
  });

  it('knows a hob’s plates, numbered', () => {
    expect(
      hobOf(candidate('sensor.kochfeld_kochzone_3', 'miele', 'plate', { object: 'kochzone_3' })),
    ).toEqual({
      index: 3,
    });
    expect(
      hobOf(
        candidate('sensor.x_burner_2_power_level', 'lg_thinq', 'power_level_for_location', {
          object: 'burner_2_power_level',
        }),
      ),
    ).toEqual({ index: 2 });
    expect(hobOf(candidate('sensor.x_level', 'smartthings', 'manual_level'))).toEqual({});
    expect(hobOf(candidate('sensor.x', 'miele', 'status'))).toBeUndefined();
  });
});
