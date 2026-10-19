import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { APPLIANCE_KINDS } from '../kinds.js';
import { KIND_ART } from '../picture.js';
import { APPLIANCE_ART, ART_DEFS } from './art.js';

const LAB = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'apps',
  'design-lab',
  'fluvy.js',
);

/** The design lab's copy of the pictures (a plain script: run as it is). */
async function lab(): Promise<{ art: Record<string, string>; defs: string }> {
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
  const fluvy = context['FLUVY'] as {
    APPLIANCE_ART: Record<string, string>;
    APPLIANCE_ART_DEFS: string;
  };
  return { art: fluvy.APPLIANCE_ART, defs: fluvy.APPLIANCE_ART_DEFS };
}

describe('the appliances’ pictures', () => {
  it('are the design lab’s, drawing for drawing, materials and all', async () => {
    const { art, defs } = await lab();
    expect(defs).toBe(ART_DEFS);
    expect(Object.keys(art).sort()).toEqual(Object.keys(APPLIANCE_ART).sort());
    for (const [name, body] of Object.entries(art))
      expect(body, `picture "${name}" differs from the design lab`).toBe(
        APPLIANCE_ART[name as keyof typeof APPLIANCE_ART],
      );
  });

  it('draw every kind, and every drawing is some kind’s', () => {
    for (const kind of APPLIANCE_KINDS) expect(APPLIANCE_ART[KIND_ART[kind]], kind).toBeDefined();
    expect(new Set(Object.values(KIND_ART))).toEqual(new Set(Object.keys(APPLIANCE_ART)));
  });

  it('stay on their 64 grid, take only their own materials, and wear a shadow and a rim', () => {
    const own = new Set([...ART_DEFS.matchAll(/id="(fa\w)"/g)].map((match) => match[1]));
    for (const [name, body] of Object.entries(APPLIANCE_ART)) {
      for (const [, attribute, value] of body.matchAll(/\s(x|y|cx|cy|width|height)="([-\d.]+)"/g))
        expect(Number(value), `${name} ${attribute ?? ''}`).toSatisfy(
          (n: number) => n >= 0 && n <= 64,
        );
      for (const [, id] of body.matchAll(/url\(#(\w+)\)/g))
        expect(own.has(id ?? ''), name).toBe(true);
      expect(body, name).toContain('url(#faH)');
      expect(body, name).toContain('class="r"');
    }
  });
});
