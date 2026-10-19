import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  changeText,
  clockText,
  daysShort,
  daysText,
  lastText,
  momentText,
  nextText,
  offsetWords,
  scheduleLines,
  spanBare,
  spanText,
  suggestAlias,
  weekdayShort,
  whenShort,
} from './format.js';
import type { Schedule, Weekday } from './schedule.js';

/** A house speaking `language` on a 24-hour clock (12 when asked), the browser's own zone. */
const house = (language = 'en', clock: '12' | '24' = '24'): HomeAssistant =>
  ({
    language,
    locale: { language, number_format: 'language', time_format: clock },
    states: {},
  }) as unknown as HomeAssistant;

const en = house();
/** Thursday 17 September 2026, 21:47 — the sheets' moment. */
const NOW = new Date(2026, 8, 17, 21, 47, 12);
const at = (hours: number, minutes = 0, days = 0): Date =>
  new Date(2026, 8, 17 + days, hours, minutes);

describe('the days in words', () => {
  it('names the three kinds', () => {
    expect(daysText(en, { kind: 'every' })).toBe('Every day');
    expect(daysText(en, { kind: 'workdays' })).toBe('Workdays');
    expect(daysText(en, { kind: 'workdays', sensor: 'binary_sensor.workday_sensor' })).toBe(
      'Workdays',
    );
    expect(daysText(en, { kind: 'weekend' })).toBe('Weekends');
  });

  it('says a run of three or more with an en dash, the rest one by one', () => {
    const custom = (days: Weekday[]): string => daysText(en, { kind: 'custom', days });
    expect(custom(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('Mon–Fri');
    expect(custom(['mon', 'wed', 'fri'])).toBe('Mon, Wed, Fri');
    expect(custom(['mon', 'tue'])).toBe('Mon, Tue');
    expect(custom(['mon', 'tue', 'wed', 'sat'])).toBe('Mon–Wed, Sat');
    expect(custom(['sat'])).toBe('Sat');
  });

  it('wraps a run across the end of the week', () => {
    expect(daysText(en, { kind: 'custom', days: ['fri', 'sat', 'sun', 'mon'] })).toBe('Fri–Mon');
    expect(daysText(en, { kind: 'custom', days: ['sun', 'mon', 'wed'] })).toBe('Wed, Sun, Mon');
  });

  it('shortens a list of four or more to its count where a row is narrow', () => {
    expect(daysShort(en, { kind: 'custom', days: ['mon', 'tue', 'thu', 'fri'] })).toBe('4 days');
    expect(daysShort(en, { kind: 'custom', days: ['mon', 'wed', 'fri'] })).toBe('Mon, Wed, Fri');
    expect(daysShort(en, { kind: 'every' })).toBe('Every day');
  });

  it.each([
    ['de', 'Mo', 'Mo–Fr', 'Jeden Tag'],
    ['es', 'lun', 'lun–vie', 'Cada día'],
    ['fr', 'lun', 'lun–ven', 'Tous les jours'],
    ['it', 'lun', 'lun–ven', 'Ogni giorno'],
    ['nl', 'ma', 'ma–vr', 'Elke dag'],
    ['pt-BR', 'seg', 'seg–sex', 'Todo dia'],
    ['tr', 'Pzt', 'Pzt–Cum', 'Her gün'],
  ])('speaks %s: the short weekday, a run, every day', (language, monday, run, every) => {
    const hass = house(language);
    expect(weekdayShort(hass, 'mon')).toBe(monday);
    expect(daysText(hass, { kind: 'custom', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe(run);
    expect(daysText(hass, { kind: 'every' })).toBe(every);
  });
});

describe('moments and spans', () => {
  it('reads a clock time on the house’s clock, 12 hours when it asks', () => {
    expect(clockText(en, '09:05')).toBe('09:05');
    expect(clockText(en, '00:00')).toBe('00:00');
    expect(clockText(house('en', '12'), '09:05')).toBe('09:05 AM');
    expect(clockText(house('en', '12'), '21:05')).toBe('09:05 PM');
  });

  it('says a sun offset in hours and minutes, signed', () => {
    expect(offsetWords(en, 15)).toBe('+15 min');
    expect(offsetWords(en, -30)).toBe('−30 min');
    expect(offsetWords(en, 75)).toBe('+1 h 15 min');
    expect(offsetWords(en, -120)).toBe('−2 h');
    expect(offsetWords(en, 0)).toBe('+0 min');
  });

  it('names a moment: the time, or the sun with its offset', () => {
    expect(momentText(en, { kind: 'time', at: '06:45' })).toBe('06:45');
    expect(momentText(en, { kind: 'sun', event: 'sunrise', offset: 0 })).toBe('Sunrise');
    expect(momentText(en, { kind: 'sun', event: 'sunset', offset: -30 })).toBe('Sunset −30 min');
    expect(momentText(house('de'), { kind: 'sun', event: 'sunset', offset: -30 })).toBe(
      'Sonnenuntergang −30 min',
    );
  });

  it('writes a window as its two moments with an en dash, and without the sun’s offsets when asked', () => {
    const start = { kind: 'time', at: '09:00' } as const;
    const sunrise = { kind: 'sun', event: 'sunrise', offset: 15 } as const;
    const sunset = { kind: 'sun', event: 'sunset', offset: -30 } as const;
    expect(spanText(en, start)).toBe('09:00');
    expect(spanText(en, start, { kind: 'time', at: '11:00' })).toBe('09:00–11:00');
    expect(spanText(en, sunrise, { kind: 'time', at: '23:00' })).toBe('Sunrise +15 min–23:00');
    expect(spanText(en, sunrise, sunset)).toBe('Sunrise +15 min–Sunset −30 min');
    expect(spanBare(en, sunrise, sunset)).toBe('Sunrise–Sunset');
    expect(spanBare(en, start, { kind: 'time', at: '11:00' })).toBe('09:00–11:00');
    expect(spanBare(en, sunset)).toBe('Sunset');
  });

  it('lines a schedule up from the fullest to the least it says, each whole, in the order that gives way', () => {
    const blinds: Schedule = {
      id: 'fluvy_0b1a2d3e4f50',
      alias: 'Blinds',
      targets: ['cover.living'],
      days: { kind: 'every' },
      start: { kind: 'sun', event: 'sunrise', offset: 15 },
      end: { kind: 'sun', event: 'sunset', offset: -30 },
      then: { verb: 'open' },
    };
    expect(scheduleLines(en, blinds, at(7, 52, 1), NOW)).toEqual([
      'Every day · Sunrise +15 min–Sunset −30 min · Next in 10 h',
      'Every day · Sunrise +15 min–Sunset −30 min · In 10 h',
      'Every day · Sunrise +15 min–Sunset −30 min',
      'Every day · Sunrise–Sunset',
      'Every day · Sunrise',
    ]);
    const four: Schedule = {
      ...blinds,
      days: { kind: 'custom', days: ['mon', 'tue', 'thu', 'fri'] },
      start: { kind: 'time', at: '09:00' },
      end: { kind: 'time', at: '11:00' },
    };
    // a clock window has no offsets to lose: its forms are fewer, and the days' word and the start never go
    expect(scheduleLines(en, four, undefined, NOW)).toEqual([
      'Mon, Tue, Thu, Fri · 09:00–11:00',
      'Mon, Tue, Thu, Fri · 09:00',
      '4 days · 09:00',
    ]);
    const lone: Schedule = {
      id: blinds.id,
      alias: blinds.alias,
      targets: blinds.targets,
      days: blinds.days,
      start: { kind: 'time', at: '23:00' },
      then: blinds.then,
    };
    expect(scheduleLines(en, lone, undefined, NOW)).toEqual(['Every day · 23:00']);
  });
});

describe('the next and the last run', () => {
  it('says the next run within the day as a wait, beyond it with its weekday', () => {
    expect(nextText(en, at(23, 47), NOW)).toBe('Next in 2 h');
    expect(nextText(en, at(22, 17), NOW)).toBe('Next in 30 min');
    expect(nextText(en, at(9, 0, 1), NOW)).toBe('Next in 11 h');
    expect(nextText(en, at(9, 0, 3), NOW)).toBe('Next Sun 09:00');
    expect(nextText(en, at(21, 47, 7), NOW)).toBe('Next Thu 21:47');
  });

  it('says a next run under a minute away by its time, never "Next Now"', () => {
    expect(nextText(en, new Date(NOW.getTime() + 20_000), NOW)).toBe('Next 21:47');
  });

  it('says the last run today by its time, before that by how long ago, and never when it never ran', () => {
    expect(lastText(en, undefined, NOW)).toBe('Never run');
    expect(lastText(en, new Date(Number.NaN), NOW)).toBe('Never run');
    expect(lastText(en, at(19, 47), NOW)).toBe('Ran 19:47');
    expect(lastText(en, at(15, 47, -1), NOW)).toBe('Yesterday');
    expect(lastText(en, at(21, 47, -3), NOW)).toBe('3 days ago');
  });

  it.each(['de', 'es', 'fr', 'it', 'nl', 'pt-BR', 'tr'])(
    'speaks %s for the next and the last run, with the words in place',
    (language) => {
      const hass = house(language);
      const next = nextText(hass, at(23, 47), NOW);
      expect(next).not.toContain('{');
      expect(next.length).toBeGreaterThan(5);
      expect(lastText(hass, undefined, NOW)).not.toContain('.');
      expect(lastText(hass, at(21, 47, -3), NOW)).toMatch(/3/);
    },
  );
});

describe('what a target does next', () => {
  it('says when as a sentence goes on: a wait within the day, the weekday beyond it, the time when it is now', () => {
    expect(whenShort(en, at(23, 47), NOW)).toBe('in 2 h');
    expect(whenShort(en, at(6, 45, 1), NOW)).toBe('in 9 h');
    expect(whenShort(en, at(7, 15, 4), NOW)).toBe('Mon 07:15');
    expect(whenShort(en, new Date(NOW.getTime() + 20_000), NOW)).toBe('21:47');
  });

  it('says it by the verb', () => {
    expect(changeText(en, 'on', at(6, 45, 1), NOW)).toBe('Turns on in 9 h');
    expect(changeText(en, 'off', at(23, 47), NOW)).toBe('Turns off in 2 h');
    expect(changeText(en, 'open', at(7, 15, 4), NOW)).toBe('Opens Mon 07:15');
    expect(changeText(en, 'close', at(22, 22), NOW)).toBe('Closes in 35 min');
    expect(changeText(en, 'run', at(23, 0), NOW)).toBe('Runs in 1 h');
  });

  it.each(['de', 'es', 'fr', 'it', 'nl', 'pt-BR', 'tr'])(
    'speaks %s, the wait where the language puts it',
    (language) => {
      const words = changeText(house(language), 'on', at(6, 45, 1), NOW);
      expect(words).not.toContain('{');
      expect(words).toMatch(/9/);
    },
  );
});

describe('the name a schedule suggests', () => {
  it('names the first target, its days and its span', () => {
    expect(
      suggestAlias(
        en,
        ['Kitchen lamp'],
        { kind: 'workdays' },
        { kind: 'time', at: '09:00' },
        { kind: 'time', at: '11:00' },
      ),
    ).toBe('Kitchen lamp · Workdays 09:00–11:00');
  });

  it('counts the other targets after the first, and keeps the name fit to write', () => {
    expect(
      suggestAlias(
        en,
        ['Kitchen lamp', 'Hall light', 'Porch'],
        { kind: 'every' },
        {
          kind: 'sun',
          event: 'sunset',
          offset: -30,
        },
      ),
    ).toBe('Kitchen lamp +2 · Every day Sunset −30 min');
    expect(
      suggestAlias(
        en,
        ['Blinds'],
        { kind: 'every' },
        { kind: 'sun', event: 'sunrise', offset: 15 },
        { kind: 'sun', event: 'sunset', offset: -30 },
      ),
    ).toBe('Blinds · Every day Sunrise +15 min–Sunset −30 min');
    expect(
      suggestAlias(en, ['  Lamp \u0007 one  '], { kind: 'every' }, { kind: 'time', at: '09:00' }),
    ).toBe('Lamp one · Every day 09:00');
  });

  it('says the days and the time alone while nothing is chosen', () => {
    expect(suggestAlias(en, [], { kind: 'every' }, { kind: 'time', at: '22:00' })).toBe(
      'Every day 22:00',
    );
  });
});
