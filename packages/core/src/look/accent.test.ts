// @vitest-environment happy-dom
import { deltaE } from '@fluvy/tokens/runtime';
import { describe, expect, it } from 'vitest';
import { AccentSheet } from './accent.js';

describe('the ink a series is drawn in (AccentSheet.inkOf)', () => {
  it('answers a tone of the palette’s, a colour of the user’s, and nothing for a tone without an ink', () => {
    const sheet = new AccentSheet();
    sheet.wears('', 'light');
    const heat = sheet.inkOf('heat');
    const water = sheet.inkOf('water');
    expect(heat).toMatch(/^#[0-9a-f]{6}$/);
    expect(water).toMatch(/^#[0-9a-f]{6}$/);
    // two states the palette engine keeps apart
    expect(deltaE(heat!, water!)).toBeGreaterThan(8);
    expect(sheet.inkOf('accent')).toMatch(/^#[0-9a-f]{6}$/);
    expect(sheet.inkOf('#2f8f5b')).toMatch(/^#[0-9a-f]{6}$/);
    expect(sheet.inkOf('off')).toBeUndefined();
    expect(sheet.inkOf('neutral')).toBeUndefined();
  });

  it('answers on the palette and mode the card wears', () => {
    const sheet = new AccentSheet();
    sheet.wears('', 'light');
    const light = sheet.inkOf('heat');
    sheet.wears('', 'dark');
    expect(sheet.inkOf('heat')).not.toBe(light);
  });
});
