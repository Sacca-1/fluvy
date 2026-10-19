import type { HomeAssistant } from '@fluvy/core';
import type { ReactiveElement } from 'lit';
import type { CalendarCardConfig } from '../config.js';
import type { Agenda } from '../model.js';
import type { Words } from '../words.js';
import { type Tone } from '@fluvy/ui';

/** ok · still reading · every read failed · every calendar is unavailable or gone */
export type Status = 'ok' | 'loading' | 'failed' | 'unavailable';

/**
 * Everything a view may know. Views are plain functions of this object: they hold no state, read no
 * data of their own and ask the one `agenda` for every count, row and dot they draw.
 */
export interface ViewContext {
  readonly hass: HomeAssistant | undefined;
  readonly config: CalendarCardConfig;
  readonly agenda: Agenda;
  readonly words: Words;
  readonly status: Status;
  /** A quiet line about calendars that could not be read while others could; empty when all is well. */
  readonly notice: string;
  /**
   * What the calendars say while not one of them can be read ("Unavailable", "Entity not found"): the head's state, as
   * the view draws itself at rest; '' while one can be.
   */
  readonly away: string;
  /** Content width of the card (its width minus the 20 px sides). */
  readonly width: number;
  /** The selected day (today until the user picks another). */
  readonly day: Date;
  /** First day of the month the grid shows. */
  readonly month: Date;
  /** The weekday a week starts on, as `Date#getDay()` counts. */
  readonly first: number;
  /** Which way the month last turned: the grid slides in from that side. */
  readonly turn: -1 | 0 | 1;
  /** The day holding the month grid's tab stop (the selected day until the keys move it). */
  readonly focus: Date;
  /** The card: the grid's focus follows the tab stop once it has drawn a move. */
  readonly host: ReactiveElement;
  toneOf(entityId: string): Tone;
  /** A calendar's own colour, as `AccentSheet` reads `data-accent`; nothing for one without. */
  accentOf(entityId: string): string | undefined;
  nameOf(entityId: string): string;
  select(day: Date): void;
  stepMonth(direction: 1 | -1): void;
  /** The keys moved the tab stop to `day`, turning the month when it left it (the selection stays). */
  moveFocus(day: Date): void;
  /** More-info of a calendar (the first one when none is named). */
  open(entityId?: string): void;
}
