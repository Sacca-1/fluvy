import { FluvyMapCard } from '../../../../packages/cards/src/map/map-card.js';
import { FluvyRoomCard } from '../../../../packages/cards/src/room/room-card.js';
import type { StateSeed } from '../hass.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-room-card')) customElements.define('fluvy-room-card', FluvyRoomCard);
if (!customElements.get('fluvy-map-card')) customElements.define('fluvy-map-card', FluvyMapCard);

/** A drawing stands in for the living room's photo: the playground fetches nothing. */
const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9c7a8"/><stop offset="1" stop-color="#8c6f4e"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><rect x="40" y="110" width="150" height="50" rx="10" fill="#5b4632"/><circle cx="250" cy="70" r="30" fill="#f3e6c8" opacity="0.8"/></svg>',
)}`;

const room = (config: Record<string, unknown>) => ({ type: 'custom:fluvy-room-card', ...config });

/*
 * #39's house: four areas, each one temperature and one humidity sensor and nothing else. Garden and guest WC plain;
 * the kitchen's two diagnostic and named in its area's settings; the living room's two hidden. Around it: a sensor
 * that comes late (its registry entry here, its state added by the rooms suite), a thermostat alone, a dead sensor
 * first, and entries the registry has and the house has no state for.
 */
const reading = (id: string, value: string, kind: 'temperature' | 'humidity'): StateSeed => [
  id,
  value,
  {
    friendly_name: id.slice(id.indexOf('.') + 1).replace(/_/g, ' '),
    device_class: kind,
    unit_of_measurement: kind === 'temperature' ? '°C' : '%',
  },
];
const READINGS: readonly StateSeed[] = [
  reading('sensor.rm_garten_temperature', '16.4', 'temperature'),
  reading('sensor.rm_garten_humidity', '92', 'humidity'),
  reading('sensor.rm_gaste_wc_temperature', '22.1', 'temperature'),
  reading('sensor.rm_gaste_wc_humidity', '53', 'humidity'),
  reading('sensor.rm_kuche_temperature', '21.3', 'temperature'),
  reading('sensor.rm_kuche_humidity', '48', 'humidity'),
  reading('sensor.rm_wohnzimmer_temperature', '20.5', 'temperature'),
  reading('sensor.rm_wohnzimmer_humidity', '45', 'humidity'),
  reading('sensor.rm_hall_a_temperature', 'unavailable', 'temperature'),
  reading('sensor.rm_hall_b_temperature', '19.8', 'temperature'),
];
const entry = (entity_id: string, area_id: string, more: Record<string, unknown> = {}) =>
  [entity_id, { entity_id, area_id, ...more }] as const;
/** The reporter's card, each room at half a section. */
const reporter = (area: string) =>
  room({
    area,
    variant: 'photo',
    controls: 'tiles',
    show_count: false,
    show_climate: true,
    path: `/fluvy-auto/room-${area}`,
    cols: 6,
  });

export const sheet: SheetSpec = {
  states: [
    [
      'light.rm_ceiling',
      'on',
      { friendly_name: 'Ceiling', brightness: 178, supported_color_modes: ['brightness'] },
    ],
    [
      'light.rm_reading',
      'off',
      { friendly_name: 'Reading lamp', supported_color_modes: ['brightness'] },
    ],
    ['light.rm_shelf', 'on', { friendly_name: 'Shelf', supported_color_modes: ['onoff'] }],
    ['switch.rm_tv_plug', 'on', { friendly_name: 'TV plug', device_class: 'outlet' }],
    [
      'cover.rm_blinds',
      'open',
      { friendly_name: 'Blinds', current_position: 40, supported_features: 15 },
    ],
    ['media_player.rm_tv', 'off', { friendly_name: 'Living room TV' }],
    [
      'climate.rm_living',
      'heat',
      {
        friendly_name: 'Living room',
        temperature: 21.5,
        current_temperature: 21.4,
        hvac_action: 'heating',
        hvac_modes: ['heat', 'off'],
      },
    ],
    [
      'sensor.rm_living_temperature',
      '21.4',
      {
        friendly_name: 'Living room temperature',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      },
    ],
    [
      'sensor.rm_living_humidity',
      '46',
      { friendly_name: 'Living room humidity', device_class: 'humidity', unit_of_measurement: '%' },
    ],
    ['sensor.rm_dead', 'unavailable', { friendly_name: 'Loft sensor' }],
    ['light.rm_kitchen', 'off', { friendly_name: 'Kitchen', supported_color_modes: ['onoff'] }],
    ['switch.rm_kettle', 'off', { friendly_name: 'Kettle', device_class: 'outlet' }],
    [
      'sensor.rm_kitchen_temperature',
      '22.8',
      {
        friendly_name: 'Kitchen temperature',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      },
    ],
    [
      'light.rm_bedroom',
      'off',
      { friendly_name: 'Bedroom', supported_color_modes: ['brightness'] },
    ],
    [
      'fan.rm_bedroom',
      'on',
      { friendly_name: 'Bedroom fan', percentage: 40, supported_features: 1 },
    ],
    ...READINGS,
    [
      'climate.rm_study',
      'heat',
      {
        friendly_name: 'Study',
        temperature: 21,
        current_temperature: 20.5,
        current_humidity: 44,
        hvac_action: 'heating',
        hvac_modes: ['heat', 'off'],
      },
    ],
    // the den's lights: a blue strip and a red lamp lit, a white one too (#41: a room's lights in their bulbs' colours)
    [
      'light.rm_den_strip',
      'on',
      {
        friendly_name: 'Strip',
        brightness: 255,
        supported_color_modes: ['rgb'],
        color_mode: 'rgb',
        rgb_color: [33, 150, 243],
      },
    ],
    [
      'light.rm_den_lamp',
      'on',
      {
        friendly_name: 'Lamp',
        brightness: 128,
        supported_color_modes: ['hs'],
        color_mode: 'hs',
        hs_color: [4, 78],
        rgb_color: [244, 67, 54],
      },
    ],
    [
      'light.rm_den_ceiling',
      'on',
      {
        friendly_name: 'Ceiling',
        brightness: 200,
        supported_color_modes: ['color_temp'],
        color_mode: 'color_temp',
        color_temp_kelvin: 2700,
        hs_color: [28.4, 65.7],
        rgb_color: [255, 167, 87],
      },
    ],
  ],
  registry: {
    entities: {
      'light.rm_ceiling': { entity_id: 'light.rm_ceiling', area_id: 'rm_living' },
      'light.rm_reading': { entity_id: 'light.rm_reading', area_id: 'rm_living' },
      'light.rm_shelf': { entity_id: 'light.rm_shelf', area_id: 'rm_living' },
      'switch.rm_tv_plug': { entity_id: 'switch.rm_tv_plug', area_id: 'rm_living' },
      'cover.rm_blinds': { entity_id: 'cover.rm_blinds', area_id: 'rm_living' },
      'media_player.rm_tv': { entity_id: 'media_player.rm_tv', area_id: 'rm_living' },
      'climate.rm_living': { entity_id: 'climate.rm_living', area_id: 'rm_living' },
      'sensor.rm_living_temperature': {
        entity_id: 'sensor.rm_living_temperature',
        area_id: 'rm_living',
      },
      'sensor.rm_living_humidity': { entity_id: 'sensor.rm_living_humidity', area_id: 'rm_living' },
      'sensor.rm_dead': { entity_id: 'sensor.rm_dead', area_id: 'rm_living' },
      'light.rm_kitchen': { entity_id: 'light.rm_kitchen', area_id: 'rm_kitchen' },
      'switch.rm_kettle': { entity_id: 'switch.rm_kettle', area_id: 'rm_kitchen' },
      'sensor.rm_kitchen_temperature': {
        entity_id: 'sensor.rm_kitchen_temperature',
        area_id: 'rm_kitchen',
      },
      'light.rm_bedroom': { entity_id: 'light.rm_bedroom', area_id: 'rm_bedroom' },
      'light.rm_den_strip': { entity_id: 'light.rm_den_strip', area_id: 'rm_den' },
      'light.rm_den_lamp': { entity_id: 'light.rm_den_lamp', area_id: 'rm_den' },
      'light.rm_den_ceiling': { entity_id: 'light.rm_den_ceiling', area_id: 'rm_den' },
      'fan.rm_bedroom': { entity_id: 'fan.rm_bedroom', area_id: 'rm_bedroom' },
      ...Object.fromEntries([
        entry('sensor.rm_garten_temperature', 'rm_garten'),
        entry('sensor.rm_garten_humidity', 'rm_garten'),
        entry('sensor.rm_gaste_wc_temperature', 'rm_gaste_wc'),
        entry('sensor.rm_gaste_wc_humidity', 'rm_gaste_wc'),
        entry('sensor.rm_kuche_temperature', 'rm_kuche', { entity_category: 'diagnostic' }),
        entry('sensor.rm_kuche_humidity', 'rm_kuche', { entity_category: 'diagnostic' }),
        entry('sensor.rm_wohnzimmer_temperature', 'rm_wohnzimmer', { hidden: true }),
        entry('sensor.rm_wohnzimmer_humidity', 'rm_wohnzimmer', { hidden: true }),
        entry('sensor.rm_late_temperature', 'rm_late'),
        entry('climate.rm_study', 'rm_study'),
        entry('sensor.rm_hall_a_temperature', 'rm_hall'),
        entry('sensor.rm_hall_b_temperature', 'rm_hall'),
        entry('sensor.rm_store_temperature', 'rm_store'),
        entry('sensor.rm_store_humidity', 'rm_store', { hidden: true }),
      ]),
    },
    areas: {
      rm_living: {
        area_id: 'rm_living',
        name: 'Living room',
        floor_id: 'rm_ground',
        icon: 'mdi:sofa',
        picture: PHOTO,
      },
      rm_kitchen: {
        area_id: 'rm_kitchen',
        name: 'Kitchen',
        floor_id: 'rm_ground',
        icon: 'mdi:silverware-fork-knife',
      },
      rm_bedroom: {
        area_id: 'rm_bedroom',
        name: 'Bedroom',
        floor_id: 'rm_upstairs',
        icon: 'mdi:bed',
      },
      rm_empty: { area_id: 'rm_empty', name: 'Attic' },
      rm_garten: { area_id: 'rm_garten', name: 'Garten', icon: 'mdi:flower' },
      rm_gaste_wc: { area_id: 'rm_gaste_wc', name: 'Gäste-WC', icon: 'mdi:toilet' },
      rm_kuche: {
        area_id: 'rm_kuche',
        name: 'Küche',
        icon: 'mdi:stove',
        temperature_entity_id: 'sensor.rm_kuche_temperature',
        humidity_entity_id: 'sensor.rm_kuche_humidity',
      },
      rm_wohnzimmer: { area_id: 'rm_wohnzimmer', name: 'Wohnzimmer', icon: 'mdi:sofa' },
      rm_late: { area_id: 'rm_late', name: 'Spare room', icon: 'mdi:bed' },
      rm_study: { area_id: 'rm_study', name: 'Study', icon: 'mdi:desk' },
      rm_hall: { area_id: 'rm_hall', name: 'Hall', icon: 'mdi:door' },
      rm_store: { area_id: 'rm_store', name: 'Storeroom', icon: 'mdi:archive' },
      rm_den: { area_id: 'rm_den', name: 'Den', icon: 'mdi:sofa' },
    },
    floors: {
      rm_ground: { floor_id: 'rm_ground', name: 'Ground floor', level: 0 },
      rm_upstairs: { floor_id: 'rm_upstairs', name: 'Upstairs', level: 1 },
    },
  },
  frames: [
    // the approved area anatomy: the photo, the readouts, the category rows
    {
      title: 'Room · photo',
      cards: [room({ area: 'rm_living', path: '/fluvy-auto/room-rm_living' })],
    },
    // its controls as compact tiles instead of rows
    {
      title: 'Room · tiles',
      cards: [room({ area: 'rm_living', controls: 'tiles', path: '/fluvy-auto/room-rm_living' })],
    },
    // no picture: the accent's gradient under the pill; no path, so no chevrons
    { title: 'Room · no photo', cards: [room({ area: 'rm_kitchen' })] },
    // the head and the controls
    {
      title: 'Room · tile',
      cards: [
        room({
          area: 'rm_living',
          variant: 'tile',
          controls: 'tiles',
          path: '/fluvy-auto/room-rm_living',
        }),
      ],
    },
    // a compact tile: two a row
    {
      title: 'Room · rows',
      cards: [
        room({ area: 'rm_living', variant: 'row', cols: 6, path: '/fluvy-auto/room-rm_living' }),
        room({ area: 'rm_bedroom', variant: 'row', cols: 6 }),
      ],
    },
    // an area with nothing in it, and one that is not there
    {
      title: 'Room · empty, missing',
      cards: [room({ area: 'rm_empty' }), room({ area: 'rm_ghost' })],
    },
    // #39 as reported, two a row: the diagnostic sensors the kitchen names are read; the living room's hidden ones are
    // not, and its card keeps the photo, then says why it is empty
    {
      title: 'Room · four areas, two sensors each (#39)',
      cards: ['rm_garten', 'rm_gaste_wc', 'rm_kuche', 'rm_wohnzimmer'].map(reporter),
    },
    // the empty room across the section, photo and tile: the administrator's hint and the way in
    {
      title: 'Room · hidden sensors, why it is empty',
      cards: [
        room({
          area: 'rm_wohnzimmer',
          variant: 'photo',
          show_count: false,
          path: '/fluvy-auto/room-rm_wohnzimmer',
        }),
        room({ area: 'rm_wohnzimmer', variant: 'tile', path: '/fluvy-auto/room-rm_wohnzimmer' }),
      ],
    },
    // the same room for someone who is not an administrator: the panel, no hint
    {
      title: 'Room · hidden sensors, not an administrator',
      cards: [room({ area: 'rm_wohnzimmer', variant: 'tile' })],
      hass: (hass) => ({ ...hass, user: { ...hass.user!, is_admin: false } }),
    },
    // a sensor whose state is not there yet (Home Assistant starting): the rooms suite adds it, the card fills
    {
      title: 'Room · a sensor that arrives late',
      cards: [room({ area: 'rm_late', variant: 'photo', show_count: false })],
    },
    // a thermostat alone: the room's readings are its own
    { title: 'Room · thermostat only', cards: [room({ area: 'rm_study', variant: 'photo' })] },
    // the first sensor dead, the second working: the working one is read
    {
      title: 'Room · unavailable first',
      cards: [room({ area: 'rm_hall', variant: 'photo', show_count: false })],
    },
    // entries the registry has and the house has no state for: empty, and nothing counted
    { title: 'Room · registry without state', cards: [room({ area: 'rm_store' })] },
    // a room's lights in their bulbs' colours (`light_colors`): its tiles each its own, its lights' row the colour of
    // what is lit, by brightness (the white adds none)
    {
      title: 'Room · bulb colours',
      cards: [
        room({ area: 'rm_den', variant: 'tile', controls: 'tiles', light_colors: true }),
        room({ area: 'rm_den', variant: 'tile', light_colors: true }),
      ],
    },
  ],
};
