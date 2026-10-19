/** The Activity page's row detail: its facts, the cause as a way in, the buttons laid out by measurement. */
import { html, nothing, type TemplateResult } from 'lit';
import {
  domainOf,
  formatDate,
  localize,
  moreInfo,
  navigate,
  type EntityView,
  type KeyOf,
  type SourceTarget,
} from '@fluvy/core';
import type { ActivityCause, ActivityItem } from '@fluvy/core/activity';
import { glyph, textWidth } from '@fluvy/ui';
import { changeOf } from './rows.js';
import { HOUR, keepDay, type Place } from './shared.js';
import { focusOn } from './sources.js';
import type { FluvyActivity } from './view.js';
import { causeGlyph, causeName, isMoment, triggerOf } from './words.js';

type ActivityString = KeyOf<'activity' | 'page'>;

export function renderDetail(
  page: FluvyActivity,
  item: ActivityItem,
  view: EntityView | undefined,
  cause: ActivityCause | undefined,
  place: Place,
): TemplateResult {
  const { event, key } = item;
  const hass = page.hass!;
  const when = new Date(event.when * 1000);
  const domain = event.entity_id ? domainOf(event.entity_id) : '';
  const registry = event.entity_id ? hass.entities?.[event.entity_id] : undefined;
  const device = registry?.device_id ? hass.devices?.[registry.device_id] : undefined;
  // where it is: its area, then its device — said once when the device is named like its area
  const where = [view?.areaName ?? '', device?.name_by_user ?? device?.name ?? ''].filter(
    (part, i, parts) =>
      part !== '' && parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === i,
  );
  const trigger = triggerOf(page, event);
  const facts: [ActivityString, TemplateResult | string][] = [
    [
      'fact.when',
      html`<span class="av-parts" data-parts
        ><span class="av-part">${keepDay(formatDate(hass, when, 'full'))}</span
        ><span class="av-part">${page.time(when.getTime(), true)}</span></span
      >`,
    ],
  ];
  if (event.state !== undefined && event.entity_id && !isMoment(event))
    facts.push(['fact.change', changeOf(page, event, item.from, view)]);
  if (trigger) facts.push(['fact.trigger', trigger]);
  if (cause) facts.push(['fact.cause', causeLink(page, cause)]);
  if (where.length) facts.push(['fact.where', where.join(' · ')]);
  const config = domain === 'automation' ? view?.stateObj?.attributes['id'] : undefined;
  const buttons: [string, () => void][] = [];
  if (event.entity_id && view?.stateObj)
    buttons.push([page.t('more_info'), () => moreInfo(page, event.entity_id!)]);
  // the quick way to Sources: only page device (or entity) on the day on screen
  const focus: SourceTarget | undefined = device
    ? { device_id: [device.id] }
    : event.entity_id
      ? { entity_id: [event.entity_id] }
      : undefined;
  if (focus && JSON.stringify(focus) !== JSON.stringify(page.target))
    buttons.push([page.t('only_this'), () => focusOn(page, focus)]);
  if (config !== undefined && hass.user?.is_admin)
    buttons.push([
      localize(hass, 'common.trace'),
      () => navigate(`/config/automation/trace/${String(config)}`),
    ]);
  else if (event.entity_id && view?.stateObj) {
    const from = new Date(when.getTime() - HOUR).toISOString();
    const to = new Date(when.getTime() + HOUR).toISOString();
    buttons.push([
      page.t('history'),
      () => navigate(`/history?entity_id=${event.entity_id}&start_date=${from}&end_date=${to}`),
    ]);
  }
  if (device && hass.user?.is_admin)
    buttons.push([page.t('device'), () => navigate(`/config/devices/device/${device.id}`)]);
  return foldDetail(
    page,
    key,
    place,
    html`<dl class="av-facts">
        ${facts.map(
          ([label, value]) =>
            html`<div class="av-fact">
              <dt>${page.t(label)}</dt>
              <dd>${value}</dd>
            </div>`,
        )}
      </dl>
      ${detailActions(page, buttons)}`,
  );
}

/**
 * The cause, a way in: an automation opens its trace (for an administrator) or its details, a script or a device
 * its details; a person is only named.
 */
