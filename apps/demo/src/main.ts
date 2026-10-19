// every part of English first: the playground's sheets define the families' cards themselves
import '@fluvy/playground/english';
import '@fluvy/cards';
import { type EffectiveSettings, ensureLanguage, type Look, lookKey, paletteOf } from '@fluvy/core';
import { PALETTE_NAMES } from '@fluvy/tokens/runtime';
import { pinClock } from '@fluvy/playground/clock';
import { createMemoryLook } from '@fluvy/playground/look-memory';
import mark from '../../../custom_components/fluvy/brand/icon.png';
import { installBridges } from './bridges.js';
import { FluvyDemoShell, type PaletteDot } from './shell.js';
import { createStage } from './stage.js';
import { parseState, sameView, serialize, type DemoLanguage, type DemoState } from './state.js';
import { t } from './strings.js';

/**
 * The public demo: the playground's sheets and pages on the stand-in Home Assistant, with Fluvy's own settings
 * machinery running the look — the settings live in memory, the live engine paints the page, and the settings
 * panel shown here edits the same settings. The URL says what is shown (the playground's parameters); a change on
 * the page updates it in place.
 */
const base = import.meta.env.BASE_URL;
let state: DemoState = parseState(new URLSearchParams(location.search), window.innerWidth);
pinClock(state.at);
await ensureLanguage(state.language);
document.documentElement.lang = state.language;

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.href = mark;
document.head.append(favicon);

const look = createMemoryLook(document, state.mode === 'dark');
const { store } = look.handle;
// the house wears the look everywhere (the whole page, as Home Assistant would), in the visitor's language
void store.saveHouse({ scope: 'everywhere', ...state.look });
void store.savePersonal({ language: state.language });

const shell = new FluvyDemoShell();
shell.mark = mark;
shell.palettes = PALETTE_NAMES.map((name): PaletteDot => {
  const palette = paletteOf(name);
  return { name, title: palette.title, ink: palette[state.mode].accent.ink };
});
shell.state = state;
document.getElementById('shell')?.replaceWith(shell);

const stage = createStage(document.getElementById('stage') as HTMLElement, look);

const syncUrl = (): void => {
  const query = serialize(state).toString();
  history.replaceState(null, '', query ? `${base}?${query}` : base);
};

/** A change from the chrome (or the panel): the settings machinery applies the look, the stage the rest. */
function apply(patch: Partial<DemoState>): void {
  const next: DemoState = { ...state, ...patch };
  const viewChanged = !sameView(next.view, state.view);
  const lookChanged = lookKey(next.look) !== lookKey(state.look);
  const modeChanged = next.mode !== state.mode;
  const languageChanged = next.language !== state.language;
  state = next;
  if (lookChanged) void store.saveHouse({ ...state.look });
  if (modeChanged) {
    look.setDark(state.mode === 'dark');
    shell.palettes = shell.palettes.map((dot) => ({
      ...dot,
      ink: paletteOf(dot.name)[state.mode].accent.ink,
    }));
  }
  if (languageChanged) {
    document.documentElement.lang = state.language;
    void store.savePersonal({ language: state.language });
  }
  if (viewChanged) stage.show(state);
  else stage.update(state);
  shell.state = state;
  syncUrl();
}

shell.addEventListener('demo-change', (event) => {
  apply((event as CustomEvent<Partial<DemoState>>).detail);
});

// the settings panel changes the same settings: the chrome follows
look.handle.onChange((settings: EffectiveSettings) => {
  const patch: { look?: Look; language?: DemoLanguage } = {};
  if (lookKey(settings.look) !== lookKey(state.look)) patch.look = settings.look;
  if (settings.language !== 'auto' && settings.language !== state.language)
    patch.language = settings.language;
  if (Object.keys(patch).length) apply(patch);
});

installBridges({
  moreInfo: (entityId) =>
    shell.say(t(state.language, 'notice.more_info', { entity: stage.nameOf(entityId) })),
  panelTab: (tab) => apply({ view: { kind: 'panel', tab } }),
  navigate: (path) => shell.say(t(state.language, 'notice.navigate', { path })),
  restoreUrl: syncUrl,
});

stage.show(state);
syncUrl();
if (state.path) shell.say(t(state.language, 'notice.navigate', { path: state.path }));

// the same readiness the playground declares: the tools that screenshot it work here
void document.fonts.ready.then(() =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset['ready'] = '1';
    }),
  ),
);
