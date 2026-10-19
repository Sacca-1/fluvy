// every part of English first: the sheets define the families' cards themselves
import './english.js';
import { catalogue } from '@fluvy/cards';
import {
  ensureLanguage,
  fallbackCss,
  LIGHT_TINTS,
  lookRule,
  resolveLanguage,
  setLightDefaults,
  type HomeAssistant,
  type Look,
  type LovelaceCard,
  type LovelaceGridOptions,
} from '@fluvy/core';
import {
  DEFAULT_PALETTE,
  DEFAULT_PILL,
  DEFAULT_SHAPE,
  isPaletteName,
  isPillName,
  isShapeName,
  parseStatuses,
  STATUS_NAMES,
  statusesKey,
  type CustomBase,
  type FillStyle,
  type PillName,
  type PaletteCharacter,
} from '@fluvy/tokens/runtime';
import { setFallbackTokens, textWidth } from '@fluvy/ui';
import { pinClock } from './clock.js';
import { dashboardOptions, mountDashboard } from './dashboard.js';
import { createHass, type MockOptions, type StateSeed } from './hass.js';
import { mountActivity, type ActivityMoment } from './activity.js';
import { mountHistory, type HistoryMoment } from './history.js';
import { mountPanel, PANEL_WS, type PanelState } from './panel.js';
import { mountWall, wallSettingsFor, type WallMoment } from './wall.js';
import { outOfReachView } from './out-of-reach.js';
import { loadFixture, mergeWs, NOW, SHEETS, type FrameSpec, type SheetSpec } from './scenes.js';

/**
 * ?sheet=home            which design sheet to mount (default: all; `measurer` the measurer's fixtures)
 * ?mode=dark             Home Assistant's dark mode + the dark token block
 * ?width=392             a frame's width: the section's, which a full card fills (a half card is (width − 16) / 2);
 *                        a frame with a width of its own keeps it
 * ?lang=es               UI language
 * ?theme=off             drop the theme tokens: the cards must fall back to their own
 * &fallback=mist           …and those are this palette's, the page wearing none (a dashboard without the look, #40)
 * ?palette=volt          a preset, applied by the live palette engine (the one the bundle runs)
 * ?shape=round           soft | round | crisp
 * ?accent=%23ff4a1a      a custom palette instead: &character=vivid &base=cool &fill=solid &highlight=%23e2ff3d
 * ?compare=linen,volt    the sheet once per palette, side by side (each column scoped to its palette)
 * ?template_delay=3000   how long the mock takes to answer a row's template, in ms (default 30: before the first paint)
 * ?lights=on            the house's defaults for lights (fluvy's settings → Look): a light card's tint (off | on |
 *                        always) where it says none; &bulbs=1 a lit light in its bulb's colour on tiles, rows, rooms
 * ?warning=%23dc630b     the house's status colours (fluvy's settings → Appearance), over the page's look (Linen where
 *                        it asks none): &danger= &success= &notice= the same; a frame may name its own (`statuses`)
 * ?panel=appearance      fluvy's settings panel (appearance | scope | dashboard | wall | preferences)
 * &state=pending,guest     …at a moment of its own (see `PanelState` in panel.ts)
 * &nopopover=1             …in a browser without the Popover API (the dropdown's fixed fallback)
 * ?history=1             Fluvy's History page on a made-up house (&moment=week|month|states|many|empty|loading|sources|dates)
 * ?activity=1            Fluvy's Activity page on a made-up house (&live=0 without live entries,
 *                        &at=2026-09-17T21:47 the clock set to that moment, still running,
 *                        &card=1 its timeline on a card,
 *                        &moment=detail|burst|dates|sources|lights|week|nomatch|fresh|drop|loading|empty)
 * ?dashboard=home        a sheet's frames as a dashboard's view, under Home Assistant's header and its view tabs
 *                        (&tabs= &content= &tabtitle= &views= &icons= &edit= &subview= &scope= — see dashboard.ts)
 * ?frames=none           the house of the sheets asked for (every sheet's without `sheet`), none of their frames drawn:
 *                        a suite mounts its own cards in it (`fluvyCatalogue`, `fluvySheets`, `fluvyOutOfReach`)
 */
