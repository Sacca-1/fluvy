// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { baseStyles, setFallbackTokens } from '@fluvy/ui';
import { derivePalette, seedOf, withStatuses } from '@fluvy/tokens/runtime';
import { html, type CSSResultGroup, type TemplateResult } from 'lit';
import { FluvyCard, resyncCardThemes } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';
import { accentHex, AccentSheet, litCss } from '../look/accent.js';
import { declarationsOf, lookRule, paletteOf } from '../look/css.js';
import { fallbackCss, LookEngine } from '../look/engine.js';
import {
  HOUSE_DEFAULTS,
  PERSONAL_DEFAULTS,
  resolveSettings,
  type EffectiveSettings,
} from '../settings/index.js';

/**
 * The house's status colours (1.9): one setting over every palette, written by the look engine with the palette's own
 * tokens (the page, a dashboard, the cards' fallback), and carried in `--fluvy-palette` so a card that derives a colour
 * in JavaScript (a lit surface in the warning, a series' ink) derives it on them too.
 */
const ORANGE = '#dc630b';
const linen = derivePalette(seedOf('linen'));
const ours = withStatuses(seedOf('linen'), linen, { warning: ORANGE });

const settings = (patch: Partial<EffectiveSettings>): EffectiveSettings => ({
  ...resolveSettings(HOUSE_DEFAULTS, PERSONAL_DEFAULTS),
  ...patch,
});
const value = (declarations: readonly (readonly [string, string])[], name: string) =>
  declarations.find(([key]) => key === name)?.[1];

function engine() {
  document.adoptedStyleSheets = [];
  const look = new LookEngine(document, () => new CSSStyleSheet(), undefined);
  const text = (sheet: CSSStyleSheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('');
  return { look, page: () => text(document.adoptedStyleSheets.at(-1)!), text };
}

describe('the house’s status colours on the page', () => {
  it('derives the look in them, the palette’s own where they are Auto', () => {
    const look = { palette: 'linen', shape: 'soft', pills: 'round' } as const;
    const auto = declarationsOf(look, 'light');
    const orange = declarationsOf(look, 'light', { warning: ORANGE });
    expect(value(auto, '--fluvy-warning')).toBe(linen.light.semantic.warning.ink);
    expect(value(orange, '--fluvy-warning')).toBe(ours.light.semantic.warning.ink);
    expect(value(orange, '--fluvy-warning-fill')).toBe(ours.light.semantic.warning.fill);
    expect(value(orange, '--warning-color')).toBe(ours.light.semantic.warning.ink);
    expect(value(orange, '--fluvy-danger')).toBe(value(auto, '--fluvy-danger'));
    expect(value(orange, '--fluvy-palette')).toBe(`linen|warning=${ORANGE}`);
    expect(value(auto, '--fluvy-palette')).toBe('linen');
    // derived once per palette and picks
    expect(paletteOf('linen', { warning: ORANGE })).toBe(paletteOf('linen', { warning: ORANGE }));
    expect(paletteOf('linen', {})).toBe(paletteOf('linen'));
    expect(lookRule(look, 'dark', ':host', false, { warning: ORANGE })).toContain(
      `--fluvy-warning:${ours.dark.semantic.warning.ink};`,
    );
  });

  it('applies a change of them at once (the cards look again), and nothing for the same', () => {
    const { look, page } = engine();
    const auto = settings({ scope: 'everywhere' });
    expect(look.apply(auto, false)).toBe(true);
    expect(page()).toContain(`--fluvy-warning: ${linen.light.semantic.warning.ink} !important`);
    const orange = settings({ scope: 'everywhere', statuses: { warning: ORANGE } });
    expect(look.apply(orange, false)).toBe(true);
    expect(page()).toContain(`--fluvy-warning: ${ours.light.semantic.warning.ink} !important`);
    expect(look.apply(orange, false)).toBe(false);
    // the dashboards' sheet, in the dashboards scope, the same
    look.apply({ ...orange, scope: 'dashboards' }, true);
    expect([...look.panelSheet.cssRules].map((rule) => rule.cssText).join('')).toContain(
      `--fluvy-warning: ${ours.dark.semantic.warning.ink}`,
    );
  });

  it('puts them in the cards’ own tokens, where no look reaches a card', () => {
    const { look } = engine();
    look.apply(settings({ statuses: { warning: ORANGE } }), false);
    const fallback = [...(baseStyles[0]?.styleSheet?.cssRules ?? [])]
      .map((rule) => rule.cssText)
      .join('');
    expect(fallback).toContain(`--fluvy-warning: ${ours.light.semantic.warning.ink}`);
    expect(fallback).toContain(`--fluvy-warning: ${ours.dark.semantic.warning.ink}`);
    expect(fallbackCss({ palette: 'linen', shape: 'soft', pills: 'round' })).not.toContain(
      '|warning=',
    );
  });
});

describe('a card’s colours on the house’s statuses', () => {
  it('derives what it draws in the warning on them: a lit surface, a series’ ink', () => {
    const sheet = new AccentSheet();
    sheet.wears(`linen|warning=${ORANGE}`, 'light');
    expect(sheet.inkOf('warning')).toBe(ours.light.semantic.warning.ink);
    sheet.wears('linen', 'light');
    expect(sheet.inkOf('warning')).toBe(linen.light.semantic.warning.ink);
    expect(litCss(`linen|warning=${ORANGE}`, 'light', 'warning', 1)).not.toBe(
      litCss('linen', 'light', 'warning', 1),
    );
  });

  it('keeps everything else of the palette: its accent, a colour named, its own colour', () => {
    const key = `linen|warning=${ORANGE}|danger=#c2255c`;
    for (const name of ['orange', 'red', 'teal', '#0000ff'])
      expect(accentHex(key, 'light', name), name).toBe(accentHex('linen', 'light', name));
    // a custom palette's key reads back with its statuses
    const custom = 'custom:vivid:cool:#3b5bdb:tint:';
    expect(accentHex(`${custom}|warning=${ORANGE}`, 'dark', 'orange')).toBe(
      accentHex(custom, 'dark', 'orange'),
    );
  });

  it('looks again when the house changes them: a new palette key is a new render', async () => {
    class StatusCard extends FluvyCard {
      static override styles: CSSResultGroup = [...baseStyles];
      renders = 0;
      protected renderCard(): TemplateResult {
        this.renders += 1;
        return html`<article></article>`;
      }
    }
    customElements.define('fluvy-status-test-card', StatusCard);
    setFallbackTokens(':host([no-theme]){--fluvy-palette:linen}');
    const card = document.createElement('fluvy-status-test-card') as StatusCard;
    card.setConfig({ type: 'custom:fluvy-status-test-card' });
    card.hass = { states: {}, themes: { darkMode: false } } as unknown as HomeAssistant;
    document.body.append(card);
    await card.updateComplete;
    const before = card.renders;
    setFallbackTokens(`:host([no-theme]){--fluvy-palette:linen|warning=${ORANGE}}`);
    card.toggleAttribute('data-restyle'); // happy-dom restyles an element only when it changes
    resyncCardThemes();
    await card.updateComplete;
    expect(card.renders).toBe(before + 1);
    resyncCardThemes();
    await card.updateComplete;
    expect(card.renders).toBe(before + 1);
    card.remove();
    setFallbackTokens(':host([no-theme]){--fluvy-palette:linen}');
  });
});
