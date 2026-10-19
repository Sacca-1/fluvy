// @vitest-environment happy-dom
import { baseStyles } from '@fluvy/ui';
import { html, type TemplateResult } from 'lit';
import { describe, expect, it } from 'vitest';
import { FluvyCard, selfHide, VISIBILITY_EVENT } from '../card.js';

class QuietCard extends FluvyCard {
  protected renderCard(): TemplateResult {
    return html``;
  }
}
customElements.define('fluvy-self-hide-test-card', QuietCard);

/** A card in a wrapper that listens as Home Assistant's does, and what it heard. */
function mounted(): { card: QuietCard; heard: boolean[] } {
  const wrapper = document.createElement('div');
  const card = document.createElement('fluvy-self-hide-test-card') as QuietCard;
  const heard: boolean[] = [];
  wrapper.addEventListener(VISIBILITY_EVENT, (event) =>
    heard.push((event as CustomEvent<{ value: boolean }>).detail.value),
  );
  wrapper.append(card);
  document.body.append(wrapper);
  return { card, heard };
}

describe('selfHide', () => {
  it('hides the card and says so to the wrapper, keeping it connected', () => {
    const { card, heard } = mounted();
    selfHide(card, true);
    expect(card.hidden).toBe(true);
    expect(card.hasAttribute('hidden')).toBe(true);
    expect(card.connectedWhileHidden).toBe(true);
    expect(heard).toEqual([false]);
  });

  it('says it whichever way it goes, and only when it changes', () => {
    const { card, heard } = mounted();
    selfHide(card, false);
    selfHide(card, true);
    selfHide(card, true);
    selfHide(card, false);
    selfHide(card, false);
    expect(heard).toEqual([false, true]);
    expect(card.hidden).toBe(false);
  });

  it('bubbles out of a shadow root, as the wrapper sits outside it', () => {
    const { card } = mounted();
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.append(card);
    document.body.append(host);
    const heard: boolean[] = [];
    const listen = (event: Event): void => {
      heard.push((event as CustomEvent<{ value: boolean }>).detail.value);
    };
    document.addEventListener(VISIBILITY_EVENT, listen);
    selfHide(card, true);
    document.removeEventListener(VISIBILITY_EVENT, listen);
    expect(heard).toEqual([false]);
  });

  it('never hides in the editor’s preview, and shows itself when the preview comes', () => {
    const { card, heard } = mounted();
    card.preview = true;
    selfHide(card, true);
    expect(card.hidden).toBe(false);
    expect(heard).toEqual([]);
    card.preview = false;
    selfHide(card, true);
    card.preview = true;
    selfHide(card, true);
    expect(card.hidden).toBe(false);
    expect(heard).toEqual([false, true]);
  });

  it('is taken out of any wrapper’s flow by the cards’ own sheet', () => {
    const css = baseStyles.map((sheet) => sheet.cssText).join('');
    expect(css).toContain(':host([hidden]){display:none}');
  });
});
