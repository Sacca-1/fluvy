import { walkShadow } from '../shell/dom.js';
import { PANEL_ATTRIBUTE } from './attributes.js';

interface PanelPrototype {
  updated?: (changed: unknown) => void;
  __fluvyLook?: true;
}

type PanelElement = HTMLElement & { panel?: { url_path?: string } };
/** Home Assistant's card editor dialog: it knows which panel it was opened on through `hass.panelUrl`. */
type DialogElement = HTMLElement & { hass?: { panelUrl?: string } };

type Wears = (urlPath: string | undefined) => boolean;

/** Marks a panel, or the card editor, from the url path of the dashboard it shows; true when the mark changed. */
function mark(element: HTMLElement, urlPath: string | undefined, wears: Wears): boolean {
  const on = wears(urlPath);
  if (element.hasAttribute(PANEL_ATTRIBUTE) === on) return false;
  element.toggleAttribute(PANEL_ATTRIBUTE, on);
  return true;
}

/**
 * Keeps every dashboard panel marked: `ha-panel-lovelace`'s one update method is wrapped (a panel is
 * reused from dashboard to dashboard, so each update re-reads its url path); `changed` runs when a mark
 * moves, so the cards inside look for the theme again. False if Home Assistant
 * reshaped the element: the `dashboards` scope then does nothing, and `everywhere` still works.
 */
export async function patchLovelacePanels(
  registry: CustomElementRegistry,
  wears: Wears,
  changed: () => void,
): Promise<boolean> {
  await registry.whenDefined('ha-panel-lovelace');
  const proto = registry.get('ha-panel-lovelace')?.prototype as PanelPrototype | undefined;
  const original = proto?.updated;
  if (!proto || typeof original !== 'function') return false;
  if (!proto.__fluvyLook) {
    proto.updated = function (this: PanelElement, changes: unknown): void {
      original.call(this, changes);
      if (mark(this, this.panel?.url_path, wears)) changed();
    };
    proto.__fluvyLook = true;
  }
  return true;
}

/**
 * Keeps the card editor dialog marked as the dashboard it was opened on: the colour picker's swatches then show
 * the palette's colours (they resolve where the dialog lives, outside the panel). Wrapped as the panels are, and
 * `changed` runs when its mark moves: the preview inside looks for the theme again.
 */
export async function patchEditDialog(
  registry: CustomElementRegistry,
  wears: Wears,
  changed: () => void,
): Promise<boolean> {
  await registry.whenDefined('hui-dialog-edit-card');
  const proto = registry.get('hui-dialog-edit-card')?.prototype as PanelPrototype | undefined;
  const original = proto?.updated;
  if (!proto || typeof original !== 'function') return false;
  if (!proto.__fluvyLook) {
    proto.updated = function (this: DialogElement, changes: unknown): void {
      original.call(this, changes);
      if (mark(this, this.hass?.panelUrl, wears)) changed();
    };
    proto.__fluvyLook = true;
  }
  return true;
}

/** Re-marks the panels (and an open card editor) on the page now (the settings changed); true when a mark changed. */
export function markPanels(doc: Document, wears: Wears): boolean {
  let changed = false;
  walkShadow(doc, (element) => {
    if (element.localName === 'ha-panel-lovelace') {
      const panel = element as PanelElement;
      if (mark(panel, panel.panel?.url_path, wears)) changed = true;
    } else if (element.localName === 'hui-dialog-edit-card') {
      const dialog = element as DialogElement;
      if (mark(dialog, dialog.hass?.panelUrl, wears)) changed = true;
    }
  });
  return changed;
}
