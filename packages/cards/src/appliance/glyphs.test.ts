import { iconNames } from '@fluvy/core';
import { glyphBody, glyphNames, isGlyph, type GlyphName } from '@fluvy/ui';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { APPLIANCE_GLYPHS, PICKABLE } from './glyphs.js';
import './view.js';

const LAB = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'apps',
  'design-lab',
  'fluvy.js',
);

/** The design lab's copy of the appliances' glyphs (a plain script: run as it is). */
async function labGlyphs(): Promise<Record<string, string>> {
  const context: Record<string, unknown> = {
    document: {
      createElement: () => ({ style: {} }),
      body: { appendChild() {} },
      createRange: () => ({}),
    },
  };
  context['globalThis'] = context;
  vm.createContext(context);
  vm.runInContext(await readFile(LAB, 'utf8'), context);
  return (context['FLUVY'] as { APPLIANCE_GLYPHS: Record<string, string> }).APPLIANCE_GLYPHS;
}

describe('the appliances’ glyphs', () => {
  it('are the design lab’s, path for path, and no more', async () => {
    const lab = await labGlyphs();
    expect(Object.keys(lab).sort()).toEqual(Object.keys(APPLIANCE_GLYPHS).sort());
    for (const [name, svg] of Object.entries(lab))
      expect(
        svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''),
        `glyph "${name}" differs from the design lab`,
      ).toBe(APPLIANCE_GLYPHS[name as keyof typeof APPLIANCE_GLYPHS]);
  });

  it('join the set once the family has landed, never in place of one of its own', () => {
    for (const [name, body] of Object.entries(APPLIANCE_GLYPHS)) {
      expect(glyphNames, name).not.toContain(name);
      expect(isGlyph(name), name).toBe(true);
      expect(glyphBody(name as GlyphName).body, name).toBe(body);
    }
  });

  it('the six a person may pick are outlined in core’s icon set, the others are not', () => {
    const outlined = new Set(iconNames());
    for (const name of Object.keys(APPLIANCE_GLYPHS))
      expect(outlined.has(name), name).toBe((PICKABLE as readonly string[]).includes(name));
  });
});
