/*
 * What a person told the cards about their appliances, kept in this browser: the finish they unloaded (a tap on
 * "Unloaded"), by appliance — an LG washer has no door to say so. A finish is remembered until the next one replaces
 * it; storage that cannot be reached (a private window, blocked site data) keeps it for the page instead.
 */

const KEY = 'fluvy-unloaded';
/** The page's copy: what storage holds, and what it could not. */
let memory: Record<string, number> | undefined;

function read(): Record<string, number> {
  if (memory) return memory;
  memory = {};
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    if (stored && typeof stored === 'object')
      for (const [id, at] of Object.entries(stored))
        if (typeof at === 'number' && Number.isFinite(at)) memory[id] = at;
  } catch {
    // nothing kept, or nothing readable: the page remembers from now on
  }
  return memory;
}

/** The finish (ms) the person unloaded this appliance after (its device, else its entity), if any. */
export const unloadedAt = (appliance: string): number | null => read()[appliance] ?? null;

/** Said on the window when an appliance is said unloaded: every card showing it draws again. */
export const UNLOADED_EVENT = 'fluvy-unloaded';

/** Remembers that the finish at `finish` (ms) was unloaded. */
export function rememberUnloaded(appliance: string, finish: number): void {
  const kept = read();
  kept[appliance] = finish;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // the page keeps it
  }
  window.dispatchEvent(new Event(UNLOADED_EVENT));
}

/** Forgets every finish (tests). */
export function forgetUnloaded(): void {
  memory = undefined;
}
