// @vitest-environment happy-dom
import { preloadLanguages, type HomeAssistant } from '@fluvy/core';
import { html, render } from 'lit';
import { describe, expect, it } from 'vitest';
import type { TextRuler } from '../shared/fit.js';
import { heroDigital, side, tile, type ClockModel } from './layouts.js';

/*
 * The time steps down a size before a digit is cut: the hero's 64 to 48, the side clock's 40 to 32 (the face following
 * it down to a tile's 24), the tile's 40 to 32. The ruler is a stub: a glyph is 0.6 em wide, a unit adds its margin.
 */

const ruler = {
  width(...args: [string, string, string?, string?]): number {
    const [cls, text, , unit = ''] = args;
    const size = /ck-big--s/.test(cls)
      ? 48
      : /ck-big/.test(cls)
        ? 64
        : /--s/.test(cls)
          ? 32
          : /ck-tile__time|ck-time/.test(cls)
            ? 40
            : 13;
    const unitSize = /ck-big/.test(cls) ? 24 : 16;
    return (
      Math.round(text.length * size * 0.6) +
      (unit ? 8 + Math.round(unit.length * unitSize * 0.6) : 0) +
      1
    );
  },
  pill: () => 0,
  clear() {},
} as unknown as TextRuler;

const model = (width: number, period = ''): ClockModel => ({
  hass: undefined,
  analog: true,
  numerals: 'none',
  seconds: false,
  still: true,
  tone: 'accent',
  face: new Date(2026, 9, 17, 21, 47),
  clock: { time: period ? '9:47' : '21:47', seconds: '', period },
  title: '',
  date: null,
  week: null,
  sky: null,
  forecast: { status: 'none' },
  sun: { next: null, rising: null, setting: null },
  width,
  ruler,
});

const drawn = (template: unknown): HTMLElement => {
  const host = document.createElement('div');
  render(html`${template}`, host);
  return host;
};

describe('the hero’s big time', () => {
  it('keeps 64 with its period where the column holds them', () => {
    // "00:00" at 64 is 193, "PM" 8 + 29: 231 in a 280 column
    const big = drawn(heroDigital(model(280, 'PM'))).querySelector('.ck-big')!;
    expect(big.classList.contains('ck-big--s')).toBe(false);
    expect(big.querySelector('.ck-big__unit')?.textContent).toBe('PM');
  });

  it('lets the period go, then steps down to 48 where not even the time alone holds (a 211 column)', () => {
    // 171: neither 231 nor 193 holds at 64; at 48 the time is 145 and the period 8 + 22: 175 does not, 145 does
    const big = drawn(heroDigital(model(171, 'PM'))).querySelector('.ck-big')!;
    expect(big.classList.contains('ck-big--s')).toBe(true);
    expect(big.querySelector('.ck-big__unit')).toBeNull();
    // 200: the time alone holds at 64 (193): the period goes, the size stays
    const wider = drawn(heroDigital(model(200, 'PM'))).querySelector('.ck-big')!;
    expect(wider.classList.contains('ck-big--s')).toBe(false);
    expect(wider.querySelector('.ck-big__unit')).toBeNull();
  });
});

describe('the side clock’s time beside its face', () => {
  it('stays at 40 beside a 48 face where it fits', () => {
    // 300: "00:00" at 40 is 121; a 48 face takes 116, leaving 184
    const host = drawn(side(model(300)));
    const time = host.querySelector('.ck-time')!;
    expect(time.classList.contains('ck-time--s')).toBe(false);
  });

  it('steps down to 32 and lets the face follow it down to 24 in a column where it would be cut (211)', () => {
    // 171: beside a 48 face the room is 55 — too little even at 32 (97); the face goes to floor4((171 − 20 − 97) / 2) = 24
    const host = drawn(side(model(171)));
    const time = host.querySelector('.ck-time')!;
    expect(time.classList.contains('ck-time--s')).toBe(true);
    expect(host.textContent).toContain('21:47');
  });
});

describe('the lines under a time, never cut', () => {
  const sun = {
    next: { kind: 'sunrise' as const, at: { time: '07:31', seconds: '', period: '' } },
    rising: null,
    setting: null,
  };
  const lines = (host: HTMLElement): string[] =>
    [...host.querySelectorAll('.fv-card__sub, .ck-caption')].map(
      (line) => line.textContent?.trim() ?? '',
    );

  it('says the sun in its short word where the long one would be cut, the face yielding to it, else not at all', async () => {
    await preloadLanguages();
    const hass = { language: 'de' } as HomeAssistant;
    // 226 (266): beside a 48 face (110) "Untergang 00:00" (118) does not hold — the face goes to 44, and the line is
    // "Aufgang 07:31", as it would be at sunset, never "Sonnenaufgang 0…"
    expect(lines(drawn(side({ ...model(226), hass, sun })))).toEqual(['Aufgang 07:31']);
    // 171 (211): not even beside a tile's 24 face (103): the line leaves
    expect(lines(drawn(side({ ...model(171), hass, sun })))).toEqual([]);
  });

  it('lets the sky take its short word, then leave after the date, whole', () => {
    const night = {
      ok: true,
      text: 'Klare Nacht',
      short: 'Klar',
      inline: 'klare Nacht',
      glyph: 'moon' as const,
      night: true,
      temperature: 18,
      unit: '°C',
      feels: null,
      wind: '',
    };
    const at = (width: number, sky = night): string[] =>
      lines(
        drawn(
          heroDigital({
            ...model(width),
            date: { full: 'Donnerstag, 17. September', short: 'Do., 17. Sept.', tiny: '17. Sept.' },
            sky,
            forecast: { status: 'ready', tonight: 13, tomorrow: 23 },
          }),
        ),
      );
    // "Do., 17. Sept. · klar" (165) holds 171; at 150 the sky leaves, never "klare N…"
    expect(at(171)).toEqual(['Do., 17. Sept. · klar']);
    expect(at(150)).toEqual(['Do., 17. Sept.']);
    // a weather gone says so, then the house's short word, then nothing after the date: "· offline" (188) does not
    // hold 171
    const gone = {
      ...night,
      ok: false,
      text: 'Entität nicht gefunden',
      short: 'Offline',
      inline: 'entität nicht gefunden',
    };
    expect(at(400, gone)).toEqual(['Donnerstag, 17. September · entität nicht gefunden']);
    expect(at(200, gone)).toEqual(['Do., 17. Sept. · offline']);
    expect(at(171, gone)).toEqual(['Do., 17. Sept.']);
  });
});

describe('a tile’s time', () => {
  it('keeps 40 while the tile holds the time, and steps down to 32 where it would be cut (a 124 tile)', () => {
    const wide = drawn(tile({ ...model(136), analog: false })).querySelector('.ck-tile__time')!;
    expect(wide.classList.contains('ck-tile__time--s')).toBe(false);
    // 92 of content: "00:00" at 40 is 121, at 32 it is 97 — still over, but the smaller step is the last
    const narrow = drawn(tile({ ...model(92), analog: false })).querySelector('.ck-tile__time')!;
    expect(narrow.classList.contains('ck-tile__time--s')).toBe(true);
    // 100: at 32 the time holds (97), its period does not
    const step = drawn(tile({ ...model(100, 'PM'), analog: false })).querySelector(
      '.ck-tile__time',
    )!;
    expect(step.classList.contains('ck-tile__time--s')).toBe(true);
    expect(step.querySelector('.fv-unit')).toBeNull();
  });
});
