// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { FluvyHeadingCard, type HeadingCardConfig } from './heading-card.js';

if (!customElements.get('fluvy-heading-card'))
  customElements.define('fluvy-heading-card', FluvyHeadingCard);

const hass = { states: {}, language: 'en', locale: { language: 'en' } } as unknown as HomeAssistant;

async function mount(config: Omit<HeadingCardConfig, 'type'>): Promise<ShadowRoot> {
  const card = document.createElement('fluvy-heading-card') as FluvyHeadingCard;
  card.setConfig({ type: 'custom:fluvy-heading-card', ...config });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card.shadowRoot as ShadowRoot;
}

describe('the heading card’s styles (#47)', () => {
  it('is a group’s 20/600 title by default and a page’s section title, 32 tall, where it says `title`', async () => {
    expect(FluvyHeadingCard.layoutHeight({ type: 'custom:fluvy-heading-card' })).toBe(24);
    expect(
      FluvyHeadingCard.layoutHeight({ type: 'custom:fluvy-heading-card', heading_style: 'title' }),
    ).toBe(32);
    const group = await mount({ title: 'Scenes', subtitle: 'Edit', path: '/scenes' });
    expect(group.querySelector('.hm-section')?.className.trim()).toBe('hm-section');
    // a page's section title: its icon, its title at its size, its link's words and the chevron
    const section = await mount({
      title: 'Large appliances',
      icon: 'fluvy:dishwasher',
      subtitle: 'All appliances',
      path: '/appliances',
      heading_style: 'title',
    });
    expect(section.querySelector('.hm-section')?.classList.contains('hm-section--title')).toBe(
      true,
    );
    expect(section.querySelector('.hm-section')?.classList.contains('hm-section--big')).toBe(true);
    expect(section.querySelector('.hm-section__icon')).not.toBeNull();
    expect(section.querySelector('button.hm-section__meta')?.textContent?.trim()).toBe(
      'All appliances',
    );
    expect(section.querySelector('button.hm-section__meta')?.getAttribute('aria-label')).toBe(
      'Large appliances · All appliances',
    );
  });

  it('offers both styles in its editor, the group’s where the config says none', () => {
    const fields = JSON.stringify(FluvyHeadingCard.getConfigForm().schema);
    expect(fields).toContain('"name":"heading_style"');
    expect(fields).toContain('"value":"title"');
    expect(fields).toContain('"value":"subtitle"');
    expect(
      FluvyHeadingCard.defaults?.({ type: 'custom:fluvy-heading-card' }, undefined),
    ).toMatchObject({
      heading_style: 'subtitle',
    });
  });
});
