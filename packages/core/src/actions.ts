import { haptic, setHaptics, type HapticKind } from '@fluvy/ui';
import { domainOf } from './entity.js';
import type { HomeAssistant, ServiceTarget } from './ha/types.js';

export function fireEvent<T>(node: EventTarget, type: string, detail?: T): void {
  node.dispatchEvent(
    new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: false }),
  );
}

/** Haptics live in `@fluvy/ui` (the controls buzz too); the cards reach them from here as before. */
export { haptic, setHaptics, type HapticKind };

export const moreInfo = (node: EventTarget, entityId: string): void =>
  fireEvent(node, 'hass-more-info', { entityId });

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  fireEvent(window, 'location-changed', { replace });
}

/** What `confirmation` may say; Home Assistant's dialog reads it. */
export interface ActionConfirmation {
  text?: string;
  title?: string;
  confirm_text?: string;
  dismiss_text?: string;
  exemptions?: readonly { user: string }[];
}

/** A tap or a hold, as Home Assistant writes its actions. */
export interface ActionConfig {
  action:
    | 'more-info'
    | 'toggle'
    | 'navigate'
    | 'url'
    | 'perform-action'
    | 'call-service'
    | 'assist'
    | 'fire-dom-event'
    | 'none';
  entity?: string;
  navigation_path?: string;
  navigation_replace?: boolean;
  url_path?: string;
  perform_action?: string;
  data?: Record<string, unknown>;
  target?: ServiceTarget;
  /** `perform-action` as it was written before Home Assistant 2024.8: `call-service`, `service`, `service_data`. */
  service?: string;
  service_data?: Record<string, unknown>;
  /** Asked before the action runs, by Home Assistant's own dialog. */
  confirmation?: boolean | ActionConfirmation;
  /** `fire-dom-event` hands the whole action on, so it carries whatever its listener reads (`browser_mod: {…}`). */
  [key: string]: unknown;
}

/** The service a toggle is, by domain: a cover opens, a lock unlocks, a vacuum starts — never a blind `homeassistant.toggle`. */
export function toggleService(
  hass: HomeAssistant,
  entityId: string,
): [domain: string, service: string] {
  const domain = domainOf(entityId);
  const state = hass.states[entityId]?.state;
  switch (domain) {
    case 'cover':
      return [domain, state === 'closed' || state === 'closing' ? 'open_cover' : 'close_cover'];
    case 'valve':
      return [domain, state === 'closed' ? 'open_valve' : 'close_valve'];
    case 'lock':
      return [domain, state === 'locked' ? 'unlock' : 'lock'];
    case 'vacuum':
      return [domain, state === 'cleaning' ? 'pause' : 'start'];
    case 'media_player':
      return [domain, 'media_play_pause'];
    case 'scene':
    case 'script':
      return [domain, 'turn_on'];
    case 'button':
    case 'input_button':
      return [domain, 'press'];
    case 'automation':
      return [domain, 'toggle'];
    // the domain's own service, like Home Assistant's own cards: `homeassistant.turn_on` works but hides the intent in the logbook
    case 'light':
    case 'switch':
    case 'fan':
    case 'humidifier':
    case 'siren':
    case 'input_boolean':
    case 'remote':
      return [domain, state === 'on' ? 'turn_off' : 'turn_on'];
    default:
      return ['homeassistant', state === 'on' ? 'turn_off' : 'turn_on'];
  }
}

export function toggleEntity(hass: HomeAssistant, entityId: string): Promise<unknown> {
  const [domain, service] = toggleService(hass, entityId);
  return hass.callService(domain, service, {}, { entity_id: entityId });
}

export const TOGGLE_DOMAINS = new Set([
  'light',
  'switch',
  'input_boolean',
  'fan',
  'humidifier',
  'siren',
  'automation',
  'cover',
  'valve',
  'lock',
  'vacuum',
  'media_player',
  'scene',
  'script',
  'button',
  'input_button',
  'group',
  'remote',
]);

/**
 * What only Home Assistant's own handler does: ask first (`confirmation` — its dialog, its words, its exemptions)
 * and open Assist. The action goes to it as `hass-action`, which its root element answers. A toggle goes as the
 * service Fluvy would have called, so a vacuum still starts and a cover still opens. Where nobody answers (outside
 * Home Assistant), an action that had to be asked about does not run.
 */
function handOver(
  node: HTMLElement,
  hass: HomeAssistant,
  config: ActionConfig,
  entity: string | undefined,
): void {
  let action = config;
  if (config.action === 'toggle') {
    if (!entity) return;
    const [domain, service] = toggleService(hass, entity);
    action = {
      ...config,
      action: 'perform-action',
      perform_action: `${domain}.${service}`,
      target: { entity_id: entity },
    };
  }
  fireEvent(node, 'hass-action', { config: { entity, tap_action: action }, action: 'tap' });
}

/**
 * Whether an action has something to do: never `none`, nor more-info or a toggle with no entity to act on (its own or
 * the card's — a card of many has none). A surface that would be drawn as a button asks first: one that does nothing
 * is not drawn.
 */
export function actionRuns(action: ActionConfig | undefined, fallbackEntity?: string): boolean {
  const kind = action?.action ?? 'more-info';
  return kind === 'more-info' || kind === 'toggle'
    ? Boolean(action?.entity ?? fallbackEntity)
    : kind !== 'none';
}

export async function runAction(
  node: HTMLElement,
  hass: HomeAssistant,
  action: ActionConfig | undefined,
  fallbackEntity?: string,
): Promise<void> {
  const config: ActionConfig = action ?? { action: 'more-info' };
  const entity = config.entity ?? fallbackEntity;
  if (config.action === 'none') return;
  if (config.confirmation || config.action === 'assist') {
    handOver(node, hass, config, entity);
    return;
  }
  switch (config.action) {
    case 'more-info':
      if (entity) moreInfo(node, entity);
      return;
    case 'toggle':
      if (entity) {
        haptic(node, 'light');
        await toggleEntity(hass, entity);
      }
      return;
    case 'navigate':
      if (config.navigation_path) navigate(config.navigation_path, config.navigation_replace);
      return;
    case 'url':
      if (config.url_path) window.open(config.url_path, '_blank', 'noopener');
      return;
    case 'fire-dom-event':
      // Home Assistant's own: the action as `ll-custom`'s detail, from the card, for the frontend
      // integrations that listen for it (browser_mod's popups, with `browser_id: THIS` resolved there).
      fireEvent(node, 'll-custom', config);
      return;
    case 'perform-action':
    case 'call-service': {
      const [domain, service] = (config.perform_action ?? config.service ?? '').split('.', 2);
      if (domain && service) {
        haptic(node, 'light');
        await hass.callService(
          domain,
          service,
          config.data ?? config.service_data ?? {},
          config.target,
        );
      }
      return;
    }
  }
}