const params = new URLSearchParams(location.search);
const dark = params.get('mode') === 'dark';
const width = Number(params.get('width') ?? 360);
const dashboard = params.get('dashboard');
const only = dashboard ?? params.get('sheet');
const language = params.get('lang') ?? 'en';
/** The house's status colours the URL asks for (none: every status the palette's). */
const statuses = parseStatuses(
  Object.fromEntries(STATUS_NAMES.map((name) => [name, params.get(name)])),
);
const tinted = statusesKey(statuses) !== '';

// a WebView without the top layer: the dropdown must place its menu itself
if (params.get('nopopover') === '1')
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    value: undefined,
    configurable: true,
  });
document.documentElement.dataset['mode'] = dark ? 'dark' : 'light';
document.documentElement.lang = language;
// the language's words before anything is drawn: a screenshot never catches the English fallback
await ensureLanguage(resolveLanguage(language));
if (params.get('theme') === 'off') {
  delete document.documentElement.dataset['palette'];
  document.documentElement.style.setProperty('--fluvy-theme', 'initial');
  // a dashboard that does not wear the look, as Home Assistant draws it: no palette of ours on the page, and the cards'
  // own tokens the look of the house (the look engine puts it there) — not the generated Linen
  const fallback = params.get('fallback');
  if (fallback) {
    document.documentElement.style.setProperty('--fluvy-palette', 'initial');
    setFallbackTokens(
      fallbackCss(
        {
          palette: isPaletteName(fallback) ? fallback : 'linen',
          shape: 'soft',
          pills: 'round',
        },
        statuses,
      ),
    );
  }
} // 'initial' beats the stylesheet's :root value; '' would only drop the inline one

/** The look the URL asks for, or null to keep the generated lab tokens (Linen, Soft). */
function requestedLook(): Look | null {
  const palette = params.get('palette');
  const shape = params.get('shape');
  const pills = params.get('pills');
  const accent = params.get('accent');
  if (!palette && !shape && !pills && !accent && !tinted) return null;
  const custom = accent
    ? {
        character: (params.get('character') ?? 'vivid') as PaletteCharacter,
        base: (params.get('base') ?? 'neutral') as CustomBase,
        accent,
        fill: (params.get('fill') ?? 'tint') as FillStyle,
        ...(params.get('highlight') ? { highlight: params.get('highlight') as string } : {}),
      }
    : null;
  return {
    palette: custom ?? (isPaletteName(palette) ? palette : 'linen'),
    shape: isShapeName(shape) ? shape : 'soft',
    pills: isPillName(pills) ? pills : 'round',
  };
}
const look = requestedLook();
if (look) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(lookRule(look, dark ? 'dark' : 'light', ':root', true, statuses));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  document.documentElement.dataset['look'] = '1';
}

// the house's defaults for lights, as fluvy's settings would hand them to every card
const houseTint = LIGHT_TINTS.find((tint) => tint === params.get('lights'));
if (houseTint || params.has('bulbs'))
  setLightDefaults({ tint: houseTint ?? 'off', colors: params.get('bulbs') === '1' });

const activity = params.get('activity') === '1';
const history = params.get('history') === '1';
// the person's preference: the Activity page's timeline on a card
if (params.get('card') === '1') document.documentElement.setAttribute('fluvy-activity-card', '');
// the page's clock starts at `at` and runs on (screenshots of "today" that do not change with the day)
const at = params.get('at');
if (at) pinClock(at);
const panelTab = params.get('panel');
const panelStates = (params.get('state') ?? '').split(',').filter(Boolean) as PanelState[];
// the panel stands alone: no sheet frames beside it; a fixture sheet is asked for by name
const fixture = only && !SHEETS[only] ? await loadFixture(only) : undefined;
const selected: Array<[string, SheetSpec]> =
  panelTab || activity || history
    ? []
    : fixture && only
      ? [[only, fixture]]
      : Object.entries(SHEETS).filter(([name]) => !only || only === name);
const states = new Map<string, StateSeed>();
for (const [, sheet] of selected) for (const seed of sheet.states) states.set(seed[0], seed);

