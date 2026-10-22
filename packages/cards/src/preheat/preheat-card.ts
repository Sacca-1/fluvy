import type { FluvyCardConfig, LovelaceConfigForm } from '@fluvy/core';
import { css, html, type CSSResultGroup } from 'lit';
import { Card } from '../shared/base.js';
import { entityField, textField, formLabels } from '../shared/form.js';

interface PreheatConfig extends FluvyCardConfig {
  subtitle?: string;
}

type Settings = Record<string, number | string | boolean>;
const labels: Record<string, string> = {
  comfort: 'Gewenste temperatuur (°C)',
  enabled: 'Slimme prijsregeling',
  external_temperature: 'Externe kamertemperatuur gebruiken (bijv. ALPSTUGA)',
  max_correction: 'Maximale aircocorrectie (±°C)',
  correction_minutes: 'Meetverschil afvlakken (minuten)',
  feedback_gain: 'Bijsturing bij afwijkende kamertemperatuur (°C/°C)',
  overheat_multiplier: 'Extra tegensturing bij te warme kamer (×)',
  max_overheat_correction: 'Maximale aircoverlaging (°C; 0 = algemene grens)',
  feedback_deadband: 'Rustzone rond kamerdoel (±°C)',
  external_interval: 'Instelinterval kamerbijsturing (minuten)',
  max_boost: 'Maximale voorverwarming (+°C)',
  max_drop: 'Maximale onderschrijding (−°C)',
  min_spread: 'Minimaal voordeel na warmteverlies (€/kWh stroom)',
  max_hours: 'Maximale optimalisatieduur (uur)',
  loss_rate: 'Geschat warmteverlies per uur',
  heat_capacity: 'Geschatte warmtecapaciteit (kWh warmte/°C)',
  electric_power: 'Geschat elektrisch vermogen (kW)',
  min_interval: 'Minimale instelinterval (minuten)',
  manual_hours: 'Pauze na handmatige wijziging (uur)',
  purchase_fee: 'Inkoopvergoeding incl. btw (€/kWh)',
  energy_tax: 'Energiebelasting incl. btw (€/kWh)',
  tariff_valid_until: 'Contracttarieven geldig tot (exclusief)',
  climate_entity: 'Woonkamerairco',
  indoor_entity: 'Externe binnentemperatuur',
  outdoor_entity: 'Buitentemperatuur / weer',
  price_entity: 'EnergyZero huidige marktprijs incl. btw',
  power_entity: 'Aircovermogen in W (optioneel)',
  energy_entity: 'Aircoverbruik in kWh (optioneel)',
};
const limits: Record<string, readonly [number, number, number]> = {
  comfort: [16, 28, 0.5],
  max_correction: [0, 3, 0.5],
  correction_minutes: [5, 60, 5],
  feedback_gain: [0, 2, 0.1],
  overheat_multiplier: [1, 3, 0.25],
  max_overheat_correction: [0, 3, 0.5],
  feedback_deadband: [0.1, 1, 0.1],
  external_interval: [5, 60, 5],
  max_boost: [0, 3, 0.5],
  max_drop: [0, 2, 0.5],
  min_spread: [0, 1, 0.01],
  max_hours: [0, 3, 0.5],
  loss_rate: [0.01, 0.5, 0.01],
  heat_capacity: [0.2, 20, 0.1],
  electric_power: [0.1, 5, 0.1],
  min_interval: [15, 180, 5],
  manual_hours: [0.5, 24, 0.5],
  purchase_fee: [0, 1, 0.00001],
  energy_tax: [0, 1, 0.00001],
};

