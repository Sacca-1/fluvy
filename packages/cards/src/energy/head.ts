import { badge, emptyState, type Tone } from '@fluvy/ui';
import { nothing, type LitElement, type ReactiveController, type TemplateResult } from 'lit';
import { fitLine, lineCount, TextRuler, type Segment } from '../shared/fit.js';
import { FontsSettled } from '../shared/fonts.js';

/* the head's geometry (fluvy.css): a 44 icon and a 12 gap before the titles, a 12 gap before what trails them */
const ICON = 44 + 12;
const GAP = 12;
/** A badge's sides: what `fitPills()` adds to its text. */
export const BADGE_SIDES = 28;
/* a compact row's circle (40) and its gap: the head's smaller circle too */
const ICON_COMPACT = 40 + 12;
/** The least a row's name may have beside its value before the circle gives way to it (the name itself when shorter). */
const ROW_NAME_MIN = 96;
/** The least a head's name keeps beside a circle it must show (`always`): two letters and the ellipsis at 16/600. */
const NAME_FLOOR = 40;

/** How a row is laid out: the compact row's 40 circle, or no circle at all (given to the name). */
export interface RowLayout {
  readonly compact?: boolean;
  readonly icon?: boolean;
  /** What ends the row when it is not a value's words: a chevron's 44, a switch's 56. */
  readonly end?: number;
}

export interface HeadFitOptions {
  /** Content width of the card. */
  readonly width: number;
  readonly title: string;
  readonly sub?: string | undefined;
  /**
   * The sub's shorter forms, in order, for a column where even its first segment would not hold (a stale "Updated 32
   * days ago" → "32 days ago", "Entity not found" → "Not found"): the first that holds is taken, else the last — `''`
   * lets the line go, as a lesser element does before a word is cut.
   */
  readonly shorter?: readonly string[];
  /** The badge that trails the titles, if any. */
  readonly badge?: { readonly text: string; readonly tone: Tone } | null | undefined;
  /** Width of a fixed trailing element instead (a 44 round, a 96 nav pair). */
  readonly trailing?: number;
  /**
   * The badge says what the card is for (an alert, a count under a fold): the sub's trailing segments give way before
   * it does, and the badge goes only where the sub's first segment would not hold beside it.
   */
  readonly badgeFirst?: boolean;
  /** Whether the circle shows; the card's own `show_icon` (`Card.showIcon`) when not given. */
  readonly icon?: ShowIcon;
}

/**
 * Whether a head's circle shows (a card's `show_icon`): `auto` lets it give way where that makes the name whole,
 * `always` keeps it while the name keeps its floor (two letters and the ellipsis: the smaller circle first, then
 * none), `never` draws none.
 */
export type ShowIcon = 'auto' | 'always' | 'never';

export interface FittedHead {
  /** Empty when there is no sub (what `head()` reads as none). */
  readonly sub: string;
  /** The badge to put in the trailing slot — `nothing` when it had to step aside. */
  readonly badge: TemplateResult | typeof nothing;
  /** False when the title needed the icon circle's room too: `head({ icon: null })` draws none. */
  readonly icon: boolean;
  /** The circle is the head's smaller one (`head({ small })`): the full one would leave the name under its floor. */
  readonly small: boolean;
  /** The title still does not hold in its room: it ends in an ellipsis, and the head's button carries it whole. */
  readonly cut: boolean;
}

/** A card that says how its head's circle shows (`Card.showIcon`, from its `show_icon`). */
interface IconHost {
  readonly showIcon?: ShowIcon;
}

/** A switch at the head's end: its 56 × 44 hit (`.fv-hit`), not the 48 track — the room a head fit must keep for it. */
export const SWITCH_SLOT = 56;

/**
 * Fits a card head to its column before it is rendered, so nothing in it is ever clipped: the title
 * is the card's name and stays whole; what gives way has an order — the badge first (the state a badge
 * carries is one every card of this family also shows in its body), then the sub's trailing " · "
 * segments ("South roof · 5.4 kWp" → "South roof"), then the icon circle: a title — or a sub's first
 * segment — that still does not fit in a column of 172 takes its room where that makes it whole, or where the name
 * would otherwise end before it had begun (a chart card's icon is decoration; the chart says what the card is, and the
 * card's tap is its whole head, never the circle). A badge that is the card's alert (`badgeFirst`) outranks the sub's
 * trailing segments. Lists share the rows' rule: `rowsKeepIcon` gives every row's circle to the names together.
 *
 * Widths are laid out by the browser in the card's own classes (`TextRuler`), never guessed, and
 * measured again when a web font lands. One instance per card: `private readonly head = new HeadFit(this)`.
 */
