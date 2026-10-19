import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addEnglish,
  ensureLanguage,
  languageOf,
  languageReady,
  localize,
  onWords,
  plural,
  preloadLanguages,
  setLanguageOverride,
  strings,
  wordsIn,
  type MessageKey,
} from '../i18n/index.js';
import {
  LANGUAGE_CODES,
  LANGUAGES,
  isCardLanguage,
  offeredLanguages,
  resolveLanguage,
  speaks,
} from '../i18n/languages.js';

describe('the language registry', () => {
  it('names every language it describes', () => {
    for (const code of LANGUAGE_CODES) expect(LANGUAGES[code].code).toBe(code);
    expect(new Set(LANGUAGE_CODES).size).toBe(LANGUAGE_CODES.length);
  });

  it('resolves what Home Assistant reports to a language Fluvy has', () => {
    expect(resolveLanguage('es-ES')).toBe('es');
    expect(resolveLanguage('pt-BR')).toBe('pt-BR');
    expect(resolveLanguage('pt')).toBe('pt-BR');
    expect(resolveLanguage('pt-PT')).toBe('pt-BR');
    expect(resolveLanguage('en-GB')).toBe('en');
    expect(resolveLanguage('zh-Hans')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
    expect(speaks('de-CH')).toBe(true);
    expect(speaks('sv')).toBe(false);
    expect(isCardLanguage('auto')).toBe(true);
    expect(isCardLanguage('fr')).toBe(true);
    expect(isCardLanguage('sv')).toBe(false);
  });

  it('offers English first, then the rest by their own names', () => {
    const offered = offeredLanguages().map((l) => l.code);
    expect(offered[0]).toBe('en');
    expect(offered).toHaveLength(LANGUAGE_CODES.length);
    const names = offeredLanguages()
      .slice(1)
      .map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('keeps every greeting band in the day, in order', () => {
    for (const { dayParts } of Object.values(LANGUAGES)) {
      const bands = [dayParts.morning, dayParts.afternoon, dayParts.evening, dayParts.night].filter(
        (h): h is number => h !== undefined,
      );
      expect(bands).toEqual([...bands].sort((a, b) => a - b));
      for (const hour of bands) expect(hour).toBeGreaterThanOrEqual(0);
      for (const hour of bands) expect(hour).toBeLessThanOrEqual(24);
    }
  });
});

describe('the catalogue', () => {
  it('has nothing empty in English, in any of its parts', () => {
    const parts = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales', 'en');
    for (const file of readdirSync(parts)) {
      const part = JSON.parse(readFileSync(join(parts, file), 'utf8')) as Record<
        string,
        Record<string, string>
      >;
      for (const [namespace, table] of Object.entries(part))
        for (const [key, value] of Object.entries(table))
          expect(value, `${file} ${namespace}.${key}`).not.toBe('');
    }
  });
});

describe('the words', () => {
  beforeAll(async () => {
    await preloadLanguages();
  });

  it('are looked up by the language Home Assistant speaks, resolved, with English behind them', () => {
    setLanguageOverride(undefined);
    expect(localize({ language: 'es-ES' }, 'common.on')).toBe('Encendido');
    expect(localize({ language: 'sv' }, 'common.on')).toBe('On');
    expect(localize(undefined, 'person.count', { home: 2, total: 3 })).toBe('2 of 3 home');
    expect(languageOf({ language: 'pt' })).toBe('pt-BR');
  });

  it('follow the person’s choice over Home Assistant’s', () => {
    setLanguageOverride('es');
    expect(localize({ language: 'en' }, 'common.off')).toBe('Apagado');
    expect(languageOf({ language: 'en' })).toBe('es');
    setLanguageOverride(undefined);
    expect(localize({ language: 'en' }, 'common.off')).toBe('Off');
  });

  it('give a card its own namespace, and a page the shared page words after its own', () => {
    const cover = strings('cover');
    expect(cover({ language: 'es' }, 'favourites')).toBe('Favoritos');
    expect(cover({ language: 'xx' }, 'favourites')).toBe('Favourites');
    const history = strings('history', 'page');
    expect(history({ language: 'en' }, 'today')).toBe('Today');
    expect(history({ language: 'es' }, 'title')).toBe('Historial');
  });

  it('take a family’s English when its chunk registers it, behind every language', () => {
    const key = 'family-test.hello' as MessageKey;
    expect(localize({ language: 'en' }, key)).toBe('hello');
    addEnglish({ 'family-test': { hello: 'Hello' } });
    expect(localize({ language: 'en' }, key)).toBe('Hello');
    expect(localize({ language: 'es' }, key)).toBe('Hello');
  });

  it('never throw on a key the catalogue lacks', () => {
    const s = strings('cover');
    expect(s({ language: 'en' }, 'no_such_key' as never)).toBe('no_such_key');
  });

  it('pick a plural form when the catalogue has one, else fill the base with n', () => {
    expect(plural({ language: 'en' }, 'history.sources_count', 3)).toBe('3 sources');
    expect(plural({ language: 'es' }, 'page.days', 5)).toBe('5 días');
    expect(plural({ language: 'en' }, 'common.events', 3, { count: 3 })).toBe('3 events');
  });

  it('count what is out of reach in its own plural: one, then two', () => {
    const away = (language: string, n: number) =>
      plural({ language }, 'room.unavailable', n, { count: n });
    expect([away('en', 1), away('en', 2)]).toEqual(['1 unavailable', '2 unavailable']);
    expect([away('es', 1), away('es', 2)]).toEqual(['1 no disponible', '2 no disponibles']);
    expect([away('fr', 1), away('fr', 2)]).toEqual(['1 indisponible', '2 indisponibles']);
    expect([away('it', 1), away('it', 2)]).toEqual(['1 non disponibile', '2 non disponibili']);
    expect([away('pt-BR', 1), away('pt-BR', 2)]).toEqual(['1 indisponível', '2 indisponíveis']);
  });

  it('say one more as one, then two: "+1 autre", never "+1 autres"', () => {
    const said = (language: string, key: MessageKey) =>
      [1, 2].map((n) => plural({ language }, key, n, { count: n }));
    expect(said('fr', 'calendar.more')).toEqual(['+1 autre', '+2 autres']);
    expect(said('it', 'calendar.more')).toEqual(['+1 altro', '+2 altri']);
    expect(said('de', 'calendar.more')).toEqual(['+1 weiterer', '+2 weitere']);
    expect(said('es', 'calendar.earlier')).toEqual(['1 anterior', '2 anteriores']);
    expect(said('fr', 'history.more')).toEqual(['+1 autre', '+2 autres']);
    expect(said('it', 'history.more')).toEqual(['+1 altro', '+2 altri']);
    expect(said('en', 'history.more')).toEqual(['+1 more', '+2 more']);
  });

  it('can be read in a fixed language whatever the person chose', () => {
    setLanguageOverride('es');
    expect(wordsIn('en')('common.on')).toBe('On');
    setLanguageOverride(undefined);
  });

  it('arrive once and say so', async () => {
    let told = 0;
    const off = onWords(() => told++);
    await ensureLanguage('es');
    expect(languageReady('es')).toBe(true);
    off();
    expect(told).toBe(0); // already here: nothing was fetched, nobody was told
  });
});