/** One controller entity; physical sources come from its validated backend settings. */
export class FluvyPreheatCard extends Card<PreheatConfig> {
  static override base = ['entity', 'name'] as const;
  static override keys = ['subtitle'];
  static override layoutHeight(): number {
    return 500;
  }
  static getStubConfig(_hass: unknown, entities: readonly string[]): PreheatConfig {
    return {
      type: 'custom:fluvy-preheat-card',
      entity: entities.find((id) => id.startsWith('sensor.')) ?? 'sensor.voorverwarming',
    };
  }
  static override properties = {
    ...Card.properties,
    draft: { state: true },
    error: { state: true },
    busy: { state: true },
  };
  private draft: Settings = {};
  private error = '';
  private busy = false;
  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    css`
      .heat {
        padding: 24px;
        display: grid;
        gap: 16px;
      }
      .title {
        font-size: 18px;
        font-weight: 600;
      }
      button {
        font: inherit;
        color: inherit;
        cursor: pointer;
        border: 1px solid var(--fluvy-border, #8884);
        border-radius: 16px;
        padding: 12px 16px;
        background: var(--fluvy-surface-2, #8881);
      }
      .hero {
        text-align: left;
        width: 100%;
      }
      .value {
        font-size: 44px;
        line-height: 1.3;
        font-weight: 500;
      }
      .muted {
        color: var(--fluvy-text-secondary);
        line-height: 1.5;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .adjust {
        display: flex;
        gap: 8px;
      }
      .schedule {
        display: grid;
        gap: 12px;
        border-top: 1px solid var(--divider-color);
        padding-top: 16px;
      }
      .schedule input[type='time'] {
        width: 120px;
      }
      dialog {
        position: fixed;
        inset: 0;
        margin: auto;
        color: var(--primary-text-color);
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 24px;
        width: min(560px, calc(100vw - 48px));
        max-height: 85dvh;
        padding: 24px;
        box-sizing: border-box;
      }
      dialog::backdrop {
        background: #0007;
      }
      .fields {
        display: grid;
        gap: 16px;
        margin: 24px 0;
      }
      label {
        display: grid;
        gap: 6px;
        line-height: 1.4;
      }
      input,
      select {
        box-sizing: border-box;
        font: inherit;
        color: inherit;
        background: var(--secondary-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 10px;
        min-width: 0;
        max-width: 100%;
        width: 100%;
      }
      input[type='checkbox'] {
        width: 24px;
        height: 24px;
      }
      .error {
        color: var(--error-color, #b00);
      }
      .footer {
        position: sticky;
        bottom: -24px;
        background: var(--card-background-color);
        padding: 16px 0;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
    `,
  ];
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [entityField(['sensor']), textField('name'), textField('subtitle')],
      ...formLabels(),
    };
  }
  protected override prepare(config: FluvyCardConfig): FluvyCardConfig {
    if (!config.entity) throw new Error('Kies de beslissensor van Slim verwarmen');
    return config;
  }
  protected override watched(): readonly string[] {
    return [this.config?.entity ?? ''];
  }
  override getCardSize(): number {
    return 4;
  }
  private get data(): Record<string, unknown> {
    return this.hass?.states[this.config?.entity ?? '']?.attributes ?? {};
  }
  private get settings(): Settings {
    return (this.data.settings ?? {}) as Settings;
  }
  private async openSettings(): Promise<void> {
    this.draft = { ...this.settings };
    this.error = '';
    this.requestUpdate();
    await this.updateComplete;
    this.renderRoot.querySelector('dialog')?.showModal();
  }
  private async save(settings: Settings, resume = false): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      await this.hass?.callService('smart_preheat', 'configure', { settings, resume });
      this.renderRoot.querySelector('dialog')?.close();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }
  private options(key: string): string[] {
    const domain =
      key === 'climate_entity'
        ? ['climate']
        : key === 'outdoor_entity'
          ? ['sensor', 'weather']
          : ['sensor'];
    return Object.keys(this.hass?.states ?? {})
      .filter((id) => domain.includes(id.split('.')[0]!))
      .sort();
  }
  private field(key: string) {
    const update = (event: Event) => {
      const input = event.target as HTMLInputElement;
      this.draft = {
        ...this.draft,
        [key]:
          key === 'enabled' || key === 'external_temperature'
            ? input.checked
            : key in limits
              ? input.valueAsNumber
              : input.value,
      };
    };
    if (key.endsWith('_entity'))
      return html`<label
        >${labels[key]}<select .value=${String(this.draft[key] ?? '')} @change=${update}>
          <option value="">Niet gekoppeld</option>
          ${this.options(key).map((id) => html`<option value=${id}>${this.hass?.states[id]?.attributes.friendly_name ?? id} · ${id}</option>`)}
        </select></label
      >`;
    if (key === 'enabled' || key === 'external_temperature')
      return html`<label class="row"
        >${labels[key]}<input
          type="checkbox"
          .checked=${Boolean(this.draft[key])}
          @change=${update}
      /></label>`;
    const range = limits[key];
    return html`<label
      >${labels[key]}<input
        type=${range ? 'number' : 'date'}
        .value=${String(this.draft[key] ?? '')}
        min=${range?.[0] ?? ''}
        max=${range?.[1] ?? ''}
        step=${range?.[2] ?? ''}
        @change=${update}
    /></label>`;
  }
  private renderSchedule() {
    const s = this.settings,
      d = this.data;
    const next =
      typeof d.next_switch === 'string'
        ? new Date(d.next_switch).toLocaleString('nl-NL', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: this.hass?.config.time_zone,
          })
        : '';
    const last = d.schedule_last as { status?: string; reason?: string } | undefined;
    return html`<section class="schedule" aria-label="Dagelijks schakelen">
      <strong>Dagelijks schakelen</strong>
      ${(['on', 'off'] as const).map(
        (action) =>
          html`<div class="row">
            <label class="row"
              ><input
                type="checkbox"
                aria-label=${action === 'on' ? 'Automatisch inschakelen' : 'Automatisch uitschakelen'}
                .checked=${Boolean(s['auto_' + action])}
                ?disabled=${this.busy}
                @change=${(event: Event) => this.save({ ['auto_' + action]: (event.target as HTMLInputElement).checked })}
              />${action === 'on' ? 'Automatisch aan' : 'Automatisch uit'}</label
            >
            <input
              type="time"
              aria-label=${action === 'on' ? 'Inschakeltijd' : 'Uitschakeltijd'}
              .value=${String(s[action + '_time'] ?? '')}
              ?disabled=${this.busy}
              step="60"
              @change=${(event: Event) => this.save({ [action + '_time']: (event.target as HTMLInputElement).value })}
            />
          </div>`,
      )}
      <div class="muted">Dagelijks · handmatige pauze gaat voor</div>
      ${next ? html`<div class="muted">Volgende: ${d.next_switch_action === 'on' ? 'aan' : 'uit'} · ${next}</div>` : ''}
      ${last && ['skipped', 'error'].includes(last.status ?? '') ? html`<div class="muted">${last.reason}</div>` : ''}
    </section>`;
  }
  protected renderCard() {
    const d = this.data,
      s = this.settings;
    const num = (v: unknown) =>
      typeof v === 'number' ? v.toLocaleString('nl-NL', { maximumFractionDigits: 2 }) : '—';
    const deferred = d.mode === 'defer' && typeof d.defer_until === 'number';
    const active = d.mode === 'preheat' || d.mode === 'defer';
    const benefit = active
      ? d.saving_per_kwh
      : typeof d.next_preheat === 'string'
        ? d.next_saving_per_kwh
        : undefined;
    const resume = deferred
      ? new Date(Number(d.defer_until) * 1000).toLocaleTimeString('nl-NL', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    const next =
      typeof d.next_preheat === 'string'
        ? new Date(d.next_preheat).toLocaleString('nl-NL', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Geen gepland';
    return html`<article class="fv-card heat" data-card>
        <div class="title">${this.config?.name ?? 'Slim verwarmen'}</div>
        <div class="muted">${this.config?.subtitle ?? 'Comfort en stroomprijs'}</div>
        <button
          class="hero"
          @click=${() => this.openSettings()}
          aria-label="Gewenste temperatuur en geavanceerde instellingen"
        >
          <div class="muted">Gewenste temperatuur</div>
          <div class="value">${num(s.comfort)} °C</div>
          <div class="muted">Tik voor instellingen</div>
        </button>
        <div class="row">
          <span class="muted">Comfort aanpassen</span
          ><span class="adjust"
            ><button
              ?disabled=${this.busy || !s.comfort || Number(s.comfort) <= 16}
              aria-label="Temperatuur verlagen"
              @click=${() => this.save({ comfort: Number(s.comfort) - 0.5 })}
            >
              −</button
            ><button
              ?disabled=${this.busy || !s.comfort || Number(s.comfort) >= 28}
              aria-label="Temperatuur verhogen"
              @click=${() => this.save({ comfort: Number(s.comfort) + 0.5 })}
            >
              +
            </button></span
          >
        </div>
        <div class="row">
          <span>Airco ingesteld</span><strong>${num(d.actual_target)} °C</strong>
        </div>
        ${
          s.external_temperature
            ? html`<div class="muted">
                Kamer ${num(d.indoor)} °C · Aircosensor ${num(d.unit_temperature)} °C<br />
                Kamerdoel ${num(d.target)} °C · Correctie ${num(d.correction)} °C<br />
                ${d.external_status ?? 'Externe regeling wordt geladen'}
                ${d.unit_status ? html`<br />${d.unit_status}` : ''}
              </div>`
            : ''
        }
        <div class="row">
          <span>Budget stroomprijs</span
          ><strong>€ ${typeof d.price === 'number' ? d.price.toFixed(4) : '—'}/kWh</strong>
        </div>
        <div class="row">
          <span>${deferred ? 'Terug naar comfort' : 'Volgende voorverwarming'}</span
          ><strong>${deferred ? resume : next}</strong>
        </div>
        ${typeof benefit === 'number' ? html`<div class="row"><span>${active ? 'Voordeel per verschoven kWh' : 'Gepland voordeel per kWh'}</span><strong>€ ${benefit.toFixed(3)}/kWh</strong></div>` : ''}
        ${this.renderSchedule()}
        <div class="muted" role="status">${d.reason ?? 'Regeling niet beschikbaar'}</div>
        ${d.manual_until ? html`<div class="muted">Pauze tot ${new Date(String(d.manual_until)).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
        ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ''}
      </article>
      <dialog
        aria-label="Slimme woonkamerverwarming"
        @cancel=${() => {
          this.error = '';
        }}
      >
        <div class="row">
          <strong>Slimme woonkamerverwarming</strong
          ><button
            aria-label="Sluiten"
            @click=${() => this.renderRoot.querySelector('dialog')?.close()}
          >
            ×
          </button>
        </div>
        <p class="muted">
          De externe regeling combineert het afgevlakte meetverschil met bijsturing op het
          kamerdoel. Bijsturing 0 schakelt alleen die toevoeging uit. Het begrensde aircodoel kan
          buiten de comfortgrenzen van het kamerdoel liggen. Oude metingen blijven zichtbaar, maar
          worden pas na een verse melding gebruikt. De airco regelt zelf de compressor. Uit of
          koelen blijft behouden. Warmteverlies, warmtecapaciteit en vermogen zijn schattingen; het
          voordeel is geen gemeten besparing. Extra tegensturing en de aparte verlagingsgrens
          verlagen alleen het aircodoel; het kamerdoel blijft behouden. De regeling start op
          voordeel per verschoven kWh stroom, na geschat warmteverlies. Er geldt geen minimum
          totaalbedrag per actie.
        </p>
        <form
          @submit=${(event: Event) => {
            event.preventDefault();
            void this.save(this.draft);
          }}
        >
          <div class="fields">${Object.keys(labels).map((key) => this.field(key))}</div>
          ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : ''}
          <div class="footer">
            <button type="button" ?disabled=${this.busy} @click=${() => this.save({}, true)}>
              Regeling hervatten</button
            ><button type="submit" ?disabled=${this.busy}>
              ${this.busy ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </form>
      </dialog>`;
  }
}
