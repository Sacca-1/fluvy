// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { derivePalette, seedOf } from '@fluvy/tokens/runtime';
import { TONE_VARS, TONES } from '@fluvy/ui';
import {
  accentCss,
  accentHex,
  AccentSheet,
  litCss,
  PALETTE_ACCENT,
  paletteAccentCss,
  surfaceCss,
  TONE_STATES,
} from '../look/accent.js';

const linen = derivePalette(seedOf('linen'));

describe('a card’s colour on its palette', () => {
  it('resolves a name, a hex or a triplet on the palette it wears, and nothing for the accent itself', () => {
    expect(accentHex('linen', 'light', 'teal')).toBe(linen.light.state['presence-home'].ink);
    expect(accentHex('linen', 'dark', 'teal')).toBe(linen.dark.state['presence-home'].ink);
    expect(accentHex('linen', 'light', '#ABC')).toBe('#aabbcc');
    expect(accentHex('linen', 'light', [255, 0, 0])).toBe('#ff0000');
    for (const none of [undefined, null, '', 'primary', 'accent', 'nope'])
      expect(accentHex('linen', 'light', none)).toBeUndefined();
    // a key that is not one of ours (no look on the page) derives on the default palette
    expect(accentHex('', 'light', 'teal')).toBe(accentHex('linen', 'light', 'teal'));
    expect(accentHex('custom:soft:warm:#716345::', 'light', '#00b894')).toBe('#00b894');
  });

  it('writes the accent’s family and nothing else, the same twice', () => {
    const css = accentCss('linen', 'light', '#0000ff');
    expect(css).toContain('--fluvy-accent:#');
    expect(css).toContain('--fluvy-graph-12:#');
    expect(css).toContain('--fluvy-state-light-active-fill:#');
    expect(css).not.toContain('--fluvy-card:');
    expect(css).not.toContain('--fluvy-state-climate-heat');
    expect(accentCss('linen', 'light', '#0000ff')).toBe(css);
    expect(accentCss('linen', 'dark', '#0000ff')).not.toBe(css);
    expect(accentCss('volt', 'light', '#0000ff')).not.toBe(css);
  });

  it('is a sheet the card adopts: its own colour on its children, each item’s on its data-accent', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const accents = new AccentSheet();
    accents.adopt(root);
    accents.adopt(root);
    expect(root.adoptedStyleSheets).toHaveLength(1);
    const sheet = root.adoptedStyleSheets[0]!;
    expect(accents.wears('linen', 'light')).toBe(true);
    expect(accents.wears('linen', 'light')).toBe(false);
    accents.host('teal');
    accents.begin();
    expect(accents.item('#ff0000')).toBe('#ff0000');
    expect(accents.item('nope')).toBeUndefined();
    accents.commit();
    const rules = [...sheet.cssRules].map((rule) => rule.cssText);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatch(/^:host > \* \{/);
    expect(rules[1]).toMatch(/^\[data-accent="#ff0000"\] \{/);
    // nothing changed: nothing written again; the mode changes: derived again
    accents.commit();
    expect(sheet.cssRules).toHaveLength(2);
    expect(accents.wears('linen', 'dark')).toBe(true);
    accents.host('teal');
    accents.begin();
    accents.commit();
    expect(sheet.cssRules).toHaveLength(1);
    expect(sheet.cssRules[0]!.cssText).not.toBe(rules[0]);
    // no colour of its own: an empty sheet
    accents.host(undefined);
    accents.commit();
    expect(sheet.cssRules).toHaveLength(0);
  });

  it('reads the inks a YAML may name and what the picker lets you type, on the palette worn (#40)', () => {
    expect(accentHex('linen', 'light', 'primary-text')).toBe(linen.light.text.primary);
    expect(accentHex('linen', 'dark', 'secondary-text')).toBe(linen.dark.text.secondary);
    expect(accentHex('linen', 'light', 'disabled')).toBe(linen.light.unavailable.ink);
    expect(accentHex('linen', 'light', '#AABBCC80')).toBe('#aabbcc');
    expect(accentHex('linen', 'light', 'rgb(255 74 26)')).toBe('#ff4a1a');
    // no canvas here: another CSS colour is nothing, never an error
    expect(accentHex('linen', 'light', 'hsl(0 100% 50%)')).toBeUndefined();
  });

  it('gives an item that names the accent the palette’s own, under a card’s colour too', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const accents = new AccentSheet();
    accents.adopt(root);
    accents.wears('mist', 'light');
    accents.host('red');
    accents.begin();
    expect(accents.item('primary')).toBe(PALETTE_ACCENT);
    expect(accents.item(' Accent ')).toBe(PALETTE_ACCENT);
    accents.commit();
    const own = [...root.adoptedStyleSheets[0]!.cssRules]
      .map((rule) => rule.cssText)
      .find((text) => text.startsWith(`[data-accent="${PALETTE_ACCENT}"]`));
    const mist = derivePalette(seedOf('mist')).light;
    expect(own).toContain(`--fluvy-accent: ${mist.accent.ink}`);
    expect(own).toContain(`--fluvy-accent-fill: ${mist.accent.fill}`);
    expect(paletteAccentCss('mist', 'light')).toBe(paletteAccentCss('mist', 'light'));
  });

  it('steps a card’s own surface’s inner fills a shade deeper (`--fluvy-inset`), never the page’s colour in it', () => {
    const css = surfaceCss('linen', 'light', '#2196f3');
    expect(css).toMatch(
      /--fluvy-card:#[0-9a-f]{6};--fluvy-border:#[0-9a-f]{6};--fluvy-inset:#[0-9a-f]{6};/,
    );
    expect(css).not.toContain(`--fluvy-inset:${linen.light.surface.page};`);
  });
});

