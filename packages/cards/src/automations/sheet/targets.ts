import {
  areaOf,
  localize,
  resolveEntity,
  strings,
  usableEntity,
  type EntityView,
  type HomeAssistant,
} from '@fluvy/core';
import { glyph, listRow } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import { glyphFor } from '../../shared/domain.js';

/**
 * The sheet's "What": a live search over the entities a schedule may target, the ones chosen as chips with a close
 * glyph, and the candidates as compact rows grouped by area — at most six, then "{n} more · keep typing", so the
 * sheet never scrolls inside a list. Pure templates and one pure search; the sheet keeps the state.
 */

const s = strings('automations');

/** How many candidates the sheet shows before it asks for more letters. */
export const MATCHES = 6;

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
 * The entities a schedule may target that match the words typed (every word in the name or the id), of the domains
 * allowed, in the area when one is set, not chosen already, usable (not hidden, not config or diagnostic): the
 * first six by area and name, and how many more there are.
 */
export function findCandidates(
  hass: HomeAssistant,
  domains: readonly string[],
  area: string | undefined,
  query: string,
  chosen: readonly string[],
): Candidates {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const found: Candidate[] = [];
  for (const id of Object.keys(hass.states)) {
    const domain = id.slice(0, id.indexOf('.'));
    if (!domains.includes(domain) || chosen.includes(id) || !usableEntity(hass, id)) continue;
    const areaId = areaOf(hass, id);
    if (area && areaId !== area) continue;
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
): TemplateResult | typeof nothing {
  if (!ids.length) return nothing;
  return html`<div class="fv-chips ss-chosen">
    ${ids.map((id) => {
      const name = resolveEntity(hass, id).name;
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
