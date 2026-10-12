import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import type { MockOptions, StateSeed } from './hass.js';

/**
 * The playground's content. One module per design sheet in `./sheets/` — same house as the sheets
 * (Marta’s flat, Thursday 17 September 2026, 21:47), so a card can be held against its approved
 * design. Modules are picked up automatically; nothing else has to be edited to add one.
 */
export interface FrameSpec {
  readonly title: string;
  readonly width?: number;
  /** false = a stress frame (deliberate overflow, scrolling rows): rendered for the eye, not audited by the measurer. */
  readonly measure?: boolean;
  readonly cards: ReadonlyArray<LovelaceCardConfig & { cols?: number }>;
  /**
   * The house as this frame's cards see it, when it is not the sheet's: another house's Energy dashboard, one with
   * none, statistics that cannot be read. Keep what the cards key their caches on (the connection) stable.
   */
  readonly hass?: (hass: HomeAssistant) => HomeAssistant;
}

export interface SheetSpec {
  readonly states: readonly StateSeed[];
  readonly frames: readonly FrameSpec[];
  /** Registries the sheet's cards read (areas, floors, devices, entity entries); merged with every other sheet's. */
  readonly registry?: MockOptions['registry'];
  /** entity id → series returned for `history/history_during_period`. */
  readonly history?: Record<string, readonly number[]>;
  /** WebSocket message type → canned answer (also used for `subscribeMessage`). */
  readonly ws?: Record<string, (message: Record<string, unknown>) => unknown>;
  /** REST answers, e.g. calendar events or a config written: (method, path, body) → an answer, or undefined to pass. */
  readonly api?: (method: string, path: string, body?: unknown) => unknown;
  /** The house's units when this sheet stands alone (`?sheet=…`): imperial for a house in °F and miles. */
  readonly units?: 'imperial';
}

export { NOW } from './now.js';

type Answer = (message: Record<string, unknown>) => unknown;

/**
 * Several sheets' canned answers as one. A message more than one sheet answers is asked of each: statistics are
 * merged id by id (the first series with data kept — each sheet answers its own ids, and an empty one for the
 * others), anything else is the first sheet's answer.
 */
export function mergeWs(
  answers: ReadonlyArray<Readonly<Record<string, Answer>> | undefined>,
): Record<string, Answer> {
  const types = new Set(answers.flatMap((ws) => Object.keys(ws ?? {})));
  return Object.fromEntries(
    [...types].map((type) => {
      const handlers = answers.flatMap((ws) => (ws?.[type] ? [ws[type]] : []));
      if (handlers.length === 1) return [type, handlers[0] as Answer];
      const merged: Answer = async (message) => {
        const replies = await Promise.all(handlers.map((handler) => handler(message)));
        if (type !== 'recorder/statistics_during_period')
          return replies.find((reply) => reply !== undefined && reply !== null);
        const out: Record<string, unknown[]> = {};
        for (const reply of replies)
          for (const [id, rows] of Object.entries((reply ?? {}) as Record<string, unknown[]>))
            if (!out[id]?.length) out[id] = rows;
        return out;
      };
      return [type, merged];
    }),
  );
}

const modules = import.meta.glob<{ sheet: SheetSpec }>('./sheets/*.ts', { eager: true });

export const SHEETS: Record<string, SheetSpec> = Object.fromEntries(
  Object.entries(modules).map(([path, module]) => [
    path.replace('./sheets/', '').replace('.ts', ''),
    module.sheet,
  ]),
);