describe('a lit light card’s surface (1.9, #41)', () => {
  const sheetOf = (accents: AccentSheet): string[] => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    accents.adopt(root);
    accents.commit();
    return [...root.adoptedStyleSheets[0]!.cssRules].map((rule) => rule.cssText);
  };

  it('writes each lit surface on its data-surface, after the card’s own colour and surface', () => {
    const accents = new AccentSheet();
    accents.wears('linen', 'light');
    accents.host('teal');
    accents.surface('blue');
    accents.begin();
    expect(accents.lit('#ff9800', 0.73)).toBe('#ff9800-75');
    expect(accents.lit('light', 0)).toBe('light-0');
    // the same surface twice is one rule
    expect(accents.lit('#ff9800', 0.75)).toBe('#ff9800-75');
    const rules = sheetOf(accents);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toMatch(/^:host > \* \{/);
    expect(rules[1]).toMatch(/^\[data-surface="#ff9800-75"\] \{/);
    expect(rules[1]).toContain('--fluvy-card:');
    expect(rules[1]).toContain('--fluvy-border:');
    expect(rules[1]).toContain('--fluvy-inset:');
    expect(rules[2]).toMatch(/^\[data-surface="light-0"\] \{/);
    // a render that asks for none forgets them
    accents.begin();
    expect(sheetOf(accents)).toHaveLength(1);
  });

  it('is lit in the palette’s own lit light where it glows no colour — not a colour that shares its name', () => {
    const noir = derivePalette(seedOf('noir')).light;
    const light = litCss('noir', 'light', 'light', 1);
    expect(light).toContain(`--fluvy-border:${noir.state['light-active'].fillBorder};`);
    // amber on Noir is a near black: the lit light is the palette's role, never the name
    expect(light).not.toBe(litCss('noir', 'light', accentHex('noir', 'light', 'amber')!, 1));
    expect(litCss('noir', 'light', 'accent', 1)).toContain(
      `--fluvy-border:${noir.accent.fillBorder};`,
    );
    expect(litCss('noir', 'light', 'heat', 1)).toContain(
      `--fluvy-border:${noir.state['climate-heat'].fillBorder};`,
    );
    expect(litCss('noir', 'light', 'light', 1)).toBe(light);
  });

  it('knows each tone’s state as the tones’ own table does', () => {
    for (const tone of TONES) {
      const ink = TONE_VARS[tone].ink;
      expect(TONE_STATES[tone], tone).toBe(ink.startsWith('state-') ? ink.slice(6) : undefined);
    }
  });
});
