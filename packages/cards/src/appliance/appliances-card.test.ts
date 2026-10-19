// @vitest-environment happy-dom
import { ensureLanguage, plural, type HomeAssistant, type LovelaceCardConfig } from '@fluvy/core';
import { OUT_OF_REACH, outOfReachStates } from '@fluvy/demo-home/out-of-reach';
import { afterEach, describe, expect, it } from 'vitest';
import { appliancesHeight } from '../appliances-family.js';
import { FluvyApplianceCard } from './appliance-card.js';
import { FluvyAppliancesCard } from './appliances-card.js';
import { allFixtures, houseOf } from './fixtures/index.js';
import { applianceDevices } from './kinds.js';

if (!customElements.get('fluvy-appliances-card'))
  customElements.define('fluvy-appliances-card', FluvyAppliancesCard);
if (!customElements.get('fluvy-appliance-card'))
  customElements.define('fluvy-appliance-card', FluvyApplianceCard);

const NOW = Date.parse('2026-10-17T12:00:00Z');
const AT = new Date(NOW).toISOString();
const HOUSE = {
  ...houseOf(allFixtures(NOW), NOW),
  themes: { darkMode: false },
  callService: async () => undefined,
  callWS: async () => ({}),
} as unknown as HomeAssistant;

type Mounted = FluvyAppliancesCard & { updateComplete: Promise<boolean> };

async function mount(
  config: Record<string, unknown>,
  hass: HomeAssistant = HOUSE,
): Promise<Mounted> {
  const card = document.createElement('fluvy-appliances-card') as Mounted;
  card.setConfig({
    type: 'custom:fluvy-appliances-card',
    _now: AT,
    ...config,
  } as LovelaceCardConfig);
  card.hass = hass;
  (card as unknown as { width: number }).width = 360;
  document.body.append(card);
  await card.updateComplete;
  await card.updateComplete;
  return card;
}

const root = (card: Mounted): ShadowRoot => card.shadowRoot as ShadowRoot;
const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const titles = (card: Mounted): string[] =>
  [...root(card).querySelectorAll('.al-rows .fv-row--bar .fv-row__title')].map(text);

afterEach(() => document.body.replaceChildren());

