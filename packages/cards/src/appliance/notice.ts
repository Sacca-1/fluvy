import type { HomeAssistant } from '@fluvy/core';
import type { NoticeTrigger } from '../automations/notice.js';
import type { ApplianceKind } from './kinds.js';
import { COMPLETED, type ApplianceFound } from './reading.js';
import { attributeOf, entityOf } from './refs.js';
import { FINISHED_WORDS, statusOfWord } from './status.js';

/*
 * "Tell me when it's done" (#47) for one appliance: what says its cycle is over, as an automation's triggers — its
 * integration's event where it has one (LG's washers power off when done, and say so first), its flag that the
 * cycle completed (LG's older integration's), else the words of its state (and of its phase, where they say it) that
 * mean finished — an attribute's where the state is one — else a plug's power falling quiet; and who hears it: the
 * administrator's phone, by the Home Assistant app on a device their person tracks.
 */

/** A state's (or an attribute's) turning to one of `to`. */
const turning = (ref: string, to: readonly string[]): NoticeTrigger => {
  const attribute = attributeOf(ref);
  return { kind: 'state', entity: entityOf(ref), to, ...(attribute ? { attribute } : {}) };
};

/** A slug as Home Assistant writes one: the letters without their accents, the rest an underscore. */
const slug = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/**
 * The words of a state that say finished: those of its options that do, else every integration's (hOn's 7). `strict`
 * (a phase): its options only — a phase's free words say nothing sure.
 */
function finishedWords(
  hass: HomeAssistant,
  entity: string,
  platform: string | undefined,
  kind: ApplianceKind,
  strict: boolean,
): string[] {
  const options = hass.states[entity]?.attributes['options'];
  if (Array.isArray(options))
    return options.filter(
      (option): option is string =>
        typeof option === 'string' && statusOfWord(option, platform, kind) === 'finished',
    );
  if (strict) return [];
  return platform === 'hon' ? ['7'] : [...FINISHED_WORDS];
}

/**
 * What never finishes a cycle: a fridge, a freezer, a wine cooler (on a plug, its compressor would say "done" every
 * time it rests), a hob, a coffee machine (a cup is not a cycle).
 */
const NEVER_DONE: ReadonlySet<ApplianceKind> = new Set([
  'fridge',
  'freezer',
  'wine',
  'hob',
  'coffee',
]);

/**
 * What says the appliance's cycle is over, as triggers of one kind; none where nothing can say it (`NEVER_DONE`). A
 * plug finishes as its card reads it: under half its running power for `finishedAfter` minutes.
 */
export function noticeTriggers(
  hass: HomeAssistant,
  found: ApplianceFound,
  kind: ApplianceKind,
  plug: { readonly running: number; readonly finishedAfter: number },
): NoticeTrigger[] {
  const { roles } = found.entities;
  if (NEVER_DONE.has(kind)) return [];
  if (roles.notification)
    return [{ kind: 'event', entity: roles.notification, types: [...COMPLETED] }];
  if (roles.completed) return [turning(roles.completed, ['on'])];
  if (roles.state)
    return [
      [roles.state, false],
      [roles.phase, true],
    ].flatMap(([ref, strict]): NoticeTrigger[] => {
      if (typeof ref !== 'string') return [];
      const to = finishedWords(hass, ref, found.platform, kind, Boolean(strict));
      return to.length ? [turning(ref, to)] : [];
    });
  if (roles.running) return [{ kind: 'off', entity: roles.running }];
  if (roles.watts)
    return [
      { kind: 'below', entity: roles.watts, below: plug.running / 2, minutes: plug.finishedAfter },
    ];
  return [];
}

/** The administrator's phone: Home Assistant's app on a device their person tracks, as its notify service. */
export function phoneOf(hass: HomeAssistant): string | undefined {
  const services = hass.services?.['notify'] ?? {};
  const person = Object.values(hass.states).find(
    (state) =>
      state.entity_id.startsWith('person.') && state.attributes['user_id'] === hass.user?.id,
  );
  const trackers = person?.attributes['device_trackers'];
  for (const tracker of Array.isArray(trackers) ? trackers : []) {
    const entry = hass.entities?.[String(tracker)];
    if (entry?.platform !== 'mobile_app') continue;
    const device = entry.device_id ? hass.devices?.[entry.device_id] : undefined;
    const service = `mobile_app_${slug(device?.name ?? String(tracker).replace(/^[^.]*\./, ''))}`;
    if (service in services) return service;
  }
  return undefined;
}