const registry = selected.reduce<NonNullable<MockOptions['registry']>>(
  (all, [, sheet]) => ({
    entities: { ...all.entities, ...sheet.registry?.entities },
    devices: { ...all.devices, ...sheet.registry?.devices },
    areas: { ...all.areas, ...sheet.registry?.areas },
    floors: { ...all.floors, ...sheet.registry?.floors },
  }),
  { entities: {}, devices: {}, areas: {}, floors: {} },
);
const mock = createHass([...states.values()], {
  dark,
  language,
  now: NOW,
  registry,
  history: Object.assign({}, ...selected.map(([, s]) => s.history ?? {})) as Record<
    string,
    readonly number[]
  >,
  statistics: Object.assign({}, ...selected.map(([, s]) => s.statistics ?? {})) as NonNullable<
    MockOptions['statistics']
  >,
  issues: selected.flatMap(([, s]) => s.issues ?? []),
  translations: Object.assign({}, ...selected.map(([, s]) => s.translations ?? {})) as Record<
    string,
    string
  >,
  data: {
    user: Object.assign({}, ...selected.map(([, s]) => s.data?.user ?? {})) as Record<
      string,
      unknown
    >,
    system: Object.assign({}, ...selected.map(([, s]) => s.data?.system ?? {})) as Record<
      string,
      unknown
    >,
  },
  ws: mergeWs([...selected.map(([, s]) => s.ws), panelTab ? PANEL_WS : undefined]),
  ...(params.has('template_delay') ? { templateDelay: Number(params.get('template_delay')) } : {}),
  // &units=imperial, or a sheet that stands alone in a house in °F and miles
  ...(params.get('units') === 'imperial' ||
  (selected.length === 1 && selected[0]?.[1].units === 'imperial')
    ? { units: 'imperial' as const }
    : {}),
  api: (method, path, body) => {
    for (const [, s] of selected) {
      const answer = s.api?.(method, path, body);
      if (answer !== undefined) return answer;
    }
    return [];
  },
});
/** Every card mounted, with the house its frame shows it (a frame may answer some questions its own way). */
const cards: { card: LovelaceCard; view: (hass: HomeAssistant) => HomeAssistant }[] = [];
mock.subscribe((hass: HomeAssistant) => {
  for (const { card, view } of cards) card.hass = view(hass);
});

const stage = document.getElementById('stage') as HTMLElement;
if (panelTab) mountPanel(stage, mock.hass(), panelTab, dark, panelStates);
if (history)
  mountHistory(
    stage,
    mock.hass(),
    language,
    params.get('live') !== '0',
    (params.get('moment') ?? undefined) as HistoryMoment | undefined,
  );
if (activity)
  mountActivity(
    stage,
    mock.hass(),
    language,
    params.get('live') !== '0',
    (params.get('moment') ?? undefined) as ActivityMoment | undefined,
  );
// the wall: this page as a wall panel over the sheet's frames (`?sheet=home&wall=1&moment=asleep`)
const wallMoment =
  params.get('wall') === '1' ? ((params.get('moment') ?? 'awake') as WallMoment) : undefined;
if (wallMoment)
  void mountWall(
    document,
    () => mock.hass(),
    dark,
    wallMoment,
    wallSettingsFor(params, wallMoment),
  );
const compare = (params.get('compare') ?? '').split(',').filter(isPaletteName);
const shape = params.get('shape');
/** Where the frames go: the stage, or one column per compared palette with its look scoped to it. */
const columns = dashboard
  ? [mountDashboard(stage, dashboardOptions(params))]
  : compare.length
    ? compare.map((palette) => {
        const column = document.createElement('div');
        column.className = 'pg-look';
        column.dataset['look'] = palette;
        const label = document.createElement('p');
        label.className = 'pg-look__name';
        label.textContent = palette;
        column.append(label);
        stage.append(column);
        return column;
      })
    : [stage];
if (compare.length) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(
    compare
      .map((palette) =>
        lookRule(
          {
            palette,
            shape: isShapeName(shape) ? shape : 'soft',
            pills: isPillName(params.get('pills')) ? (params.get('pills') as PillName) : 'round',
          },
          dark ? 'dark' : 'light',
          `[data-look="${palette}"]`,
          false,
          statuses,
        ),
      )
      .join(''),
  );
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
/**
 * A frame in status colours of its own (`FrameSpec.statuses`): the look its column wears — a compared palette, the
 * URL's, else the generated Linen — in them, on the frame alone.
 */
