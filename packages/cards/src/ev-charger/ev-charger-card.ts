import { chargerHeight } from '../energy-family.js';
import {
  clock12,
  dateFormat,
  formatNumber,
  formatTime,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { head, sheetStyles, type Tone } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { HeadFit } from '../energy/head.js';
import { durationFigure, durationReadout } from '../energy/duration.js';
import { MARK_LABEL, markedRuler } from '../energy/marked-ruler.js';
import { modeRow } from '../energy/mode-row.js';
import { valueRow, type Figure } from '../shared/value-row.js';
import { deviceName, readoutParts, scaled, scaleOf, watts } from '../energy/power.js';
import { statsCols, statsStyles, type Stat } from '../energy/stats.js';
import { Card, HEAD_BASE, type BaseKey } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  iconField,
  showIconField,
  textField,
} from '../shared/form.js';
import {
  carFlow,
  clampPercent,
  dueOf,
  readyByOf,
  statusCharging,
  targetOf,
  type CarFlow,
  type Due,
} from './charger.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const s = strings('ev-charger', 'energy-flow');

export interface EvChargerCardConfig extends FluvyCardConfig {
  /** The charger's power sensor: + charges the car, − the car feeding the house (V2H). */
  entity?: string;
  /** The sensor counts charging as negative. */
  invert?: boolean;
  /** The car's state of charge. */
  level?: string;
  /** Where the charge should end: a percentage, or an entity that holds one. */
  target?: number | string;
  /** When it should be there: a time ("07:00"), or an entity that holds one (a time, a timestamp). */
  ready_by?: string;
  /** The energy this session has added. */
  session_energy?: string;
  /** A sensor or binary sensor saying charging / connected: the head's second line, and how long it has charged. */
  status?: string;
  /** The car's name, after the status. */
  vehicle?: string;
  /** How much of what the car takes comes from the sun (%). */
  solar_share?: string;
  /** A `select` / `input_select` of the charging mode. */
  mode?: string;
  /** The tests' clock: "now" for how long it has charged. */
  _now?: string;
}

/**
 * The car on its charger: its charge on a read-only ruler with the target marked, when it is due, what the session
 * added, for how long it has charged and how much came from the sun, and the charging mode as tiles. The head's
 * badge is the power while it charges, and in the car's colour when the car powers the house (the sub says which way). Anything not configured is not
 * drawn, and a reading that cannot be read is "—".
 */
export class FluvyEvChargerCard extends Card<EvChargerCardConfig> {
  static override layoutHeight(config: EvChargerCardConfig, hass?: HomeAssistant): number {
    return chargerHeight(config, hass);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    statsStyles,
    css`
      .ef-card {
        width: 100%;
      }
    `,
  ];

