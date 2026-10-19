import type { HomeAssistant } from '@fluvy/core';
import { css, html, nothing, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import type { ArtName } from './art/art.js';
import type { ApplianceKind } from './kinds.js';

/*
 * An appliance's picture: the product drawing of its kind (the `appliance-art` chunk, fetched by the first card that
 * draws one and kept), the person's own picture (`image`: an address, or an entity whose `entity_picture` it is), or
 * nothing while the drawings are on their way — the box keeps its size, so nothing moves when they land.
 */

/** What a card shows in a picture's place: the drawing (default), the kind's circle, or nothing. */
export type PictureStyle = 'art' | 'icon' | 'none';

/** The drawing each kind is shown with: a washer-dryer the washer's, an air fryer the fryer's, a plug's the plug. */
export const KIND_ART: Readonly<Record<ApplianceKind, ArtName>> = {
  washer: 'washer',
  washer_dryer: 'washer',
  dryer: 'dryer',
  dishwasher: 'dishwasher',
  oven: 'oven',
  microwave: 'microwave',
  hob: 'hob',
  hood: 'hood',
  fridge: 'fridge',
  freezer: 'freezer',
  wine: 'wine',
  coffee: 'coffee',
  kettle: 'kettle',
  air_fryer: 'fryer',
  toaster: 'toaster',
  blender: 'blender',
  sandwich_maker: 'sandwich_maker',
  appliance: 'plug',
};

type Art = typeof import('./art/art.js');

let art: Art | undefined;
let loading: Promise<void> | undefined;
/** The cards waiting for the drawings: each draws again when they land. */
const waiting = new Set<() => void>();
/** Each kind's drawing, built once. */
const drawn = new Map<ArtName, TemplateResult>();

/** Fetches the drawings once; every card that asked draws again when they land. */
function load(then: () => void): void {
  waiting.add(then);
  loading ??= import('./art/art.js').then(
    (module) => {
      art = module;
      for (const draw of waiting) draw();
      waiting.clear();
    },
    () => {
      // a chunk that cannot be fetched (offline) is asked again by the next card that draws
      loading = undefined;
    },
  );
}

/** A kind's drawing, or undefined while the drawings are on their way (`then` runs when they land). */
export function artOf(kind: ApplianceKind, then: () => void): TemplateResult | undefined {
  const name = KIND_ART[kind];
  if (!art) {
    load(then);
    return undefined;
  }
  let template = drawn.get(name);
  if (!template) {
    template = html`<svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>${unsafeSVG(art.ART_DEFS)}</defs>
      ${unsafeSVG(art.APPLIANCE_ART[name])}
    </svg>`;
    drawn.set(name, template);
  }
  return template;
}

/**
 * The person's own picture: an address, or an entity that has one (`image.waschmaschine`, a camera's still), else
 * none; an address Home Assistant serves is made whole by it (`hassUrl`).
 */
export function imageOf(hass: HomeAssistant | undefined, image: string | undefined): string {
  if (!image) return '';
  const own = /^[a-z_]+\.[\w-]+$/.test(image)
    ? hass?.states[image]?.attributes['entity_picture']
    : image;
  if (typeof own !== 'string' || !own) return '';
  return own.startsWith('/') && hass?.hassUrl ? hass.hassUrl(own) : own;
}

/**
 * The picture's box and its drawing: the contact shadow in the page's ink and a rim light along its edges, both the
 * card's to set — none on a light card; on a dark one a deeper shadow, the rim, and a soft glow behind it, so a black
 * glass appliance does not sink into the card. Out of reach, it greys and fades with the card.
 */
export const pictureStyles = css`
  .ap-pic {
    display: inline-flex;
    flex: 0 0 var(--ap-pic);
    width: var(--ap-pic);
    height: var(--ap-pic);
    border-radius: var(--fluvy-radius-control);
    transition: scale var(--fv-fast) var(--fv-ease);
  }
  .ap-pic > svg,
  .ap-pic > img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ap-pic .r {
    fill: none;
    stroke: var(--ap-rim, transparent);
    stroke-width: 1;
    stroke-linecap: round;
  }
  :host([dark]) .ap-pic {
    --ap-shade: #000;
    --ap-shade-o: 0.62;
    --ap-rim: rgb(255 255 255 / 24%);
    background: radial-gradient(closest-side, rgb(255 255 255 / 8%), transparent);
  }
  .is-unavailable .ap-pic {
    opacity: 0.5;
    filter: grayscale(1);
  }
`;

/** The picture's box (`size` square), its drawing or the person's picture inside; empty until the drawings land. */
export function pictureBox(
  size: number,
  inside: TemplateResult | string | undefined,
  extra = '',
): TemplateResult {
  return html`<span class="ap-pic ${extra}" style="--ap-pic:${size}px" aria-hidden="true"
    >${typeof inside === 'string' ? html`<img src=${inside} alt="" />` : (inside ?? nothing)}</span
  >`;
}

/**
 * The whole card's head says what the appliance does beside its name where the slot beside its 64 picture holds at
 * least this (two thirds of the design's 180 at a 360 column); narrower, under the head, the card's width: by the
 * column, never by the words.
 */
export const SUB_BESIDE = 120;

/** How the whole card's head lays out, by its column and its name's width at 20 and at 16. */
export interface HeadFit {
  /** The picture's box: 64, 44, or none. */
  readonly size: 0 | 44 | 64;
  /** The name steps from 20 to 16. */
  readonly small: boolean;
  /** What it does goes under the head, the card's width. */
  readonly under: boolean;
  /** The room the name and what it does have beside the picture and the round. */
  readonly room: number;
}

/**
 * The whole card's head (#47): the picture gives way before a letter of the name does — 64 where the whole name holds
 * beside it at 20, 44 where it holds at 20 and then at 16, else none (the name at 20, then 16) — and only a name that
 * holds nowhere ends in its ellipsis, beside no picture. The picture keeps a slot of 72 at least beside it. What it
 * does sits beside the name or under the head by the column alone (`SUB_BESIDE` beside the 64), so the head of every
 * card of a row is as tall as the next whatever its name. `width` is the card's content, `trailing` the round and its
 * gap (0 without one), `big` and `small` the name's widths at 20 and at 16.
 */
export function headFit(
  width: number,
  trailing: number,
  picture: boolean,
  big: number,
  small: number,
): HeadFit {
  const room = (size: number): number => width - trailing - (size ? size + 16 : 0);
  const steps: ReadonlyArray<readonly [0 | 44 | 64, boolean]> = picture
    ? [
        [64, false],
        [44, false],
        [44, true],
        [0, false],
        [0, true],
      ]
    : [
        [0, false],
        [0, true],
      ];
  const [size, step] = steps.find(
    ([n, s]) => room(n) >= (n ? Math.max(72, s ? small : big) : s ? small : big),
  ) ?? [0, true];
  return { size, small: step, under: room(picture ? 64 : 0) < SUB_BESIDE, room: room(size) };
}
