#!/usr/bin/env node
/**
 * Alignment measurer: opens a design-lab page and audits every phone frame against the
 * house rules — 4px grid, text columns, control heights, icon boxes, touch targets,
 * shared baselines and whole-pixel geometry at DPR 1/2/3.
 *
 *   node measure.mjs --page ../../apps/design-lab/sheets/palette-gallery.html \
 *     --frame '.phone' --palette linen --grid 4 --dpr 1,2,3 \
 *     --out ../../apps/design-lab/out/measure/report.json \
 *     --md  ../../apps/design-lab/out/measure/report.md
 *
 * Also an http page (the playground's real cards, the settings panel: `--page "http://127.0.0.1:5184/?panel=preferences"`).
 *
 * Exit code 1 when anything is off. Opt a subtree out with `data-measure="skip"`;
 * force an element in with any other `data-measure` value. `data-measure="drawn"` is the one for a drawing (a
 * chart's paths, a timeline's stretches): its subtree keeps every rule but the grid and the whole pixel, whose
 * widths the data decides. Two more declarations the page can make:
 *   `data-scroll-row`  a row that scrolls sideways: what it clips at its padding edge is not an overflow, and its
 *                      selected item (`aria-selected`, `.is-active`) must lie in full view, clear of 24 px fades;
 *   `data-fill-row`    a row whose equal cells share its width: their widths are the row's (not the 4 grid's), and
 *                      the row is checked instead — equal cells on whole pixels, one gap between them, spanning its
 *                      content box but for a tail under a pixel per cell (what a whole-pixel division leaves over).
 * A card in a column off the grid (the 211 floor, a third of a section) is held to the grid and the whole pixel at the
 * widths where its column is on them: what its width decides falls off by the width's own remainder.
 * A box is placed by its parent (a flex or grid's justify, text-align for an inline-level box), never by its own
 * text-align; text centred in its own box, or in a fitted pill, has no left edge of its own.
 *
 * An ellipsis is a name's answer to a narrow column, nothing else's. A name says so (`data-name`, a class that says
 * `name`, or a `title` that holds its words — which excuses a name's words only, never a figure, and never a state or a
 * status line's: a class that says `sub`, `line`, `state` or `status`), or is one the house gives (an entity's, a
 * device's, an area's, a person's, what a player plays) or a card's config (its `name`, its `title`): a card writes it
 * as it is. Text cut with an ellipsis — or a line clamp's — is read
 * where the cut falls: a figure, a unit or a percentage cut anywhere (`cut-figure`: "Schauer · 6…"), a word inside a
 * button, a chip, a badge, a heading, a title, a date or a state (`ellipsis`), and any other word that is no name — a
 * sub, a caption, a label (`cut-word`: "2 événe…"). Prose clamped at three lines ends a sentence, not a word. A time
 * rail's knob hides what it would cover, whole: a tick, bar or label still painted within its halo (`rail-bite`) is a
 * defect.
 *
 * Text is read where it is laid: a run's line boxes (a range's rect is the font's content area, which overhangs a
 * tight line height). Seven rules read it so:
 *   `overlap`      a run drawn over a `[data-control]` it is not inside (a figure under its stepper), or over another
 *                  run inside value rows, readouts and tile feet (a label over its value); pieces placed out of the
 *                  flow (absolute, fixed) are exempt, as they are from containment;
 *   `collision`    two runs drawn over each other anywhere else, where no control is involved (a week strip's weekdays
 *                  read as one word: "LUNMARMER");
 *   `midword`      a line that ends inside a word (`overflow-wrap`, `word-break`: "Resta/rt HA"), or between a figure
 *                  and its unit across a no-break space; the language's own hyphenation (`hyphens: auto`, a soft
 *                  hyphen) is not a break;
 *   `pill-cut`     a content-sized pill (`[data-fit]`) that does not hold its content: a pill must, so a name inside
 *                  one has no ellipsis to fall back on;
 *   `clipped`      a run that runs past the box clipping it (an ancestor's `overflow`), with no ellipsis to say so;
 *   `raw-key`      a catalogue key on screen (`wall.back`): a word that never arrived — a catalogue namespace, or an
 *                  underscore, before its dotted rest (an entity id the house has is a name; "p.m." is a word);
 *   `head-target`  a card head's button (`.fv-card__tap`, its overlay stretched over the head) that keeps no free
 *                  44 × 44 beside the controls raised over it.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { parseArgs, launchOptions } from './lib.mjs';

const args = parseArgs(process.argv.slice(2), {
  page: '../../apps/design-lab/sheets/palette-gallery.html',
  frame: '[data-frame]',
  palette: '',
  grid: '4',
  width: '412',
  dpr: '1,2,3',
  out: '',
  md: '',
  // `pass`: a page with no frame to measure (a card probe over a sheet without such frames) is an empty report
  empty: 'fail',
});

const CONTROL_HEIGHTS = [28, 36, 44, 48, 56];
const ICON_SIZES = [40, 44, 48, 56, 64]; // 56 = the energy flow's house (the ribbons land on it), 64 = hero icon circle (weather, confirm sheets)
const TOUCH_MIN = 44;
const TOL = 0.02;
const BASELINE_TOL = 0.5;
const TEXT_COLUMN_TOL = 0.5; // left edges closer than this are the same column
const OVERLAP_TOL = 0.5; // two boxes that share less than this, either way, only touch
// a catalogue key: `wall.back`, `energy-flow.title`, `panel.palette.custom_sub`; no segment is empty ("p.m." is none)
const RAW_KEY = '^[a-z][a-z0-9_-]*(?:\\.[a-z0-9_-]+)+$';
/** The catalogue's namespaces (`wall`, `energy-flow`): a dotted word that starts with one, or has an underscore, is a key */
const NAMESPACES = await (async () => {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../packages/core/src/i18n/locales/en',
  );
  const files = await readdir(dir).catch(() => []);
  const names = new Set();
  for (const file of files.filter((name) => name.endsWith('.json')))
    for (const key of Object.keys(JSON.parse(await readFile(join(dir, file), 'utf8'))))
      names.add(key);
  return [...names];
})();
const MAX_LISTED = 60;

/**
 * Runs inside the page. Everything it needs is defined here: `page.evaluate` ships the
 * function as source, so it closes over nothing from the module above.
 */