export class HeadFit implements ReactiveController {
  /** The card's text ruler (measured again when a font lands): what else the card fits may share it. */
  readonly ruler: TextRuler;

  constructor(private readonly host: LitElement) {
    this.ruler = new TextRuler(() => host.renderRoot as ParentNode | undefined);
    host.addController(this);
    // a face that arrives after the first render changes every width: measure afresh and lay the head out again
    new FontsSettled(host, () => {
      this.ruler.clear();
      this.host.requestUpdate();
    });
  }

  hostConnected(): void {}

  fit(o: HeadFitOptions): FittedHead {
    const show = o.icon ?? (this.host as LitElement & IconHost).showIcon ?? 'auto';
    const pill = o.badge ? this.ruler.pill('fv-badge', o.badge.text, BADGE_SIDES) : 0;
    let trailing = o.badge ? pill : (o.trailing ?? 0);
    let circle = show === 'never' ? 0 : ICON;
    const room = (): number => o.width - circle - (trailing > 0 ? trailing + GAP : 0);
    let keepBadge = Boolean(o.badge);

    if (keepBadge && this.ruler.width('fv-card__title', o.title) > room()) {
      keepBadge = false;
      trailing = 0;
    }

    // what gives way has an order (design/language.md § Header pattern): the badge first — its state is in the body
    // too — then the sub's trailing segments, then the icon circle
    if (o.sub && keepBadge && this.ruler.width('fv-card__sub', o.sub) > room()) {
      const first = o.badgeFirst ? this.fitSub(o.sub, room()) : '';
      if (!first || this.ruler.width('fv-card__sub', first) > room()) {
        keepBadge = false;
        trailing = 0;
      }
    }
    let sub = o.sub ? this.fitSub(o.sub, room()) : '';

    // the title, or the sub's first segment (a period's "Desde medianoche"), needs the circle's room too: the circle
    // gives way where its room makes one of them whole — or where the name would end before it had begun (under 96, or
    // under the name itself: a row's rule). A circle that would leave them cut anyway stays, the name taking its
    // ellipsis.
    const title = this.ruler.width('fv-card__title', o.title);
    const first = o.sub ? this.ruler.width('fv-card__sub', o.sub.split(' · ')[0] ?? '') : 0;
    const whole = [title, first].some((w) => w > room() && w <= room() + ICON);
    const unbegun = room() < Math.min(ROW_NAME_MIN, title);
    if (show === 'auto' && (whole || unbegun)) circle = 0;
    // a circle that must show leaves the name its floor (or the whole of a shorter one): where the full circle would
    // not, the smaller one; where not even that, none — a name never vanishes beside its circle and what trails it
    const floor = Math.min(NAME_FLOOR, title);
    if (show === 'always' && room() < floor) circle = ICON_COMPACT;
    if (show === 'always' && room() < floor) circle = 0;
    if (circle !== ICON && o.sub) sub = this.fitSub(o.sub, room());

    // a line still too long for its room, even down to its first segment: its next shorter form, fitted afresh
    const [next, ...rest] = o.shorter ?? [];
    if (next !== undefined && this.ruler.width('fv-card__sub', sub) > room())
      return this.fit({ ...o, sub: next, shorter: rest });

    return {
      sub,
      badge: keepBadge && o.badge ? badge(o.badge.text, o.badge.tone) : nothing,
      icon: circle > 0,
      small: circle === ICON_COMPACT,
      cut: title > room(),
    };
  }

  /**
   * A card's sub fitted to `room` on its own (a head whose geometry is not the standard one: the player's 80 art and
   * its rounds): "A · B · C" keeps A, then as many of the rest as the room holds.
   */
  fitSub(sub: string, room: number): string {
    const segments: Segment[] = sub
      .split(' · ')
      .map((text, index) => ({ text, optional: index > 0 }));
    return fitLine(segments, room, (text) => this.ruler.width('fv-card__sub', text));
  }

