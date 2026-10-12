#!/usr/bin/env node
/**
 * Interaction and lifecycle tests for the energy, solar, clock and calendar cards on the playground
 * (real cards, simulated hass). Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5184/ node interactions-energy-clock-calendar.mjs
 * What it proves (the flow has its own suite, interactions-energy-flow.mjs): an unavailable curve claims no
 * reading at "now"; the analog face runs without a single DOM write
 * while the digital seconds tick once a second; a removed clock schedules nothing more; a calendar
 * never re-reads because `hass` was replaced, reads a new month once and the old one from cache,
 * and its days work from the keyboard; a humidifier switch flips before Home Assistant answers;
 * rows open more-info from the keyboard, once.
 */
import { BASE, calls, frame, reset, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { browser, check } = suite;

async function open(sheet, width = 360, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, ...options });
  await page.goto(`${BASE}?sheet=${sheet}&width=${width}`);
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForTimeout(900);
  return page;
}

/** Counts `hass-more-info` events reaching the document while `run` happens. */
async function moreInfos(page, run) {
  // one listener per page, not per call: a second registration would count every event twice
  await page.evaluate(() => {
    window.__moreInfo = [];
    if (!window.__moreInfoBound) {
      window.__moreInfoBound = true;
      document.addEventListener(
        'hass-more-info',
        (e) => window.__moreInfo.push(e.detail?.entityId),
        true,
      );
    }
  });
  await run();
  await page.waitForTimeout(80);
  return page.evaluate(() => window.__moreInfo);
}

/* ---------- energy: an unavailable curve claims no reading at "now" ---------- */
{
  const page = await open('energy');
  // the unavailable energy card keeps its history but claims no reading at "now"
  const deadCurve = frame(page, 'Nothing to show').locator('fluvy-energy-card').nth(1);
  const dot = await deadCurve.evaluate((card) => {
    const d = card.shadowRoot.querySelector('.curve-dot');
    return d ? getComputedStyle(d).display : 'absent';
  });
  check(
    'energy: an unavailable sensor draws no dot at "now"',
    dot === 'none' || dot === 'absent',
    dot,
  );
  check(
    'energy: …and its value reads —',
    (
      await deadCurve.locator('.fv-readout--l .fv-readout__value span').first().textContent()
    ).trim() === '—',
  );
  await page.close();
}

