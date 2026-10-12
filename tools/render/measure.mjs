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
 * A box is placed by its parent (a flex or grid's justify, text-align for an inline-level box), never by its own
 * text-align; text centred in its own box, or in a fitted pill, has no left edge of its own.
 *
 * An ellipsis is a name's answer to a narrow column, nothing else's: text cut with one inside a button, a chip, a
 * badge, a heading, a title, a date or a state (`ellipsis`) is a defect, unless it is a name (a class that says
 * `name`, or `data-name`). A time rail's knob hides what it would cover, whole: a tick, bar or label still painted
 * within its halo (`rail-bite`) is a defect.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
});

const CONTROL_HEIGHTS = [28, 36, 44, 48, 56];
const ICON_SIZES = [40, 44, 48, 56, 64]; // 56 = the energy flow's house (the ribbons land on it), 64 = hero icon circle (weather, confirm sheets)
const TOUCH_MIN = 44;
const TOL = 0.02;
const BASELINE_TOL = 0.5;
const TEXT_COLUMN_TOL = 0.5; // left edges closer than this are the same column
const MAX_LISTED = 60;

/**
 * Runs inside the page. Everything it needs is defined here: `page.evaluate` ships the
 * function as source, so it closes over nothing from the module above.
 */
function audit(opts) {
  const { frameSel, grid, dprs, tol, baselineTol, columnTol, controls, icons, touchMin } = opts;

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

  /** Last four levels below the frame — enough to find the node, short enough to read. */
  const shortPath = (el, frame) => {
    const parts = [];
    for (let node = el; node && node !== frame && parts.length < 4; node = up(node)) {
      parts.unshift(node.tagName.toLowerCase() + firstClass(node));
    }
    return parts.join(' > ');
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

  return frames.map((frame, index) => {
    const origin = frame.getBoundingClientRect();
    const violations = [];
    const columns = new Map(); // card element → left edges of its text runs
    const baselines = new Map(); // data-baseline value → [{ path, y }]

    const add = (rule, el, rect, detail) => {
      violations.push({ rule, selector: shortPath(el, frame), rect, detail });
    };
    const relative = (rect) => ({
      x: r3(rect.left - origin.left),
      y: r3(rect.top - origin.top),
      w: r3(rect.width),
      h: r3(rect.height),
    });

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

      if (sized && paints(el, cs) && !isValue && !drawn) {
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
      // An ellipsis on what is not a name: a button's label, a title, a date, a state's word
      if (
        cs.textOverflow === 'ellipsis' &&
        cs.overflow !== 'visible' &&
        !scrollRow(el) &&
        el.scrollWidth > el.clientWidth + 1
      ) {
        const cls = (node) => (typeof node.className === 'string' ? node.className : '');
        const named = (() => {
          for (let node = el; node && node !== frame; node = up(node)) {
            if (node.hasAttribute?.('data-name') || /name/i.test(cls(node))) return true;
            if (node.tagName === 'BUTTON' || node.getAttribute?.('role') === 'button') return false;
          }
          return false;
        })();
        const inControl = !!el.closest?.('button, .fv-btn, .fv-chip, .fv-badge, h1, h2, h3');
        const meaning = /state|title|date|label|value|count/i.test(cls(el));
        if (!named && (inControl || meaning))
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
  controls: CONTROL_HEIGHTS,
  icons: ICON_SIZES,
  touchMin: TOUCH_MIN,
});

await browser.close();

if (frames.length === 0) {
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
