import { FluvyChipsCard } from '../../../../packages/cards/src/chips/chips-card.js';
import { FluvyHeadingCard } from '../../../../packages/cards/src/heading/heading-card.js';
import { FluvyHelloCard } from '../../../../packages/cards/src/hello/hello-card.js';
import { FluvyNowPlayingCard } from '../../../../packages/cards/src/now-playing/now-playing-card.js';
import { FluvyReadoutsCard } from '../../../../packages/cards/src/readouts/readouts-card.js';
import { FluvySceneCard } from '../../../../packages/cards/src/scene/scene-card.js';
import type { LovelaceCardConfig } from '@fluvy/core';
import { NOW } from '../now.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-hello-card'))
  customElements.define('fluvy-hello-card', FluvyHelloCard);
if (!customElements.get('fluvy-chips-card'))
  customElements.define('fluvy-chips-card', FluvyChipsCard);
if (!customElements.get('fluvy-heading-card'))
  customElements.define('fluvy-heading-card', FluvyHeadingCard);
if (!customElements.get('fluvy-scene-card'))
  customElements.define('fluvy-scene-card', FluvySceneCard);
if (!customElements.get('fluvy-readouts-card'))
  customElements.define('fluvy-readouts-card', FluvyReadoutsCard);
if (!customElements.get('fluvy-now-playing-card'))
  customElements.define('fluvy-now-playing-card', FluvyNowPlayingCard);

/* supported_features bits of media_player */
const PAUSE = 1,
  SEEK = 2,
  VOLUME_SET = 4,
  VOLUME_MUTE = 8,
  PREVIOUS = 16,
  NEXT = 32,
  TURN_ON = 128,
  TURN_OFF = 256,
  PLAY = 16384;
const SPEAKER =
  PAUSE | SEEK | VOLUME_SET | VOLUME_MUTE | PREVIOUS | NEXT | TURN_ON | TURN_OFF | PLAY;

