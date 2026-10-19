/**
 * Numbers as the docs spell them ("fifty-five", "fifteen"), and back: what the facts guard reads a spelled count with.
 * Whole numbers under a thousand, as the prose writes them — tens and units joined by a hyphen, a space tolerated on
 * the way back.
 */

const UNITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const;

/** `55` → `fifty-five`, `15` → `fifteen`, `100` → `one hundred`, `141` → `one hundred and forty-one`. */
export function wordsOf(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new RangeError(`wordsOf(${n}): 0–999`);
  if (n < 20) return UNITS[n] as string;
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)] as string;
    return n % 10 ? `${tens}-${UNITS[n % 10]}` : tens;
  }
  const rest = n % 100;
  const hundreds = `${UNITS[Math.floor(n / 100)]} hundred`;
  return rest ? `${hundreds} and ${wordsOf(rest)}` : hundreds;
}

/** Every word a spelled number may begin with, for a pattern. */
export const NUMBER_WORDS: readonly string[] = [...UNITS.slice(1), ...TENS.filter(Boolean)];

/**
 * A spelled number back to its value (`Fifty-five`, `fifty five`, `fifteen`; digits as they are), or `undefined` for
 * words that are no number. Case does not matter: the prose capitalises a sentence's first word.
 */
export function numberOf(text: string): number | undefined {
  const words = text.trim().toLowerCase();
  if (/^\d{1,3}$/.test(words)) return Number(words);
  const parts = words.split(/[-\s]+/);
  if (parts.length === 1) {
    const unit = UNITS.indexOf(parts[0] as (typeof UNITS)[number]);
    if (unit >= 0) return unit;
    const tens = TENS.indexOf(parts[0] as (typeof TENS)[number]);
    return tens >= 2 ? tens * 10 : undefined;
  }
  if (parts.length === 2) {
    const tens = TENS.indexOf(parts[0] as (typeof TENS)[number]);
    const unit = UNITS.indexOf(parts[1] as (typeof UNITS)[number]);
    return tens >= 2 && unit >= 1 && unit <= 9 ? tens * 10 + unit : undefined;
  }
  return undefined;
}
