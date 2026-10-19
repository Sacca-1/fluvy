import {
  areaOf,
  isUsable,
  localize,
  resolveEntity,
  stateText,
  strings,
  usableEntity,
  type EntityView,
  type HomeAssistant,
} from '@fluvy/core';
import { glyph, listRow, type ChipItem } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import { chipRow, type ChipFit } from '../../shared/chips.js';
import { glyphFor } from '../../shared/domain.js';
import { domainsOf, verbsFor } from '../schedule.js';
import type { TargetChoice } from '../scope.js';

/**
 * The sheet's "What": a live search over the entities a schedule may target, the ones chosen as chips with a close
 * glyph, and the candidates as compact rows grouped by area — at most six, then "{n} more · keep typing", so the
 * sheet never scrolls inside a list. A card about a few entities (`only`) shows them instead: one as a fixed row,
 * up to six as chips that toggle in place. Pure templates and one pure search; the sheet keeps the state.
 */

const s = strings('automations');

/** How many candidates the sheet shows before it asks for more letters; as many targets of a card show as chips. */
export const MATCHES = 6;

/** Where the candidates come from: the house's entities of those domains (in the area), or a card's targets alone. */
export type Scope =
  | { readonly domains: readonly string[]; readonly area?: string | undefined }
  | { readonly only: readonly string[] };

/** Whether an entity can join those chosen: the verbs they share would not be none (a light and a cover share none). */
export const joins = (chosen: readonly string[], id: string): boolean =>
  !chosen.length || verbsFor(domainsOf([...chosen, id])).length > 0;

export interface Candidate {
  readonly id: string;
  readonly view: EntityView;
  /** The area's name; '' for an entity in none. */
  readonly area: string;
}

export interface Candidates {
  /** The matches shown, grouped by area in the area's order, the ones in no area last. */
  readonly groups: ReadonlyArray<{ readonly area: string; readonly items: readonly Candidate[] }>;
  /** How many matches are not shown. */
  readonly more: number;
}

/**
 * The entities a schedule may target that match the words typed (every word in the name or the id): of the domains
 * allowed, in the area when one is set, usable (not hidden, not config or diagnostic) — or a card's targets alone,
 * as they are (an explicit choice wins) — not chosen already, and sharing a verb with those that are: the first six
 * by area and name, and how many more there are.
 */
export function findCandidates(
  hass: HomeAssistant,
  scope: Scope,
  query: string,
  chosen: readonly string[],
): Candidates {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const house = 'only' in scope ? undefined : scope;
  const found: Candidate[] = [];
  for (const id of 'only' in scope ? scope.only : Object.keys(hass.states)) {
    if (house && !house.domains.includes(id.slice(0, id.indexOf('.')))) continue;
    if (chosen.includes(id) || !joins(chosen, id)) continue;
    if (house && !usableEntity(hass, id)) continue;
    const areaId = areaOf(hass, id);
    if (house?.area && areaId !== house.area) continue;
    const view = resolveEntity(hass, id);
    const hay = `${view.name} ${id}`.toLocaleLowerCase();
    if (!words.every((word) => hay.includes(word))) continue;
    found.push({ id, view, area: (areaId && hass.areas[areaId]?.name) || '' });
  }
  const language = hass.language;
  found.sort((a, b) => {
    if (a.area !== b.area) {
      if (!a.area) return 1;
      if (!b.area) return -1;
      return a.area.localeCompare(b.area, language);
    }
    return a.view.name.localeCompare(b.view.name, language);
  });
  const shown = found.slice(0, MATCHES);
  const groups: { area: string; items: Candidate[] }[] = [];
  for (const item of shown) {
    const last = groups[groups.length - 1];
    if (last && last.area === item.area) last.items.push(item);
    else groups.push({ area: item.area, items: [item] });
  }
  return { groups, more: found.length - shown.length };
}

export interface SearchFieldOptions {
  readonly value: string;
  readonly label: string;
  readonly onInput: (value: string) => void;
}

/**
 * The language's text field as a live search (`.fv-field`, the search glyph trailing). Keys typed in it never leave
 * the sheet: Home Assistant binds single-letter shortcuts on the window and cannot see the focus is in a dialog.
 */
