import { isActive, localize, type EntityView, type HomeAssistant } from '@fluvy/core';

/** What a set of entities says of itself: "2 of 4 on" while something is on, "4 devices" ("1 device") when nothing is. */
export function counted(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  entity: (id: string) => EntityView,
): string {
  if (ids.length === 0) return '';
  const on = ids.filter((id) => isActive(entity(id))).length;
  if (on > 0) return localize(hass, 'common.on_of', { on, count: ids.length });
  return ids.length === 1
    ? localize(hass, 'common.device')
    : localize(hass, 'common.devices', { count: ids.length });
}

/** "2 of 4 on" in its shorter forms, longest first ("2/4 on", then "2/4"): a line too narrow for the words keeps the count. */
export const onOfShort = (hass: HomeAssistant | undefined, on: number, count: number): string[] => [
  localize(hass, 'common.on_of_short', { on, count }),
  `${on}/${count}`,
];
