#!/usr/bin/env node
/**
 * The playground's stand-in answers as Home Assistant does: history for every entity asked, statistics by period and
 * over a window, what an item relates to, the repairs, stored data and its subscriptions, events by type — and a
 * sheet's own answers asked first, joined with the house's. Its registries stay the same objects while only the
 * states change, as Home Assistant's do. Each check builds its own house in the page (`createHass`).
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-mock.mjs
 */
import { startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;
const page = await suite.sheet('rooms');

const results = await page.evaluate(async () => {
  const { createHass } = await import('/src/hass.ts');
  const HOUR = 3_600_000;
  const out = {};
  const tick = (ms = 60) => new Promise((done) => setTimeout(done, ms));

  // history: every id asked, a series spread over the window, and none for an id without one
  {
    const mock = createHass([], { history: { 'sensor.a': [1, 2, 3], 'sensor.b': [4, 5] } });
    const answer = await mock.hass().callWS({
      type: 'history/history_during_period',
      start_time: new Date(Date.now() - 6 * HOUR).toISOString(),
      end_time: new Date().toISOString(),
      entity_ids: ['sensor.a', 'sensor.b', 'sensor.c'],
    });
    out.history = Object.fromEntries(
      Object.entries(answer).map(([id, rows]) => [id, rows.map((row) => row.s).join(',')]),
    );
  }

  // statistics: a counter's gains by the hour, a day's gain is its hours', a window's gain is its rows'
  {
    const hourly = Array.from({ length: 72 }, (_, i) => 100 + i * (i % 3)); // readings, oldest first
    const mock = createHass([], {
      statistics: {
        'sensor.meter': { kind: 'counter', hourly },
        'sensor.temp': { kind: 'measurement', hourly: hourly.map((v) => v / 10) },
      },
    });
    const hass = mock.hass();
    const last = Math.floor(Date.now() / HOUR) * HOUR;
    const ask = (period, ids, types) =>
      hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(last - 48 * HOUR).toISOString(),
        end_time: new Date(last).toISOString(),
        statistic_ids: ids,
        period,
        types,
      });
    const hours = (await ask('hour', ['sensor.meter', 'sensor.none'], ['change']))['sensor.meter'];
    const days = (await ask('day', ['sensor.meter'], ['change', 'state']))['sensor.meter'];
    const means = (await ask('day', ['sensor.temp'], ['mean', 'min', 'max']))['sensor.temp'];
    const gains = hourly.slice(-48).map((v, i, all) => v - (all[i - 1] ?? hourly.at(-49)));
    out.hours = {
      count: hours.length,
      changes: hours.map((row) => row.change).join(','),
      expected: gains.join(','),
      none: 'sensor.none' in (await ask('hour', ['sensor.none'], ['change'])),
      ends: hours.at(-1).end === last,
    };
    out.days = {
      sum: days.reduce((sum, row) => sum + row.change, 0),
      expected: gains.reduce((sum, v) => sum + v, 0),
      state: days.at(-1).state === hourly.at(-1),
      midnight: days.every((row) => new Date(row.start).getHours() === 0 || row === days[0]),
    };
    out.means = means.every(
      (row) => row.min <= row.mean && row.mean <= row.max && !('change' in row),
    );
    const window = await hass.callWS({
      type: 'recorder/statistic_during_period',
      statistic_id: 'sensor.meter',
      fixed_period: {
        start_time: new Date(last - 2 * HOUR).toISOString(),
        end_time: new Date(last).toISOString(),
      },
      types: ['change'],
    });
    out.window = { change: window.change, expected: gains.at(-1) + gains.at(-2) };
    const today = await hass.callWS({
      type: 'recorder/statistic_during_period',
      statistic_id: 'sensor.meter',
      calendar: { period: 'day' },
      types: ['change'],
    });
    const midnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const sinceMidnight = (last - midnight) / HOUR;
    out.today = {
      change: today.change ?? 0,
      expected: sinceMidnight ? gains.slice(-sinceMidnight).reduce((sum, v) => sum + v, 0) : 0,
    };
  }

  // a sheet's answers first, joined with the house's: statistics id by id, related items kind by kind
  {
    const mock = createHass([], {
      statistics: { 'sensor.house': { kind: 'counter', hourly: [1, 2, 3] } },
      registry: {
        entities: {
          'light.lamp': { entity_id: 'light.lamp', device_id: 'd1', platform: 'hue' },
        },
        devices: { d1: { id: 'd1', area_id: 'kitchen' } },
        areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen' } },
      },
      ws: {
        'recorder/statistics_during_period': () => ({
          'sensor.sheet': [{ start: 0, end: 1, change: 7 }],
        }),
        'search/related': (message) =>
          message.item_id === 'light.lamp' ? { automation: ['automation.evening'] } : undefined,
        'energy/get_prefs': () => undefined, // the sheet's alone: its answer, even an empty one, is the answer
      },
    });
    const hass = mock.hass();
    const stats = await hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: new Date(Date.now() - 6 * HOUR).toISOString(),
      statistic_ids: ['sensor.sheet', 'sensor.house'],
      period: 'hour',
      types: ['change'],
    });
    out.joined = Object.keys(stats).sort().join(',');
    out.related = {
      entity: await hass.callWS({
        type: 'search/related',
        item_type: 'entity',
        item_id: 'light.lamp',
      }),
      device: await hass.callWS({ type: 'search/related', item_type: 'device', item_id: 'd1' }),
      area: await hass.callWS({ type: 'search/related', item_type: 'area', item_id: 'kitchen' }),
    };
    out.sheetOnly = (await hass.callWS({ type: 'energy/get_prefs' })) === undefined;
    // a subscription the table answers: sent once, the answer itself (never a promise)
    let sent;
    await hass.connection.subscribeMessage((message) => (sent = message), {
      type: 'recorder/statistics_during_period',
      statistic_ids: ['sensor.sheet'],
      period: 'hour',
    });
    await tick();
    out.subscribed = !!sent && typeof sent.then !== 'function' && 'sensor.sheet' in sent;
    out.unhandled = await hass
      .callWS({ type: 'nothing/here' })
      .then(() => 'answered')
      .catch(() => 'refused');
    out.calls = mock.wsCalls.map((call) => call.type).includes('search/related');
  }

  // the repairs, and the event that says they changed, to whoever listens to that type alone
  {
    const issue = { domain: 'hue', issue_id: 'bridge', severity: 'warning' };
    const mock = createHass([], { issues: [issue] });
    const hass = mock.hass();
    const heard = [];
    await hass.connection.subscribeEvents(
      (event) => heard.push(event.event_type),
      'repairs_issue_registry_updated',
    );
    mock.issues.push({ domain: 'zha', issue_id: 'radio', severity: 'error' });
    mock.fire('automation_reloaded');
    mock.fire('repairs_issue_registry_updated', { action: 'create' });
    const { issues } = await hass.callWS({ type: 'repairs/list_issues' });
    out.repairs = { ids: issues.map((i) => i.issue_id).join(','), heard: heard.join(',') };
  }

  // stored data: what is there, then every write to that key; the house's takes an admin
  {
    const mock = createHass([], { data: { user: { 'fluvy-alerts': { snoozed: ['a'] } } } });
    const hass = mock.hass();
    const values = [];
    const off = await hass.connection.subscribeMessage((message) => values.push(message.value), {
      type: 'frontend/subscribe_user_data',
      key: 'fluvy-alerts',
    });
    await tick(10);
    await hass.callWS({
      type: 'frontend/set_user_data',
      key: 'fluvy-alerts',
      value: { snoozed: [] },
    });
    await hass.callWS({ type: 'frontend/set_user_data', key: 'other', value: 1 });
    off();
    await hass.callWS({ type: 'frontend/set_user_data', key: 'fluvy-alerts', value: 'after' });
    const read = await hass.callWS({ type: 'frontend/get_user_data', key: 'fluvy-alerts' });
    const guest = createHass([], {});
    const refused = await { ...guest.hass(), user: { id: 'g', name: 'Guest', is_admin: false } }
      .callWS({ type: 'frontend/set_system_data', key: 'fluvy', value: 1 })
      .then(() => false)
      .catch(() => true);
    out.data = { values: JSON.stringify(values), read: JSON.stringify(read), refused };
  }

  // registries made once: a state change hands new states and the same registries
  {
    const mock = window.fluvyMock;
    const before = mock.hass();
    const id = Object.keys(before.states)[0];
    mock.set(id, before.states[id].state);
    const after = mock.hass();
    out.registries = {
      states: before.states !== after.states,
      same: ['entities', 'devices', 'areas'].every((key) => before[key] === after[key]),
    };
  }
  return out;
});