describe('the house’s appliances', () => {
  // the owner's rule (1.9): the house's appliances are found in its registries, so their entities unavailable, unknown
  // or gone from the house leave every row, tile and whole card in place, each drawn as its live one is
  it.each(
    (['rows', 'compact', 'tiles', 'cards'] as const).flatMap((variant) =>
      OUT_OF_REACH.map((kind) => [variant, kind] as const),
    ),
  )(
    'as %s keeps every appliance of the house while their entities are %s',
    async (variant, kind) => {
      const config = { variant, max_rows: 30 };
      const live = await mount(config);
      const ids = (live as unknown as { watched(): readonly string[] }).watched();
      const gone = await mount(config, {
        ...HOUSE,
        states: outOfReachStates(HOUSE.states, ids, kind),
      });
      const parts = (card: Mounted): number =>
        root(card).querySelectorAll('.fv-row--bar, .al-tile, fluvy-appliance-card').length;
      expect(parts(gone)).toBeGreaterThan(0);
      expect(parts(gone)).toBe(parts(live));
      if (variant !== 'cards') return;
      // each whole card its live twin's sections, in the list's order (the cards keep their places)
      const wholes = async (card: Mounted): Promise<string[][]> => {
        const cards = [...root(card).querySelectorAll('fluvy-appliance-card')] as Array<
          FluvyApplianceCard & { updateComplete: Promise<boolean> }
        >;
        await Promise.all(cards.map((whole) => whole.updateComplete));
        return cards.map((whole) =>
          [...(whole.shadowRoot?.querySelector('article')?.children ?? [])].map(
            (el) =>
              `${el.tagName.toLowerCase()}.${[...el.classList]
                .filter((c) => !/^is-|^fv-tone--/.test(c))
                .sort()
                .join('.')}`,
          ),
        );
      };
      expect(await wholes(gone)).toEqual(await wholes(live));
    },
  );

  it('lists every appliance of the house, what needs a hand first, then what runs (ending soonest), then the rest', async () => {
    const card = await mount({ max_rows: 30 });
    const count = applianceDevices(HOUSE).length;
    // thirty rows at most, the rest under the fold
    expect(titles(card)).toHaveLength(Math.min(30, count));
    expect(text(root(card).querySelector('.al-rows:last-child .fv-row__title'))).toBe(
      `${count - 30} more`,
    );
    // a load to take out, a door left open, a failure or a reminder lead, then what runs
    const first = root(card).querySelector('.al-rows .fv-row--bar .fv-row__sub');
    expect(first?.classList.contains('fv-row__sub--warning')).toBe(true);
    const values = [...root(card).querySelectorAll('.al-rows .fv-row--bar')].map((row) => ({
      warning: Boolean(row.querySelector('.fv-row__sub--warning')),
      value: text(row.querySelector('.fv-row__value')),
    }));
    const lastWarning = values.map((row) => row.warning).lastIndexOf(true);
    expect(values.slice(0, lastWarning + 1).every((row) => row.warning)).toBe(true);
  });

  it('counts what runs, what is done and what rests in its head', async () => {
    const card = await mount({});
    expect(text(root(card).querySelector('.fv-card__sub'))).toMatch(
      /^\d+ running · \d+ done · \d+ at rest$/,
    );
  });

  // the global judge (1.9): one appliance is "1 läuft", never "1 laufen"
  it.each([
    ['de', 'running_count', '1 läuft', '2 laufen'],
    ['es', 'done_count', '1 terminado', '2 terminados'],
    ['fr', 'done_count', '1 terminé', '2 terminés'],
  ] as const)('counts one and two in %s, each in its number', async (language, key, one, two) => {
    await ensureLanguage(language);
    const hass = { language };
    expect(plural(hass, `appliance.${key}`, 1, { count: 1 })).toBe(one);
    expect(plural(hass, `appliance.${key}`, 2, { count: 2 })).toBe(two);
    // and the head says each count in its number
    const card = await mount({}, { ...HOUSE, language } as HomeAssistant);
    const parts = text(root(card).querySelector('.fv-card__sub')).split(' · ');
    const forms = [one, two].map((said) => said.slice(2));
    const ours = parts.filter((part) => forms.includes(part.replace(/^\d+ /, '')));
    expect(ours).toHaveLength(1);
    for (const part of ours) {
      const n = Number(part.split(' ')[0]);
      expect(part).toBe(`${n} ${n === 1 ? forms[0] : forms[1]}`);
    }
  });

  it('folds what is over its rows into a “more” row, which opens the rest', async () => {
    const card = await mount({ max_rows: 3 });
    expect(titles(card)).toHaveLength(3);
    const more = [...root(card).querySelectorAll<HTMLElement>('.fv-row--tap')].find((row) =>
      /more$/.test(text(row)),
    );
    expect(more).toBeDefined();
    more?.click();
    await card.updateComplete;
    expect(titles(card).length).toBeGreaterThan(3);
  });

  it('lists the appliances it names, in their order, each with its own name', async () => {
    const card = await mount({
      sort: 'name',
      appliances: [{ device: 'lg-washer', name: 'Laundry' }, 'hc-oven', 'lg-fridge'],
    });
    expect(titles(card)).toEqual(['Backofen', 'Kühlschrank', 'Laundry']);
  });

  it('says why it is empty, and hides itself then where asked', async () => {
    const none = await mount({ appliances: [] });
    expect(text(root(none).querySelector('.fv-empty-state'))).toBe('No appliance found');
    const quiet = await mount({ show: 'active', appliances: ['miele-coffee'] });
    expect(text(root(quiet).querySelector('.fv-empty-state'))).toBe('Nothing running');
    const hidden = await mount({ appliances: [], hide_empty: true });
    expect(hidden.hidden).toBe(true);
  });

  it('knows its height at a 360 column: rows, compact rows, tiles, an empty list', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`);
    // the rows start 4 under the head (88), not a list's 16
    expect(FluvyAppliancesCard.layoutHeight({ type: 'x', appliances: rows(3) })).toBe(88 + 3 * 76);
    expect(appliancesHeight({ type: 'x', appliances: rows(3), variant: 'compact' })).toBe(
      88 + 3 * 48,
    );
    // the house's appliances, which the config cannot count: as many as the fold allows, and the fold row
    expect(appliancesHeight({ type: 'x' })).toBe(88 + 6 * 76 + 4 + 48);
    expect(appliancesHeight({ type: 'x', max_rows: 4, variant: 'compact' })).toBe(88 + 4 * 48 + 52);
    expect(appliancesHeight({ type: 'x', appliances: rows(8) })).toBe(88 + 6 * 76 + 52);
    // tiles with their pictures (88), or with their circles (84)
    expect(appliancesHeight({ type: 'x', appliances: rows(3), variant: 'tiles' })).toBe(
      100 + 2 * 88 + 8,
    );
    expect(
      appliancesHeight({ type: 'x', appliances: rows(3), variant: 'tiles', picture: 'icon' }),
    ).toBe(100 + 2 * 84 + 8);
    expect(appliancesHeight({ type: 'x', appliances: [] }) % 4).toBe(0);
    // whole cards one under the other, 16 apart: a washer's 376, a toaster's row 88
    expect(
      appliancesHeight({
        type: 'x',
        variant: 'cards',
        appliances: [
          { device: 'a', kind: 'washer' },
          { device: 'b', kind: 'toaster' },
        ],
      }),
    ).toBe(376 + 16 + 88);
  });

  it('lays each appliance out as its whole card, side by side, as listed: the automatic dashboard’s band (#47)', async () => {
    const card = await mount({
      variant: 'cards',
      picture: 'icon',
      appliances: [
        { device: 'lg-fridge', kind: 'fridge' },
        'hc-oven',
        { device: 'lg-washer', rows: ['program', 'energy'] },
      ],
    });
    type Whole = HTMLElement & { config: Record<string, unknown>; hass: HomeAssistant };
    const wholes = (): Whole[] => [...root(card).querySelectorAll<Whole>('.al-cards > *')];
    // no head and no surface of its own: the cards stand in the section as its own would
    expect(root(card).querySelector('.fv-card__head, article')).toBeNull();
    expect(card.getGridOptions().columns).toBe('full');
    // as listed (whole cards never trade places), each its item as its config, the list's picture where it names none
    expect(wholes().map((whole) => whole.config['device'])).toEqual([
      'lg-fridge',
      'hc-oven',
      'lg-washer',
    ]);
    expect(wholes()[0]!.config).toMatchObject({
      type: 'custom:fluvy-appliance-card',
      kind: 'fridge',
      picture: 'icon',
      _now: AT,
    });
    expect(wholes()[2]!.config['rows']).toEqual(['program', 'energy']);
    // a whole card holds in 300 at least (four across a desktop's band), rows alone in 240
    const grid = root(card).querySelector<HTMLElement>('.al-cards');
    expect(grid?.style.getPropertyValue('--al-least')).toBe('300px');
    const rows = await mount({
      variant: 'cards',
      appliances: [{ device: 'tuya-kettle', variant: 'row' }],
    });
    expect(
      root(rows).querySelector<HTMLElement>('.al-cards')?.style.getPropertyValue('--al-least'),
    ).toBe('240px');
    // the same cards on the next render, every change of the house reaching them
    const [first] = wholes();
    const next = { ...HOUSE, states: { ...HOUSE.states } } as HomeAssistant;
    card.hass = next;
    await card.updateComplete;
    expect(wholes()[0]).toBe(first);
    expect(first!.hass.states).toBe(next.states);
    // sorted by name where asked
    const named = await mount({
      variant: 'cards',
      sort: 'name',
      appliances: ['lg-washer', 'hc-oven'],
    });
    expect(
      [...root(named).querySelectorAll<Whole>('.al-cards > *')].map(
        (whole) => whole.config['device'],
      ),
    ).toEqual(['hc-oven', 'lg-washer']);
  });
});
