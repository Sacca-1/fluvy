import { localize, type HomeAssistant } from '@fluvy/core';
import { html, nothing, type TemplateResult } from 'lit';
import { durationParts, type DurationUnit } from '../shared/duration.js';
import type { Figure } from '../shared/value-row.js';

const word = (hass: HomeAssistant | undefined, unit: DurationUnit): string =>
  localize(hass, unit === 'd' ? 'time.unit_d' : unit === 'h' ? 'time.unit_h' : 'time.unit_min');

/** A span of time as a readout's words ("2 h 10" + "min"), to measure it by; "—" when it is not known. */
export function durationFigure(
  hass: HomeAssistant | undefined,
  label: string,
  seconds: number | null,
): Figure {
  const parts = seconds === null ? null : durationParts(seconds);
  const last = parts?.[parts.length - 1];
  if (!parts || !last) return { label, value: '—', unit: '' };
  const lead = parts.slice(0, -1).map((p) => `${p.value} ${word(hass, p.unit)} `);
  return { label, value: `${lead.join('')}${last.value}`, unit: word(hass, last.unit) };
}

/**
 * A span of time as a readout: "2 h 10 min", each unit in the readout's unit face on the figure's baseline — the
 * last one in the unit slot, as every readout's unit is.
 */
export function durationReadout(
  hass: HomeAssistant | undefined,
  label: string,
  seconds: number | null,
  size: 'xs' | 's' | 'l' = 's',
): TemplateResult {
  const parts = seconds === null ? null : durationParts(seconds);
  const last = parts?.[parts.length - 1];
  const lead = parts?.slice(0, -1) ?? [];
  return html`<div class="fv-readout fv-readout--${size}">
    <p class="fv-readout__label">${label}</p>
    <p class="fv-readout__value">
      <span
        >${lead.map((p) => html`${p.value}<span class="fv-unit">${word(hass, p.unit)}</span> `)}${
          last ? last.value : '—'
        }</span
      >${last ? html`<span class="fv-unit">${word(hass, last.unit)}</span>` : nothing}
    </p>
  </div>`;
}
