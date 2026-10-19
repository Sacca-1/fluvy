/*
 * The appliances' pictures: one product drawing a kind, as a catalogue would photograph it — brushed stainless, white
 * enamel, black glass and chrome, lit from the top left, standing on a soft contact shadow — on a 64 grid, so it is
 * crisp at 48 to 64 px and at twice that. No brand, no photograph: the shapes are generic. The materials are shared
 * gradients (`ART_DEFS`, drawn once a picture), their ids Fluvy's own so nothing else in a card's root takes them.
 *
 * One drawing serves both modes: the contact shadow's ink and weight and a rim light along the top and the left edge
 * (`r`, a path each) are the page's (`--ap-shade`, `--ap-shade-o`, `--ap-rim`, set by the card: no rim on a light
 * card, a soft one on a dark card, where a black glass appliance would otherwise sink into it).
 *
 * This module is its own chunk (`appliance-art`), fetched by the first card that draws a picture; the design lab keeps
 * the same table (`FLUVY.APPLIANCE_ART` in `apps/design-lab/fluvy.js`), held to it by `art.test.ts`. Nothing here
 * imports: the lab reads it as it is.
 */

/** The shared materials, each in the box of the shape it fills. */
export const ART_DEFS =
  '<linearGradient id="faS" x2="1"><stop offset="0" stop-color="#aeb3bb"/><stop offset=".18" stop-color="#e6e9ec"/><stop offset=".46" stop-color="#c9cdd3"/><stop offset=".74" stop-color="#e2e5e8"/><stop offset="1" stop-color="#a2a8b0"/></linearGradient>' +
  '<linearGradient id="faV" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#1c2028" stop-opacity=".16"/></linearGradient>' +
  '<linearGradient id="faW" x2=".6" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#f1f2f4"/><stop offset="1" stop-color="#d9dce1"/></linearGradient>' +
  '<linearGradient id="faB" y2="1"><stop offset="0" stop-color="#454952"/><stop offset=".45" stop-color="#25282e"/><stop offset="1" stop-color="#121418"/></linearGradient>' +
  '<linearGradient id="faG" x2=".9" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".42" stop-color="#fff" stop-opacity=".06"/><stop offset=".43" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
  '<linearGradient id="faC" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".5" stop-color="#9ea4ac"/><stop offset=".62" stop-color="#c2c7cd"/><stop offset="1" stop-color="#eef0f2"/></linearGradient>' +
  '<radialGradient id="faD" cx=".4" cy=".36" r=".72"><stop offset="0" stop-color="#7b8390"/><stop offset=".55" stop-color="#2f343c"/><stop offset="1" stop-color="#14161a"/></radialGradient>' +
  '<radialGradient id="faL" cx=".4" cy=".36" r=".72"><stop offset="0" stop-color="#b7bcc4"/><stop offset=".6" stop-color="#727983"/><stop offset="1" stop-color="#3d424a"/></radialGradient>' +
  '<radialGradient id="faH"><stop offset="0" style="stop-color:var(--ap-shade,#1b1e26);stop-opacity:var(--ap-shade-o,.34)"/><stop offset="1" style="stop-color:var(--ap-shade,#1b1e26);stop-opacity:0"/></radialGradient>';

/** The contact shadow under an object `w` wide, centred. */
const shadow = (w: number): string =>
  `<ellipse cx="32" cy="60.6" rx="${w / 2}" ry="2.6" fill="url(#faH)"/>`;

/** A box of a material, its top light and its fall into shade laid over it. */
const lit = (x: number, y: number, w: number, h: number, r: number, fill: string): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${fill})"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#faV)"/>`;

/** The rim light along a box's left and top edges (drawn only where the card says: a dark card). */
const rim = (x: number, y: number, w: number, h: number, r: number): string =>
  `<path class="r" d="M${x + 0.5} ${y + h - r}V${y + r}a${r - 0.5} ${r - 0.5} 0 0 1 ${r - 0.5}-${r - 0.5}H${x + w - r}"/>`;

/** A front loader's door: its gasket, its chrome ring, its glass (`glass`: a washer's dark, a dryer's grey drum). */
const door = (cx: number, cy: number, r: number, glass: string): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r + 0.6}" fill="#7f858e"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#faC)"/><circle cx="${cx}" cy="${cy}" r="${r - 2.6}" fill="#2c3037"/><circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="url(#${glass})"/><path d="M${cx - r * 0.5} ${cy - r * 0.28}a${r * 0.62} ${r * 0.62} 0 0 1 ${r * 0.58}-${r * 0.36}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/>`;

