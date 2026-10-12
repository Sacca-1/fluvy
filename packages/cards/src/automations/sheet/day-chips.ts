import { localize, type HomeAssistant, type MessageKey } from '@fluvy/core';
import { optionGrid, type ChipItem } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { fittedColumns, type ChipFit } from '../../shared/chips.js';
import { firstWeekday } from '../../shared/dates.js';
import { weekdayShort } from '../format.js';
import { WEEKDAYS, type Weekday } from '../schedule.js';

/** A weekday's long word in the catalogue (`option.monday`), for what a reader hears. */
const LONG: Readonly<Record<Weekday, MessageKey>> = {
  mon: 'option.monday',
  tue: 'option.tuesday',
  wed: 'option.wednesday',
  thu: 'option.thursday',
  fri: 'option.friday',
  sat: 'option.saturday',
  sun: 'option.sunday',
};

/** The week's days from the one the house starts its week on (`firstWeekday`: Sunday is 0, as `getDay` counts). */
export function weekFrom(hass: HomeAssistant | undefined): readonly Weekday[] {
  const start = (firstWeekday(hass, undefined) + 6) % 7; // the index in `WEEKDAYS`, which starts on Monday
  return WEEKDAYS.map((_, index) => WEEKDAYS[(start + index) % 7] as Weekday);
}

/**
 * The seven days as chips that fill one row (four and three where a column cannot hold seven short words), each
 * pressed or not, its short word on the chip and its long one for a reader; a tap toggles the day.
 */
export function dayChips(
  hass: HomeAssistant | undefined,
  chosen: readonly Weekday[],
  onToggle: (day: Weekday) => void,
  fit: ChipFit,
): TemplateResult {
  const days = weekFrom(hass);
  const items: ChipItem[] = days.map((day) => ({ key: day, label: weekdayShort(hass, day) }));
  const grid = optionGrid(days.length, fittedColumns(items, fit, [7, 4]));
  return html`<div
    class="fv-chips fv-chips--fill ss-days"
    role="group"
    style="grid-template-columns:repeat(${grid.tracks}, minmax(0, 1fr))"
  >
    ${days.map((day, index) => {
      const active = chosen.includes(day);
      return html`<button
        class="fv-chip ${active ? 'is-active' : ''}"
        data-target
        aria-pressed=${active ? 'true' : 'false'}
        aria-label=${localize(hass, LONG[day])}
        style=${grid.spans[index] === 1 ? nothing : `grid-column:span ${grid.spans[index]}`}
        @click=${() => onToggle(day)}
      >
        <span class="fv-chip__pill" data-control>${weekdayShort(hass, day)}</span>
      </button>`;
    })}
  </div>`;
}