  /**
   * Room for a row's words beside its value (`fv-row`: a 44 circle — 40 in a compact row, none in a row that gave
   * it to its name — and two 12 gaps).
   */
  rowRoom(width: number, value: string, layout: RowLayout = {}): number {
    const icon = layout.icon === false ? 0 : layout.compact ? ICON_COMPACT : ICON;
    const end = layout.end ?? (value ? this.ruler.width('fv-row__value', value) : 0);
    return width - icon - GAP - end;
  }

  /** The least a row's name needs beside its value: 96, or the name itself (measured) when it is shorter. */
  rowNameRoom(title: string): number {
    return Math.min(ROW_NAME_MIN, this.ruler.width('fv-row__title', title));
  }

  /**
   * Whether a list of rows keeps its circles: a row squeezed so far that its name would end before it had begun
   * (its words' column under 96, or under the name itself) gives the circle's room to the name — and every row of
   * the list with it, so the names keep one column. The head's own order: the circle gives way before a name is cut
   * short; a name that still does not fit then ends in an ellipsis, as names may. A row's `sub` is the least of its
   * second line that must stay whole (a share, a time, a state: its shortest form): the circle gives way to it too.
   */
  rowsKeepIcon(
    width: number,
    rows: readonly {
      readonly title: string;
      readonly value: string;
      readonly end?: number;
      readonly sub?: string;
    }[],
    compact = false,
  ): boolean {
    return rows.every(({ title, value, end, sub }) => {
      const room = this.rowRoom(width, value, end === undefined ? { compact } : { compact, end });
      return (
        room >= this.rowNameRoom(title) && (!sub || room >= this.ruler.width('fv-row__sub', sub))
      );
    });
  }

  /**
   * A compact row's value for an entity that cannot be read: the state's word ("Unavailable", "Not found"), where
   * it leaves the name its room even without the circle; else `fallback` — the figure's dash, the dashed ring still
   * saying why.
   */
  rowWord(width: number, title: string, word: string, fallback: string): string {
    return this.rowRoom(width, word, { compact: true, icon: false }) >= this.rowNameRoom(title)
      ? word
      : fallback;
  }

  /** A row's second line fitted to `room`: segments after the first go, from the end, before anything is clipped. */
  fitRowSub(sub: string, room: number): string {
    return this.fitRowSegments(
      sub.split(' · ').map((text, index) => ({ text, optional: index > 0 })),
      room,
    );
  }

  /** The same with the caller's own priorities: optional segments leave from the end, required ones stay. */
  fitRowSegments(segments: readonly Segment[], room: number): string {
    return fitLine(segments, room, (text) => this.ruler.width('fv-row__sub', text));
  }

  /**
   * An empty card's panel: what is missing in one line, and how to fix it as the hint under it — left out where it
   * would run past two lines (half a column), as the panel stays a panel and not a page of words.
   */
  empty(glyph: string, text: string, hint: string, width: number, short?: string): TemplateResult {
    const room = Math.min(EMPTY_HINT_MAX, width - EMPTY_SIDES);
    const fits = this.ruler.width('fv-empty-state__hint', hint) <= room * EMPTY_TWO_LINES;
    return emptyState(glyph, this.emptyText(text, width, short), fits ? hint : '');
  }

  /**
   * An empty panel's line in a column of `width`: its words, where they hold two lines broken between words; else its
   * `short` form (half a section: fr's "Pas encore d'historique" would break inside "d'historique", it's "Ancora
   * nessuna cronologia" take three lines and run past the panel's 120).
   */
  emptyText(text: string, width: number, short?: string): string {
    if (short === undefined) return text;
    const lines = lineCount(text, width - EMPTY_SIDES, (words) =>
      this.ruler.width('fv-empty-state__text', words),
    );
    return lines > 2 ? short : text;
  }
}

/** The hint's measure (`.fv-empty-state__hint` max-width), the panel's padding both sides, and two lines of it less
 * what wrapping by words loses. */
const EMPTY_HINT_MAX = 380;
const EMPTY_SIDES = 32;
const EMPTY_TWO_LINES = 1.8;