/* ---------- scrubbing: a pointer over a chart reads the value under it, everything returns to now ---------- */
{
  const page = await open('energy');
  const card = page.locator('fluvy-energy-card').first();
  const chart = card.locator('.ef-chart');
  const label = card.locator('.ef-top .fv-readout__label').first();
  const bubble = card.locator('.fv-bubble');
  const before = {
    label: (await label.textContent()).trim(),
    bubble: (await bubble.textContent()).replace(/\s+/g, ' ').trim(),
    left: (await bubble.boundingBox()).x,
  };
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(120);
  const during = {
    label: (await label.textContent()).trim(),
    bubble: (await bubble.textContent()).replace(/\s+/g, ' ').trim(),
    left: (await bubble.boundingBox()).x,
  };
  check(
    'energy: hovering the chart moves the bubble to the pointer',
    during.left < before.left - 40,
    `${before.left} → ${during.left}`,
  );
  check(
    'energy: …the bubble says when',
    /\d{1,2}:\d{2}/.test(during.bubble) && !/\d:\d{2}/.test(before.bubble),
    during.bubble,
  );
  check(
    'energy: …and the readout label becomes that time',
    during.label !== before.label && /\d{1,2}:\d{2}/.test(during.label),
    during.label,
  );
  await page.mouse.move(box.x - 40, box.y - 40);
  await page.waitForTimeout(120);
  const after = { label: (await label.textContent()).trim(), left: (await bubble.boundingBox()).x };
  check(
    'energy: leaving the chart returns to now',
    after.label === before.label && Math.abs(after.left - before.left) < 1,
    `${after.label} ${after.left}`,
  );
  await page.close();
}
{
  const sensorPage = await open('ambient');
  const sensor = sensorPage
    .locator('fluvy-sensor-card')
    .filter({ has: sensorPage.locator('.fv-bubble') })
    .first(); // a chart card with history
  const chart = sensor.locator('.am-chart');
  const bubble = sensor.locator('.fv-bubble');
  const restLeft = (await bubble.boundingBox()).x;
  const box = await chart.boundingBox();
  await sensorPage.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await sensorPage.waitForTimeout(120);
  const text = (await bubble.textContent()).replace(/\s+/g, ' ').trim();
  check(
    'sensor: hovering the curve reads the value under the pointer with its time',
    (await bubble.boundingBox()).x < restLeft - 80 && /\d{1,2}:\d{2}/.test(text),
    text,
  );
  // several sensors on one card (issue #26): a readout each, a curve each on its own scale; scrubbed, the readouts
  // read that moment and one bubble says when
  const several = frame(sensorPage, 'Sensors · two on one chart').locator('fluvy-sensor-card');
  await several.scrollIntoViewIfNeeded();
  const readPair = () =>
    several.evaluate((el) => ({
      labels: [...el.shadowRoot.querySelectorAll('.am-pair .fv-readout__label')].map((l) =>
        l.textContent.trim(),
      ),
      values: [...el.shadowRoot.querySelectorAll('.am-pair .fv-readout__value')].map((v) =>
        v.textContent.replace(/\s+/g, ' ').trim(),
      ),
      lines: el.shadowRoot.querySelectorAll('.am-multi .curve-line').length,
      tones: [...el.shadowRoot.querySelectorAll('.am-multi > g')].map((g) =>
        g.getAttribute('class'),
      ),
      // the moment read is a pill on the axis row (several curves: no bubble over one of them)
      bubble: el.shadowRoot.querySelector('.am-axis .am-when')?.textContent.trim() ?? '',
      // the hours give way (they fade) while the pill reads
      axisHidden:
        el.shadowRoot.querySelector('.am-axis')?.classList.contains('is-reading') ?? false,
    }));
  const atRest = await readPair();
  check(
    'sensors: two on one card — “Temperature 21.4 °C | Humidity 46 %”, two curves in their measures’ tones',
    atRest.labels.join('|') === 'Temperature|Humidity' &&
      /^21\.4 ?°C$/.test(atRest.values[0] ?? '') &&
      /^46 ?%$/.test(atRest.values[1] ?? '') &&
      atRest.lines === 2 &&
      atRest.tones.join('|') === 'fv-tone--heat|fv-tone--water' &&
      atRest.bubble === '',
    JSON.stringify(atRest),
  );
  // issue #28: a readout is called what the config says, else its measure's word, else its name beyond the head; a
  // sensor with a colour of its own wears it on its key and its curve
  const readOf = (title) =>
    frame(sensorPage, title)
      .locator('fluvy-sensor-card')
      .evaluate((el) => {
        const root = el.shadowRoot;
        const items = [...root.querySelectorAll('.am-pair__item')];
        const curves = [...root.querySelectorAll('.am-multi > g')];
        return {
          title: root.querySelector('.fv-card__title')?.textContent.trim() ?? '',
          labels: items.map((i) => i.querySelector('.am-name')?.textContent.trim() ?? ''),
          accents: items.map((i) => i.dataset.accent ?? ''),
          keys: items.map((i) => {
            const key = i.querySelector('.am-key');
            return key ? getComputedStyle(key).backgroundColor : '';
          }),
          strokes: curves.map((g) => getComputedStyle(g.querySelector('.curve-line')).stroke),
          curveAccents: curves.map((g) => g.dataset.accent ?? ''),
        };
      });
  const office = await readOf('Sensors · the measures name themselves');
  check(
    'sensors: "Office climate temperature" and "… humidity" under "Office" read "Temperature" and "Humidity" with nothing set',
    office.title === 'Office' && office.labels.join('|') === 'Temperature|Humidity',
    JSON.stringify(office),
  );
  const named = await readOf('Sensors · three, named and coloured');
  check(
    'sensors: `label` names the card’s own readout, an entry’s `name` its own, and the word sensor keeps its name',
    named.labels.join('|') === 'Inside|Power|Washer',
    JSON.stringify(named.labels),
  );
  check(
    'sensors: an entry’s own colour is on its readout and its curve (the key and the line in that ink), the others keep their measures’ tones',
    named.accents[1] !== '' &&
      named.accents[0] === '' &&
      named.curveAccents[1] === named.accents[1] &&
      named.keys[1] !== '' &&
      named.keys[1] === named.strokes[1] &&
      named.strokes[0] !== named.strokes[1],
    JSON.stringify(named),
  );
  const pairBox = await several.locator('.am-chart').boundingBox();
  await sensorPage.mouse.move(pairBox.x + pairBox.width * 0.3, pairBox.y + pairBox.height * 0.6);
  await sensorPage.waitForTimeout(150);
  const read = await readPair();
  await sensorPage.mouse.move(0, 0);
  check(
    'sensors: scrubbed, each readout says that moment at its reading’s precision (“48 %”, never “47.9 %”), and the pill on the axis row says when over the hours',
    read.values.join() !== atRest.values.join() &&
      /^\d+ ?%$/.test(read.values[1] ?? '') &&
      /^\d{1,2}:\d{2}$/.test(read.bubble) &&
      read.axisHidden &&
      !atRest.axisHidden,
    JSON.stringify(read),
  );
  // each readout centred in its column, a key in its curve's ink beside the name once the circles have gone
  const layout = await several.evaluate((el) => {
    const items = [...el.shadowRoot.querySelectorAll('.am-pair__item')];
    return items.map((item) => {
      const box = item.getBoundingClientRect();
      const inner = [...item.children].map((c) => c.getBoundingClientRect());
      const left = Math.min(...inner.map((b) => b.left));
      const right = Math.max(...inner.map((b) => b.right));
      const key = item.querySelector('.am-key');
      return {
        off: Math.abs(left - box.left - (box.right - right)),
        circle: Boolean(item.querySelector('.fv-ico')),
        key: key !== null && Math.round(key.getBoundingClientRect().width) === 12,
      };
    });
  });
  check(
    'sensors: each readout centred in its column; without its circle, a 12 px key in its curve’s ink beside its name',
    layout.length === 2 && layout.every((i) => i.off <= 1 && (i.circle || i.key)),
    JSON.stringify(layout),
  );
  await sensorPage.close();
  const page = await open('solar');
  const production = page.locator('fluvy-production-card').first();
  const bars = production.locator('.so-bars');
  const readoutLabel = production.locator('.so-top .fv-readout__label').first();
  const rest = (await readoutLabel.textContent()).trim();
  const bb = await bars.boundingBox();
  await page.mouse.move(bb.x + bb.width * (10.5 / 24), bb.y + bb.height * 0.6);
  await page.waitForTimeout(120);
  const hover = (await readoutLabel.textContent()).trim();
  check(
    'production: hovering a bar names its hour',
    hover !== rest && /10/.test(hover) && (await bars.locator('.so-bar.is-hover').count()) === 1,
    hover,
  );
  await page.mouse.move(bb.x - 40, bb.y - 40);
  await page.waitForTimeout(120);
  check(
    'production: leaving returns to the day total',
    (await readoutLabel.textContent()).trim() === rest,
  );
  await page.close();
}