const framesInStatuses = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, framesInStatuses];
const statusRules = new Set<string>();
function wearStatuses(
  frame: HTMLElement,
  own: NonNullable<FrameSpec['statuses']>,
  column: HTMLElement,
): void {
  const worn = parseStatuses({ ...statuses, ...own });
  const key = statusesKey(worn);
  frame.dataset['statuses'] = key;
  const palette = column.dataset['look'];
  const base = look ?? { palette: DEFAULT_PALETTE, shape: DEFAULT_SHAPE, pills: DEFAULT_PILL };
  const scope = palette ? `[data-look="${palette}"] ` : '';
  const rule = lookRule(
    isPaletteName(palette) ? { ...base, palette } : base,
    dark ? 'dark' : 'light',
    `${scope}[data-statuses="${key}"]`,
    false,
    worn,
  );
  if (statusRules.has(rule)) return;
  statusRules.add(rule);
  framesInStatuses.replaceSync([...statusRules].join(''));
}
/**
 * The columns Home Assistant gives a card asked for `cols`: held to its own grid options' minimum and maximum. In a
 * frame of columns of its own (a grid card's), only its maximum holds it, and none past the frame's.
 */
const columnsOf = (card: LovelaceCard, cols: number | undefined, total = 12): number => {
  if (!cols) return total;
  let grid: LovelaceGridOptions | undefined;
  try {
    grid = card.getGridOptions?.();
  } catch {
    grid = undefined; // a card that cannot say (an error in its place) takes what it was given
  }
  if (total !== 12) return Math.min(cols, total);
  return Math.min(Math.max(cols, grid?.min_columns ?? 1), grid?.max_columns ?? 12);
};

const framed = params.get('frames') !== 'none';
for (const column of columns)
  for (const [name, sheet] of selected) {
    for (const frame of framed ? sheet.frames : []) {
      const el = document.createElement('section');
      el.className = 'pg-frame';
      el.dataset[frame.measure === false ? 'stress' : 'frame'] = `${name}/${frame.title}`;
      el.style.width = `${frame.width ?? width}px`;
      if (frame.gap !== undefined) el.style.gap = `${frame.gap}px`;
      if (frame.statuses) wearStatuses(el, frame.statuses, column);
      const total = frame.columns ?? 12;
      if (frame.columns) el.style.gridTemplateColumns = `repeat(${total}, minmax(0, 1fr))`;
      // the narrowest card's columns: what the measurer's card probes pick frames by (a half section is 6)
      let span = 12;
      for (const { cols, ...config } of frame.cards) {
        const tag = String(config.type).replace(/^custom:/, '');
        const card = document.createElement(tag) as LovelaceCard;
        try {
          card.setConfig(config);
        } catch (error) {
          card.textContent = String(error);
        }
        const view = frame.hass ?? ((hass: HomeAssistant) => hass);
        card.hass = view(mock.hass());
        const given = columnsOf(card, cols, total);
        if (given < 12) {
          card.dataset['cols'] = String(given);
          card.style.gridColumn = `span ${given}`;
        } else if (total !== 12) card.style.gridColumn = `span ${given}`;
        span = Math.min(span, given);
        cards.push({ card, view });
        el.append(card);
      }
      el.dataset['span'] = String(span);
      column.append(el);
    }
  }

// the mock and the shared text measurer, for the interaction tests; the cards, the sheets and a house with entities out
// of reach, for a suite that mounts its own
Object.assign(window, {
  fluvyMock: mock,
  fluvyTextWidth: textWidth,
  // the house's defaults for lights changed in fluvy's settings: every card on the page draws again
  fluvyLightDefaults: setLightDefaults,
  fluvyCatalogue: catalogue,
  fluvySheets: SHEETS,
  fluvyOutOfReach: outOfReachView,
});

// Home Assistant's <ha-icon> is not here: a stub draws a neutral disc so an `mdi:` reference has a visible box
if (!customElements.get('ha-icon')) {
  customElements.define(
    'ha-icon',
    class extends HTMLElement {
      connectedCallback(): void {
        if (!this.shadowRoot)
          this.attachShadow({ mode: 'open' }).innerHTML =
            '<style>:host{display:inline-flex;width:20px;height:20px}svg{width:100%;height:100%}</style><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></svg>';
      }
    },
  );
}
void document.fonts.ready.then(() =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset['ready'] = '1';
    }),
  ),
);
