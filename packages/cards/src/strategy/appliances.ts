import type { ApplianceKind } from '../appliance/kinds.js';
import { applianceVariant } from '../appliances-family.js';
import type { HomeRegistry } from './home-registry.js';
import { heading } from './layout.js';
import type { Card, Section, StrategyContext, View } from './types.js';

/*
 * The house's appliances as the reporter of #47 drew them, across the view under its columns: "Large appliances" —
 * each a whole card, side by side (four at a desktop's width, as many as hold on a narrower screen) — then "Small
 * appliances", each a row. A band is one section spanning the view's columns (Home Assistant narrows it to those a
 * screen has); its heading leads to every appliance, and the appliances card lays the cards out inside it, so the cards
 * fill the band at any width, never a gap at its end.
 */

/** A band's order: what keeps food cold, what cleans, what cooks, the coffee; then the small ones. */
const ORDER: readonly ApplianceKind[] = [
  'fridge',
  'freezer',
  'wine',
  'dishwasher',
  'washer',
  'washer_dryer',
  'dryer',
  'oven',
  'hob',
  'air_fryer',
  'coffee',
  'toaster',
  'kettle',
  'microwave',
  'blender',
  'sandwich_maker',
  'hood',
  'appliance',
];

/** As many as Home shows of each band: two rows of four large ones, a row of five small ones. */
export const HOME_LARGE = 8;
export const HOME_SMALL = 5;

/** The subview of every appliance, which Home's bands lead to. */
export const APPLIANCES_PATH = 'appliances';

/** An appliance of a band: its device and what it is (the card's height is its kind's). */
export interface BandItem {
  readonly device: string;
  readonly kind: ApplianceKind;
}

/**
 * The appliances in a band's order, the large ones (a kind whose card is whole: a washer, a fridge, an oven) apart from
 * the small ones (a kettle, a toaster, anything on a plug: a row each).
 */
export function bandsOf(
  home: HomeRegistry,
  devices: readonly string[],
): { readonly large: readonly BandItem[]; readonly small: readonly BandItem[] } {
  const items = devices
    .map((device) => ({
      device,
      kind: home.applianceKind(device),
      name:
        home.registries.devices?.[device]?.name_by_user ??
        home.registries.devices?.[device]?.name ??
        '',
    }))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
        a.name.localeCompare(b.name, home.registries.language),
    )
    .map(({ device, kind }) => ({ device, kind }));
  return {
    large: items.filter(({ kind }) => applianceVariant({ type: '', kind }) === 'full'),
    small: items.filter(({ kind }) => applianceVariant({ type: '', kind }) !== 'full'),
  };
}

/**
 * A band's cards: its heading — a section title, as the reporter drew it, the way to every appliance where there is
 * one — and the appliances side by side.
 */
function band(
  title: string,
  icon: string,
  items: readonly BandItem[],
  link: { readonly path: string; readonly text: string } | undefined,
  small: boolean,
): Card[] {
  return [
    {
      ...heading(title, icon, [], link?.path),
      heading_style: 'title',
      ...(link ? { subtitle: link.text } : {}),
    },
    {
      type: 'custom:fluvy-appliances-card',
      variant: 'cards',
      // a small one is a row whatever its kind would draw alone (a hood's compact card): the band's rows are level
      appliances: items.map(({ device, kind }) => ({
        device,
        kind,
        ...(small && applianceVariant({ type: '', kind }) !== 'row' ? { variant: 'row' } : {}),
      })),
      grid_options: { columns: 'full' },
    },
  ];
}

/**
 * The bands of a set of appliances, as one section across `span` columns: the large ones, then the small ones, each
 * capped where `caps` says (Home's), each heading leading to `path` (every appliance) where there is one. None for
 * a house without appliances.
 */
export function applianceSections(
  ctx: Pick<StrategyContext, 'home' | 't'>,
  devices: readonly string[],
  span: number,
  { path, caps = false }: { readonly path?: string; readonly caps?: boolean } = {},
): Section[] {
  const { large, small } = bandsOf(ctx.home, devices);
  const link = (text: 'strategy.all_appliances' | 'strategy.show_all') =>
    path ? { path, text: ctx.t(text) } : undefined;
  const cards = [
    ...(large.length
      ? band(
          ctx.t('strategy.large_appliances'),
          'fluvy:dishwasher',
          caps ? large.slice(0, HOME_LARGE) : large,
          link('strategy.all_appliances'),
          false,
        )
      : []),
    ...(small.length
      ? band(
          ctx.t('strategy.small_appliances'),
          'fluvy:plug',
          caps ? small.slice(0, HOME_SMALL) : small,
          link('strategy.show_all'),
          true,
        )
      : []),
  ];
  return cards.length ? [{ type: 'grid', column_span: span, cards }] : [];
}

/** Every appliance of the house on a view of its own, reached from Home's bands (never a tab), back to Home. */
export function appliancesView(ctx: StrategyContext, columns: number): View {
  return {
    title: ctx.t('strategy.appliances'),
    icon: 'fluvy:washer',
    path: APPLIANCES_PATH,
    type: 'sections',
    max_columns: columns,
    subview: true,
    back_path: `${ctx.base}/home`,
    sections: applianceSections(ctx, ctx.home.applianceDevices, columns),
  };
}