/** A pane of black glass with its sheen. */
const glass = (x: number, y: number, w: number, h: number, r: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#faB)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#faG)"/>`;

/** The pictures, by name: every kind has one (a washer-dryer the washer's, an appliance on a plug the plug's). */
export const APPLIANCE_ART = {
  /** a front loader in silver: its drawer and display, its chrome door over a dark drum */
  washer:
    shadow(42) +
    lit(11, 5, 42, 55, 4, 'faS') +
    '<path d="M11 16h42" stroke="#8d939b" stroke-width=".7"/><rect x="14.5" y="8" width="11" height="5" rx="1.2" fill="#d5d9de" stroke="#9aa0a8" stroke-width=".5"/><rect x="34" y="8.6" width="9" height="3.8" rx=".9" fill="#1a1d22"/><rect x="35.2" y="9.8" width="3.6" height="1.4" rx=".4" fill="#7fd0ff" opacity=".85"/><circle cx="48" cy="10.5" r="2.7" fill="url(#faC)" stroke="#878d96" stroke-width=".5"/>' +
    door(32, 37.5, 15, 'faD') +
    '<rect x="14" y="56.5" width="36" height="1.6" rx=".8" fill="#1c2028" opacity=".12"/>' +
    rim(11, 5, 42, 55, 4),
  /** a tumble dryer: a big dial, its door's grey drum, the condenser's flap under it */
  dryer:
    shadow(42) +
    lit(11, 5, 42, 55, 4, 'faS') +
    '<path d="M11 16h42" stroke="#8d939b" stroke-width=".7"/><rect x="14.5" y="8.6" width="9" height="3.8" rx=".9" fill="#1a1d22"/><rect x="15.7" y="9.8" width="3.6" height="1.4" rx=".4" fill="#ffb26b" opacity=".9"/><circle cx="36" cy="10.5" r="3.2" fill="url(#faC)" stroke="#878d96" stroke-width=".5"/><circle cx="45" cy="10.5" r="1" fill="#6f757e"/><circle cx="49" cy="10.5" r="1" fill="#6f757e"/>' +
    door(32, 36, 14.5, 'faL') +
    '<rect x="15" y="53.5" width="34" height="3.6" rx="1" fill="#b4b9c0" stroke="#8f959d" stroke-width=".5"/>' +
    rim(11, 5, 42, 55, 4),
  /** a dishwasher in stainless: its control strip, its handle, its brushed door and plinth */
  dishwasher:
    shadow(46) +
    lit(9, 6, 46, 54, 3, 'faS') +
    '<path d="M12 6h40a3 3 0 0 1 3 3v6H9V9a3 3 0 0 1 3-3Z" fill="#3a3e45"/><rect x="38" y="9" width="9" height="3.4" rx=".8" fill="#14161a"/><rect x="39.2" y="10" width="3.8" height="1.4" rx=".4" fill="#7fd0ff" opacity=".85"/><circle cx="14" cy="10.7" r="1" fill="#9aa0a8"/><circle cx="18" cy="10.7" r="1" fill="#9aa0a8"/><rect x="15" y="18" width="34" height="2.4" rx="1.2" fill="url(#faC)" stroke="#878d96" stroke-width=".4"/><path d="M12 23.5h40M12 55h40" stroke="#9aa0a8" stroke-width=".5" opacity=".7"/><rect x="11" y="56" width="42" height="3.4" rx=".8" fill="#7d838c"/>' +
    rim(9, 6, 46, 54, 3),
  /** a built-in oven: its control strip with a display, its handle over a black glass door */
  oven:
    shadow(54) +
    lit(5, 9, 54, 50, 3, 'faS') +
    '<rect x="27" y="11.6" width="10" height="4.6" rx="1" fill="#121418"/><path d="M28.6 14h1.6M31.2 14h1.6M33.8 14h1.6" stroke="#ff7a45" stroke-width="1.1"/><circle cx="12" cy="13.9" r="2.4" fill="url(#faC)" stroke="#7f858e" stroke-width=".5"/><circle cx="52" cy="13.9" r="2.4" fill="url(#faC)" stroke="#7f858e" stroke-width=".5"/>' +
    glass(8, 20, 48, 36, 2) +
    '<rect x="13" y="28" width="38" height="23" rx="1.6" fill="#0b0c0f" stroke="#3b4048" stroke-width=".6"/><path d="M15 30h34" stroke="#ff8a4a" stroke-opacity=".28" stroke-width=".8"/><rect x="10" y="22" width="44" height="2.2" rx="1.1" fill="url(#faC)" stroke="#6f757e" stroke-width=".4"/>' +
    rim(5, 9, 54, 50, 3),
  /** a microwave: its black glass door, its keypad and display, a chrome edge to open it by */
  microwave:
    shadow(56) +
    lit(4, 16, 56, 36, 3, 'faS') +
    glass(7, 19, 37, 30, 2) +
    '<rect x="11" y="23" width="29" height="22" rx="1.4" fill="#0b0c0f" stroke="#3b4048" stroke-width=".5"/><rect x="42.6" y="19" width="1.6" height="30" rx=".8" fill="url(#faC)"/><rect x="47" y="20" width="10" height="5" rx="1" fill="#121418"/><path d="M48.6 22.5h1.4M51 22.5h1.4M53.4 22.5h1.4" stroke="#7fd0ff" stroke-width="1"/><g fill="#8b9199"><circle cx="49" cy="30" r="1"/><circle cx="52" cy="30" r="1"/><circle cx="55" cy="30" r="1"/><circle cx="49" cy="34" r="1"/><circle cx="52" cy="34" r="1"/><circle cx="55" cy="34" r="1"/></g><circle cx="52" cy="42.5" r="3" fill="url(#faC)" stroke="#7f858e" stroke-width=".5"/>' +
    rim(4, 16, 56, 36, 3),
  /** a hob from above: black glass, four rings, its touch strip */
  hob:
    shadow(50) +
    glass(7, 7, 50, 51, 4) +
    '<g fill="none" stroke="#8a9099" stroke-width=".9" stroke-opacity=".75"><circle cx="21" cy="20.5" r="8.5"/><circle cx="43" cy="20.5" r="8.5"/><circle cx="21" cy="42" r="8.5"/><circle cx="43" cy="42" r="8.5"/></g><g fill="none" stroke="#8a9099" stroke-width=".6" stroke-opacity=".35"><circle cx="21" cy="20.5" r="5"/><circle cx="43" cy="20.5" r="5"/><circle cx="21" cy="42" r="5"/><circle cx="43" cy="42" r="5"/></g><g fill="#8a9099" opacity=".7"><circle cx="26" cy="54" r=".7"/><circle cx="30" cy="54" r=".7"/><circle cx="34" cy="54" r=".7"/><circle cx="38" cy="54" r=".7"/></g>' +
    rim(7, 7, 50, 51, 4),
  /** a chimney hood in stainless: its chimney, its canopy, its lamps under it */
  hood:
    shadow(44) +
    lit(26, 4, 12, 30, 1, 'faS') +
    '<path d="M12 34h40l5 11H7Z" fill="url(#faS)"/><path d="M12 34h40l5 11H7Z" fill="url(#faV)"/><rect x="7" y="45" width="50" height="3.4" rx=".8" fill="#454952"/><circle cx="22" cy="46.7" r="1" fill="#ffe2a6"/><circle cx="42" cy="46.7" r="1" fill="#ffe2a6"/><rect x="28" y="40" width="8" height="2" rx="1" fill="#8b9199"/>' +
    '<path class="r" d="M26.5 34V5H37M12.3 34.5h39.4"/>',
  /** a fridge freezer in silver: the freezer's door over the fridge's, their handles */
  fridge:
    shadow(30) +
    lit(17, 2, 30, 58, 3, 'faS') +
    '<rect x="17" y="21" width="30" height=".9" fill="#7f858e"/><rect x="20" y="9" width="1.7" height="9" rx=".85" fill="url(#faC)" stroke="#7f858e" stroke-width=".35"/><rect x="20" y="24.5" width="1.7" height="15" rx=".85" fill="url(#faC)" stroke="#7f858e" stroke-width=".35"/><rect x="18.5" y="58" width="27" height="1.4" rx=".7" fill="#1c2028" opacity=".2"/>' +
    rim(17, 2, 30, 58, 3),
  /** an upright freezer in white enamel: one door, a long handle, its display */
  freezer:
    shadow(30) +
    lit(17, 2, 30, 58, 3, 'faW') +
    '<rect x="17" y="2" width="30" height="58" rx="3" fill="none" stroke="#c4c9d0" stroke-width=".6"/><rect x="21" y="8" width="7" height="3.4" rx=".8" fill="#1a1d22"/><rect x="22" y="9" width="3" height="1.4" rx=".4" fill="#7fd0ff"/><rect x="42.5" y="14" width="1.8" height="26" rx=".9" fill="url(#faC)" stroke="#8f959d" stroke-width=".35"/><path d="M20 55h24" stroke="#c4c9d0" stroke-width=".6"/>' +
    rim(17, 2, 30, 58, 3),
  /** a wine cooler: black glass over its shelves of bottles, a chrome handle */
  wine:
    shadow(32) +
    '<rect x="16" y="4" width="32" height="56" rx="3" fill="#24272d"/>' +
    '<rect x="19" y="7" width="26" height="50" rx="1.6" fill="#101216"/><g fill="#6e5136"><rect x="19" y="16" width="26" height=".9"/><rect x="19" y="26" width="26" height=".9"/><rect x="19" y="36" width="26" height=".9"/><rect x="19" y="46" width="26" height=".9"/></g><g fill="#6d1f2b"><circle cx="23.5" cy="13.4" r="2.1"/><circle cx="32" cy="13.4" r="2.1"/><circle cx="23.5" cy="33.4" r="2.1"/><circle cx="40.5" cy="33.4" r="2.1"/><circle cx="32" cy="43.4" r="2.1"/></g><g fill="#2e4a35"><circle cx="40.5" cy="13.4" r="2.1"/><circle cx="23.5" cy="23.4" r="2.1"/><circle cx="32" cy="23.4" r="2.1"/><circle cx="40.5" cy="23.4" r="2.1"/><circle cx="32" cy="33.4" r="2.1"/><circle cx="23.5" cy="43.4" r="2.1"/><circle cx="40.5" cy="43.4" r="2.1"/></g><rect x="19" y="7" width="26" height="50" rx="1.6" fill="url(#faG)"/><rect x="42" y="12" width="1.6" height="22" rx=".8" fill="url(#faC)"/>' +
    rim(16, 4, 32, 56, 3),
  /** an espresso machine in graphite: its cup warmer, its chrome group, a glass of coffee on the drip tray */
  coffee:
    shadow(40) +
    glass(14, 5, 36, 52, 4) +
    '<rect x="14" y="5" width="36" height="3.6" rx="1.8" fill="url(#faC)"/><circle cx="32" cy="13.6" r="2.7" fill="url(#faC)" stroke="#5c626b" stroke-width=".5"/><circle cx="22" cy="13.6" r="1" fill="#8b9199"/><circle cx="42" cy="13.6" r="1" fill="#8b9199"/><rect x="18.5" y="19" width="27" height="30" rx="2" fill="#0d0e11"/><rect x="24.5" y="19" width="15" height="5.4" rx="1.6" fill="url(#faC)"/><path d="M30 24.4v2.6M34 24.4v2.6" stroke="#9ea4ac" stroke-width="1.2"/>' +
    '<path d="M26.6 35.4h10.8l-.9 9.4a1.8 1.8 0 0 1-1.8 1.6h-5.4a1.8 1.8 0 0 1-1.8-1.6Z" fill="#fff" fill-opacity=".22" stroke="#d9dde2" stroke-width=".5"/><path d="M27.4 39.2h9.2l-.6 5.5a1.2 1.2 0 0 1-1.2 1h-5.6a1.2 1.2 0 0 1-1.2-1Z" fill="#5a3420"/><rect x="27.4" y="38.6" width="9.2" height="1.3" rx=".6" fill="#c08a55"/><path d="M28 36.4l.5 7" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/>' +
    '<rect x="17" y="47" width="30" height="3" rx="1" fill="url(#faC)"/><rect x="12" y="51" width="40" height="7.4" rx="2.4" fill="#1d2025"/><rect x="12" y="51" width="40" height="7.4" rx="2.4" fill="url(#faG)"/>' +
    rim(14, 5, 36, 52, 4),
  /** a kettle in brushed steel: its lid and knob, its spout, its black handle and base, its water window */
  kettle:
    shadow(32) +
    '<rect x="17" y="54" width="30" height="5" rx="2" fill="#1d2025"/>' +
    '<path d="M21.5 19h21l3 35h-27Z" fill="url(#faS)"/><path d="M21.5 19h21l3 35h-27Z" fill="url(#faV)"/><path d="M21.6 23 13 17.8l.9-1.7 8 3.4Z" fill="#a2a8b0"/><rect x="21" y="14" width="22" height="6" rx="3" fill="url(#faS)"/><rect x="29" y="10.6" width="6" height="4" rx="1.6" fill="#1d2025"/><path d="M42.5 16c7.5 0 9.5 4 9.5 9.5v15c0 4-1.8 6.5-6.6 7.4l-.8-3.1c2.6-.6 3.6-2 3.6-4.6v-14.4c0-3.6-1-6.3-5.8-6.3Z" fill="#1d2025"/><rect x="38" y="25" width="2.2" height="22" rx="1.1" fill="#2c4152" opacity=".75"/><path d="M24.6 22.5 23 51" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>' +
    '<path class="r" d="M18.6 53.5 21.6 19.6H42"/>',
  /** an air fryer in gloss black: its display, its drawer and the drawer's silver handle */
  fryer:
    shadow(40) +
    glass(13, 5, 38, 53, 9) +
    '<rect x="19.5" y="10" width="25" height="11" rx="3.4" fill="#0c0d10" stroke="#3b4048" stroke-width=".5"/><path d="M27.4 15.5h2M31 15.5h2M34.6 15.5h2" stroke="#ff8a4a" stroke-width="1.2"/><path d="M13 28.2h38" stroke="#07080a" stroke-width="1"/><rect x="29.4" y="32" width="5.2" height="18" rx="2.6" fill="url(#faC)" stroke="#5c626b" stroke-width=".4"/><path d="M16.5 12c0-2.4 1.4-4 4-4.6" stroke="#fff" stroke-opacity=".4" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
    rim(13, 5, 38, 53, 9),
  /** a toaster in brushed steel: two slices up, its lever and its dial */
  toaster:
    shadow(48) +
    '<rect x="17" y="11" width="13" height="16" rx="4" fill="#e9c58c" stroke="#b7864d" stroke-width=".8"/><rect x="33.5" y="10" width="13" height="17" rx="4" fill="#e9c58c" stroke="#b7864d" stroke-width=".8"/>' +
    lit(7, 22, 50, 34, 10, 'faS') +
    '<rect x="15" y="23" width="16" height="2.6" rx="1.3" fill="#2a2d33"/><rect x="32.5" y="23" width="16" height="2.6" rx="1.3" fill="#2a2d33"/><rect x="54.6" y="30" width="4.2" height="8.6" rx="1.8" fill="#1d2025"/><circle cx="48" cy="47" r="2.9" fill="url(#faC)" stroke="#7f858e" stroke-width=".5"/><path d="M11.5 32c0-4 2-6.5 5-7.5" stroke="#fff" stroke-opacity=".6" stroke-width="1.2" stroke-linecap="round" fill="none"/><rect x="11" y="56" width="7" height="2.4" rx="1" fill="#1d2025"/><rect x="46" y="56" width="7" height="2.4" rx="1" fill="#1d2025"/>' +
    rim(7, 22, 50, 34, 10),
  /** a blender: a glass jar under its black lid, on a stainless base with a dial */
  blender:
    shadow(30) +
    '<path d="M20 44h24l2.4 15H17.6Z" fill="url(#faS)"/><path d="M20 44h24l2.4 15H17.6Z" fill="url(#faV)"/><circle cx="32" cy="52" r="3.2" fill="#1d2025"/><circle cx="32" cy="52" r="1.8" fill="url(#faC)"/>' +
    '<path d="M42 16h3.4a2.4 2.4 0 0 1 2.4 2.4v14.2a2.4 2.4 0 0 1-2.4 2.4H41" fill="none" stroke="#9fb3c6" stroke-width="2.2"/><path d="M21.5 12h21l-2.8 32H24.3Z" fill="#dce9f4" fill-opacity=".62" stroke="#9fb3c6" stroke-width=".7"/><path d="M28 40.5h8M32 38.5v4" stroke="#7f858e" stroke-width="1.2" stroke-linecap="round"/><path d="M24.6 15.5 26.4 40" stroke="#fff" stroke-opacity=".85" stroke-width="1.2" stroke-linecap="round"/><rect x="20.5" y="6.5" width="23" height="6" rx="2" fill="#1d2025"/><rect x="29" y="4" width="6" height="3" rx="1.2" fill="#2c3037"/>' +
    '<path class="r" d="M21 43.5 22 13M21 6.5h22"/>',
  /** a sandwich maker in gloss black: its domed lid, its steel badge, its clasp and lamps */
  sandwich_maker:
    shadow(50) +
    '<rect x="8" y="39" width="48" height="16" rx="5" fill="#1d2025"/><path d="M9 41c0-10 6-15.5 23-15.5S55 31 55 41Z" fill="url(#faB)"/><path d="M9 41c0-10 6-15.5 23-15.5S55 31 55 41Z" fill="url(#faG)"/><ellipse cx="32" cy="32" rx="11" ry="2.6" fill="url(#faS)" opacity=".8"/><rect x="25" y="40" width="14" height="5" rx="2.2" fill="#3a3e45"/><path d="M8.5 47h47" stroke="#07080a" stroke-width=".8"/><circle cx="46" cy="50" r=".9" fill="#5fd38a"/><circle cx="49.4" cy="50" r=".9" fill="#ff6a4d"/><rect x="12" y="55" width="6" height="2.4" rx="1" fill="#101216"/><rect x="46" y="55" width="6" height="2.4" rx="1" fill="#101216"/>' +
    '<path class="r" d="M9.5 41c0-9.6 6-15 22.5-15"/>',
  /** an appliance on a smart plug: the plug, white, its socket and its lamp */
  plug:
    shadow(30) +
    lit(17, 12, 30, 44, 8, 'faW') +
    '<rect x="17" y="12" width="30" height="44" rx="8" fill="none" stroke="#c4c9d0" stroke-width=".6"/><circle cx="32" cy="31" r="10" fill="#f4f5f7" stroke="#cdd1d7" stroke-width=".7"/><circle cx="28" cy="31" r="1.5" fill="#3a3e45"/><circle cx="36" cy="31" r="1.5" fill="#3a3e45"/><circle cx="32" cy="48" r="1.4" fill="#5fd38a"/>' +
    rim(17, 12, 30, 44, 8),
} as const;

export type ArtName = keyof typeof APPLIANCE_ART;