/* ---------- clock: CSS hands, one aligned timer, nothing left behind ---------- */
{
  const page = await open('clocks');
  const live = frame(page, 'Live (the real clock)');
  const analog = live.locator('fluvy-clock-card').nth(0);
  const digital = live.locator('fluvy-clock-card').nth(1);

  const faceWrites = await analog.evaluate(async (card) => {
    const face = card.shadowRoot.querySelector('.ck-face');
    let writes = 0;
    const observer = new MutationObserver((records) => {
      writes += records.length;
    });
    observer.observe(face, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const startAngle = getComputedStyle(face.querySelector('.ck-second')?.parentElement).transform;
    await new Promise((r) => setTimeout(r, 2200));
    const endAngle = getComputedStyle(face.querySelector('.ck-second')?.parentElement).transform;
    observer.disconnect();
    return { writes, moved: startAngle !== endAngle };
  });
  check(
    'clock: the analog second hand sweeps for 2 s without one DOM write',
    faceWrites.writes === 0 && faceWrites.moved,
    JSON.stringify(faceWrites),
  );

  const ticks = await digital.evaluate(async (card) => {
    const unit = () => card.shadowRoot.querySelector('.ck-big__unit')?.textContent ?? '';
    const seen = new Set([unit()]);
    const until = Date.now() + 2300;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 50));
      seen.add(unit());
    }
    return [...seen];
  });
  check(
    'clock: digital seconds advance once a second (aligned timer)',
    ticks.length >= 3 && ticks.length <= 4 && ticks.every((t) => /^:\d\d$/.test(t)),
    ticks.join(' '),
  );

  const after = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('fluvy-clock-card')].filter((c) => !c.config?._now);
    for (const card of cards) card.remove();
    let scheduled = 0;
    const native = window.setTimeout;
    window.setTimeout = (fn, delay, ...rest) => {
      if (delay >= 200 && delay <= 61_000) scheduled += 1;
      return native(fn, delay, ...rest);
    };
    await new Promise((r) => native(r, 2400));
    window.setTimeout = native;
    return scheduled;
  });
  check(
    'clock: removed clocks schedule no more timers',
    after === 0,
    `${after} scheduled in 2.4 s`,
  );
  await page.close();
}

