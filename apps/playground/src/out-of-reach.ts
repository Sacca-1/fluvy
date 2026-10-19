import type { HomeAssistant } from '@fluvy/core';
import { outOfReachStates, type OutOfReach } from '@fluvy/demo-home/out-of-reach';

/**
 * The house with these entities out of reach as Home Assistant writes them (`@fluvy/demo-home/out-of-reach`): a
 * frame's view of it (the `unavailable` sheet), or a twin's (`interactions-unavailable.mjs`, as `fluvyOutOfReach`).
 */
export const outOfReachView =
  (ids: readonly string[], kind: OutOfReach = 'unavailable') =>
  (hass: HomeAssistant): HomeAssistant => ({
    ...hass,
    states: outOfReachStates(hass.states, ids, kind),
  });