function audit(opts) {
  const {
    frameSel,
    grid,
    dprs,
    tol,
    baselineTol,
    columnTol,
    overlapTol,
    controls,
    icons,
    touchMin,
    rawKey,
    namespaces,
  } = opts;

  /* Shadow DOM aware walking: the production cards render into shadow roots, the design sheets do not. */
  const up = (node) => node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
  const kids = (el) =>
    Array.from(el.shadowRoot ? el.shadowRoot.children : el.children).filter(
      (c) => c.tagName !== 'STYLE',
    );

  const r3 = (n) => Math.round(n * 1000) / 1000;
  const offGrid = (v) => Math.abs(v - Math.round(v / grid) * grid) > tol;
  const near = (v, target) => Math.abs(v - target) <= tol;

  /** Computed colours arrive as `rgb(a)(…)`; only the alpha decides whether it paints. */
  const alphaOf = (color) => {
    const inside = /^rgba?\(([^)]+)\)$/.exec(color);
    if (!inside) return color === 'transparent' ? 0 : 1;
    const parts = inside[1].split(/[,/\s]+/).filter(Boolean);
    return parts.length > 3 ? Number(parts[3]) : 1;
  };

  const paints = (el, cs) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg' || tag === 'img' || tag === 'canvas') return true;
    if (el.hasAttribute('data-measure')) return true;
    if (alphaOf(cs.backgroundColor) > 0) return true;
    if (cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow !== 'none') return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) =>
        parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none',
    );
  };

  const firstClass = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    return cls ? '.' + cls.split(/\s+/)[0] : '';
  };

  /**
   * The card a node belongs to: the outermost of Fluvy's elements holding it below the frame (a ruler's card, not the
   * ruler), else the outermost element of any kind (a page's own), else the frame's own (the settings panel).
   */
  const hostOf = (el, frame) => {
    let fluvy = '';
    let any = '';
    for (let node = el; node && node !== frame; node = up(node)) {
      const tag = node.tagName.toLowerCase();
      if (!tag.includes('-')) continue;
      any = tag;
      if (tag.startsWith('fluvy-')) fluvy = tag;
    }
    return fluvy || any || frame.tagName.toLowerCase();
  };

  /** Last four levels below the frame — enough to find the node, short enough to read. */
  const shortPath = (el, frame) => {
    const parts = [];
    for (let node = el; node && node !== frame && parts.length < 4; node = up(node)) {
      parts.unshift(node.tagName.toLowerCase() + firstClass(node));
    }
    return parts.join(' > ');
  };

  /**
   * Whether an element sits in a column off the grid: the frame's child that holds it (a card in its grid cell) is not a
   * whole multiple of the grid — the 211 floor, a 266 card, a third of a section. Every box its width decides (a bar's
   * remainder, a block inset from one side, a picture's height) then falls off the grid by that remainder, so the grid
   * and the whole pixel are judged where the card's width is on the grid, and nothing else is spared.
   */
  const offGridColumns = new Map();
  const inOffGridColumn = (el, frame) => {
    let column = el;
    while (column && up(column) && up(column) !== frame) column = up(column);
    if (!column || up(column) !== frame) return false;
    if (!offGridColumns.has(column))
      offGridColumns.set(column, offGrid(column.getBoundingClientRect().width));
    return offGridColumns.get(column);
  };

  /** The card an element sits on; a floating surface (a menu fixed over the page) is the card of what it holds. */
  const cardOf = (el, frame) => {
    for (let node = up(el); node && node !== frame; node = up(node)) {
      if (node.hasAttribute('data-card')) return node;
      if (/card/i.test(typeof node.className === 'string' ? node.className : '')) return node;
      if (globalThis.getComputedStyle(node).position === 'fixed') return node;
    }
    return null;
  };

  /** First line box of the element's own text, or null when it has none. */
  const firstTextRect = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      if (rects.length) return rects[0];
    }
    return null;
  };

  /*
   * An empty inline-block's baseline is its bottom margin edge, so a zero-sized probe
   * inserted into the line reports the real text baseline whatever the font size is.
   * Flex and grid parents have no line box to join — there the line-box bottom is the
   * closest honest answer, which is why mixed groups are compared with a loose tolerance.
   */
  const baselineOf = (el, cs) => {
    if (/flex|grid/.test(cs.display)) {
      const rect = firstTextRect(el);
      return rect ? rect.bottom : null;
    }
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden';
    el.insertBefore(probe, el.firstChild);
    const { bottom } = probe.getBoundingClientRect();
    probe.remove();
    return bottom;
  };

  const keys = ['x', 'y', 'w', 'h'];
  const frames = Array.from(document.querySelectorAll(frameSel));

  /**
   * A row declared to scroll sideways (`data-scroll-row`, a phone's tab strip) that does overflow: it clips what
   * runs past its edge, by design.
   */
  const scrollRow = (el) =>
    el.hasAttribute?.('data-scroll-row') && el.scrollWidth > el.clientWidth + 1;
  /** An element such a row clips: only its relation across the row's edge is the row's business. */
  const scrolledAway = (el, frame) => {
    for (let node = up(el); node && node !== frame; node = up(node)) {
      if (!scrollRow(node)) continue;
      // its content scrolls under its padding too: the edge that clips is the padding box's
      const row = node.getBoundingClientRect();
      const rcs = globalThis.getComputedStyle(node);
      const box = el.getBoundingClientRect();
      return (
        box.left < row.left + parseFloat(rcs.paddingLeft) - 0.5 ||
        box.right > row.right - parseFloat(rcs.paddingRight) + 0.5
      );
    }
    return false;
  };

  /**
   * A box that runs past a scroller it scrolls in (a side column taller than the window scrolls within itself): what
   * lies past the scroller's box is scrolled content, not an overflow.
   */
  const scrolledWithin = (el, frame) => {
    const box = el.getBoundingClientRect();
    for (let node = up(el); node && node !== frame; node = up(node)) {
      const ncs = globalThis.getComputedStyle(node);
      if (!/(auto|scroll)/.test(ncs.overflowY) || node.scrollHeight <= node.clientHeight + 0.5)
        continue;
      const clip = node.getBoundingClientRect();
      if (box.bottom > clip.bottom + 0.5 || box.top < clip.top - 0.5) return true;
    }
    return false;
  };

  /** The box that lays an element out: its parent, or past a `display: contents` one (it has no box), the next. */
  const layoutParent = (el) => {
    let node = up(el);
    while (node && globalThis.getComputedStyle(node).display === 'contents') node = up(node);
    return node;
  };

  /** A knob, cursor, bubble or fill that encodes a continuous value cannot sit on the grid. */
  const continuous = (el, frame) => {
    for (let node = el; node && node !== frame; node = up(node)) {
      if (node.getAttribute('data-measure') === 'value') return true;
    }
    return false;
  };

  /**
   * Centred or end-aligned content has no meaningful left edge: a label centred in a chip,
   * the right-hand item of a space-between row, anything under `data-align="center|end"`.
   */
  const alignedAway = (el, cs, frame) => {
    // an inline-level box is placed by its parent's text-align; its own text-align only places its content
    // (every button centres its content by default: that says nothing about the button's own x)
    if (/^inline/.test(cs.display) && up(el) && up(el) !== frame) {
      if (/^(center|right|end)$/.test(globalThis.getComputedStyle(up(el)).textAlign)) return true;
    }
    // an inline box that trails text (a unit, a trend glyph) inherits the exemption for its subtree
    for (let node = el; node && node !== frame; node = up(node)) {
      if (continuesLine(node, node.getBoundingClientRect())) return true;
    }
    if (/flex/.test(cs.display) && /^(center|flex-end|end)$/.test(cs.justifyContent)) return true;
    for (let node = el; node && node !== frame; node = up(node)) {
      const align = node.getAttribute('data-align');
      if (align === 'center' || align === 'end' || align === 'optical') return true; // optical: ink pulled onto the column on purpose
      const parent = up(node);
      if (!parent || parent === frame) break;
      const pcs = globalThis.getComputedStyle(parent);
      if (/flex|grid/.test(pcs.display)) {
        if (/^(center|flex-end|end|right)$/.test(pcs.justifyContent)) return true;
        if (/^space-/.test(pcs.justifyContent) && parent.firstElementChild !== node) return true;
      }
    }
    return false;
  };

  /** Only the first text run on a line owns the column edge; a unit after a value does not. */
  const continuesLine = (el, textRect) => {
    let text = null;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) {
        text = node;
        break;
      }
    }
    for (let sib = text ? text.previousSibling : null; sib; sib = sib.previousSibling) {
      if (sib.nodeType === 3 && sib.textContent.trim()) return true;
      if (sib.nodeType === 1 && sib.getBoundingClientRect().width > 0) return true;
    }
    let prev = el.previousSibling;
    // skip blank text and comment nodes (Lit leaves comment markers between template parts)
    while (prev && ((prev.nodeType === 3 && !prev.textContent.trim()) || prev.nodeType === 8))
      prev = prev.previousSibling;
    if (!prev) return false;
    if (prev.nodeType === 3) return true;
    const r = prev.getBoundingClientRect();
    // on the same line: the boxes overlap vertically and the previous one ends before this one begins (a block
    // placed under a shorter sibling is on a line of its own, and keeps every x check)
    return (
      r.width > 0 &&
      r.bottom > textRect.top + 0.5 &&
      r.top < textRect.bottom - 0.5 &&
      r.right <= textRect.left + 0.5
    );
  };

  /** Painted at all: shown, and not faded out to nothing (a cross-fade's outgoing words). */
  const seen = (el) =>
    el.checkVisibility
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : true;

  /**
   * Where a text node is laid: one box per line. A range's rect is the font's content area (ascent to descent), which
   * overhangs a line height tighter than the font's own — a 48 px figure on a 48 px line reaches 5 px past it either
   * way, onto nothing it touches. The line box is what the design places, so the overhang is taken off.
   */
  const lineBoxes = (node, el) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const line = parseFloat(globalThis.getComputedStyle(el).lineHeight); // NaN for `normal`: no overhang to take off
    return Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => {
        const over = Number.isFinite(line) && r.height > line ? (r.height - line) / 2 : 0;
        return { left: r.left, right: r.right, top: r.top + over, bottom: r.bottom - over };
      });
  };

  /** Two boxes share more than the tolerance both ways. */
  const overlaps = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > overlapTol &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > overlapTol;

  /** Whether `ancestor` holds `node`, across shadow roots (a control's own words live in its shadow). */
  const holds = (ancestor, node) => {
    for (let n = node; n; n = up(n)) if (n === ancestor) return true;
    return false;
  };

  /**
   * A piece placed out of the flow — absolute or fixed itself, or inside such a piece before the padded box that would
   * hold it (a knob, a bubble, a label laid over a track, a menu): containment's own exemption, shared by `overlap`.
   */
  const placedOut = (el, frame) => {
    for (let node = el; node && node !== frame; node = up(node)) {
      const ncs = globalThis.getComputedStyle(node);
      if (ncs.position === 'absolute' || ncs.position === 'fixed') return true;
      if (
        node !== el &&
        (parseFloat(ncs.paddingLeft) > 0 ||
          parseFloat(ncs.paddingRight) > 0 ||
          parseFloat(ncs.paddingBottom) > 0)
      )
        return false;
    }
    return false;
  };

  /**
   * The surface a box is drawn on: the nearest one laid over the page (fixed, or in the top layer: an open popover or
   * dialog — a menu, a sheet), or the page itself (null). Words and controls on different surfaces do not overlap: the
   * upper one covers the lower by design.
   */
  const surfaceOf = (el, frame) => {
    for (let node = el; node && node !== frame; node = up(node)) {
      if (globalThis.getComputedStyle(node).position === 'fixed') return node;
      if (node.matches?.(':popover-open, dialog[open]')) return node;
    }
    return null;
  };

  /** SVG's drawing elements: what a drawn control paints, piece by piece. */
  const SHAPES = new Set([
    'line',
    'path',
    'rect',
    'circle',
    'ellipse',
    'polygon',
    'polyline',
    'text',
  ]);

  /**
   * What a control paints, where a word could hide under it: its own box when it paints (a stepper's pill, a switch's
   * track), else the bounds of its painted parts — a ruler's 44 box keeps air over its ticks and knob, and a word in
   * that air is not under anything.
   */
  const drawnBox = (el) => {
    if (el.tagName.toLowerCase() !== 'svg' && paints(el, globalThis.getComputedStyle(el)))
      return el.getBoundingClientRect();
    const parts = [];
    const walk = (node) => {
      for (const child of node.shadowRoot ? node.shadowRoot.children : node.children) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'style') continue;
        const ccs = globalThis.getComputedStyle(child);
        // a part faded out (a value bubble at rest) paints nothing
        if (ccs.display === 'none' || !seen(child)) continue;
        if (SHAPES.has(tag)) parts.push(child.getBoundingClientRect());
        else if (tag !== 'svg' && tag !== 'defs' && paints(child, ccs))
          parts.push(child.getBoundingClientRect());
        else walk(child);
      }
    };
    walk(el);
    if (!parts.length) return null;
    return {
      left: Math.min(...parts.map((b) => b.left)),
      right: Math.max(...parts.map((b) => b.right)),
      top: Math.min(...parts.map((b) => b.top)),
      bottom: Math.max(...parts.map((b) => b.bottom)),
    };
  };

  /** A box's padding box: where its `overflow` clips. */
  const paddingBox = (el) => {
    const b = el.getBoundingClientRect();
    const ecs = globalThis.getComputedStyle(el);
    return {
      left: b.left + parseFloat(ecs.borderLeftWidth),
      right: b.right - parseFloat(ecs.borderRightWidth),
      top: b.top + parseFloat(ecs.borderTopWidth),
      bottom: b.bottom - parseFloat(ecs.borderBottomWidth),
    };
  };

  /** A box's content width: what its content has between its padding. */
  const contentWidth = (el) => {
    const ecs = globalThis.getComputedStyle(el);
    const box = paddingBox(el);
    return box.right - box.left - parseFloat(ecs.paddingLeft) - parseFloat(ecs.paddingRight);
  };

  /** The width a box's content takes laid out whole: a clipped name still measures its every letter. */
  const contentTaken = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
  };

  const clips = (ecs) => /hidden|clip/.test(ecs.overflowX) || /hidden|clip/.test(ecs.overflowY);

  /** What of a run's boxes is painted: each box cut to every box that clips or scrolls it (an ellipsis's own box). */
  const shownBoxes = (boxes, el, frame) => {
    let shown = boxes;
    for (let node = el; node && node !== frame && shown.length; node = up(node)) {
      const ncs = globalThis.getComputedStyle(node);
      if (ncs.display === 'contents' || ncs.display === 'inline') continue;
      const cutX = ncs.overflowX !== 'visible';
      const cutY = ncs.overflowY !== 'visible';
      if (!cutX && !cutY) continue;
      const box = paddingBox(node);
      shown = shown
        .map((b) => ({
          left: cutX ? Math.max(b.left, box.left) : b.left,
          right: cutX ? Math.min(b.right, box.right) : b.right,
          top: cutY ? Math.max(b.top, box.top) : b.top,
          bottom: cutY ? Math.min(b.bottom, box.bottom) : b.bottom,
        }))
        .filter((b) => b.right - b.left > overlapTol && b.bottom - b.top > overlapTol);
    }
    return shown;
  };

  /** Where value rows, readouts and tile feet keep their words: no two of them may be laid over each other. */
  const WORDS = '.fv-value-row, .fv-readout, .fv-tile__foot';
  /** What a finger presses: what a card head's overlay has to keep clear of. */
  const PRESSABLE =
    '[data-target], [data-control], button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="slider"], [role="checkbox"]';
  const keyLike = new RegExp(rawKey);
  const namespaceSet = new Set(namespaces);
  // the house's own entity ids are names, not keys (the playground's mock is on the page; a design sheet has none)
  const house = globalThis.fluvyMock?.hass?.();
  const entityIds = new Set(Object.keys(house?.states ?? {}));
  /**
   * What the house names: its entities, devices, areas, floors and people, and what a player or a calendar says it
   * plays or where (an artist, a source, a place); and what a card's config names. A card shows them as they are, so
   * one cut inside such a name is a name ending in its ellipsis, whether the card declared it or not.
   */
  const NAMING = [
    'friendly_name',
    'media_title',
    'media_artist',
    'media_album_name',
    'media_series_title',
    'media_channel',
    'app_name',
    'source',
    'message',
    'location',
  ];
  // and what a card's config names, as typed (`name`, `title`), on the sheet the page shows (every one without)
  const sheet = new URLSearchParams(globalThis.location.search).get('sheet');
  const typed = [];
  const typedIn = (value) => {
    if (Array.isArray(value)) value.forEach(typedIn);
    else if (value && typeof value === 'object')
      for (const [key, inner] of Object.entries(value))
        if ((key === 'name' || key === 'title') && typeof inner === 'string') typed.push(inner);
        else typedIn(inner);
  };
  for (const [name, spec] of Object.entries(globalThis.fluvySheets ?? {}))
    if (!sheet || name === sheet) for (const frame of spec.frames ?? []) typedIn(frame.cards);
  const houseNames = [
    ...typed,
    ...Object.values(house?.states ?? {}).flatMap((s) => NAMING.map((key) => s.attributes?.[key])),
    ...Object.values(house?.entities ?? {}).map((e) => e.name),
    ...Object.values(house?.devices ?? {}).flatMap((d) => [d.name_by_user, d.name]),
    ...Object.values(house?.areas ?? {}).map((a) => a.name),
    ...Object.values(house?.floors ?? {}).map((f) => f.name),
  ].filter(
    (name, i, all) => typeof name === 'string' && name.trim().length > 1 && all.indexOf(name) === i,
  );
  /** Whether the character at `at` lies inside one of the house's names written in `text`. */
  const inHouseName = (text, at) =>
    houseNames.some((name) => {
      for (let from = text.indexOf(name); from >= 0; from = text.indexOf(name, from + 1))
        if (from <= at && at < from + name.length) return true;
      return false;
    });

  /**
   * A head's tap target (`.fv-card__tap`): the box its stretched overlay covers — the overlay's containing block (the
   * head row) inset as the `::after` says — or the button itself when it has no overlay.
   */
  const tapArea = (tap, frame) => {
    const after = globalThis.getComputedStyle(tap, '::after');
    if (after.position !== 'absolute') return tap.getBoundingClientRect();
    let block = tap;
    while (block && block !== frame && globalThis.getComputedStyle(block).position === 'static')
      block = up(block);
    const box = paddingBox(block && block !== frame ? block : tap);
    const inset = (value, size) =>
      value.endsWith('%') ? (parseFloat(value) / 100) * size : parseFloat(value) || 0;
    const w = box.right - box.left;
    const h = box.bottom - box.top;
    return {
      left: box.left + inset(after.left, w),
      right: box.right - inset(after.right, w),
      top: box.top + inset(after.top, h),
      bottom: box.bottom - inset(after.bottom, h),
    };
  };

  /**
   * Whether `area` keeps a free square of `side` clear of `blocks`. A square that fits can slide left and up until it
   * meets the area's edge or a block's right or bottom side, so those edges are the only places to try.
   */
  const keepsSquare = (area, blocks, side) => {
    const xs = [area.left, ...blocks.map((b) => b.right)];
    const ys = [area.top, ...blocks.map((b) => b.bottom)];
    return xs.some((x) =>
      ys.some(
        (y) =>
          x + side <= area.right + tol &&
          y + side <= area.bottom + tol &&
          blocks.every(
            (b) =>
              !(
                x < b.right - tol &&
                x + side > b.left + tol &&
                y < b.bottom - tol &&
                y + side > b.top + tol
              ),
          ),
      ),
    );
  };

  /**
   * Whether a box holds a name (the one text an ellipsis may end): it says so (`data-name`, or a class that says
   * `name`: `'declared'`), or it carries its words whole in a `title`, as a name read on hover does (`'title'`). A
   * title excuses a name's words only: a figure it cuts is still `cut-figure`, and a state or a status line (a class
   * that says `sub`, `line`, `state` or `status`: what a thing is doing, "Préchauffage 7…") is never a name, whatever
   * its tooltip says.
   */
  const cls = (node) => (typeof node.className === 'string' ? node.className : '');
  const STATUS_WORD = /^(?:sub|line|state|status)$/i;
  const statusLine = (node) =>
    cls(node)
      .split(/[\s_-]+/)
      .some((word) => STATUS_WORD.test(word));
  const namedBox = (el, frame) => {
    const words = (el.textContent || '').replace(/\s+/g, ' ').trim();
    for (let node = el; node && node !== frame; node = up(node)) {
      if (node.hasAttribute?.('data-name') || /name/i.test(cls(node))) return 'declared';
      if (statusLine(node)) return false;
      if (words && (node.getAttribute?.('title') || '').replace(/\s+/g, ' ').includes(words))
        return 'title';
      if (node.tagName === 'BUTTON' || node.getAttribute?.('role') === 'button') return false;
    }
    return false;
  };

  /** Whether a text's colour paints (a ruler's transparent copy draws nothing). */
  const inked = (el) => alphaOf(globalThis.getComputedStyle(el).color) > 0;

  /** Whether a box is a control or sits inside one, across shadow roots: what `overlap` reads, not `collision`. */
  const inControl = (el, frame) => {
    for (let node = el; node && node !== frame; node = up(node))
      if (node.hasAttribute?.('data-control')) return true;
    return false;
  };

  /** Where one character is laid: its first box that takes room (a collapsed space has none: null). */
  const charRange = document.createRange();
  const charBox = (node, i) => {
    charRange.setStart(node, i);
    charRange.setEnd(node, i + 1);
    for (const rect of charRange.getClientRects()) if (rect.width > 0) return rect;
    return null;
  };

  /** Every character a box holds in its own tree, in order, with where it is laid. */
  const charsOf = (el) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      for (let i = 0; i < node.textContent.length; i += 1)
        out.push({ ch: node.textContent[i], rect: charBox(node, i) });
    return out;
  };

  /** How wide the box's font draws an ellipsis: what the cut leaves room for at the end of its line. */
  const ellipsisCanvas = document.createElement('canvas').getContext('2d');
  const ellipsisWidth = (ecs) => {
    ellipsisCanvas.font = `${ecs.fontStyle} ${ecs.fontWeight} ${ecs.fontSize} ${ecs.fontFamily}`;
    return ellipsisCanvas.measureText('\u2026').width;
  };

  /**
   * A figure is a token with a digit, a percentage or a degree in it ("60", "21,5°", "08:15", "36 %"), a unit after one
   * ("kWh", "km/h", "min") or a currency before one: what `cut-figure` holds whole.
   */
  const UNIT = new RegExp(
    [
      '^(?:[kMGmµu]?(?:Wh|W|VA|var|V|A|Hz|g|L|l|m|Pa|bar|s|J)', // power, energy, volume, length, pressure, time
      '°[CF]?|K|lx|lm|ppm|ppb|dBm?|mph|kn|inHg|psi|in|ft|mi|gal|min|h|d|m[²³]|ft[²³]',
      '[^\\s\\d]{1,3}/[^\\s\\d]{1,4}', // a rate: km/h, L/min, m³/h
      '[€$£¥₺])$',
    ].join('|'),
    'u',
  );
  const FIGURE = /[\p{Nd}%‰°]/u;
  const figureAt = (text, at) => {
    const tokens = [];
    for (const match of text.matchAll(/\S+/gu))
      tokens.push({ start: match.index, end: match.index + match[0].length, word: match[0] });
    const index = tokens.findIndex((token) => at < token.end);
    if (index < 0) return false;
    const { word } = tokens[index];
    if (FIGURE.test(word)) return true;
    if (UNIT.test(word) && index > 0 && FIGURE.test(tokens[index - 1].word)) return true;
    return (
      /^[€$£¥₺]$/u.test(word) && index + 1 < tokens.length && FIGURE.test(tokens[index + 1].word)
    );
  };

  /**
   * What an ellipsis (or a line clamp's) cuts of a box's text: the words seen, and whether the cut falls on a figure —
   * the first character it hides, or the token that character belongs to. Null when the box cuts nothing: a box whose
   * text fits, or whose overflow is not text.
   */
  const cutOf = (el, ecs) => {
    if (!/hidden|clip/.test(ecs.overflowX) && !/hidden|clip/.test(ecs.overflowY)) return null;
    const clamp = ecs.getPropertyValue('-webkit-line-clamp');
    const clamped = clamp && clamp !== 'none' && el.scrollHeight > el.clientHeight + 1;
    const ellipsis =
      ecs.textOverflow === 'ellipsis' &&
      /hidden|clip/.test(ecs.overflowX) &&
      el.scrollWidth > el.clientWidth + 1;
    if (!clamped && !ellipsis) return null;
    const box = paddingBox(el);
    const right = box.right - parseFloat(ecs.paddingRight);
    const bottom = box.bottom - parseFloat(ecs.paddingBottom);
    // a flex or grid box draws no ellipsis: it clips its text silently, at its edge
    const mark = /flex|grid/.test(ecs.display) ? 0 : ellipsisWidth(ecs);
    const chars = charsOf(el);
    const laid = chars.filter((c) => c.rect && c.rect.bottom <= bottom + overlapTol);
    const lastTop = laid.length ? Math.max(...laid.map((c) => c.rect.top)) : -Infinity;
    const hidden = (c) =>
      c.rect !== null &&
      (c.rect.bottom > bottom + overlapTol ||
        (c.rect.top >= lastTop - overlapTol && c.rect.right > right - mark + overlapTol));
    const at = chars.findIndex((c) => hidden(c) && c.ch.trim());
    if (at < 0) return null;
    const text = chars.map((c) => c.ch).join('');
    return {
      seen: text.slice(0, at).replace(/\s+/g, ' ').trim(),
      text: text.replace(/\s+/g, ' ').trim(),
      name: inHouseName(text, at),
      figure: figureAt(text, at),
      silent: mark === 0,
      // prose is clamped at three lines (§ Readouts and text): a clamp that deep ends a sentence, not a word
      prose: clamped && !ellipsis && Number(clamp) >= 3,
    };
  };

  /** Words, for the mid-word rule: a line may end between two of them, never inside one. */
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const NO_BREAK = /[\u00a0\u2007\u202f\u2060]/u;

  /**
   * Where a run's lines end inside a word: each index whose character starts a new line while the one before it is in
   * the same word, or is a no-break space (a figure parted from its unit). Hyphenation the language does is no break.
   */
  const brokenWords = (run) => {
    const text = run.node.textContent;
    const ecs = globalThis.getComputedStyle(run.el);
    if (ecs.hyphens === 'auto') return [];
    const words = Array.from(segmenter.segment(text)).filter((s) => s.isWordLike);
    const inside = (i) => words.some((w) => w.index < i && i < w.index + w.segment.length);
    const shown = (rect) =>
      run.shown.some(
        (b) =>
          rect.left + rect.width / 2 >= b.left &&
          rect.left + rect.width / 2 <= b.right &&
          rect.top + rect.height / 2 >= b.top &&
          rect.top + rect.height / 2 <= b.bottom,
      );
    const breaks = [];
    let last = null;
    for (let i = 0; i < text.length; i += 1) {
      const rect = charBox(run.node, i);
      if (!rect) continue;
      if (last && rect.top > last.top + last.height / 2 && shown(rect) && shown(last)) {
        const before = text[i - 1];
        if (before !== '\u00ad' && (inside(i) || NO_BREAK.test(before) || NO_BREAK.test(text[i])))
          breaks.push(i);
      }
      last = rect;
    }
    return breaks;
  };

  return frames.map((frame, index) => {
    const origin = frame.getBoundingClientRect();
    const violations = [];
    const columns = new Map(); // card element → left edges of its text runs
    const baselines = new Map(); // data-baseline value → [{ path, y }]
    const runs = []; // every text node shown: { node, el, boxes, shown, out, surface, words, card, sideways }
    const pressed = []; // every [data-control] shown: { el, box (what it paints), out, surface }

    const add = (rule, el, rect, detail) => {
      violations.push({
        rule,
        card: hostOf(el, frame),
        selector: shortPath(el, frame),
        rect,
        detail,
      });
    };
    const relative = (rect) => ({
      x: r3(rect.left - origin.left),
      y: r3(rect.top - origin.top),
      w: r3(rect.width ?? rect.right - rect.left),
      h: r3(rect.height ?? rect.bottom - rect.top),
    });
    const quote = (node) => `"${node.textContent.trim().slice(0, 40)}"`;

    const queue = kids(frame);
    while (queue.length) {
      const el = queue.shift();
      if (el.getAttribute('data-measure') === 'skip') continue;
      // read out, not shown: the language's 1×1 clipped box for a screen reader is not a layout box at all
      if (el.classList?.contains('fv-sr')) continue;
      // A drawing: its boxes come from data (a curve's samples, a stretch's minutes), so no grid and no whole
      // pixel can be asked of them — everything else still is. The subtree stays measured; only those two rules
      // step aside, because a subtree told to `skip` is a blind spot, and blind spots hide defects.
      const drawn = el.closest?.('[data-measure="drawn"]') !== null;
      const cs = globalThis.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // An <svg> is one painted box; its internal geometry is not on the CSS grid.
      if (el.tagName.toLowerCase() !== 'svg') queue.push(...kids(el));

      const box = el.getBoundingClientRect();
      const rect = relative(box);
      const sized = box.width > 0 || box.height > 0;
      const isValue = continuous(el, frame);
      const away = alignedAway(el, cs, frame) || (sized && continuesLine(el, box));

      if (sized && paints(el, cs) && !isValue && !drawn && !inOffGridColumn(el, frame)) {
        // A box the container sizes (a card filling its dashboard column, an svg filling its control)
        // cannot choose a multiple of the grid: the column decides. Its own padding and children still must.
        const stretched = (() => {
          const parent = up(el);
          if (!parent || parent === frame) return false;
          const pb = parent.getBoundingClientRect();
          const pcs = globalThis.getComputedStyle(parent);
          const inner = pb.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
          return Math.abs(box.width - inner) < 0.5;
        })();
        // A cell of a row that fills its column (option tiles, chip rows that fill, a tab row that fits, any row marked
        // `data-fill-row`: a pair of equal buttons) is sized by the
        // row: the column's width divided among the cells decides its width and, from the second cell on, its x.
        // Everything inside such a cell inherits its x; the cell (and a chip's pill, which fills its chip) its width.
        const cell =
          el.closest?.(
            '.fv-options > *, .fv-chips--fill > *, .fv-chips.fills > *, .fv-tiles > *, [data-fill-row] > *',
          ) ?? null;
        const sharedX = cell !== null;
        const sharedW = cell === el || (cell !== null && el.classList.contains('fv-chip__pill'));
        // a declared row is checked as a row below (equal cells that span it), and its cells still land on whole pixels
        const declared = cell !== null && up(cell)?.hasAttribute?.('data-fill-row');
        // Centred content takes its parent's place on the grid: the parent is what aligns (and is measured), the child
        // sits (parent − child) / 2 inside it by construction — a 20 glyph in the heading's 24 box or in a 56 circle, a
        // row's circle and control centred on a row that grew by a wrapped line (the language keeps them centred there).
        const centredIn = (() => {
          const parent = up(el);
          if (!parent || parent === frame) return { x: false, y: false };
          const pb = parent.getBoundingClientRect();
          return {
            x: Math.abs(pb.x + pb.width / 2 - (box.x + box.width / 2)) < 0.5,
            y: Math.abs(pb.y + pb.height / 2 - (box.y + box.height / 2)) < 0.5,
          };
        })();
        const off = keys.filter(
          (key) =>
            !(key === 'x' && (away || sharedX || centredIn.x)) &&
            !(key === 'y' && centredIn.y) &&
            !(key === 'w' && (stretched || sharedW)) &&
            offGrid(rect[key]),
        );
        const detail = off.map((key) => `${key}=${rect[key]}`).join(' ');
        if (off.length) add('grid', el, rect, `${detail} ∉ ${grid}`);

        const fractional = [];
        for (const dpr of dprs) {
          for (const key of keys) {
            // a declared row's cell always has its own x checked
            if (key === 'x' && !(declared && cell === el) && (away || (sharedX && !declared)))
              continue;
            if (key === 'w' && sharedW && !declared) continue;
            const device = rect[key] * dpr;
            const whole = Math.abs(device - Math.round(device)) <= tol;
            if (!whole) fractional.push(`${key}×${dpr}=${r3(device)}`);
          }
        }
        if (fractional.length) add('half-pixel', el, rect, fractional.join(' '));
      }

      // a vertical control (ruler) is measured by its width instead of its height
      if (
        el.hasAttribute('data-control') &&
        !controls.some((h) => near(rect.h, h) || near(rect.w, h))
      ) {
        add('control-height', el, rect, `height ${rect.h} ∉ {${controls.join(', ')}}`);
      }
      if (el.hasAttribute('data-icon')) {
        const square = Math.abs(rect.w - rect.h) <= tol;
        if (!square || !icons.some((size) => near(rect.w, size))) {
          add('icon-box', el, rect, `${rect.w}×${rect.h} ∉ square {${icons.join(', ')}}`);
        }
      }
      if (el.hasAttribute('data-target') && (rect.w < touchMin - tol || rect.h < touchMin - tol)) {
        add('touch-target', el, rect, `${rect.w}×${rect.h} < ${touchMin}`);
      }
      if (el.hasAttribute('data-baseline')) {
        const y = baselineOf(el, cs);
        if (y !== null) {
          const key = el.getAttribute('data-baseline');
          if (!baselines.has(key)) baselines.set(key, []);
          baselines.get(key).push({ el, rect, y: r3(y - origin.top) });
        }
      }

      const sideways = scrolledAway(el, frame) || scrolledWithin(el, frame);

      // a declared fill row: its cells are equal and span its content box
      if (el.hasAttribute('data-fill-row')) {
        const cells = [...el.children].filter((c) => c.getBoundingClientRect().width > 0);
        if (cells.length) {
          const rects = cells.map((c) => c.getBoundingClientRect());
          const widths = rects.map((r) => r.width);
          const ecs = globalThis.getComputedStyle(el);
          const inner =
            el.getBoundingClientRect().width -
            parseFloat(ecs.paddingLeft) -
            parseFloat(ecs.paddingRight);
          const span =
            Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
          if (Math.max(...widths) - Math.min(...widths) > 0.01)
            add('fill-row', el, rect, `cells ${widths.map(r3).join(' / ')} are not equal`);
          // whole-pixel cells may leave what the division does not share as a tail at the end: less than a pixel
          // per cell on the row, never past its content box
          const perRow = rects.filter((r) => Math.abs(r.top - rects[0].top) < 0.5).length;
          if (span > inner + 0.5 || inner - span >= Math.max(1, perRow))
            add('fill-row', el, rect, `cells span ${r3(span)} of ${r3(inner)}`);
          // one rhythm between the cells of a line
          const gaps = [];
          for (let i = 1; i < rects.length; i += 1)
            if (Math.abs(rects[i].top - rects[i - 1].top) < 0.5)
              gaps.push(r3(rects[i].left - rects[i - 1].right));
          if (gaps.length && Math.max(...gaps) - Math.min(...gaps) > 0.01)
            add('fill-row', el, rect, `gaps ${gaps.join(' / ')} are not equal`);
        }
      }

      // a row that scrolls sideways keeps its selected item in full view (clear of the fades at a side that goes on)
      if (scrollRow(el)) {
        const selected = el.querySelector(':scope > [aria-selected="true"], :scope > .is-active');
        if (selected) {
          const row = el.getBoundingClientRect();
          const item = selected.getBoundingClientRect();
          const fadeLeft = el.scrollLeft > 1 ? 24 : 0;
          const fadeRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1 ? 24 : 0;
          if (item.left < row.left + fadeLeft - 0.5 || item.right > row.right - fadeRight + 0.5)
            add(
              'scroll-selected',
              selected,
              relative(item),
              `selected ${r3(item.left - row.left)}–${r3(item.right - row.left)} of a ${r3(row.width)} row`,
            );
        }
      }
      // an unpainted in-flow box (a text block, a titles column) must stay inside its direct parent's border box
      if (
        sized &&
        !sideways &&
        !paints(el, cs) &&
        !isValue &&
        cs.position !== 'absolute' &&
        layoutParent(el) &&
        layoutParent(el) !== frame &&
        parseFloat(cs.marginLeft) >= 0 &&
        parseFloat(cs.marginRight) >= 0
      ) {
        const parent = layoutParent(el);
        const pcs = globalThis.getComputedStyle(parent);
        if (pcs.position !== 'absolute' && pcs.display !== 'inline') {
          const pb = parent.getBoundingClientRect();
          const out = [];
          if (box.bottom > pb.bottom + 0.5) out.push(`bottom +${r3(box.bottom - pb.bottom)}`);
          if (box.right > pb.right + 0.5) out.push(`right +${r3(box.right - pb.right)}`);
          if (out.length)
            add(
              'containment',
              el,
              rect,
              `${out.join(', ')} past its parent ${shortPath(parent, frame)}`,
            );
        }
      }

      // the frame is the outermost box: nothing (painted or not) may lie outside it
      if (sized && !sideways && cs.position !== 'absolute') {
        const fb = frame.getBoundingClientRect();
        const out = [];
        if (box.right > fb.right + 0.5) out.push(`right +${r3(box.right - fb.right)}`);
        if (box.bottom > fb.bottom + 0.5) out.push(`bottom +${r3(box.bottom - fb.bottom)}`);
        if (box.left < fb.left - 0.5) out.push(`left ${r3(box.left - fb.left)}`);
        if (out.length) add('frame-overflow', el, rect, `${out.join(', ')} past the frame`);
      }
      // a shell part declares the height it was designed at; a squeezed flex item yields on-grid numbers otherwise
      if (
        el.hasAttribute('data-expect-h') &&
        Math.abs(rect.h - Number(el.getAttribute('data-expect-h'))) > tol
      ) {
        add(
          'declared-height',
          el,
          rect,
          `height ${rect.h} ≠ declared ${el.getAttribute('data-expect-h')}`,
        );
      }

      // pills: a content-sized badge or chip is its text plus 28 (14 px sides) or, on tab rows, plus 32 (a chip in a row
      // that fills is sized by the row); any other pill declares its sides (`data-pill`: the timeline's state, 16)
      if (
        el.classList.contains('fv-badge') ||
        el.hasAttribute('data-pill') ||
        (el.classList.contains('fv-chip') && !el.closest('.fv-chips--fill, .fv-chips.fills'))
      ) {
        const range = document.createRange();
        // the text itself: a chip's pill, a declared pill's text box (its last child), else the pill
        range.selectNodeContents(
          el.classList.contains('fv-chip')
            ? el.querySelector('.fv-chip__pill') || el
            : el.hasAttribute('data-pill')
              ? el.lastElementChild || el
              : el,
        );
        const textW = range.getBoundingClientRect().width;
        const pad = r3(box.width - textW);
        const expected = el.hasAttribute('data-pill')
          ? Number(el.getAttribute('data-pill'))
          : el.hasAttribute('data-fit')
            ? Number(el.getAttribute('data-fit'))
            : 28; // 28 = 14 px sides; tab rows declare 32
        // the pill lands on the 4 grid: its sides carry the remainder, under 4 (a text 72.23 wide gets 31.77)
        if (pad < expected - 0.5 || pad > expected + 3.99)
          add(
            'pill-sides',
            el,
            rect,
            `width ${r3(box.width)} − text ${r3(textW)} = ${pad} ∉ [${expected}, ${expected + 3}]`,
          );
      }

      // containment: a painted, in-flow box must stay inside the padding box of its nearest padded ancestor
      // (optical negative margins and absolutely positioned pieces — bubbles, knobs, labels — are exempt, and so
      // is a surface fixed over the page: a menu is placed against the viewport, and holds its own rows)
      if (
        sized &&
        paints(el, cs) &&
        !isValue &&
        cs.position !== 'absolute' &&
        cs.position !== 'fixed' &&
        parseFloat(cs.marginLeft) >= 0 &&
        parseFloat(cs.marginRight) >= 0
      ) {
        let host = up(el);
        let inFlow = true;
        while (host && host !== frame) {
          const hcs = globalThis.getComputedStyle(host);
          if (hcs.position === 'absolute') {
            inFlow = false;
            break;
          }
          if (
            parseFloat(hcs.paddingLeft) > 0 ||
            parseFloat(hcs.paddingRight) > 0 ||
            parseFloat(hcs.paddingBottom) > 0
          )
            break;
          host = up(host);
        }
        if (inFlow && !sideways && host && host !== frame) {
          const hcs = globalThis.getComputedStyle(host);
          const hb = host.getBoundingClientRect();
          const inner = {
            left: hb.left + parseFloat(hcs.paddingLeft),
            right: hb.right - parseFloat(hcs.paddingRight),
            bottom: hb.bottom - parseFloat(hcs.paddingBottom),
          };
          const out = [];
          if (box.left < inner.left - 0.5) out.push(`left ${r3(box.left - inner.left)}`);
          if (box.right > inner.right + 0.5) out.push(`right +${r3(box.right - inner.right)}`);
          if (parseFloat(hcs.paddingBottom) > 0 && box.bottom > inner.bottom + 0.5)
            out.push(`bottom +${r3(box.bottom - inner.bottom)}`);
          if (out.length)
            add(
              'containment',
              el,
              rect,
              `${out.join(', ')} past ${shortPath(host, frame)} padding box`,
            );
        }
      }

      // Text must stay inside its box. A name that declares `text-overflow: ellipsis` is allowed to end in
      // one — that is the design's answer for a long device name. A VALUE has no ellipsis, so a clipped
      // value is still a defect, and so is any text that escapes its card.
      if (
        cs.overflow !== 'visible' &&
        cs.textOverflow !== 'ellipsis' &&
        !scrollRow(el) &&
        el.scrollWidth > el.clientWidth + 1
      ) {
        add(
          'text-clipped',
          el,
          rect,
          `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
        );
      }
      // Text cut with an ellipsis or a line clamp: a name's answer to a narrow column, nothing else's. A figure cut
      // anywhere is `cut-figure`; a word in a control, a heading, a title, a date or a state `ellipsis`; any other
      // word that is no name (a sub, a caption, a label) `cut-word`. A name read on hover (its title) may lose its
      // words to an ellipsis, never a figure
      const named = namedBox(el, frame);
      if (!scrollRow(el) && seen(el) && named !== 'declared') {
        const inButton = !!el.closest?.('button, .fv-btn, .fv-chip, .fv-badge, h1, h2, h3');
        const meaning = /state|title|date|label|value|count/i.test(cls(el));
        const cut = cutOf(el, cs);
        if (cut) {
          const seenText = cut.seen.slice(-40);
          if (!cut.name && (cut.figure || (!named && !cut.prose)))
            add(
              cut.figure ? 'cut-figure' : inButton || meaning ? 'ellipsis' : 'cut-word',
              el,
              rect,
              `"${cut.text.slice(0, 60)}" ${cut.silent ? `clipped after "${seenText}"` : `reads "${seenText}…"`}`,
            );
        } else if (
          !named &&
          (inButton || meaning) &&
          cs.textOverflow === 'ellipsis' &&
          cs.overflow !== 'visible' &&
          el.scrollWidth > el.clientWidth + 1
        )
          add(
            'ellipsis',
            el,
            rect,
            `"${(el.textContent || '').trim().slice(0, 40)}" cut: ${el.scrollWidth} > ${el.clientWidth}`,
          );
      }
      // a time rail: nothing painted within the knob's halo (the knob hides what it would cover, whole)
      if (el.tagName.toLowerCase() === 'fluvy-time-rail' && el.shadowRoot) {
        const knob = el.shadowRoot.querySelector('.fv-knob');
        if (knob) {
          const k = knob.getBoundingClientRect();
          const cx = k.left + k.width / 2;
          const cy = k.top + k.height / 2;
          // the ring, its 4 px halo, half a stroke
          const halo = k.width / 2 + 5;
          for (const mark of el.shadowRoot.querySelectorAll('.tick, .bar, .label')) {
            if (Number(globalThis.getComputedStyle(mark).opacity) < 0.01) continue;
            const b = mark.getBoundingClientRect();
            // a stretch with nothing in it is a bar scaled to nothing: it paints nothing
            if ((!b.width && !b.height) || (mark.classList.contains('bar') && b.width < 0.5))
              continue;
            // a bar is scaled to its count: its painted box is what getBoundingClientRect reports
            const pad = mark.classList.contains('tick') ? 1 : 0;
            const dx = Math.max(b.left - cx, 0, cx - b.right);
            const dy = Math.max(b.top - pad - cy, 0, cy - b.bottom - pad);
            if (dx * dx + dy * dy < halo * halo - 0.5)
              add(
                'rail-bite',
                mark,
                relative(b),
                `${mark.getAttribute('class')} ${r3(Math.sqrt(dx * dx + dy * dy))} px from the knob's centre (< ${halo})`,
              );
          }
        }
      }
      // A clipping box cannot let its text escape: the Range still measures the whole string, so only
      // text that is actually painted outside (no clipping) is a defect. The box itself is checked by containment.
      const textRect = cs.overflow === 'visible' ? firstTextRect(el) : null;
      if (textRect && !sideways) {
        const host = cardOf(el, frame) || frame;
        const hostRect = host.getBoundingClientRect();
        if (
          textRect.right > hostRect.right + 0.5 ||
          textRect.left < hostRect.left - 0.5 ||
          textRect.bottom > hostRect.bottom + 0.5
        ) {
          add('text-overflow', el, relative(textRect), `text leaves its card box`);
        }
        const left = r3(textRect.left - origin.left);
        const textBox = {
          x: left,
          y: r3(textRect.top - origin.top),
          w: r3(textRect.width),
          h: r3(textRect.height),
        };
        // text centred (or right-aligned) in its own box has no left edge of its own
        // (a fitted pill centres its text by construction: fitPills pads it evenly, on whole pixels)
        const textAway =
          away || /^(center|right|end)$/.test(cs.textAlign) || !!el.closest?.('[data-fit]');
        const owns = !isValue && !textAway && !continuesLine(el, textRect);
        if (owns && offGrid(left)) add('text-left', el, textBox, `left=${left} ∉ ${grid}`);
        const card = cardOf(el, frame);
        if (card && owns) {
          if (!columns.has(card)) columns.set(card, []);
          columns.get(card).push(left);
        }
      }

      // the words this box holds itself, where they are laid: what overlap, clipped and raw-key read
      if (seen(el)) {
        for (const node of el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes) {
          if (node.nodeType !== 3 || !node.textContent.trim()) continue;
          const boxes = lineBoxes(node, el);
          if (!boxes.length) continue;
          runs.push({
            node,
            el,
            boxes,
            shown: shownBoxes(boxes, el, frame),
            out: placedOut(el, frame),
            surface: surfaceOf(el, frame),
            words: !!el.closest?.(WORDS),
            card: cardOf(el, frame),
            sideways,
            inked: inked(el),
            control: inControl(el, frame),
          });
        }
        const painted = sized && el.hasAttribute('data-control') ? drawnBox(el) : null;
        if (painted)
          pressed.push({
            el,
            box: painted,
            out: placedOut(el, frame),
            surface: surfaceOf(el, frame),
          });
      }

      // a content-sized pill holds its content: what clips inside it (a chip's name) or, with nothing clipping, the pill
      if (sized && el.hasAttribute('data-fit') && seen(el)) {
        const inner = Array.from(el.querySelectorAll('*')).filter(
          (node) =>
            clips(globalThis.getComputedStyle(node)) && node.getBoundingClientRect().width > 0,
        );
        for (const piece of inner.length ? inner : [el]) {
          const room = contentWidth(piece);
          const taken = contentTaken(piece);
          if (taken > room + overlapTol)
            add(
              'pill-cut',
              piece,
              relative(piece.getBoundingClientRect()),
              `${quote(piece)} takes ${r3(taken)} of ${r3(room)}`,
            );
        }
      }

      // a head's button: its overlay keeps a free 44 × 44 beside the controls raised over the head
      if (el.classList.contains('fv-card__tap') && seen(el)) {
        const area = tapArea(el, frame);
        const blocks = Array.from(el.getRootNode().querySelectorAll(PRESSABLE))
          .filter((node) => node !== el && !holds(el, node) && !holds(node, el) && seen(node))
          .map((node) => node.getBoundingClientRect())
          .map((b) => ({
            left: Math.max(b.left, area.left),
            right: Math.min(b.right, area.right),
            top: Math.max(b.top, area.top),
            bottom: Math.min(b.bottom, area.bottom),
          }))
          .filter((b) => b.right - b.left > tol && b.bottom - b.top > tol);
        if (!keepsSquare(area, blocks, touchMin))
          add(
            'head-target',
            el,
            relative(area),
            `no free ${touchMin} × ${touchMin} in a ${r3(area.right - area.left)} × ${r3(area.bottom - area.top)} head beside ${blocks.length} raised control(s)`,
          );
      }
    }

    // words laid over a control they are not inside, or over each other where values are read
    const laid = runs.filter((run) => !run.out && !run.sideways && run.shown.length);
    const raised = pressed.filter((control) => !control.out);
    for (const run of laid)
      for (const control of raised) {
        if (control.surface !== run.surface || holds(control.el, run.el)) continue;
        const hit = run.shown.find((b) => overlaps(b, control.box));
        if (hit)
          add(
            'overlap',
            run.el,
            relative(hit),
            `${quote(run.node)} under ${shortPath(control.el, frame)}`,
          );
      }
    const worded = laid.filter((run) => run.words);
    for (let i = 0; i < worded.length; i += 1)
      for (let j = i + 1; j < worded.length; j += 1) {
        const [a, b] = [worded[i], worded[j]];
        if (a.card !== b.card) continue;
        const hit = b.shown.find((box) => a.shown.some((other) => overlaps(box, other)));
        if (hit) add('overlap', b.el, relative(hit), `${quote(b.node)} over ${quote(a.node)}`);
      }

    // two runs laid over each other where no control is involved: what overlap does not read (a control's words, or
    // two in a value row, are its own)
    const free = runs.filter(
      (run) => !run.sideways && run.inked && !run.control && run.shown.length,
    );
    for (let i = 0; i < free.length; i += 1)
      for (let j = i + 1; j < free.length; j += 1) {
        const [a, b] = [free[i], free[j]];
        if (
          a.card !== b.card ||
          a.surface !== b.surface ||
          (a.words && b.words && !a.out && !b.out)
        )
          continue;
        const hit = b.shown.find((box) => a.shown.some((other) => overlaps(box, other)));
        if (hit) add('collision', b.el, relative(hit), `${quote(b.node)} over ${quote(a.node)}`);
      }

    // a word broken across two lines (a line that ends inside it), wherever it is drawn
    for (const run of runs) {
      if (run.sideways || !run.inked || run.boxes.length < 2) continue;
      const text = run.node.textContent;
      const breaks = brokenWords(run);
      if (breaks.length)
        add(
          'midword',
          run.el,
          relative(run.boxes[0]),
          `"${text.trim().slice(0, 60)}" broken at ${breaks
            .map((at) => `"${text.slice(Math.max(0, at - 8), at)}|${text.slice(at, at + 8)}"`)
            .join(', ')}`,
        );
    }

    // words that run past the box clipping them. An axis stops being checked past a box that scrolls it (what lies
    // beyond is scrolled, not cut) or ends it with an ellipsis or a line clamp (that says so: the ellipsis rule's); a
    // box's own width is text-clipped's, and a 1 × 1 box is read out, not shown. A line is cut across when a quarter of
    // it is past the box: a font's content area overhangs a box as tight as its letters (a timeline's 12 px block holds
    // a 12 px title whole) without cutting a letter
    for (const run of runs) {
      if (run.sideways) continue;
      let x = true;
      let y = true;
      for (let node = run.el; node && node !== frame && (x || y); node = up(node)) {
        const ncs = globalThis.getComputedStyle(node);
        // a box that has none (`contents`) or that overflow does not apply to (an inline box) clips nothing
        if (ncs.display === 'contents' || ncs.display === 'inline') continue;
        const box = paddingBox(node);
        if (box.right - box.left <= 1 || box.bottom - box.top <= 1) break;
        const ellipsis = ncs.textOverflow === 'ellipsis';
        const clamp = ncs.getPropertyValue('-webkit-line-clamp') !== 'none';
        const cutX = x && !ellipsis && node !== run.el && /hidden|clip/.test(ncs.overflowX);
        const cutY = y && !clamp && /hidden|clip/.test(ncs.overflowY);
        const past = run.boxes.find(
          (b) =>
            (cutX && (b.left < box.left - overlapTol || b.right > box.right + overlapTol)) ||
            (cutY &&
              Math.max(box.top - b.top, b.bottom - box.bottom) >
                Math.max(overlapTol, (b.bottom - b.top) / 4)),
        );
        if (past) {
          add(
            'clipped',
            run.el,
            relative(past),
            `${quote(run.node)} cut by ${node === run.el ? 'its own box' : shortPath(node, frame)}`,
          );
          break;
        }
        if (/auto|scroll/.test(ncs.overflowX) || ellipsis || node.hasAttribute('data-scroll-row'))
          x = false;
        if (/auto|scroll/.test(ncs.overflowY) || clamp) y = false;
      }
    }

    // a catalogue key on screen: a word that never arrived
    for (const run of runs) {
      const text = run.node.textContent.trim();
      if (
        keyLike.test(text) &&
        (namespaceSet.has(text.split('.')[0]) || text.includes('_')) &&
        !entityIds.has(text)
      )
        add('raw-key', run.el, relative(run.boxes[0]), `"${text}"`);
    }

    for (const [card, lefts] of columns) {
      const distinct = [];
      for (const left of lefts.sort((a, b) => a - b)) {
        if (!distinct.some((edge) => Math.abs(edge - left) <= columnTol)) distinct.push(left);
      }
      if (distinct.length > 4) {
        const detail = `${distinct.length} left edges: ${distinct.join(', ')}`;
        add('text-columns', card, relative(card.getBoundingClientRect()), detail);
      }
    }

    for (const [key, members] of baselines) {
      const [first, ...rest] = members;
      for (const member of rest) {
        if (Math.abs(member.y - first.y) <= baselineTol) continue;
        add('baseline', member.el, member.rect, `baseline ${member.y} vs ${first.y} · "${key}"`);
      }
    }

    const counts = {};
    for (const violation of violations) counts[violation.rule] = (counts[violation.rule] || 0) + 1;
    return {
      selector: frameSel,
      index,
      label: frame.getAttribute('data-frame') || frame.dataset.mode || String(index),
      rect: { w: r3(origin.width), h: r3(origin.height) },
      counts,
      violations,
    };
  });
}

