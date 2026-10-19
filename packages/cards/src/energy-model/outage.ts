import { formatTime, localize, resolveEntity, strings, type HomeAssistant } from '@fluvy/core';

const flow = strings('energy-flow');

/** A statistic of another integration (`tibber:energy_…`) has no entity to open or to ask the state of. */
export const isEntityId = (id: string | undefined): id is string =>
  typeof id === 'string' && id.includes('.') && !id.includes(':');

/**
 * A source that cannot be read, and since when: "Grid · unavailable · since 21:35", in segments a narrow head lets go
 * from the end ("Grid · unavailable"), so the time leaves whole and is never cut.
 */
export function downLine(hass: HomeAssistant | undefined, name: string, id?: string): string {
  const changed = Date.parse((id && hass?.states[id]?.last_changed) || '');
  return [
    name,
    localize(hass, 'state.unavailable').toLocaleLowerCase(hass?.language),
    Number.isFinite(changed)
      ? flow(hass, 'since_time', { time: formatTime(hass, new Date(changed)) })
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The first meter of a period card that cannot be read now, in the words the flow uses for a source that went
 * down ("Grid · unavailable · since 21:35"): its figures stop where it stopped, and the head says so rather than
 * letting a short day pass for a quiet one.
 */
export function meterOutage(
  hass: HomeAssistant | undefined,
  meters: readonly { readonly id: string; readonly name: string }[],
): string | undefined {
  for (const { id, name } of meters) {
    if (!isEntityId(id)) continue;
    const status = resolveEntity(hass, id).status;
    if (status === 'unavailable' || status === 'missing') return downLine(hass, name, id);
  }
  return undefined;
}
