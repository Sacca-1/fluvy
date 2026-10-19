/*
 * The appliances' glyphs: the thirteen kinds the family draws (the hood is Fluvy's fan, an appliance on a plug its plug)
 * and what a card's rows say (a shirt, warm air, a cup, a bean, a filter, chips), in the set's own hand — 24 grid,
 * 1.75 round stroke, ink 3..21 centred on (12, 12). They travel with the appliances'
 * chunk, which adds them to the set as it lands (`addGlyphs`); the six a person would pick for a card of their own in
 * Home Assistant's icon picker are also outlined in core's icon set (`fluvy:washer`, `tools/icons`). The design lab
 * keeps the same table (`FLUVY.APPLIANCE_GLYPHS` in `apps/design-lab/fluvy.js`); `glyphs.test.ts` holds them together.
 * Nothing here imports: the icon tools read it as it is.
 */

export const APPLIANCE_GLYPHS = {
  /** a front loader: its panel and its door, water in the drum */
  washer:
    '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 7.5h16"/><path d="M7.5 5.25h1.5"/><circle cx="12" cy="14.25" r="4.25"/><path d="M9.5 15c.85-.6 1.65-.6 2.5 0s1.65.6 2.5 0"/>',
  /** a tumble dryer: its panel and its door, the air turning in the drum */
  dryer:
    '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 7.5h16"/><path d="M7.5 5.25h1.5"/><circle cx="12" cy="14.25" r="4.25"/><path d="M12 12.25a2 2 0 1 1-2 2"/>',
  /** a dishwasher: its panel, two knobs and the door's handle */
  dishwasher:
    '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 8h16"/><path d="M7.5 5.5h.01"/><path d="M10.5 5.5h.01"/><path d="M9.5 11.5h5"/>',
  /** an oven: its panel and knobs, the window of its door */
  oven: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 8h17"/><path d="M7 5.75h.01"/><path d="M10 5.75h.01"/><rect x="7" y="11" width="10" height="6" rx="1.25"/>',
  /** a microwave: its window and its buttons */
  microwave:
    '<rect x="3" y="5" width="18" height="14" rx="3"/><rect x="6" y="8" width="9" height="8" rx="1.25"/><path d="M18 9h.01"/><path d="M18 12h.01"/><path d="M18 15h.01"/>',
  /** a hob from above: four plates */
  hob: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="2"/><circle cx="15.5" cy="8.5" r="2"/><circle cx="8.5" cy="15.5" r="2"/><circle cx="15.5" cy="15.5" r="2"/>',
  /** a fridge-freezer: two doors and their handles */
  fridge:
    '<rect x="5.5" y="3" width="13" height="18" rx="2.5"/><path d="M5.5 10h13"/><path d="M8.5 6v1.5"/><path d="M8.5 13v3"/>',
  /** a cup on its saucer, steaming */
  coffee:
    '<path d="M5.5 9h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2a4.5 4.5 0 0 1-4.5-4.5Z"/><path d="M16.5 10.5h1a2.25 2.25 0 0 1 0 4.5h-1"/><path d="M4.5 21h13.5"/><path d="M9 3c-.8.9-.8 1.6 0 2.5"/><path d="M13 3c-.8.9-.8 1.6 0 2.5"/>',
  /** a kettle: its lid, its spout and its handle */
  kettle:
    '<path d="M7.5 8h8l1.5 11a1.75 1.75 0 0 1-1.75 2h-7.5A1.75 1.75 0 0 1 6 19Z"/><path d="M9.5 5.5h4"/><path d="M11.5 3v2.5"/><path d="M17 10.5h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-.5"/><path d="M6.5 11 4 9"/>',
  /** an air fryer: its dial and its basket */
  fryer:
    '<rect x="4.5" y="3" width="15" height="18" rx="4"/><path d="M4.5 13.5h15"/><path d="M10 17h4"/><circle cx="12" cy="8" r="2"/>',
  /** a toaster: two slices up out of its slots */
  toaster:
    '<rect x="3" y="9" width="18" height="11" rx="4"/><path d="M7.5 9V5.5A1.5 1.5 0 0 1 9 4h1a1.5 1.5 0 0 1 1.5 1.5V9"/><path d="M13 9V5.5A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5V9"/><path d="M7 20v1M17 20v1"/>',
  /** a blender: its jar and handle on its base */
  blender:
    '<path d="M7 3h10l-1.5 11h-7Z"/><path d="M6.5 14h11l1 7h-13Z"/><path d="M16.75 5.5h1.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-2"/><path d="M12 17.5h.01"/>',
  /** a sandwich maker: its domed lid shut on its plate */
  sandwich:
    '<path d="M3.5 13c0-4.5 3.5-7 8.5-7s8.5 2.5 8.5 7Z"/><rect x="3.5" y="13" width="17" height="5" rx="2"/><path d="M10 15.5h4"/><path d="M6.5 18v2M17.5 18v2"/>',
  /** a shirt: what a washer's programme washes */
  shirt:
    '<path d="M8.75 4 4.5 6.25 3 10.75l3.5 1.25v8.5h11V12l3.5-1.25-1.5-4.5L15.25 4a3.25 3.25 0 0 1-6.5 0Z"/>',
  /** warm air rising: a dryer's, an air fryer's */
  steam:
    '<path d="M7 3.5c-1.6 1.8-1.6 3.7 0 5.5s1.6 3.7 0 5.5-1.6 3.7 0 5.5"/><path d="M12 3.5c-1.6 1.8-1.6 3.7 0 5.5s1.6 3.7 0 5.5-1.6 3.7 0 5.5"/><path d="M17 3.5c-1.6 1.8-1.6 3.7 0 5.5s1.6 3.7 0 5.5-1.6 3.7 0 5.5"/>',
  /** a cup on its saucer: a drink, the last one made */
  cup: '<path d="M4.5 5.5h12V11a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z"/><path d="M16.5 7h1a2.75 2.75 0 0 1 0 5.5h-1"/><path d="M3.5 19h15"/>',
  /** a wide cup with its milk's foam: a cappuccino, a latte */
  cappuccino:
    '<path d="M3.5 9h17a8.5 8.5 0 0 1-17 0Z"/><path d="M5.5 20.5h13"/><path d="M8 5c1.3-.8 2.7-.8 4 0s2.7.8 4 0"/>',
  /** a coffee bean */
  bean: '<ellipse cx="12" cy="12" rx="6.25" ry="8.75" transform="rotate(35 12 12)"/><path d="M16 6.5c-3.5 2-4.5 8.5-8 11"/>',
  /** a funnel: a filter to rinse or change */
  filter: '<path d="M3.5 4.5h17l-6.5 8v6.5l-4 2v-8.5Z"/>',
  /** chips in their carton: what an air fryer makes */
  fries:
    '<path d="M6 10h12l-1.5 10.5h-9Z"/><path d="M8.5 10 7.5 4"/><path d="M11 10V3.5"/><path d="M13.75 10l.75-5.5"/><path d="M16 10l1.5-4.5"/>',
} as const;

export type ApplianceGlyphName = keyof typeof APPLIANCE_GLYPHS;

/** The kinds a person would pick for a card of their own: outlined in core's icon set as well. */
export const PICKABLE: readonly ApplianceGlyphName[] = [
  'washer',
  'dryer',
  'dishwasher',
  'fridge',
  'oven',
  'coffee',
];