// ------------------------------------------------------------------------ report

const markdown = (report) => {
  const totals = {};
  for (const frame of report.frames) {
    for (const [rule, count] of Object.entries(frame.counts)) {
      totals[rule] = (totals[rule] || 0) + count;
    }
  }
  const byRule = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const flat = report.frames.flatMap((frame) =>
    frame.violations.map((violation) => ({ ...violation, frame: frame.label })),
  );

  const lines = [
    '# Alignment report',
    '',
    `\`${report.page}\` · frames \`${report.frame}\` · grid ${report.grid}px`,
    `· width ${report.width} · DPR ${report.dpr.join('/')} · ${report.generated}`,
    '',
    `**${report.violations} violations** across ${report.frames.length} frames.`,
    '',
    '| rule | count |',
    '| ---- | ----: |',
    ...byRule.map(([rule, count]) => `| ${rule} | ${count} |`),
    '',
    '| frame | size | violations |',
    '| ----- | ---- | ---------: |',
    ...report.frames.map(
      (f) => `| ${f.index} ${f.label} | ${f.rect.w}×${f.rect.h} | ${f.violations.length} |`,
    ),
    '',
    `## First ${Math.min(MAX_LISTED, flat.length)} of ${flat.length}`,
    '',
  ];
  for (const item of flat.slice(0, MAX_LISTED)) {
    const { x, y, w, h } = item.rect;
    lines.push(`- **${item.rule}** [${item.frame}] \`${item.selector}\` (${x}, ${y}) ${w}×${h}`);
    lines.push(`  - ${item.detail}`);
  }
  return lines.join('\n') + '\n';
};

