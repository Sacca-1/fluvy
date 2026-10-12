/**
 * What the sheet fits by measure, as pure arithmetic: the width its pair of buttons share, and whether a tile's value
 * holds its cell. The sheet measures (its ruler, its row's width) and asks here.
 */

/** The sheet's 16 between the two buttons of its pair. */
const GAP = 16;
/** The design's width for a button of the pair, where the sheet holds two of them (392 wide: 360 of content). */
export const PAIR = 172;

const up4 = (n: number): number => Math.ceil(n / 4) * 4;

/**
 * One width for both buttons of a pair, on the 4 px grid: the design's 172 where two of them and the 16 between fit
 * the row; else the row's equal share while the longer label (`natural`, its words and sides) holds it; else the
 * label's own width, and the two stand one above the other (`stacked`).
 */
export function pairWidth(
  natural: number,
  room: number,
  base = PAIR,
): { readonly pair: number; readonly stacked: boolean } {
  const share = Math.floor((room - GAP) / 2 / 4) * 4;
  const pair = up4(Math.max(natural, Math.min(base, share)));
  return { pair, stacked: 2 * pair + GAP > room };
}

/** A tile's value where it holds its cell, else its shorter form where that holds, else nothing: dropped, never wrapped or cut. */
export const heldValue = (full: string, short: string, fits: (text: string) => boolean): string =>
  fits(full) ? full : short && fits(short) ? short : '';
