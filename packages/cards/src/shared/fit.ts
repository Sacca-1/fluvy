/**
 * Fitting text to a fluid column without guessing: the browser measures the candidate itself, in the
 * very class that will draw it, so tabular figures, tracking, the font features and the font that is
 * actually loaded all count. Results are cached per class and text — a clock measures a handful of
 * strings a day, never per frame.
 */
export class TextRuler {
  private readonly cache = new Map<string, number>();

  constructor(private readonly root: () => ParentNode | undefined) {}

  /**
   * Laid-out width of `text` in the sheet class `cls` ("parent > child" when the rule is a descendant
   * one), plus an optional unit span (with its own margin) beside it. One pixel is added for the
   * rounding of layout metrics: a line that measures as fitting does fit.
   */
  width(cls: string, text: string, unitCls = '', unit = ''): number {
    const raw = this.measure(cls, text, unitCls, unit);
    return raw > 0 ? raw + 1 : 0;
  }

  /** A pill sized as `fitPills()` sizes it: the text plus its sides, up to the 4 px grid. */
  pill(cls: string, text: string, pad: number): number {
    const raw = this.measure(cls, text);
    return raw > 0 ? Math.ceil((raw + pad) / 4) * 4 : 0;
  }

  /** The layout metric itself, in whole pixels; 0 while the host is hidden (measured again next time). */
  private measure(cls: string, text: string, unitCls = '', unit = ''): number {
    const key = `${cls}|${text}|${unitCls}|${unit}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const root = this.root();
    if (!root) return 0;
    const path = cls.split(' > ');
    const probe = document.createElement('p');
    probe.className = path.pop() ?? '';
    probe.style.cssText = 'width:max-content;height:auto;margin:0;padding:0;white-space:nowrap';
    probe.append(text);
    if (unit) {
      const span = document.createElement('span');
      span.className = unitCls;
      span.textContent = unit;
      probe.append(span);
    }
    const box = document.createElement('div');
    box.className = path.join(' ');
    box.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    box.append(probe);
    root.append(box);
    const width = probe.offsetWidth; // layout metric: whole pixels, blind to a card that is still scaling in
    box.remove();
    if (width > 0) this.cache.set(key, width);
    return width;
  }

  /** A web font arrived, or a minute passed: measure afresh. */
  clear(): void {
    this.cache.clear();
  }
}

/** A caption segment: its text, a shorter form to fall back on, and whether the line may go without it. */
export interface Segment {
  readonly text: string;
  readonly short?: string;
  readonly optional?: boolean;
}

const join = (parts: readonly string[]): string => parts.filter(Boolean).join(' · ');

/** The line that fits: in full, then with the short forms, then losing optional segments from the end. */
export function fitLine(
  segments: readonly Segment[],
  available: number,
  width: (text: string) => number,
): string {
  const full = join(segments.map((segment) => segment.text));
  if (width(full) <= available) return full;
  const kept = segments.map((segment) => ({
    text: segment.short ?? segment.text,
    optional: segment.optional ?? false,
  }));
  let line = join(kept.map((segment) => segment.text));
  for (let i = kept.length - 1; i >= 0 && width(line) > available; i--) {
    if (!kept[i]?.optional) continue;
    kept.splice(i, 1);
    line = join(kept.map((segment) => segment.text));
  }
  return line;
}

/**
 * How many lines `text` takes broken between its words in `width`, as a line that wraps at words lays it out;
 * `Infinity` where one word alone is wider than the line, which only a break inside it would hold.
 */
export function lineCount(text: string, width: number, measure: (text: string) => number): number {
  let lines = 0;
  let line = '';
  for (const word of text.split(' ')) {
    const longer = line ? `${line} ${word}` : word;
    if (line && measure(longer) <= width) line = longer;
    else if (measure(word) > width) return Infinity;
    else {
      lines += 1;
      line = word;
    }
  }
  return lines;
}

/** The first candidate that fits, else the last (the shortest) one. */
export function firstFit<T>(
  candidates: readonly T[],
  fits: (candidate: T) => boolean,
): T | undefined {
  return candidates.find(fits) ?? candidates[candidates.length - 1];
}
