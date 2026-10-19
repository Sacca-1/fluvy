// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { accentHex } from '../look/accent.js';

/**
 * A browser reads any CSS colour a card's `color` may carry through a canvas (happy-dom has none): a 2D context that
 * knows a few, serialises them as a browser does, and keeps its previous value for anything it refuses.
 */
const KNOWN: Readonly<Record<string, string>> = {
  'hsl(0 100% 50%)': '#ff0000',
  rebeccapurple: '#663399',
  'hsla(200, 50%, 40%, 0.5)': 'rgba(51, 119, 153, 0.5)',
  '#000000': '#000000',
  '#ffffff': '#ffffff',
};
let style = '#000000';
const context = {
  get fillStyle(): string {
    return style;
  },
  set fillStyle(value: string) {
    style = KNOWN[value] ?? style;
  },
};
HTMLCanvasElement.prototype.getContext = (() =>
  context) as unknown as HTMLCanvasElement['getContext'];

describe('a card’s colour as any CSS colour the browser reads (#40)', () => {
  it('is that colour, its opacity dropped', () => {
    expect(accentHex('linen', 'light', 'hsl(0 100% 50%)')).toBe('#ff0000');
    expect(accentHex('linen', 'light', 'rebeccapurple')).toBe('#663399');
    expect(accentHex('linen', 'light', 'hsla(200, 50%, 40%, 0.5)')).toBe('#337799');
  });

  it('is nothing where the browser refuses it, and Home Assistant’s own words never reach it', () => {
    expect(accentHex('linen', 'light', 'nonsense')).toBeUndefined();
    for (const word of ['none', 'state', 'primary', 'accent'])
      expect(accentHex('linen', 'light', word), word).toBeUndefined();
  });
});
