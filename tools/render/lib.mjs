import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODES = ['light', 'dark'];

/**
 * The playground every tool opens: `PLAYGROUND` (a worktree runs its own on a port of its own), else the dev
 * server's :5183. Always ends in a slash, so a query goes straight after it.
 */
export const PLAYGROUND = (process.env.PLAYGROUND ?? 'http://127.0.0.1:5183/').replace(/\/?$/, '/');

const HERE = dirname(fileURLToPath(import.meta.url));
const PALETTES_JSON = resolve(HERE, '../../packages/tokens/dist/palettes.json');

/**
 * `--flag value` pairs on top of a defaults object. Unknown flags are an error.
 * A bare `--` is dropped: pnpm forwards it into the script rather than eating it.
 */
export function parseArgs(rawArgv, defaults) {
  const argv = rawArgv.filter((token) => token !== '--');
  const args = { ...defaults };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === undefined || !flag.startsWith('--')) {
      throw new Error(`Expected a --flag, received "${flag}"`);
    }
    const key = flag.slice(2);
    if (!(key in defaults)) {
      throw new Error(`Unknown flag "${flag}". Known: ${Object.keys(defaults).join(', ')}`);
    }
    if (value === undefined) throw new Error(`Flag "${flag}" needs a value`);
    args[key] = value;
  }
  return args;
}

/** Palette registry, read from the token build so the two can never drift. */
export async function paletteNames() {
  const raw = await readFile(PALETTES_JSON, 'utf8');
  return JSON.parse(raw).palettes.map((palette) => palette.name);
}

/**
 * How every tool launches Chromium. `--disable-software-rasterizer` keeps a screenshot from hanging on a machine
 * without a usable GPU; `--disable-lcd-text` keeps text the same on every machine.
 */
export const launchOptions = { args: ['--disable-lcd-text', '--disable-software-rasterizer'] };