/* ---------- calendar: reads once, keyboard days, day switching ---------- */
{
  const page = await open('calendar');
  const month = frame(page, 'Month + day').locator('fluvy-calendar-card').first();

  const reads = await month.evaluate(async (card) => {
    let count = 0;
    // count on the ORIGINAL reader: re-wrapping a wrapper would count one read once per layer
    const read = card.hass.callApi.bind(card.hass);
    const counted = (...args) => {
      count += 1;
      return read(...args);
    };
    const wrap = (hass) => ({ ...hass, callApi: counted });
    for (let i = 0; i < 20; i++) {
      card.hass = wrap(card.hass);
      await new Promise((r) => setTimeout(r, 10));
    }
    await new Promise((r) => setTimeout(r, 200));
    const replaced = count;
    card.shadowRoot.querySelector('[aria-label="Next month"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const next = {
      count: count - replaced,
      title: card.shadowRoot.querySelector('.fv-card__title').textContent.trim(),
      label: card.shadowRoot.querySelector('.fv-label')?.textContent.trim(),
    };
    const before = count;
    card.shadowRoot.querySelector('[aria-label="Previous month"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const back = {
      count: count - before,
      title: card.shadowRoot.querySelector('.fv-card__title').textContent.trim(),
      label: card.shadowRoot.querySelector('.fv-label')?.textContent.trim(),
    };
    return { replaced, next, back };
  });
  check(
    'calendar: 20 replaced hass objects → no read',
    reads.replaced === 0,
    `${reads.replaced} reads`,
  );
  check(
    'calendar: next month → one read per calendar, October, its first day selected',
    reads.next.count === 5 &&
      reads.next.title === 'October' &&
      /^Thursday 1 /.test(reads.next.label),
    JSON.stringify(reads.next),
  );
  check(
    'calendar: back to this month → served from cache, today selected',
    reads.back.count === 0 &&
      reads.back.title === 'September' &&
      /^Thursday 17 /.test(reads.back.label),
    JSON.stringify(reads.back),
  );

  await month.locator('.fv-day.is-selected').focus();
  await page.keyboard.press('ArrowRight');
  const focused = await month.evaluate((card) => card.shadowRoot.activeElement?.textContent.trim());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const label = (await month.locator('.fv-label').textContent()).trim();
  check(
    'calendar: ArrowRight moves to the 18th, Enter selects it',
    focused === '18' && /^Friday 18 · 2 events$/.test(label),
    `${focused} · ${label}`,
  );
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(400);
  check(
    'calendar: PageDown turns the month',
    (await month.locator('.fv-card__title').textContent()).trim() === 'October',
  );
  check('calendar: none of it called a service', (await calls(page)).length === 0);

  const agenda = frame(page, 'Agenda').locator('fluvy-calendar-card').first();
  await agenda.locator('.cd-rows .fv-row').last().click();
  await page.waitForTimeout(300);
  const tomorrow = {
    title: (await agenda.locator('.fv-card__title').textContent()).trim(),
    rows: await agenda.locator('.cd-event').count(),
    back: (await agenda.locator('.cd-rows .fv-row__title').last().textContent()).trim(),
  };
  await agenda.locator('.cd-rows .fv-row').last().click();
  await page.waitForTimeout(300);
  check(
    'calendar: the Tomorrow row turns the agenda and offers Today back',
    tomorrow.title === 'Tomorrow' &&
      tomorrow.rows === 2 &&
      tomorrow.back === 'Today' &&
      (await agenda.locator('.fv-card__title').textContent()).trim() === 'Today',
    JSON.stringify(tomorrow),
  );

  const opened = await moreInfos(page, async () => {
    await agenda.locator('.cd-event').first().focus();
    await page.keyboard.press('Enter');
  });
  check(
    'calendar: Enter on an event row opens its calendar, once',
    opened.length === 1 && opened[0] === 'calendar.ona',
    JSON.stringify(opened),
  );
  await page.close();
}