  static override base: readonly BaseKey[] = HEAD_BASE;
  static override keys = configKeys<EvChargerCardConfig>()([
    'invert',
    'level',
    'target',
    'ready_by',
    'session_energy',
    'status',
    'vehicle',
    'solar_share',
    'mode',
  ]);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ invert: false });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor']),
        fieldRow(textField('name'), iconField()),
        showIconField(),
        boolField('invert'),
        fieldRow(entityField(['sensor'], 'level', false), textField('target')),
        fieldRow(textField('ready_by'), entityField(['sensor', 'binary_sensor'], 'status', false)),
        fieldRow(
          entityField(['sensor'], 'session_energy', false),
          entityField(['sensor'], 'solar_share', false),
        ),
        fieldRow(textField('vehicle'), entityField(['select', 'input_select'], 'mode', false)),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(s, {
        entity: 'editor_entity',
        invert: 'editor_invert',
        level: 'editor_level',
        target: 'editor_target',
        ready_by: 'editor_ready_by',
        session_energy: 'editor_session_energy',
        status: 'editor_status',
        vehicle: 'editor_vehicle',
        solar_share: 'editor_solar_share',
        mode: 'editor_mode',
      }),
    };
  }

  static getStubConfig(
    hass: HomeAssistant | undefined,
    entities: readonly string[],
  ): EvChargerCardConfig {
    const power = entities.filter(
      (id) => id.startsWith('sensor.') && hass?.states[id]?.attributes.device_class === 'power',
    );
    const charger = power.find((id) => /charg|wallbox|evse|\bev\b|_ev_|car/i.test(id));
    return { type: 'custom:fluvy-ev-charger-card', entity: charger ?? power[0] ?? '' };
  }

  private readonly head = new HeadFit(this);
  private ticker: number | undefined;

  override getCardSize(): number {
    return Math.ceil(FluvyEvChargerCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    const c = this.config;
    const target = targetOf(c?.target);
    const ready = readyByOf(c?.ready_by);
    return [
      c?.entity,
      c?.level,
      target && 'entity' in target ? target.entity : undefined,
      ready && 'entity' in ready ? ready.entity : undefined,
      c?.session_energy,
      c?.status,
      c?.solar_share,
      c?.mode,
    ].filter((id): id is string => !!id);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // "For 2 h 03 min" is a claim about the clock: drawn again each half minute while it is shown
    this.ticker = window.setInterval(() => {
      if (this.config?.status && this.charging()) this.requestUpdate();
    }, 30_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  /* ---------- reading ---------- */

  private now(): number {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return Number.isFinite(pinned) ? pinned : Date.now();
  }

  private flow(): CarFlow | null {
    return carFlow(watts(this.entity()), this.config?.invert ?? false);
  }

  /** The charger's power when it can be read; else what the status says. */
  private charging(): boolean {
    const flow = this.flow();
    if (flow) return flow.way === 'charging';
    const status = this.config?.status ? this.entity(this.config.status) : undefined;
    return status?.status === 'ok'
      ? statusCharging(status.domain, status.state, status.deviceClass)
      : false;
  }

  /** The target in %, `null` when its entity cannot be read, `undefined` when there is none. */
  private target(): number | null | undefined {
    const target = targetOf(this.config?.target);
    if (!target) return undefined;
    if ('percent' in target) return target.percent;
    const view = this.entity(target.entity);
    return view.status === 'ok' && view.number !== null ? clampPercent(view.number) : null;
  }

  /** When the car is due, as the clock writes it; `null` when its entity cannot be read, `undefined` when there is none. */
  private due(): string | null | undefined {
    const ready = readyByOf(this.config?.ready_by);
    if (!ready) return undefined;
    if ('due' in ready) return this.clockText(ready.due);
    const view = this.entity(ready.entity);
    const due = view.status === 'ok' ? dueOf(view.state) : null;
    return due ? this.clockText(due) : null;
  }

  private clockText(due: Due): string {
    if (due.kind === 'moment') return formatTime(this.hass, due.at);
    // a time of day is written as it stands: no zone to move it through
    const h12 = clock12(this.hass);
    return dateFormat(this.hass?.language ?? 'en', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: h12 ? 'h12' : 'h23',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, due.hours, due.minutes)));
  }

  private name(view: EntityView): string {
    if (this.config?.name) return this.config.name;
    const device = this.hass?.devices?.[this.hass.entities?.[view.id]?.device_id ?? ''];
    const own = device?.name_by_user ?? device?.name;
    if (own) return own;
    return view.status === 'missing' ? s(this.hass, 'title') : deviceName(view);
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const title = this.name(view);
    // a charger out of reach, even one no longer there, is the live card with its badge saying so (the owner's rule,
    // 1.9): its figures "—", its ruler and its mode in place
    if (!this.config?.entity) return this.renderEmpty();
    const w = this.contentWidth;
    const flow = this.flow();
    const tone = toneOf(this.config, 'accent');
    const power = flow ? scaleOf([flow.watts], 'W') : null;
    const powerText =
      flow && power ? { value: scaled(this.hass, flow.watts, power), unit: power.unit } : null;
    const levelView = this.config.level ? this.entity(this.config.level) : undefined;
    const level =
      levelView === undefined
        ? undefined
        : levelView.status === 'ok' && levelView.number !== null
          ? clampPercent(levelView.number)
          : null;

    // the badge is the power either way — in the car's own colour while it powers the house — and the sub says which
    // way (the charger's status, or our words when it has none)
    const badge: { text: string; tone: Tone } | null = !flow
      ? {
          text: view.status === 'ok' ? this.t('state.unavailable') : stateText(this.hass, view),
          tone: 'warning',
        }
      : flow.way === 'feeding' && powerText
        ? { text: `${powerText.value} ${powerText.unit}`, tone: 'vehicle' }
        : flow.way === 'charging' && level !== undefined && powerText
          ? { text: `${powerText.value} ${powerText.unit}`, tone }
          : null;
    const statusView = this.config.status ? this.entity(this.config.status) : undefined;
    const status = statusView
      ? stateText(this.hass, statusView)
      : flow?.way === 'feeding'
        ? s(this.hass, 'powering_house')
        : '';
    const sub = [status, this.config.vehicle ?? ''].filter(Boolean).join(' · ');
    const fitted = this.head.fit({ width: w, title, sub, badge });
    const active = flow !== null && flow.way !== 'idle';

    return html`<article class="fv-card ef-card en-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config.icon ?? 'car') : null,
        tone: active ? tone : 'neutral',
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: true,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${this.renderTop(level, powerText, title, tone, w)} ${this.renderReadouts(statusView, w)}
      ${this.renderMode(tone, w)}
    </article>`;
  }

  /** The car's charge and when it is due, over the ruler; with no charge to show, the charger's power. */
  private renderTop(
    level: number | null | undefined,
    powerText: { value: string; unit: string } | null,
    title: string,
    tone: Tone,
    w: number,
  ): TemplateResult {
    const target = this.target();
    const due = this.due();
    const main: Figure =
      level !== undefined
        ? {
            label: s(this.hass, 'kind_vehicle'),
            value: level === null ? '—' : formatNumber(this.hass, level, { digits: 0 }),
            unit: level === null ? '' : '%',
          }
        : {
            label: this.t('energy.power'),
            value: powerText?.value ?? '—',
            unit: powerText?.unit ?? '',
          };
    const side: Figure | null =
      due !== undefined
        ? {
            label:
              typeof target === 'number'
                ? s(this.hass, 'by', {
                    percent: formatNumber(this.hass, target, { digits: 0 }),
                  })
                : s(this.hass, 'ready_by'),
            value: due ?? '—',
            unit: '',
          }
        : null;
    return html`${valueRow(this.head.ruler, w, main, side ? { figure: side } : null)}
    ${
      level !== undefined
        ? markedRuler({
            hass: this.hass,
            width: w,
            value: level,
            tone,
            mark:
              typeof target === 'number' ? { percent: target, text: s(this.hass, 'target') } : null,
            label: `${title} · ${s(this.hass, 'kind_vehicle')}`,
            measure: (text) => this.head.ruler.width(MARK_LABEL, text),
          })
        : nothing
    }`;
  }

  /** What the session added, for how long it has charged, how much came from the sun: those configured. */
  private renderReadouts(
    statusView: EntityView | undefined,
    w: number,
  ): TemplateResult | typeof nothing {
    const stats: Stat[] = [];
    const energy = this.config?.session_energy;
    if (energy)
      stats.push({ label: s(this.hass, 'added'), ...readoutParts(this.hass, this.entity(energy)) });
    if (statusView && this.charging()) {
      const since = Date.parse(statusView.stateObj?.last_changed ?? '');
      if (Number.isFinite(since)) {
        const label = s(this.hass, 'for');
        const seconds = Math.max(0, (this.now() - since) / 1000);
        stats.push({
          ...durationFigure(this.hass, label, seconds),
          draw: (size) => durationReadout(this.hass, label, seconds, size),
        });
      }
    }
    const sun = this.config?.solar_share;
    if (sun) {
      const view = this.entity(sun);
      const ok = view.status === 'ok' && view.number !== null;
      stats.push({
        label: s(this.hass, 'from_sun'),
        value: ok
          ? formatNumber(this.hass, clampPercent(view.number as number), { digits: 0 })
          : '—',
        unit: ok ? '%' : '',
      });
    }
    return stats.length ? statsCols(this.head.ruler, w, stats) : nothing;
  }

  /** The charging mode, when the card is given one: off pauses, the sun charges from its surplus, fast at full power. */
  private renderMode(tone: Tone, w: number): TemplateResult | typeof nothing {
    const id = this.config?.mode;
    if (!id) return nothing;
    const view = this.entity(id);
    if (view.status === 'missing') return nothing;
    return modeRow({
      hass: this.hass,
      view,
      state: this.stateOf(view),
      heading: s(this.hass, 'mode'),
      width: w,
      ruler: this.head.ruler,
      glyph: 'car',
      tone,
      meaning: (kind) =>
        kind === 'off'
          ? s(this.hass, 'mode_off')
          : kind === 'sun'
            ? s(this.hass, 'mode_sun')
            : kind === 'fast'
              ? s(this.hass, 'mode_fast')
              : '',
      tilesUpTo: 6,
      onSelect: (option) => {
        this.expect(view.id, option);
        this.call(view.domain, 'select_option', { option }, view.id);
      },
    });
  }
}