check(
  'history answers every entity asked',
  results.history['sensor.a'] === '1,2,3' &&
    results.history['sensor.b'] === '4,5' &&
    results.history['sensor.c'] === '',
  JSON.stringify(results.history),
);
check(
  "a counter's hourly change is what it gained, the newest row ending at the last full hour",
  results.hours.count === 48 &&
    results.hours.changes === results.hours.expected &&
    results.hours.ends,
  `${results.hours.count} rows`,
);
check('an id without statistics is left out', results.hours.none === false);
check(
  "a day's change is its hours', from midnight, and its state the last reading",
  results.days.sum === results.days.expected && results.days.state && results.days.midnight,
  `${results.days.sum} vs ${results.days.expected}`,
);
check("a measurement's day keeps mean, min and max", results.means);
check(
  'a fixed window gains what its hours gained',
  Math.abs(results.window.change - results.window.expected) < 1e-9,
  `${results.window.change} vs ${results.window.expected}`,
);
check(
  "today's calendar window gains what today's finished hours gained",
  Math.abs(results.today.change - results.today.expected) < 1e-9,
  `${results.today.change} vs ${results.today.expected}`,
);
check(
  'a sheet answers its statistics beside the house',
  results.joined === 'sensor.house,sensor.sheet',
  results.joined,
);
check(
  'related: an entity → its device, area and integration, and what the sheet adds',
  JSON.stringify(results.related.entity) ===
    JSON.stringify({
      automation: ['automation.evening'],
      device: ['d1'],
      area: ['kitchen'],
      integration: ['hue'],
    }),
  JSON.stringify(results.related.entity),
);
check(
  'related: a device → its area and entities; an area → its devices and entities',
  JSON.stringify(results.related.device) ===
    JSON.stringify({ area: ['kitchen'], entity: ['light.lamp'] }) &&
    JSON.stringify(results.related.area) ===
      JSON.stringify({ device: ['d1'], entity: ['light.lamp'] }),
  `${JSON.stringify(results.related.device)} ${JSON.stringify(results.related.area)}`,
);
check('a message only the sheet answers keeps its answer', results.sheetOnly);
check('a subscription the table answers is sent the answer itself', results.subscribed);
check('a message nobody answers is refused', results.unhandled === 'refused');
check('every message is counted', results.calls);
check(
  'the repairs as they are, and their event to its own listeners only',
  results.repairs.ids === 'bridge,radio' &&
    results.repairs.heard === 'repairs_issue_registry_updated',
  JSON.stringify(results.repairs),
);
check(
  "stored data: the person's value, then each write to that key until unsubscribed",
  results.data.values === JSON.stringify([{ snoozed: ['a'] }, { snoozed: [] }]) &&
    results.data.read === JSON.stringify({ value: 'after' }),
  `${results.data.values} · ${results.data.read}`,
);
check("the house's data refuses a guest's write", results.data.refused);
check(
  'a state change hands new states and the same registries',
  results.registries.states && results.registries.same,
);

await suite.finish();