/* ---------- humidity switch, rows from the keyboard ---------- */
{
  const page = await open('solar');
  const humidity = frame(page, 'Humidity').locator('fluvy-humidity-card').first();
  await humidity.locator('.fv-hit').click();
  const immediately = await humidity.locator('.fv-switch').getAttribute('aria-checked');
  await page.waitForTimeout(400);
  const c = await calls(page);
  check(
    'humidity: the humidifier switch flips before Home Assistant answers',
    immediately === 'false',
  );
  check(
    'humidity: …with one service call',
    c.length === 1 && c[0].s === 'humidifier.turn_off',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);

  const bars = frame(page, 'Strings & inverter').locator('fluvy-bars-card').first();
  const fromBars = await moreInfos(page, async () => {
    await bars.locator('.fv-row').first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
  });
  check(
    'bars: Enter and Space on a row open it (one event each, no service)',
    fromBars.length === 2 &&
      fromBars.every((id) => id === 'sensor.so_string_east') &&
      (await calls(page)).length === 0,
    JSON.stringify(fromBars),
  );

  const gauge = frame(page, 'Solar power').locator('fluvy-gauge-card').first();
  const fromGauge = await moreInfos(page, async () => {
    await gauge.locator('.fv-card__head button').first().click();
  });
  check(
    'gauge: the icon opens more-info',
    fromGauge.length === 1 && fromGauge[0] === 'sensor.so_solar_power',
    JSON.stringify(fromGauge),
  );

  const production = frame(page, 'Production').locator('fluvy-production-card').first();
  const readouts = await production.locator('.so-cols .fv-readout__value').allTextContents();
  check(
    'production: sun hours count the hour in progress by its minutes',
    readouts.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ') === '4.1kW | 12:00 | 8.2h',
    readouts.join(' | '),
  );

  const twelve = frame(page, 'Production · 12-hour clock').locator('.fv-axis span');
  const labels = await twelve.allTextContents();
  const oneLine = await twelve.evaluateAll((spans) =>
    spans.every((s) => s.getBoundingClientRect().height <= 17),
  );
  check(
    'production: a 12-hour axis reads 12 AM … 12 AM on one line',
    labels.join(' ') === '12 AM 6 AM 12 PM 6 PM 12 AM' && oneLine,
    labels.join(' '),
  );
  await page.close();
}

{
  const page = await open('energy');
  const devices = frame(page, 'Appliances today').locator('fluvy-energy-devices-card').first();
  const rows = await devices.locator('.fv-row').allTextContents();
  check(
    'appliances: seven rows, the water meter plain, the dryer unavailable',
    rows.length === 7 &&
      /Kitchen tap\s*84 L$/.test(rows[6].replace(/\s+/g, ' ').trim()) &&
      /Dryer\s*Unavailable\s*—/.test(rows[5].replace(/\s+/g, ' ')),
    rows.map((r) => r.replace(/\s+/g, ' ').trim()).join(' / '),
  );
  check(
    'appliances: no bar under the water meter',
    (await devices.locator('.fv-row').nth(6).locator('.fv-bar').count()) === 0,
  );
  const opened = await moreInfos(page, async () => {
    await devices.locator('.fv-row').first().focus();
    await page.keyboard.press('Enter');
  });
  check(
    'appliances: Enter on a row opens it, once',
    opened.length === 1 && opened[0] === 'sensor.ef_heat_pump_energy',
    JSON.stringify(opened),
  );
  const legend = await frame(page, '12-hour clock · mixed units')
    .locator('fluvy-energy-flow-card .fv-readout__value')
    .allTextContents();
  check(
    'flow: totals share one unit (420 Wh beside 4.1 kWh reads 0.4 kWh)',
    legend.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ') === '0.4kWh | 1.3kWh | 4.1kWh',
    legend.join(' | '),
  );
  await page.close();
}

await suite.finish();