export function searchField(o: SearchFieldOptions): TemplateResult {
  return html`<div class="fv-field ss-search" data-control>
    <input
      class="fv-field__input"
      type="search"
      data-field="search"
      .value=${live(o.value)}
      aria-label=${o.label}
      placeholder=${o.label}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="search"
      @input=${(event: Event) => o.onInput((event.currentTarget as HTMLInputElement).value)}
      @keydown=${(event: KeyboardEvent) => event.stopPropagation()}
    />
    ${glyph('search')}
  </div>`;
}

/** The targets chosen, each a content-sized chip with its name and a close glyph; a tap on the chip removes it. */
export function chosenChips(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  onRemove: (id: string) => void,
  nameOf: (id: string) => string = (id) => resolveEntity(hass, id).name,
): TemplateResult | typeof nothing {
  if (!ids.length) return nothing;
  return html`<div class="fv-chips ss-chosen">
    ${ids.map((id) => {
      const name = nameOf(id);
      return html`<button
        class="fv-chip"
        data-target
        data-fit="28"
        aria-label=${`${localize(hass, 'editor.remove')} · ${name}`}
        title=${name}
        @click=${() => onRemove(id)}
      >
        <span class="fv-chip__pill" data-control
          ><span class="fv-chip__name" data-name>${name}</span>${glyph('close')}</span
        >
      </button>`;
    })}
  </div>`;
}

/**
 * A card's one target, fixed: a row that is information, not a control (no tap) — its icon, its name and "{area} ·
 * {state}" ("Kitchen · On"), the Unavailable skin when it cannot be read.
 */
export function fixedTarget(
  hass: HomeAssistant | undefined,
  choice: TargetChoice,
  name: string,
): TemplateResult {
  const view = resolveEntity(hass, choice.id);
  return html`<div class="ss-fixed">
    ${listRow({
      icon: choice.icon ?? glyphFor(view),
      tone: 'neutral',
      title: name,
      name: true,
      sub: [view.areaName, stateText(hass, view)].filter(Boolean).join(' · '),
      trailing: 'none',
      unavailable: !isUsable(view),
    })}
  </div>`;
}

/**
 * A card's targets as chips that fill their row, in the card's order, each pressed or not; one that shares no verb
 * with those chosen is disabled, so the Do tiles are never none. Nothing moves under the finger: a tap presses or
 * releases a chip where it stands.
 */
export function targetChips(
  hass: HomeAssistant | undefined,
  only: readonly TargetChoice[],
  chosen: readonly string[],
  nameOf: (id: string) => string,
  onToggle: (id: string) => void,
  fit: ChipFit,
): TemplateResult {
  const items: ChipItem[] = only.map((choice) => {
    const active = chosen.includes(choice.id);
    return {
      key: choice.id,
      label: nameOf(choice.id),
      name: true,
      glyph: choice.icon ?? glyphFor(resolveEntity(hass, choice.id)),
      active,
      disabled: !active && !joins(chosen, choice.id),
    };
  });
  return html`<div class="ss-targets">${chipRow(items, onToggle, 'full', fit)}</div>`;
}

/** The candidates as compact rows under their area's name, and the count of the rest under them. */
export function candidateRows(
  hass: HomeAssistant | undefined,
  candidates: Candidates,
  onPick: (id: string) => void,
): TemplateResult | typeof nothing {
  if (!candidates.groups.length) return nothing;
  return html`<div class="ss-candidates">
    ${candidates.groups.map(
      (group) =>
        html`<p class="ss-group">${group.area || s(hass, 'no_area')}</p>
          <div class="ss-group__rows">
            ${group.items.map((item) =>
              listRow({
                icon: glyphFor(item.view),
                tone: 'neutral',
                title: item.view.name,
                name: true,
                compact: true,
                trailing: 'none',
                onTap: () => onPick(item.id),
              }),
            )}
          </div>`,
    )}
    ${
      candidates.more
        ? html`<p class="ss-more">${s(hass, 'more_matches', { count: candidates.more })}</p>`
        : nothing
    }
  </div>`;
}
