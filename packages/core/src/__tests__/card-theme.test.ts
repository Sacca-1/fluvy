// @vitest-environment happy-dom
import { baseStyles, setFallbackTokens } from '@fluvy/ui';
import { html, type CSSResultGroup, type TemplateResult } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import { FluvyCard, resyncCardThemes, type FluvyCardConfig } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';
import { accentCss, accentHex, surfaceCss } from '../look/accent.js';

/**
 * Issue #40: a card where no look reaches it is drawn in its fallback tokens (`:host([no-theme])`), and it must derive
 * its colours on the palette that fallback wears from its very first frame — not on the default until it is attached
 * again. happy-dom inherits no custom property from an ancestor, so every token here is declared on the host itself,
 * as the fallback sheet does.
 */
class ColourCard extends FluvyCard {
  static override styles: CSSResultGroup = [...baseStyles];
  renders = 0;
  protected renderCard(): TemplateResult {
    this.renders += 1;
    return html`<article data-accent=${this.accents.item(this.config?.color) ?? ''}></article>`;
  }
}
customElements.define('fluvy-card-theme-test-card', ColourCard);

const fallback = (light: string, dark = light): string =>
  `:host([no-theme]){--fluvy-palette:${light}}:host([no-theme][dark]){--fluvy-palette:${dark}}`;
const hassIn = (darkMode: boolean): HomeAssistant =>
  ({ states: {}, themes: { darkMode } }) as unknown as HomeAssistant;

/** A card as Home Assistant makes one: configured, its `hass` before or after it is attached. */
async function mounted(
  config: Omit<FluvyCardConfig, 'type'>,
  { dark = false, hassFirst = true } = {},
): Promise<ColourCard> {
  const card = document.createElement('fluvy-card-theme-test-card') as ColourCard;
  card.setConfig({ ...config, type: 'custom:fluvy-card-theme-test-card' });
  if (hassFirst) card.hass = hassIn(dark);
  document.body.append(card);
  if (!hassFirst) card.hass = hassIn(dark);
  await card.updateComplete;
  return card;
}

const drawn = (card: ColourCard): string =>
  card.shadowRoot!.querySelector('article')!.getAttribute('data-accent') ?? '';
/** The card's own colour and surface, as its adopted colour sheet writes them on its children. */
const hostRule = (card: ColourCard): string => {
  const sheet = card.shadowRoot!.adoptedStyleSheets.at(-1)!;
  return (
    [...sheet.cssRules].map((rule) => rule.cssText).find((text) => text.startsWith(':host >')) ?? ''
  );
};
const declarations = (rule: string): string[] =>
  (/\{(.*)\}/s.exec(rule)?.[1] ?? '')
    .split(';')
    .map((part) => part.replace(/\s+/g, ''))
    .filter(Boolean)
    .sort();

afterEach(() => {
  document.body.replaceChildren();
  setFallbackTokens(fallback('linen'));
});

describe('a card where no look reaches it (#40)', () => {
  it('derives an item’s colour on its fallback’s palette on its first frame, in one render', async () => {
    setFallbackTokens(fallback('mist'));
    const card = await mounted({ color: 'black' });
    expect(card.hasAttribute('no-theme')).toBe(true);
    expect(card.hasAttribute('dark')).toBe(false);
    expect(drawn(card)).toBe(accentHex('mist', 'light', 'black'));
    expect(drawn(card)).not.toBe(accentHex('linen', 'light', 'black'));
    expect(card.renders).toBe(1);
  });

  it('in dark mode too, with its hass after it is attached', async () => {
    setFallbackTokens(fallback('mist'));
    const card = await mounted({ color: 'black' }, { dark: true, hassFirst: false });
    expect(card.hasAttribute('dark')).toBe(true);
    expect(drawn(card)).toBe(accentHex('mist', 'dark', 'black'));
  });

  it('writes its own colour and surface on that palette at once, and the same after it is attached again', async () => {
    setFallbackTokens(fallback('mist'));
    const card = await mounted({ color: 'teal', card_color: 'red' });
    const want = [
      ...declarations(`{${accentCss('mist', 'light', accentHex('mist', 'light', 'teal')!)}}`),
      ...declarations(`{${surfaceCss('mist', 'light', accentHex('mist', 'light', 'red')!)}}`),
    ].sort();
    expect(declarations(hostRule(card))).toEqual(want);
    const first = hostRule(card);
    card.remove();
    document.body.append(card);
    await card.updateComplete;
    expect(hostRule(card)).toBe(first);
  });

  it('follows Home Assistant’s mode, and the fallback when the look changes it', async () => {
    setFallbackTokens(fallback('mist'));
    const card = await mounted({ color: 'black' });
    card.hass = hassIn(true);
    await card.updateComplete;
    expect(card.hasAttribute('dark')).toBe(true);
    expect(drawn(card)).toBe(accentHex('mist', 'dark', 'black'));
    setFallbackTokens(fallback('volt'));
    // happy-dom keeps an element's computed style until the element itself changes; a browser reads a replaced sheet
    card.toggleAttribute('data-restyle');
    resyncCardThemes();
    await card.updateComplete;
    expect(drawn(card)).toBe(accentHex('volt', 'dark', 'black'));
  });

  it('wears the look that reaches it, and no fallback', async () => {
    setFallbackTokens(fallback('mist'));
    const card = document.createElement('fluvy-card-theme-test-card') as ColourCard;
    card.setConfig({ type: 'custom:fluvy-card-theme-test-card', color: 'black' });
    card.hass = hassIn(false);
    // the look's sentinel and palette, declared on the host as a marked panel's would reach it
    card.style.setProperty('--fluvy-theme', '1');
    card.style.setProperty('--fluvy-palette', 'iris');
    document.body.append(card);
    await card.updateComplete;
    expect(card.hasAttribute('no-theme')).toBe(false);
    expect(drawn(card)).toBe(accentHex('iris', 'light', 'black'));
  });
});