export function causeLink(page: FluvyActivity, cause: ActivityCause): TemplateResult {
  const hass = page.hass!;
  const name = causeName(page, cause);
  const kind = page.t(`kind.${cause.kind}` as ActivityString);
  // what it is follows the name when there is room; on a short line it goes (the glyph says it)
  const inner = html`${glyph(causeGlyph(cause))}<span class="av-link-row__text" data-one-line
      ><span class="av-link-row__name">${name}</span
      ><span class="av-link-row__kind">· ${kind}</span></span
    >`;
  const entity = cause.entityId;
  const config = entity ? hass.states[entity]?.attributes['id'] : undefined;
  const open =
    cause.kind === 'automation' && config !== undefined && hass.user?.is_admin
      ? () => navigate(`/config/automation/trace/${String(config)}`)
      : entity && hass.states[entity]
        ? () => moreInfo(page, entity)
        : undefined;
  return open
    ? html`<button class="av-link-row" @click=${open}>${inner}${glyph('chevron')}</button>`
    : html`<span class="av-link-row is-plain">${inner}</span>`;
}

/**
 * The detail's buttons: one row of equals when every label fits its cell; else the main one alone at full width
 * and the others in pairs; else one a row. Chosen by measuring the labels (in the page's language), not by width.
 */
export function detailActions(
  page: FluvyActivity,
  buttons: readonly (readonly [string, () => void])[],
): TemplateResult | typeof nothing {
  if (!buttons.length) return nothing;
  page.family ||= getComputedStyle(page).fontFamily || 'Inter, sans-serif';
  const face = { size: 15, weight: 600, family: page.family };
  const widths = buttons.map(([label]) => Math.ceil(textWidth(label, face)));
  const room = detailWidth(page);
  const cell = (n: number): number => (room - (n - 1) * 8) / n;
  // the label and a button's 12 px sides, in a cell of n sharing the detail's width
  const fits = (n: number, from = 0): boolean =>
    !room || Math.max(...widths.slice(from)) + 24 <= cell(n);
  const shape: number[] = [];
  if (fits(buttons.length)) shape.push(buttons.length);
  else {
    // the main one is alone on its row: the pairs are decided by the others
    const pair = fits(2, 1) ? 2 : 1;
    shape.push(1);
    for (let at = 1; at < buttons.length; at += pair)
      shape.push(Math.min(pair, buttons.length - at));
  }
  // a label that cannot keep its 12 px sides even alone (a narrow phone) takes 8, then two lines
  const button = ([label, run]: readonly [string, () => void], i: number, n: number) => {
    const width = widths[i]!;
    const fit =
      !room || width + 24 <= cell(n) ? '' : width + 16 <= cell(n) ? 'is-tight' : 'is-wrap';
    return html`<button
      class="fv-btn ${i === 0 ? 'fv-btn--accent' : 'fv-btn--quiet'} ${fit}"
      @click=${run}
    >
      ${label}
    </button>`;
  };
  let at = 0;
  const rows = shape.map((n) => {
    const items = buttons.slice(at, at + n).map((item, k) => button(item, at + k, n));
    at += n;
    return html`<div class="av-actions" style="--n:${n}" data-fill-row>${items}</div>`;
  });
  return rows.length === 1 ? rows[0]! : html`<div class="av-stack">${rows}</div>`;
}

/** The text column's width: the column (inside its card), less the time and node columns before the text. */
export function textColumn(page: FluvyActivity): number {
  const column = page.mainWidth - (page.card ? (page.compact ? 32 : 48) : 0);
  return column - (page.compact ? 0 : page.timeWidth + 12) - 40 - 12;
}

/** The width inside a row's detail: the column, less the detail's indent (to the text) and its card's padding. */
export function detailWidth(page: FluvyActivity): number {
  if (!page.mainWidth) return 0;
  const column = page.mainWidth - (page.card ? (page.compact ? 32 : 48) : 0);
  const indent = 8 + (page.compact ? 0 : page.timeWidth + 12) + 40 + 12;
  // the detail reaches 8 px past the column on either side; its padding is the indent and 8; the card inside, 16
  return column + 16 - indent - 8 - 32;
}

/** What a row unfolds: it opens from nothing and folds back before it goes. */
export function foldDetail(
  page: FluvyActivity,
  key: string,
  place: Place,
  content: TemplateResult,
): TemplateResult {
  return html`<div
    class="av-detail ${page.closing.has(key) ? 'is-closing' : ''} ${place.gapAfter ? 'is-gap' : ''}"
    data-key=${key}
    @animationend=${page.onFolded}
  >
    <div class="av-detail__clip"><div class="av-detail__inner">${content}</div></div>
  </div>`;
}
