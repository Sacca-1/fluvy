import type { SheetSpec } from '../scenes.js';

/**
 * The measurer's own fixtures (`?sheet=measurer`): one frame per rule of text and targets, drawn so the rule must
 * break, and one frame that breaks none. Its title starts with the rule (`overlap · …`, `clean · …`), and
 * tools/render/measure-fixtures.mjs holds every frame to it. Not a sheet of the sweeps (it lives outside ./sheets) and
 * never on the demo: a fixture is wrong on purpose.
 */
class Fixture extends HTMLElement {
  setConfig(config: { html?: string; css?: string }): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${BASE}${config.css ?? ''}</style>${config.html ?? ''}`;
  }
  set hass(_: unknown) {}
  getCardSize(): number {
    return 1;
  }
}
if (!customElements.get('pg-fixture')) customElements.define('pg-fixture', Fixture);

/** A card's skin on the 4 grid: 16 inside, a 24 line. */
const BASE = `
:host { display: block; }
.fx-card {
  box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; padding: 16px;
  border-radius: 16px; background: var(--fluvy-card); color: var(--fluvy-text-primary);
  font: 400 16px/24px Inter, sans-serif;
}
p { margin: 0; }
.fx-row { display: flex; align-items: center; gap: 12px; }
.fx-figure { flex: 1 1 0; min-width: 0; font-size: 40px; line-height: 48px; font-weight: 600; white-space: nowrap; }
.fx-stepper { flex: 0 0 auto; position: relative; z-index: 1; width: 96px; height: 44px; border-radius: 24px; background: var(--fluvy-page); }
.fx-head { position: relative; display: flex; align-items: center; gap: 12px; height: 56px; }
.fx-title { flex: 1 1 0; min-width: 0; margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.fv-card__tap { all: unset; font: inherit; }
.fv-card__tap::after { content: ''; position: absolute; inset: 0; }
.fx-round { position: relative; z-index: 1; flex: 0 0 auto; width: 44px; height: 44px; border: 0; border-radius: 24px; background: var(--fluvy-page); }
`;

const card = (html: string, css = ''): { type: string; html: string; css: string } => ({
  type: 'custom:pg-fixture',
  html: `<article class="fx-card">${html}</article>`,
  css,
});

export const sheet: SheetSpec = {
  states: [['sensor.fixture', '21.5', { friendly_name: 'Fixture', unit_of_measurement: '°C' }]],
  frames: [
    {
      title: 'overlap · a figure under its stepper',
      cards: [
        card(
          '<div class="fx-row"><p class="fx-figure">12 345,6 kWh</p><span class="fx-stepper" data-control></span></div>',
        ),
      ],
    },
    {
      title: 'overlap · a label over its value',
      cards: [
        card(
          '<div class="fv-readout"><p>Target</p><p class="fx-value">21,5</p></div>',
          '.fx-value { margin-top: -16px; font-size: 32px; line-height: 40px; }',
        ),
      ],
    },
    {
      title: 'pill-cut · a name its pill cannot hold',
      cards: [
        card(
          '<p><span class="fx-pill" data-fit="28"><span class="fx-name" data-name>Wohnzimmerdeckenleuchte</span></span></p>',
          `.fx-pill { box-sizing: border-box; display: inline-flex; align-items: center; max-width: 96px; height: 36px;
             padding: 0 14px; border-radius: 20px; background: var(--fluvy-page); }
           .fx-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
        ),
      ],
    },
    {
      title: 'clipped · a second line its box cuts off',
      cards: [
        card(
          '<div class="fx-clip"><p>Waschmittel nachfüllen und die Tür schließen</p></div>',
          '.fx-clip { width: 160px; height: 24px; overflow: hidden; }',
        ),
      ],
    },
    {
      title: 'raw-key · a word that never arrived',
      cards: [card('<p>wall.back_to</p>')],
    },
    {
      title: 'raw-key · a key with an underscore, whatever its namespace',
      cards: [card('<p>hallway.light_off</p>')],
    },
    {
      title: 'midword · a name broken inside a word',
      cards: [
        card(
          '<p class="fx-narrow" data-name>Restart Home Assistant</p>',
          '.fx-narrow { width: 52px; overflow-wrap: anywhere; }',
        ),
      ],
    },
    {
      title: 'midword · a figure parted from its unit',
      cards: [
        card(
          '<p class="fx-narrow">36\u202f%</p>',
          '.fx-narrow { width: 20px; overflow-wrap: anywhere; }',
        ),
      ],
    },
    {
      title: 'cut-figure · a rain chance cut to one digit',
      cards: [
        card(
          '<p class="fx-sub">Schauer · 60\u202f%</p>',
          '.fx-sub { width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        ),
      ],
    },
    {
      title: 'cut-figure · a reading its flex box clips without an ellipsis',
      cards: [
        card(
          '<p class="fx-pill">21,5\u202f°C</p>',
          '.fx-pill { display: flex; width: 32px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        ),
      ],
    },
    {
      title: 'cut-figure · a status line its title does not excuse, cut on its number',
      cards: [
        card(
          '<p class="fx-line" title="Préchauffage 76 %">Préchauffage 76 %</p>',
          '.fx-line { width: 128px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        ),
      ],
    },
    {
      title: 'cut-figure · a title excuses a name’s words, never its figure',
      cards: [
        card(
          '<p class="fx-cut" title="Eco 50 °C">Eco 50 °C</p>',
          '.fx-cut { width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        ),
      ],
    },
    {
      title: 'cut-word · a status line is no name, whatever its title says',
      cards: [
        card(
          '<p class="fx-sub" title="Maschinenpflege starten">Maschinenpflege starten</p>',
          '.fx-sub { width: 112px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        ),
      ],
    },
    {
      title: 'cut-word · a caption that is no name',
      cards: [
        card(
          '<p class="fx-sub">Demain · 2 événements · 08:15</p>',
          '.fx-sub { width: 108px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        ),
      ],
    },
    {
      title: 'cut-word · a state its line clamp ends',
      cards: [
        card(
          '<p class="fx-clamp">Niet gedetecteerd sinds gisteren</p>',
          `.fx-clamp { width: 96px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
             overflow: hidden; }`,
        ),
      ],
    },
    {
      title: 'collision · weekdays laid over each other',
      cards: [
        card(
          '<div class="fx-week"><span>Mon</span><span>Tue</span><span>Wed</span></div>',
          `.fx-week { display: grid; grid-template-columns: repeat(3, 24px); }
           .fx-week span { display: flex; justify-content: center; font-weight: 600; white-space: nowrap; }`,
        ),
      ],
    },
    {
      title: 'head-target · a switch that leaves the head no room',
      cards: [
        card(
          '<div class="fx-head"><h3 class="fx-title"><button class="fv-card__tap">Lamp</button></h3><button class="fx-switch" data-control data-target></button></div>',
          '.fx-switch { position: relative; z-index: 1; flex: 0 0 auto; width: 296px; height: 44px; border: 0; border-radius: 24px; background: var(--fluvy-page); }',
        ),
      ],
    },
    {
      title: 'clean · what the rules let pass',
      cards: [
        card(
          `<div class="fx-head"><h3 class="fx-title"><button class="fv-card__tap">sensor.fixture</button></h3><button class="fx-round" data-control data-target></button></div>
           <div class="fx-row"><div class="fv-readout"><p>Target</p><p class="fx-figure">21,5 °C</p></div><span class="fx-stepper" data-control></span></div>
           <p><span class="fx-pill" data-fit="28"><span class="fx-name" data-name>Kitchen</span></span></p>`,
          `.fx-pill { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
             width: 96px; height: 36px; padding: 0 16px; border-radius: 20px; background: var(--fluvy-page); }
           .fx-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
        ),
      ],
    },
    {
      title: 'clean · names end in their ellipsis, prose wraps between words, figures hold',
      cards: [
        card(
          `<p class="fx-cut" data-name title="Wohnzimmerdeckenleuchte">Wohnzimmerdeckenleuchte</p>
           <p class="fx-cut" title="Esszimmer Stehlampe">Esszimmer Stehlampe</p>
           <p class="fx-cut fx-house">Fixture</p>
           <p class="fx-clamp">Call the plumber about the kitchen tap that keeps dripping all night long, again</p>
           <p class="fx-prose">Noch nichts in diesem Raum, 2 ausgeblendete oder Diagnose-Entitäten</p>
           <p class="fx-figure">36\u202f% · 21,5\u202f°C</p>
           <div class="fx-week"><span>L</span><span>M</span><span>M</span></div>`,
          `.fx-cut { width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
           .fx-house { width: 40px; }
           .fx-clamp { width: 160px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
             overflow: hidden; }
           .fx-prose { width: 160px; overflow-wrap: anywhere; }
           .fx-figure { white-space: nowrap; }
           .fx-week { display: grid; grid-template-columns: repeat(3, 24px); }
           .fx-week span { display: flex; justify-content: center; font-weight: 600; }`,
        ),
      ],
    },
    {
      title: 'clean · a 12-hour time is no key',
      cards: [
        card(
          '<p>9:41 <span>p.m.</span></p><p><span>a.m.</span> · <span>e.g.</span> · <span>example.org</span></p>',
          'p { white-space: nowrap; }',
        ),
      ],
    },
  ],
};
