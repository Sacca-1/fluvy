import {
  declarationsCss,
  statusesKey,
  THEME_SENTINEL,
  type CssDeclaration,
  type PaletteMode,
  type StatusColours,
} from '@fluvy/tokens/runtime';
import { setFallbackTokens } from '@fluvy/ui';
import type { EffectiveSettings } from '../settings/schema.js';
import { declarationsOf, lookKey, type Look } from './css.js';
import { PAGE_ATTRIBUTE, PANEL_ATTRIBUTE } from './attributes.js';

/** The last page rule, for the loader to apply before the app renders (the websocket answers later). */
export const EARLY_KEY = 'fluvy:look';

/**
 * A look as the cards' own tokens, used where no look reaches them (`:host([no-theme])`): both of its modes, in the
 * house's status colours, and never the sentinel, so a card can still tell that no look is on.
 */
export function fallbackCss(look: Look, statuses?: StatusColours): string {
  const ours = (mode: PaletteMode): readonly CssDeclaration[] =>
    declarationsOf(look, mode, statuses).filter(
      ([name]) => name.startsWith('--fluvy-') && name !== THEME_SENTINEL,
    );
  return `:host([no-theme]){${declarationsCss(ours('light'))}}:host([no-theme][dark]){${declarationsCss(ours('dark'))}}`;
}

export interface EarlyLook {
  readonly mode: PaletteMode;
  readonly css: string;
}

interface Target {
  readonly document: Document;
  readonly sheet: CSSStyleSheet;
}

/** Home Assistant's app, where it keeps its connection to the companion apps. */
interface HassElement extends Element {
  hass?: { auth?: { external?: { fireMessage(message: { type: string }): void } } };
}

/**
 * Puts a look where the settings say, in the mode Home Assistant is in:
 * - `everywhere`: one sheet adopted by the document (and by every same-origin panel frame, HACS),
 *   `:root { … !important }` — it wins over whatever theme the profile applies inline, without touching
 *   the profile; `<html fluvy-look>` tells the shell to style Home Assistant's pages;
 * - `dashboards`: the same declarations on `ha-panel-lovelace` hosts that wear the look (`panels.ts`);
 * - always: the cards' token fallback becomes this look, so a fluvy card anywhere else follows it.
 * Then, as Home Assistant does after it applies a theme, the page background, the browser's theme colour
 * and the companion app (status bar) are brought up to date.
 */
export class LookEngine {
  private readonly targets: Target[] = [];
  /** Pushed into `ha-panel-lovelace`'s styles by the starter. */
  readonly panelSheet: CSSStyleSheet;
  private applied = '';
  private fallback = '';
  private pageCss = '';

  /** `early`: the sheet the loader applied from this browser's cache before the build arrived, taken over as is. */
  constructor(
    private readonly doc: Document,
    createSheet: () => CSSStyleSheet,
    private readonly storage: Storage | undefined,
    early?: CSSStyleSheet,
  ) {
    this.panelSheet = createSheet();
    if (early) this.targets.push({ document: doc, sheet: early });
    else this.addDocument(doc, createSheet());
  }

  /** A document the look must reach (the page, a panel frame); its sheet is made by its own window. */
  addDocument(document: Document, sheet: CSSStyleSheet): void {
    this.targets.push({ document, sheet });
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    sheet.replaceSync(this.pageCss);
    document.documentElement.toggleAttribute(PAGE_ATTRIBUTE, this.pageCss !== '');
  }

  /** Applies the look; true when anything changed (the cards then look for the theme again). */
  apply(settings: EffectiveSettings, dark: boolean): boolean {
    const mode: PaletteMode = dark ? 'dark' : 'light';
    const { look, scope, statuses } = settings;
    const key = `${lookKey(look)}${statusesKey(statuses)}|${scope}|${mode}`;
    if (key === this.applied) return false;
    this.applied = key;

    const declarations = declarationsOf(look, mode, statuses);
    const everywhere = scope === 'everywhere';
    this.pageCss = everywhere ? `:root{${declarationsCss(declarations, true)}}` : '';
    this.targets.splice(
      0,
      this.targets.length,
      ...this.targets.filter(({ document }) => document.defaultView !== null),
    );
    for (const { document, sheet } of this.targets) {
      sheet.replaceSync(this.pageCss);
      document.documentElement.toggleAttribute(PAGE_ATTRIBUTE, everywhere);
    }
    this.panelSheet.replaceSync(
      everywhere ? '' : `:host([${PANEL_ATTRIBUTE}]){${declarationsCss(declarations)}}`,
    );
    this.applyFallback(look, statuses);
    this.syncChrome();
    this.remember(mode);
    return true;
  }

  /** The cards' own tokens (used where no look reaches them) become this look's. */
  private applyFallback(look: Look, statuses: StatusColours): void {
    const key = lookKey(look) + statusesKey(statuses);
    if (key === this.fallback) return;
    this.fallback = key;
    setFallbackTokens(fallbackCss(look, statuses));
  }

  /** What Home Assistant does once a theme is on: the page background, the browser's theme colour, the companion app. */
  private syncChrome(): void {
    const root = this.doc.documentElement;
    const computed = getComputedStyle(root);
    const background = computed.getPropertyValue('--primary-background-color').trim();
    if (background) root.style.backgroundColor = background;
    const meta = this.doc.querySelector('meta[name=theme-color]');
    const color = computed.getPropertyValue('--app-theme-color').trim();
    if (meta && color) meta.setAttribute('content', color);
    (
      this.doc.querySelector('home-assistant') as HassElement | null
    )?.hass?.auth?.external?.fireMessage({
      type: 'theme-update',
    });
  }

  private remember(mode: PaletteMode): void {
    try {
      const early: EarlyLook = { mode, css: this.pageCss };
      this.storage?.setItem(EARLY_KEY, JSON.stringify(early));
    } catch {
      // no storage: the next load waits for the settings
    }
  }
}
