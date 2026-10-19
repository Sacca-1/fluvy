import {
  capabilitiesOf,
  resolveEntity,
  type EntityView,
  type HassEntity,
  type HomeAssistant,
} from '@fluvy/core';

/*
 * An attribute read as an entity would be. LG's older integration (ollo69/ha-smartthinq-sensors) says a cycle's whole
 * in the attributes of the device's own sensor — its state, its course, its times, its door, a wash's settings, a
 * range's cavities and burners, a fridge's temperatures — and the sensors it makes for most of them are off by
 * default. A role may then be "sensor.washer#remain_time": the entity, a hash, the attribute. Its view carries the
 * entity's own name and stamps and, for a temperature, the unit the sensor names beside it (`temp_unit`,
 * `oven_temp_unit`); what a tap opens and what a card watches is the entity.
 */

const HASH = '#';

/** The entity a reference names: what a tap opens, what the card watches. */
export const entityOf = (ref: string): string => ref.split(HASH)[0] ?? ref;

/** The attribute a reference names, where it names one. */
export const attributeOf = (ref: string): string | undefined => ref.split(HASH)[1];

/**
 * An entity's state, or, gone from the house, its capabilities as they were last read (an unavailable state with its
 * range, its options, its unit and class): what shapes a card is read from it, so an appliance keeps its anatomy
 * whether its entities are unavailable or missing (1.9).
 */
export const stateOf = (
  hass: Pick<HomeAssistant, 'states'> | undefined,
  id: string | undefined,
): HassEntity | undefined => (id ? (hass?.states?.[id] ?? capabilitiesOf(id)) : undefined);

/** What an attribute says when it says nothing: None, a dash, "N/A" (LG's older integration's words for it). */
const NOTHING = /^(|-|n\/a|none|null|unknown)$/i;

/**
 * An attribute as a state object of its own, under the reference's id: its value as the state (on and off for a
 * flag; nothing is unknown), the unit named beside a temperature, the entity's name and stamps; unavailable with its
 * entity. The entity's own state object for a reference without an attribute; none where there is no state.
 */
export function refState(
  hass: Pick<HomeAssistant, 'states'> | undefined,
  ref: string,
): HassEntity | undefined {
  const [id, name] = ref.split(HASH);
  const base = stateOf(hass, id);
  if (!base || name === undefined) return base;
  const value = base.attributes[name];
  const said =
    typeof value === 'boolean' ? (value ? 'on' : 'off') : value == null ? '' : String(value);
  const unit = /temp$/.test(name)
    ? (base.attributes['temp_unit'] ?? base.attributes['oven_temp_unit'])
    : undefined;
  return {
    entity_id: ref,
    state: base.state === 'unavailable' ? 'unavailable' : NOTHING.test(said) ? 'unknown' : said,
    attributes: {
      ...(base.attributes.friendly_name ? { friendly_name: base.attributes.friendly_name } : {}),
      ...(typeof unit === 'string' ? { unit_of_measurement: unit } : {}),
    },
    last_changed: base.last_changed,
    last_updated: base.last_updated,
  };
}

/** A view of what a reference names: the entity's own, or its attribute's, read as an entity's is. */
export function refView(hass: HomeAssistant | undefined, ref: string | undefined): EntityView {
  if (!ref?.includes(HASH)) return resolveEntity(hass, ref);
  const state = refState(hass, ref);
  return resolveEntity(state ? ({ states: { [ref]: state } } as HomeAssistant) : undefined, ref);
}