// --------------------------------------------------------------------------- run

const isHttp = /^https?:\/\//.test(args.page); // the playground (real cards) is served over http; the sheets are files
const pagePath = isHttp ? args.page : resolve(args.page);
const width = Number(args.width);
const grid = Number(args.grid);
const dprs = args.dpr.split(',').map((value) => Number(value.trim()));

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width, height: 1200 },
  deviceScaleFactor: 1, // measurements are CSS px; the DPR sweep is arithmetic
  reducedMotion: 'reduce',
});
const page = await context.newPage();

const url = isHttp ? new URL(pagePath) : new URL(pathToFileURL(pagePath));
if (args.palette) url.searchParams.set('palette', args.palette);
await page.goto(url.href, { waitUntil: 'load' });
// The lab sheets set this once the DOM is assembled; pages without it just carry on.
await page
  .waitForFunction(
    () =>
      document.documentElement.dataset.labReady === '1' ||
      document.documentElement.dataset.ready === '1',
    null,
    { timeout: 8000 },
  )
  .catch(() => {});
await page.evaluate(() => document.fonts.ready);
if (isHttp) await page.waitForTimeout(1500); // cards fit their pills after the font arrives, and once more at 1.2 s (the safety re-fit)

const frames = await page.evaluate(audit, {
  frameSel: args.frame,
  grid,
  dprs,
  tol: TOL,
  baselineTol: BASELINE_TOL,
  columnTol: TEXT_COLUMN_TOL,
  overlapTol: OVERLAP_TOL,
  controls: CONTROL_HEIGHTS,
  icons: ICON_SIZES,
  touchMin: TOUCH_MIN,
  rawKey: RAW_KEY,
  namespaces: NAMESPACES,
});

await browser.close();

if (frames.length === 0 && args.empty !== 'pass') {
  console.error(`No frame matched "${args.frame}" in ${pagePath}`);
  process.exit(1);
}

const report = {
  page: pagePath,
  frame: args.frame,
  palette: args.palette || null,
  width,
  grid,
  dpr: dprs,
  generated: new Date().toISOString().slice(0, 19) + 'Z',
  violations: frames.reduce((sum, frame) => sum + frame.violations.length, 0),
  frames,
};

const write = async (file, body) => {
  await mkdir(dirname(resolve(file)), { recursive: true });
  await writeFile(resolve(file), body);
};
if (args.out) await write(args.out, JSON.stringify(report, null, 2) + '\n');
const summary = markdown(report);
if (args.md) await write(args.md, summary);

console.log(summary.split('\n## First')[0]);
process.exit(report.violations > 0 ? 1 : 0);
