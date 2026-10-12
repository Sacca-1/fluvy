import type { HomeAssistant, LovelaceCard } from '@fluvy/core';
import { mountActivity, type ActivityMoment } from '@fluvy/playground/activity';
import { createHass, type StateSeed } from '@fluvy/playground/hass';
import { mountHistory, type HistoryMoment } from '@fluvy/playground/history';
import type { MemoryLook } from '@fluvy/playground/look-memory';
import { mountPanel, PANEL_WS } from '@fluvy/playground/panel';
import { mergeWs, NOW, SHEETS, type SheetSpec } from '@fluvy/playground/scenes';
import { sheetsOf } from './families.js';
import { columns, frameWidth, sameView, type DemoState } from './state.js';

type Mock = ReturnType<typeof createHass>;

/** The cards' Home Assistant as this page shows it: its mode and language on top of the stand-in's. */
export function withEnvironment(
  hass: HomeAssistant,
  state: Pick<DemoState, 'mode' | 'language'>,
): HomeAssistant {
  return {
    ...hass,
    language: state.language,
    locale: { ...hass.locale, language: state.language },
    themes: { ...hass.themes, darkMode: state.mode === 'dark' },
  };
}

export interface Stage {
  /** Mounts what the state asks for, from nothing. */
  show(state: DemoState): void;
  /** A change of mode, language or device: the cards re-skin, re-word and re-measure in place; a page is remounted. */
  update(state: DemoState): void;
  /** An entity's name on the stand-in, for a notice. */
  nameOf(entityId: string): string;
}

/** The demo's stage: the playground's sheets as frames, or one of its pages, on the stand-in `hass`. */
export function createStage(root: HTMLElement, look: MemoryLook): Stage {
  let cards: LovelaceCard[] = [];
  let mock: Mock | undefined;
  let shown: DemoState | undefined;
  let unsubscribe: (() => void) | undefined;

  const clear = (): void => {
    unsubscribe?.();
    unsubscribe = undefined;
    root.replaceChildren();
    root.classList.remove('pg-panel');
    cards = [];
  };

  const push = (hass: HomeAssistant): void => {
    if (!shown) return;
    const environment = withEnvironment(hass, shown);
    for (const card of cards) card.hass = environment;
  };

  const showSheets = (state: DemoState): void => {
    const names = sheetsOf(state.view.kind === 'sheet' ? state.view.name : 'home');
    const selected = names
      .map((name): [string, SheetSpec | undefined] => [name, SHEETS[name]])
      .filter((entry): entry is [string, SheetSpec] => entry[1] !== undefined);
    const seeds = new Map<string, StateSeed>();
    for (const [, sheet] of selected) for (const seed of sheet.states) seeds.set(seed[0], seed);
    mock = createHass([...seeds.values()], {
      dark: state.mode === 'dark',
      language: state.language,
      now: NOW,
      history: Object.assign({}, ...selected.map(([, sheet]) => sheet.history ?? {})) as Record<
        string,
        readonly number[]
      >,
      ws: mergeWs(selected.map(([, sheet]) => sheet.ws)),
      api: (method, path, body) => {
        for (const [, sheet] of selected) {
          const answer = sheet.api?.(method, path, body);
          if (answer !== undefined) return answer;
        }
        return [];
      },
    });
    unsubscribe = mock.subscribe(push);
    root.style.setProperty('--demo-frame', `${frameWidth(state)}px`);
    // as many columns as the device has; each frame goes to the shortest one, so nothing is left hanging
    const lanes = Array.from({ length: columns(state) }, () => {
      const lane = document.createElement('div');
      lane.className = 'demo-lane';
      root.append(lane);
      return lane;
    });
    const shortest = (): HTMLElement =>
      lanes.reduce((low, lane) => (lane.offsetHeight < low.offsetHeight ? lane : low));
    const environment = withEnvironment(mock.hass(), state);
    for (const [name, sheet] of selected)
      for (const frame of sheet.frames) {
        // a stress frame (deliberate overflow) is the measurer's, not a visitor's
        if (frame.measure === false) continue;
        const el = document.createElement('section');
        el.className = 'pg-frame';
        el.dataset['frame'] = `${name}/${frame.title}`;
        for (const { cols, ...config } of frame.cards) {
          const tag = String(config.type).replace(/^custom:/, '');
          const card = document.createElement(tag) as LovelaceCard;
          if (cols) card.dataset['cols'] = String(cols);
          try {
            card.setConfig(config);
          } catch (error) {
            card.textContent = String(error);
          }
          card.hass = environment;
          cards.push(card);
          el.append(card);
        }
        shortest().append(el);
      }
  };

  const showPage = (state: DemoState): void => {
    const { view } = state;
    mock = createHass([], {
      dark: state.mode === 'dark',
      language: state.language,
      now: NOW,
      ...(view.kind === 'panel' ? { ws: PANEL_WS } : {}),
    });
    const hass = withEnvironment(mock.hass(), state);
    if (view.kind === 'panel') mountPanel(root, hass, view.tab, state.mode === 'dark', [], look);
    else if (view.kind === 'history')
      mountHistory(root, hass, state.language, false, view.moment as HistoryMoment | undefined);
    else if (view.kind === 'activity')
      mountActivity(root, hass, state.language, false, view.moment as ActivityMoment | undefined);
  };

  return {
    show(state) {
      clear();
      shown = state;
      if (state.view.kind === 'sheet') showSheets(state);
      else showPage(state);
    },
    update(state) {
      // a page, another view or another device: from nothing (the lanes are filled by height)
      if (
        !shown ||
        !sameView(shown.view, state.view) ||
        state.view.kind !== 'sheet' ||
        columns(shown) !== columns(state) ||
        frameWidth(shown) !== frameWidth(state)
      ) {
        this.show(state);
        return;
      }
      shown = state;
      if (mock) push(mock.hass());
    },
    nameOf: (entityId) => mock?.hass().states[entityId]?.attributes.friendly_name ?? entityId,
  };
}