/** Pictures are data URIs: the playground never reaches out to the network. */
const plate = (from: string, to: string): string =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="72" cy="66" r="42" fill="#ffffff" opacity="0.22"/><circle cx="168" cy="186" r="66" fill="#000000" opacity="0.12"/></svg>`,
  );

/** The position is anchored to the real clock: the card advances it once a second while playing. */
const anchor = new Date().toISOString();
/** The greeting is frozen on the sheet's evening (the `_now` test hook), so every render says the same thing. */
const EVENING = '2026-09-17T21:47:12';

type Placed = LovelaceCardConfig & { cols?: number };

const hello = (config: Record<string, unknown>): Placed => ({
  type: 'custom:fluvy-hello-card',
  _now: EVENING,
  ...config,
});
const heading = (config: Record<string, unknown>): Placed => ({
  type: 'custom:fluvy-heading-card',
  ...config,
});
const scene = (entity: string, icon?: string, name?: string): Placed => ({
  type: 'custom:fluvy-scene-card',
  entity,
  ...(icon ? { icon } : {}),
  ...(name ? { name } : {}),
  cols: 6,
});
const readouts = (config: Record<string, unknown>): Placed => ({
  type: 'custom:fluvy-readouts-card',
  ...config,
});
const player = (entity: string): Placed => ({ type: 'custom:fluvy-now-playing-card', entity });

const ROOMS = [
  { label: 'All', path: '/' },
  { label: 'Living', path: '/fluvy-home/living' },
  { label: 'Kitchen', path: '/fluvy-home/kitchen' },
  { label: 'Bedroom', path: '/fluvy-home/bedroom' },
];
const MORE_ROOMS = ['Bathroom', 'Hall', 'Garage', 'Garden'].map((label) => ({
  label,
  path: `/fluvy-home/${label.toLowerCase()}`,
}));

export const sheet: SheetSpec = {
  states: [
    /* the evening of the sheet */
    [
      'sun.sun',
      'below_horizon',
      // the sun's next events as Home Assistant reports them: tomorrow's rising at 07:52, setting at 20:17
      {
        friendly_name: 'Sun',
        next_rising: new Date(NOW.getTime() + (10 * 60 + 5) * 60_000).toISOString(),
        next_setting: new Date(NOW.getTime() + (22 * 60 + 30) * 60_000).toISOString(),
        rising: false,
      },
    ],
    [
      'weather.flat',
      'clear-night',
      { friendly_name: 'Flat', temperature: 18, temperature_unit: '°C' },
    ],
    [
      'weather.sunny_after_dark',
      'sunny',
      { friendly_name: 'Coast', temperature: 17.6, temperature_unit: '°C' },
    ],
    [
      'weather.clouds',
      'partlycloudy',
      { friendly_name: 'Hills', temperature: -3, temperature_unit: '°C' },
    ],
    ['weather.no_temperature', 'rainy', { friendly_name: 'Valley', temperature: null }],
    ['weather.broken', 'unavailable', { friendly_name: 'Rooftop' }],
    [
      'person.marta',
      'home',
      // the mock's signed-in user is Marta (u1): her person carries her user id, as Home Assistant's people do
      { friendly_name: 'Marta', entity_picture: plate('#b08d57', '#e6d2ae'), user_id: 'u1' },
    ],
    ['person.ana', 'not_home', { friendly_name: 'Ana Ruiz' }],

    /* scenes: a scene keeps the time it last ran in its state, a script or automation in an attribute */
    [
      'scene.evening',
      '2026-09-17T20:14:00+00:00',
      {
        friendly_name: 'Evening',
        entity_id: ['light.a', 'light.b', 'light.c', 'switch.d', 'cover.e'],
      },
    ],
    [
      'scene.cinema',
      '2026-09-16T21:02:00+00:00',
      { friendly_name: 'Cinema', entity_id: ['light.a', 'light.b', 'switch.c', 'media_player.d'] },
    ],
    ['scene.hue_relax', 'unknown', { friendly_name: 'Relax' }],
    ['scene.away', 'unavailable', { friendly_name: 'Away' }],
    [
      'script.goodnight',
      'off',
      {
        friendly_name: 'Good night',
        last_triggered: new Date(Date.now() - 2 * 3600_000).toISOString(),
      },
    ],
    [
      'automation.wake',
      'on',
      {
        friendly_name: 'Wake up',
        last_triggered: new Date(Date.now() - 15 * 3600_000).toISOString(),
      },
    ],
    [
      'button.doorbell_chime',
      new Date(Date.now() - 3 * 86_400_000).toISOString(),
      { friendly_name: 'Chime' },
    ],
    [
      'scene.long_name',
      '2026-09-17T18:00:00+00:00',
      {
        friendly_name: 'Evening wind-down for the whole family',
        entity_id: ['light.a', 'light.b'],
      },
    ],

    /* the stats strip */
    [
      'sensor.living_temperature',
      '20.8',
      { friendly_name: 'Temperature', unit_of_measurement: '°C', device_class: 'temperature' },
    ],
    [
      'sensor.living_humidity',
      '46',
      { friendly_name: 'Humidity', unit_of_measurement: '%', device_class: 'humidity' },
    ],
    [
      'sensor.home_power',
      '1.8',
      { friendly_name: 'Power', unit_of_measurement: 'kW', device_class: 'power' },
    ],
    [
      'sensor.cellar_damp',
      'unavailable',
      { friendly_name: 'Cellar', unit_of_measurement: '%', device_class: 'humidity' },
    ],
    [
      'sensor.quiet_pressure',
      '1013',
      { friendly_name: 'Pressure', unit_of_measurement: 'hPa', device_class: 'pressure' },
    ],
    [
      'sensor.new_co2',
      '612',
      { friendly_name: 'CO₂', unit_of_measurement: 'ppm', device_class: 'carbon_dioxide' },
    ],
    ['sensor.washer', 'Rinsing', { friendly_name: 'Washer' }],

    /* the compact player */
    [
      'media_player.kitchen_speaker',
      'playing',
      {
        friendly_name: 'Kitchen speaker',
        media_title: 'Midnight Coda',
        media_artist: 'Ola Gjeilo',
        media_duration: 222,
        media_position: 84,
        media_position_updated_at: anchor,
        volume_level: 0.42,
        entity_picture: plate('#8a6a3a', '#e0cba4'),
        supported_features: SPEAKER,
      },
    ],
    [
      'media_player.den',
      'paused',
      {
        friendly_name: 'Den',
        media_title: 'The Glass Hotel',
        media_artist: 'Emily St. John Mandel',
        media_duration: 1840,
        media_position: 622,
        media_position_updated_at: anchor,
        is_volume_muted: true,
        supported_features: SPEAKER,
      },
    ],
    [
      'media_player.radio',
      'playing',
      {
        friendly_name: 'Bathroom radio',
        media_title: 'Radio 3',
        media_artist: null,
        media_duration: null,
        media_position: null,
        supported_features: PAUSE | PLAY | VOLUME_SET,
      },
    ],
    ['media_player.hall', 'idle', { friendly_name: 'Hall speaker', supported_features: SPEAKER }],
    ['media_player.patio_old', 'unavailable', { friendly_name: 'Patio speaker' }],
    [
      'media_player.long',
      'playing',
      {
        friendly_name: 'Upstairs landing speaker pair',
        media_title: 'Symphony No. 9 in E minor, “From the New World”: II. Largo',
        media_artist: 'Antonín Dvořák · Berliner Philharmoniker',
        media_duration: 5025,
        media_position: 3904,
        media_position_updated_at: anchor,
        supported_features: SPEAKER,
      },
    ],

    /* what a section heading counts */
    ['light.hall_lamp', 'on', { friendly_name: 'Hall lamp' }],
    ['light.hall_strip', 'off', { friendly_name: 'Hall strip' }],
    ['switch.hall_fan', 'on', { friendly_name: 'Hall fan' }],
    ['cover.hall_blind', 'closed', { friendly_name: 'Hall blind', current_position: 0 }],
  ],

  /* six hours of readings: the trend arrow is earned from these, never drawn by hand. `sensor.new_co2` has none. */
  history: {
    'sensor.living_temperature': [
      19.4, 19.4, 19.5, 19.6, 19.8, 20, 20.1, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8,
    ],
    'sensor.living_humidity': [58, 57, 56, 54, 52, 50, 49, 48, 47, 47, 46, 46, 46],
    'sensor.home_power': [0.4, 0.3, 0.3, 0.5, 1.2, 0.9, 1.1, 1.4, 1.2, 1.6, 1.7, 1.9, 1.8],
    /* a front went through and the needle is back where it started: 0.1 of a 20 hPa range is under 1 %, so no arrow */
    'sensor.quiet_pressure': [
      1013.1, 1013.1, 1013.1, 1005, 1000, 1008, 1015, 1020, 1016, 1014, 1013, 1013,
    ],
  },

  frames: [
    {
      title: 'A Home',
      width: 360, // the sheet's own column: four room tabs on one line and two 172 scene tiles (a half column is only on the 4 px grid at some widths — see D)
      cards: [
        hello({ name: 'Marta', person: 'person.marta', weather: 'weather.flat' }),
        { type: 'custom:fluvy-chips-card', chips: ROOMS },
        heading({
          title: 'Living room',
          icon: 'fluvy:home',
          meta: '4 devices',
          path: '/fluvy-home/living',
        }),
        player('media_player.kitchen_speaker'),
        readouts({
          entities: ['sensor.living_temperature', 'sensor.living_humidity', 'sensor.home_power'],
        }),
        heading({ title: 'Scenes', icon: 'mdi:sofa', meta: 'Edit' }),
        heading({
          title: 'A very long section title that has to give way',
          icon: 'fluvy:bulb',
          meta: '12 devices',
          path: '/fluvy-home/all',
        }),
        scene('scene.evening', 'moon'),
        scene('scene.cinema', 'film'),
      ],
    },
    {
      title: 'B Greeting',
      cards: [
        hello({ name: 'Marta' }),
        hello({ person: 'person.ana', weather: 'weather.broken' }),
        hello({ name: 'Marta', weather: 'weather.gone', _now: '2026-09-17T07:12:00' }),
        hello({ weather: 'weather.sunny_after_dark', _now: '2026-09-17T14:05:00' }),
        hello({ name: 'Marta', weather: 'weather.clouds', _now: '2026-09-17T23:30:00' }),
        hello({ name: 'Marta', weather: 'weather.no_temperature' }),
      ],
    },
    // a new card names no one: it greets whoever is signed in (Marta, her picture); a fixed person stays fixed
    {
      title: 'B Greeting · whoever is signed in',
      cards: [hello({ weather: 'weather.flat' }), hello({ person: 'person.ana' })],
    },
    // the greeting without its avatar, its date or its weather
    {
      title: 'B Greeting · bare',
      cards: [
        hello({
          name: 'Marta',
          person: 'person.marta',
          weather: 'weather.flat',
          show_weather: false,
          show_date: false,
          show_avatar: false,
        }),
        hello({ name: 'Marta', weather: 'weather.flat', show_avatar: false }),
        hello({
          name: 'Marta',
          person: 'person.marta',
          tap_action: { action: 'navigate', navigation_path: '/profile' },
        }),
      ],
    },
    {
      title: 'C Sections',
      cards: [
        heading({
          title: 'Hall',
          entities: ['light.hall_lamp', 'light.hall_strip', 'switch.hall_fan', 'cover.hall_blind'],
          path: '/fluvy-home/hall',
        }),
        heading({ title: 'Off hours', entities: ['light.hall_strip', 'cover.hall_blind'] }),
        heading({
          title: 'Blind',
          entities: ['cover.hall_blind'],
          tap_action: { action: 'more-info', entity: 'cover.hall_blind' },
        }),
        heading({ title: 'Scenes' }),
        {
          // a set that fits a 260 column on one line (a tab row never wraps: the overflow case is the stress frame)
          type: 'custom:fluvy-chips-card',
          label: 'Shortcuts',
          chips: [
            { label: 'Home', icon: 'home', path: '/' },
            { label: 'Energy', path: '/fluvy-home/energy' },
            { label: 'Blind', icon: 'blinds', entity: 'cover.hall_blind' },
          ],
        },
      ],
    },
    // a plain heading is the title alone, 24 tall: no meta, no chevron, whatever it was given
    {
      title: 'C Sections · plain',
      cards: [
        heading({ title: 'Scenes', variant: 'plain' }),
        heading({
          title: 'Hall',
          icon: 'fluvy:home',
          variant: 'plain',
          entities: ['light.hall_lamp', 'light.hall_strip'],
          path: '/fluvy-home/hall',
        }),
        heading({ title: 'Garden', subtitle: 'Edit', variant: 'plain' }),
      ],
    },
    // a page's section title (`heading_style: title`), 32 tall: where the row is short the link's words give way,
    // then the title's size (27 → 20), then the chevron, before a title ends in its ellipsis
    {
      title: 'C Sections · title',
      cards: [
        heading({
          title: 'Large appliances',
          icon: 'fluvy:dishwasher',
          subtitle: 'All appliances',
          path: '/fluvy-home/appliances',
          heading_style: 'title',
        }),
        heading({
          title: 'Hall',
          heading_style: 'title',
          entities: ['light.hall_lamp', 'light.hall_strip', 'switch.hall_fan', 'cover.hall_blind'],
        }),
        heading({
          title: 'Living room, kitchen and the hall upstairs',
          icon: 'fluvy:home',
          heading_style: 'title',
          subtitle: '18 devices',
          path: '/fluvy-home/all',
        }),
        heading({ title: 'Scenes', icon: 'mdi:sofa', heading_style: 'title', variant: 'plain' }),
      ],
    },
    {
      title: 'D Scenes · 148',
      width: 312, // the tightest half column on the 4 px grid: the tile closes its padding and lets a name take two lines
      cards: [
        scene('script.goodnight'),
        scene('automation.wake'),
        scene('button.doorbell_chime', 'note'),
        scene('scene.hue_relax', 'leaf'),
        scene('scene.away', 'away'),
        scene('scene.gone', 'moon', 'Missing'),
        { ...scene('scene.evening', 'moon'), tone: 'light', meta: 'Living room' },
        { ...scene('scene.cinema', 'film'), meta: '' },
      ],
    },
    {
      title: 'D Scenes · 236',
      width: 488,
      cards: [
        scene('script.goodnight'),
        scene('scene.hue_relax', 'leaf'),
        scene('scene.away', 'away'),
        { ...scene('scene.cinema', 'film'), meta: '' },
        { ...scene('scene.evening', 'moon'), subtitle: 'Living room', show_subtitle: false },
      ],
    },
    {
      title: 'E Readouts',
      cards: [
        readouts({
          entities: ['sensor.living_temperature', 'sensor.cellar_damp', 'sensor.home_power'],
        }),
        readouts({ entities: ['sensor.quiet_pressure', 'sensor.new_co2'] }),
        readouts({ rows: [{ entity: 'sensor.home_power', name: 'Right now' }] }),
        readouts({
          rows: [
            { entity: 'sensor.living_temperature', name: 'Living' },
            { entity: 'sensor.living_humidity' },
            'sensor.home_power',
            'sensor.quiet_pressure',
          ],
          hours: 12,
        }),
        readouts({ entities: ['sensor.gone', 'sensor.washer', 'sensor.living_humidity'] }),
      ],
    },
    // four readouts on one row where they fit (a grid pairs them two by two); a readout can answer its own tap
    {
      title: 'E Readouts · row',
      width: 480,
      cards: [
        readouts({
          variant: 'row',
          rows: [
            { entity: 'sensor.living_temperature', name: 'Living' },
            'sensor.living_humidity',
            {
              entity: 'sensor.home_power',
              tap_action: { action: 'navigate', navigation_path: '/energy' },
            },
            'sensor.quiet_pressure',
          ],
        }),
        readouts({
          entities: [
            'sensor.living_temperature',
            'sensor.living_humidity',
            'sensor.home_power',
            'sensor.quiet_pressure',
          ],
        }),
      ],
    },
    {
      title: 'F Player',
      cards: [
        player('media_player.den'),
        player('media_player.radio'),
        player('media_player.hall'),
        player('media_player.patio_old'),
        player('media_player.gone'),
      ],
    },
    {
      title: 'Stress · overflow',
      measure: false,
      cards: [
        {
          type: 'custom:fluvy-chips-card',
          chips: [
            ...ROOMS,
            ...MORE_ROOMS,
            { label: 'Downstairs guest bathroom', path: '/fluvy-home/guest' },
          ],
        },
        {
          type: 'custom:fluvy-chips-card',
          chips: [
            ...ROOMS.map((room) => ({ ...room, path: `${room.path}-x` })),
            ...MORE_ROOMS,
            { label: 'Attic', path: '/' },
          ],
        },
        hello({ name: 'Maximiliano Bartolomé', person: 'person.ana', weather: 'weather.clouds' }),
        heading({
          title: 'Living room, kitchen and the hall upstairs',
          meta: '18 devices',
          path: '/fluvy-home/all',
        }),
        heading({
          title: 'Garden',
          meta: 'Everything that runs on the irrigation schedule this week',
        }),
        scene('scene.long_name', 'moon'),
        { ...scene('scene.cinema', 'film'), meta: 'Projector, blinds, amplifier and four lights' },
        readouts({
          rows: [
            { entity: 'sensor.living_temperature', name: 'Living room temperature' },
            { entity: 'sensor.quiet_pressure', name: 'Atmospheric pressure' },
            { entity: 'sensor.new_co2', name: 'Carbon dioxide' },
          ],
        }),
        player('media_player.long'),
      ],
    },
  ],
};
