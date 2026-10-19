import { localize, relativeTime, strings, type HomeAssistant } from '@fluvy/core';

const s = strings('energy-flow');

/** A reading older than this and a live card says so: its figures rest and the head says how old they are. */
export const STALE_MS = 10 * 60_000;

/** When the newest of `ids` was last reported (ms since the epoch), 0 when none says. */
export function newestReport(hass: HomeAssistant | undefined, ids: readonly string[]): number {
  let newest = 0;
  for (const id of ids) {
    const state = hass?.states[id];
    const at = Date.parse(
      (state as { last_reported?: string } | undefined)?.last_reported ?? state?.last_updated ?? '',
    );
    if (at > newest) newest = at;
  }
  return newest;
}

/** Statistics are asked for again every five minutes (their cache's life): the five minutes `now` falls in. */
export const bucketOf = (now: number): number => Math.floor(now / 300_000);

export const isStale = (newest: number, now: number): boolean =>
  newest > 0 && now - newest > STALE_MS;

/** The live words' step: a live card's clock ticks at their pace. */
export const LIVE_TICK = 5000;

/**
 * How fresh a live card's figures are, in the flow's words: "Live · now", "Live · 15 s ago", "3 min ago", and once
 * they are stale "Updated 12 min ago". Five-second steps, so the words change only when they must.
 */
export function liveWords(hass: HomeAssistant | undefined, newest: number, now: number): string {
  const live = s(hass, 'live');
  if (!newest) return live;
  const age = Math.max(0, Math.floor((now - newest) / LIVE_TICK) * (LIVE_TICK / 1000));
  if (age < 5) return `${live} · ${localize(hass, 'common.now').toLowerCase()}`;
  if (age < 60) return `${live} · ${s(hass, 'seconds_ago', { count: age })}`;
  const text = relativeTime(hass, new Date(newest), new Date(now));
  return age * 1000 > STALE_MS ? s(hass, 'updated', { when: text }) : capitalised(text);
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The stale words' shorter form, for a head too narrow for "Updated 32 days ago": the age alone ("32 days ago"),
 * so the figure is never cut. None while the figures are live (`HeadFit`'s `shorter`).
 */
export function staleShorter(
  hass: HomeAssistant | undefined,
  newest: number,
  now: number,
): string[] {
  return isStale(newest, now)
    ? [capitalised(relativeTime(hass, new Date(newest), new Date(now)))]
    : [];
}
