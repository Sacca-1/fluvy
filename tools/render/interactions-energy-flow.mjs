#!/usr/bin/env node
/**
 * The energy flow, 1.4, on the playground's `flow` sheet (real cards, simulated hass). Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5184/ node interactions-energy-flow.mjs
 * What it proves: a grid read per phase shows its import and its export at once, each lane in its origin's colour;
 * every arrowhead ends its lane (the lane stops 7 px before the tip); pulses are Web Animations, at most eight a
 * card, faster for a bigger flow in px/s, retuned in place when a reading changes, paused off screen and in a hidden
 * tab, absent under reduced motion and `motion: off`; a flow below its threshold rests, a stale card says so, an
 * unreadable source is a hairline; the cross bridges its crossing; narrow columns list; the Energy dashboard's own
 * sources and a day's totals are read; 1.3's YAML still draws.
 */
import { contrastRatio, toHex } from './lib/colour.mjs';
import { BASE, frame, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { browser, check } = suite;

async function open(sheet = 'flow', width = 360, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, ...options });
  await page.goto(`${BASE}?sheet=${sheet}&width=${width}`);
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForTimeout(1200);
  return page;
}

const card = (page, title, n = 0) => frame(page, title).locator('fluvy-energy-flow-card').nth(n);

/**
 * A stacked energy chart's plot on the page: its left edge and width (the scales stand outside it, `data-plot`), its
 * middle height, and where an hour of the day is on it.
 */
async function plotOf(energy) {
  const chart = energy.locator('.en-chart');
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  const [left, width] = (await chart.getAttribute('data-plot')).split(' ').map(Number);
  return {
    left,
    width,
    y: box.y + box.height / 2,
    x: (hour) => box.x + left + (width * hour) / 24,
  };
}

/** Every lane group: its ink, its way, rest / hidden, and its pulses. */
const lanes = (flow) =>
  flow.evaluate((c) => {
    const root = c.shadowRoot;
    return [...root.querySelectorAll('.en-flow')].map((g) => ({
      ink: [...g.classList].find((k) => k.startsWith('en-ink--')),
      out: g.classList.contains('is-out'),
      rest: g.classList.contains('is-rest'),
      hidden: g.classList.contains('is-hidden'),
    }));
  });

const pulses = (flow) =>
  flow.evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.en-pulses')].map((g) => {
      const anims = [...g.querySelectorAll('.en-comet')].flatMap((comet) => comet.getAnimations());
      return {
        lane: g.dataset.lane,
        ink: [...g.classList].find((k) => k.startsWith('en-ink--')),
        run: Number(g.dataset.run),
        comets: g.querySelectorAll('.en-comet').length,
        waapi: anims.every((a) => !(a instanceof CSSAnimation)),
        states: [...new Set(anims.map((a) => a.playState))],
        // px per second: the lane's run over one lap at the current rate
        speed: anims[0]
          ? Number(g.dataset.run) /
            (anims[0].effect.getTiming().duration / 1000 / anims[0].playbackRate)
          : 0,
        rate: anims[0]?.playbackRate ?? 0,
      };
    }),
  );

/* ---------- the #19 house: import and export at once, coloured by origin ---------- */
{
  const page = await open();
  const flow = card(page, 'The #19 house');
  const l = await lanes(flow);
  check(
    '#19: four lanes — the sun, the grid’s pair, the battery',
    l.length === 4,
    JSON.stringify(l),
  );
  check(
    '#19: the grid imports in its own colour and exports in the sun’s, both shown',
    l[1]?.ink === 'en-ink--grid' &&
      !l[1]?.out &&
      !l[1]?.hidden &&
      l[2]?.ink === 'en-ink--solar' &&
      l[2]?.out &&
      !l[2]?.hidden,
    JSON.stringify(l.slice(1, 3)),
  );
  check(
    '#19: the battery charges from the sun (its lane runs out of the house, gold)',
    l[3]?.ink === 'en-ink--solar' && l[3]?.out && !l[3]?.rest,
    JSON.stringify(l[3]),
  );
  const words = (await flow.locator('.en-words').allTextContents()).map((t) =>
    t.replace(/\s+/g, ' ').trim(),
  );
  check(
    '#19: the grid says both figures, the house what it uses, the badge what the sun covers',
    words.some((w) => w === 'Grid1.9kW in0.4kW out') &&
      words.some((w) => w === 'House4.1kW') &&
      (await flow.locator('.fv-badge').textContent()).trim() === '54 % solar',
    words.join(' | '),
  );

  // the arrowhead ends the lane: the body stops 7 px of curve before the tip
  const gaps = await flow.evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.en-flow')].flatMap((g) =>
      ['in', 'out']
        .map((way) => {
          const body = g.querySelector(`.en-body--${way}`);
          const head = g.querySelector(`.en-head--${way}`);
          if (!body || !head) return null;
          const end = body.getPointAtLength(body.getTotalLength());
          const [x, y] = head
            .getAttribute('transform')
            .match(/translate\(([-\d.]+),([-\d.]+)\)/)
            .slice(1)
            .map(Number);
          return Math.hypot(end.x - x, end.y - y);
        })
        .filter((d) => d !== null),
    ),
  );
  check(
    'every arrowhead ends its lane: the lane stops 7 px before the tip',
    gaps.length === 7 && gaps.every((d) => d > 6.4 && d < 7.1),
    gaps.map((d) => d.toFixed(2)).join(', '),
  );

  const p = await pulses(flow);
  check(
    'pulses are Web Animations, running, one colour per origin',
    p.length === 4 &&
      p.every((g) => g.waapi && g.states.join() === 'running' && g.comets >= 1) &&
      p.find((g) => g.lane.startsWith('source-1-1'))?.ink === 'en-ink--solar',
    JSON.stringify(p),
  );
  check(
    'never more than eight pulses on a card',
    p.reduce((sum, g) => sum + g.comets, 0) <= 8,
    String(p.reduce((sum, g) => sum + g.comets, 0)),
  );
  const solar = p.find((g) => g.lane.startsWith('source-0'));
  const out = p.find((g) => g.lane.startsWith('source-1-1'));
  check(
    'a bigger flow travels faster in px/s (3.2 kW beside 0.4 kW), inside 24 → 72',
    solar && out && solar.speed > out.speed && out.speed >= 23.5 && solar.speed <= 72.5,
    `${solar?.speed.toFixed(1)} vs ${out?.speed.toFixed(1)} px/s`,
  );

  // a reading that changes only the power retunes the pace, each pulse where it is
  const before = await flow.evaluate((c) => {
    const comet = c.shadowRoot.querySelector('.en-pulses[data-lane^="source-0"] .en-comet');
    window.__comet = comet;
    return comet.getAnimations()[0].playbackRate;
  });
  await page.evaluate(() => window.fluvyMock.set('sensor.fl_solar', '4.8'));
  await page.waitForTimeout(300);
  const after = await flow.evaluate((c) => {
    const comet = c.shadowRoot.querySelector('.en-pulses[data-lane^="source-0"] .en-comet');
    return { same: comet === window.__comet, rate: comet.getAnimations()[0].playbackRate };
  });
  check(
    'a new reading retunes the pace without restarting a pulse',
    after.same && after.rate > before,
    `${before.toFixed(2)} → ${after.rate.toFixed(2)}, same element ${after.same}`,
  );

  // off screen, and in a hidden tab, everything pauses
  const offScreen = await flow.evaluate(async (c) => {
    c.style.transform = 'translateY(-5000px)';
    await new Promise((r) => setTimeout(r, 300));
    const states = [...c.shadowRoot.querySelectorAll('.en-comet')].flatMap((k) =>
      k.getAnimations().map((a) => a.playState),
    );
    c.style.transform = '';
    await new Promise((r) => setTimeout(r, 300));
    const back = [...c.shadowRoot.querySelectorAll('.en-comet')].flatMap((k) =>
      k.getAnimations().map((a) => a.playState),
    );
    return { away: [...new Set(states)], back: [...new Set(back)] };
  });
  check(
    'off screen the pulses pause, and run again on return',
    offScreen.away.join() === 'paused' && offScreen.back.join() === 'running',
    JSON.stringify(offScreen),
  );
  const hiddenTab = await flow.evaluate(async (c) => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const states = [...c.shadowRoot.querySelectorAll('.en-comet')].flatMap((k) =>
      k.getAnimations().map((a) => a.playState),
    );
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return [...new Set(states)];
  });
  check('in a hidden tab the pulses pause', hiddenTab.join() === 'paused', hiddenTab.join());
  await page.close();
}

/* ---------- import + export by two sensors; the grid badge ---------- */
{
  const page = await open();
  const flow = card(page, 'Import and export, two sensors');
  const l = await lanes(flow);
  check(
    'two sensors: the grid’s two lanes, the export in the sun’s colour',
    l.length === 3 &&
      l[1]?.ink === 'en-ink--grid' &&
      l[2]?.ink === 'en-ink--solar' &&
      !l[2]?.hidden,
    JSON.stringify(l),
  );
  check(
    'badge: grid says import + export',
    (await flow.locator('.fv-badge').textContent()).trim() === 'Import + export',
  );
  // the export stops: its lane fades out, the import stays
  await page.evaluate(() => window.fluvyMock.set('sensor.fl_grid_out', '0'));
  await page.waitForTimeout(300);
  const after = await lanes(flow);
  check(
    'when the export stops, its lane hides and the import stays',
    after[2]?.hidden && !after[1]?.hidden,
    JSON.stringify(after),
  );
  await page.close();
}

/* ---------- rest, stale, unreadable ---------- */
{
  const page = await open();
  const night = await lanes(card(page, 'Cheap hours'));
  check(
    'cross, cheap hours: the grid charges the battery in its own colour; the sun rests',
    night.some((l) => l.ink === 'en-ink--grid' && !l.rest && !l.hidden) &&
      night.filter((l) => l.ink === 'en-ink--solar').every((l) => l.rest || l.hidden),
    JSON.stringify(night),
  );
  const stale = card(page, 'Stale');
  const staleLanes = await lanes(stale);
  check(
    'stale: every lane rests, no pulse, and the head says how old the readings are',
    staleLanes.every((l) => l.rest) &&
      (await stale.locator('.en-comet').count()) === 0 &&
      (await stale.locator('.fv-card__sub').textContent()).trim() === 'Updated 12 min ago' &&
      (await stale.locator('.en-arcs.is-dim').count()) === 1,
  );
  const down = card(page, 'The grid unreadable');
  check(
    'an unreadable grid: a dashed hairline, a dashed ring, and the house unknown rather than guessed',
    (await down.locator('.en-hairline').count()) === 1 &&
      (await down.locator('.en-node.is-outage').count()) === 1 &&
      (await down.locator('.en-words').last().textContent()).replace(/\s+/g, '') === 'House—',
  );
  await page.close();
}

/* ---------- the cross bridges its crossing ---------- */
{
  const page = await open();
  const cross = card(page, 'Cross');
  const bridge = await cross.evaluate((c) => {
    const root = c.shadowRoot;
    const svgs = root.querySelectorAll('.en-stage > svg');
    const knock = root.querySelector('.en-knockout');
    return {
      svgs: svgs.length,
      knock: !!knock && !knock.classList.contains('is-hidden'),
      over: [...root.querySelectorAll('.en-pulses-layer--over .en-pulses')].map(
        (g) => g.dataset.lane,
      ),
    };
  });
  check(
    'cross: the grid → house lane is drawn over the sun → battery lane, its pulses too',
    bridge.svgs === 2 && bridge.knock && bridge.over.join() === 'gridHouse-in',
    JSON.stringify(bridge),
  );
  await page.close();
}

/* ---------- styles, motion off, reduced motion ---------- */
{
  const page = await open();
  check(
    'legs: thin lanes with their small heads',
    (await card(page, 'Legs').locator('.en-flow--thin').count()) === 4,
  );
  const rail = card(page, 'Rail');
  check(
    'rail: connectors join one track into the house; nothing travels',
    (await rail.locator('.en-rail').count()) >= 4 &&
      (await rail.locator('.en-comet').count()) === 0,
  );
  check(
    'motion: off keeps the drawing and no pulse',
    (await card(page, 'Still').locator('.en-comet').count()) === 0 &&
      (await card(page, 'Still').locator('.en-flow').count()) === 4,
  );
  await page.close();
}
{
  const page = await open('flow', 360, { reducedMotion: 'reduce' });
  const flow = card(page, 'The #19 house');
  check(
    'reduced motion: the lanes and heads stay, no pulse is started',
    (await flow.locator('.en-comet').count()) === 0 &&
      (await flow.locator('.en-head').count()) >= 4,
  );
  await page.close();
}

/* ---------- narrow columns list; the list keeps the first word of a name ---------- */
{
  const page = await open();
  const narrow = card(page, 'The narrowest column');
  check(
    'a lane under 56 px is no lane: the card lists its nodes',
    (await narrow.locator('.en-list__row').count()) === 4 &&
      (await narrow.locator('.en-stage').count()) === 0,
  );
  const half = card(page, 'Half a column');
  const labels = (await half.locator('.en-words__label').allTextContents()).map((t) => t.trim());
  check(
    'half a column: "Battery · 62 %" keeps "Battery", and the direction takes its own line',
    labels.includes('Battery') && (await half.locator('.en-words__dir').count()) >= 1,
    labels.join(' | '),
  );
  await page.close();
}

/* ---------- the Energy dashboard's own sources, and a day's totals ---------- */
{
  const page = await open();
  const auto = card(page, 'From the Energy dashboard');
  const l = await lanes(auto);
  check(
    'no sources: the Energy dashboard’s are read, the sun first (its grid by two sensors is a pair)',
    l.length === 4 &&
      (await auto.locator('.en-words__label').first().textContent()).trim() === 'Solar',
    JSON.stringify(l),
  );
  const today = card(page, 'Today');
  const words = (await today.locator('.en-words').allTextContents()).map((t) =>
    t.replace(/\s+/g, ' ').trim(),
  );
  check(
    'a day: every meter’s change summed hour by hour, the house what it used',
    words.includes('House13.4kWh') &&
      words.some((w) => w === 'Battery2.4kWh discharged3.0kWh charged'),
    words.join(' | '),
  );
  await today.locator('.fv-chip').nth(1).click();
  await page.waitForTimeout(400);
  check(
    'the period chips switch the span',
    (await today.locator('.fv-card__sub').textContent()).trim() === 'Last 7 days' &&
      (await today.locator('.fv-chip.is-active').textContent()).trim() === 'Week',
  );
  await page.close();
}

/* ---------- the house's power by source ---------- */
{
  const page = await open();
  const card = frame(page, 'House power by source').locator('fluvy-energy-card').first();
  const read = (c) =>
    c.evaluate((el) => {
      const root = el.shadowRoot;
      return {
        reading: (root.querySelector('.ef-top .fv-readout')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
        areas: [...root.querySelectorAll('.en-area:not(.is-out)')].map((a) =>
          [...a.classList].find((k) => k.startsWith('en-ink--')),
        ),
        below: [...root.querySelectorAll('.en-area.is-out')].map((a) => a.dataset.below),
        lines: [...root.querySelectorAll('path.en-area-line')].map((l) => l.getAttribute('d')),
        legend: [...root.querySelectorAll('.en-legend__item')].map((i) =>
          i.textContent.replace(/\s+/g, ''),
        ),
      };
    });
  const chart = await read(card);
  const asked = await page.evaluate(() =>
    (window.fluvyAsked ?? []).filter(
      (m) => m.type === 'recorder/statistics_during_period' && (m.types ?? []).includes('mean'),
    ),
  );
  check(
    'by source, with the Energy dashboard’s power sensors: their five-minute means in kW, as Home Assistant’s own graph',
    asked.some(
      (m) =>
        m.period === '5minute' &&
        m.units?.power === 'kW' &&
        ['sensor.fl_solar', 'sensor.fl_grid_in', 'sensor.fl_grid_out', 'sensor.fl_battery'].every(
          (id) => m.statistic_ids.includes(id),
        ),
    ),
    JSON.stringify(asked.map((m) => [m.period, m.types, m.units, m.statistic_ids])),
  );
  check(
    'by source: right now is the house’s own use (1.9 + 3.2 − 0.4 − 0.6 = 4.1 kW), not a sensor of the card',
    /^Right now 4\.1 ?kW$/.test(chart.reading),
    chart.reading,
  );
  check(
    'by source: the sun, the battery and the grid stacked; under the line what went into the battery and out to the grid; the day’s totals',
    chart.areas.sort().join() === 'en-ink--battery,en-ink--grid,en-ink--solar' &&
      chart.below.join() === 'charged,exported' &&
      chart.legend.join(' | ') ===
        'Solar6.9kWh | Battery2.4kWh | Grid4.1kWh | Charged3.0kWh | Exported1.3kWh',
    JSON.stringify(chart),
  );

  // issue #23's house: a hybrid inverter's meters are wrong, its power sensors right
  const hybrid = frame(page, 'By source · a hybrid inverter, with power')
    .locator('fluvy-energy-card')
    .first();
  const h = await read(hybrid);
  const plot = await plotOf(hybrid);
  const at = async (hour) => {
    await page.mouse.move(plot.x(hour), plot.y);
    await page.waitForTimeout(150);
    return (await read(hybrid)).reading;
  };
  const noon = await at(12.5);
  const gap = await at(3.25);
  await page.mouse.move(0, 0);
  check(
    'issue #23: drawn from power, the sun covers the house at midday, the evening is the battery’s, now is the house’s use (0.3 + 1.3 kW)',
    /^Right now 1\.6 ?kW$/.test(h.reading) &&
      h.areas.includes('en-ink--solar') &&
      h.below.join() === 'charged,exported' &&
      /^12:\d\d \d+(\.\d)? ?kW$/.test(noon) &&
      Number.parseFloat(noon.split(' ')[1] ?? '') > 0.5,
    JSON.stringify([h.reading, noon, h.legend]),
  );
  check(
    'issue #23: the recorder’s gap at 03:00 is a gap — the curve stops and the cursor reads "—", never a zero',
    h.lines.every((d) => (d.match(/M/g) ?? []).length >= 2) && /^03:\d\d —$/.test(gap),
    JSON.stringify([gap, h.lines.map((d) => (d.match(/M/g) ?? []).length)]),
  );

  // the same house without power: its meters, which count in 0.1 kWh, in half-hour blocks (a quarter would show the
  // step as a saw-tooth at the evening's 1.6 kW)
  const meters = frame(page, 'By source · a hybrid inverter, meters only')
    .locator('fluvy-energy-card')
    .first();
  const m = await read(meters);
  const xs = (m.lines[0] ?? '')
    .split(/[ML]/)
    .map((p) => Number(p.trim().split(',')[0]))
    .filter((x) => Number.isFinite(x) && x > 0);
  const steps = xs
    .slice(1)
    .map((x, i) => x - (xs[i] ?? 0))
    .filter((d) => d > 0);
  const block = ((await plotOf(meters)).width * 30) / 1440;
  check(
    'without power sensors: the meters, half an hour a point for a 0.1 kWh step (no zigzag); at rest the last half hour that has closed, as the whole house reads it',
    /^\d{1,2}:\d{2} [\d.,]+ ?k?W$/.test(m.reading) &&
      steps.length > 10 &&
      steps.every((d) => Math.abs(d - block) < 0.2 || d > block * 1.4),
    JSON.stringify({ reading: m.reading, block, steps: steps.slice(0, 8) }),
  );
  await page.close();
}

/* ---------- the whole house (issue #26) ---------- */
{
  const page = await open();
  const read = (c) =>
    c.evaluate((el) => {
      const root = el.shadowRoot;
      const text = (sel) =>
        (root.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return {
        reading: text('.ef-top > .ef-key:not(.ef-top__side) .fv-readout'),
        level: text('.ef-top__side .fv-readout'),
        above: [...root.querySelectorAll('.en-area[data-above]')].map((a) => a.dataset.above),
        below: [...root.querySelectorAll('.en-area[data-below]')].map((a) => a.dataset.below),
        house: root.querySelector('path.en-house')?.getAttribute('d') ?? null,
        // the charge is drawn a path a run (each a whole number of dashes long)
        soc: root.querySelector('path.en-soc')
          ? [...root.querySelectorAll('path.en-soc')].map((p) => p.getAttribute('d')).join(' ')
          : null,
        socDashes: [...root.querySelectorAll('path.en-soc')].map((p) =>
          Number(p.getAttribute('pathLength')),
        ),
        // the kW zero line (drawn when something went out) and the lowest point of the charge's line
        zero: root.querySelector('line.en-zero')
          ? Number(root.querySelector('line.en-zero').getAttribute('y1'))
          : null,
        socMaxY: Math.max(
          -Infinity,
          ...[...root.querySelectorAll('path.en-soc')].flatMap((p) =>
            [...p.getAttribute('d').matchAll(/[\d.]+,([\d.]+)/g)].map((m) => Number(m[1])),
          ),
        ),
        legend: [...root.querySelectorAll('.en-legend__item')].map((i) =>
          i.textContent.replace(/\s+/g, ''),
        ),
      };
    });
  const card = frame(page, 'The whole house').locator('fluvy-energy-card').first();
  await card.scrollIntoViewIfNeeded();
  const chart = await read(card);
  const asked = await page.evaluate(() =>
    (window.fluvyAsked ?? []).filter(
      (m) => m.type === 'recorder/statistics_during_period' && (m.types ?? []).includes('mean'),
    ),
  );
  check(
    'the whole house: the battery’s charge through the day from its own sensor’s five-minute means',
    asked.some(
      (m) =>
        m.period === '5minute' &&
        m.statistic_ids.length === 1 &&
        m.statistic_ids[0] === 'sensor.fl_battery_level',
    ),
    JSON.stringify(asked.map((m) => m.statistic_ids)),
  );
  check(
    'the whole house: right now the house’s use (4.1 kW), beside it the battery’s charge now (62 %)',
    /^Right now 4\.1 ?kW$/.test(chart.reading) && /^Battery 62 ?%$/.test(chart.level),
    JSON.stringify([chart.reading, chart.level]),
  );
  check(
    'the whole house: every source above the line (the sun’s whole production), the charge and the export below, the house as a line, the charge dashed',
    chart.above.join() === 'grid,battery,solar' &&
      chart.below.join() === 'battery,grid' &&
      chart.house?.startsWith('M') &&
      chart.soc?.startsWith('M') &&
      chart.legend.join(' | ') ===
        'Solar11.2kWh | Battery2.4kWh | Grid4.1kWh | Charged3.0kWh | Exported1.3kWh',
    JSON.stringify(chart),
  );
  const plot = await plotOf(card);
  await page.mouse.move(plot.x(12.5), plot.y);
  await page.waitForTimeout(200);
  const noon = await read(card);
  await page.mouse.move(0, 0);
  const units = noon.legend.map((item) => item.replace(/^[^\d—]+[\d.,]+/, ''));
  check(
    'scrubbed, the readouts say that moment and the legend each source’s power then, in one unit',
    /^12:\d\d [\d.,]+ ?k?W$/.test(noon.reading) &&
      /^Battery \d+ ?%$/.test(noon.level) &&
      units.length === 5 &&
      new Set(units).size === 1 &&
      /^k?W$/.test(units[0] ?? ''),
    JSON.stringify([noon.reading, noon.level, noon.legend]),
  );

  // issue #23's hybrid house, with its recorder's gap and a battery that fills at midday
  const hybrid = frame(page, 'The whole house · a hybrid inverter, with power')
    .locator('fluvy-energy-card')
    .first();
  await hybrid.scrollIntoViewIfNeeded();
  const h = await read(hybrid);
  const hplot = await plotOf(hybrid);
  await page.mouse.move(hplot.x(3.25), hplot.y);
  await page.waitForTimeout(200);
  const gap = await read(hybrid);
  await page.mouse.move(0, 0);
  check(
    'the gap at 03:00 is a gap in every series: the areas, the house and the charge stop, the cursor reads "—"',
    (h.house.match(/M/g) ?? []).length >= 2 &&
      (h.soc.match(/M/g) ?? []).length >= 2 &&
      h.socDashes.length >= 2 &&
      h.socDashes.every((n) => (n - 4) % 8 === 0) &&
      /^03:\d\d —$/.test(gap.reading) &&
      /^Battery —$/.test(gap.level),
    JSON.stringify([gap.reading, gap.level]),
  );
  check(
    'the charge keeps to the positive half: its lowest point never goes under the kW zero line (issue #28)',
    h.zero !== null && h.socMaxY <= h.zero + 0.05,
    JSON.stringify([h.zero, h.socMaxY]),
  );
  // issue #28's roof: the export runs deep under the line and the battery stays low, still above it
  const heavy = await read(
    frame(page, 'The whole house · heavy export, a low battery')
      .locator('fluvy-energy-card')
      .first(),
  );
  check(
    'a low battery under a deep export is drawn above the zero line, and reads its own level',
    heavy.below.includes('grid') &&
      heavy.zero !== null &&
      heavy.zero < 150 &&
      heavy.socMaxY <= heavy.zero + 0.05 &&
      /^Battery [2-4]\d ?%$/.test(heavy.level),
    JSON.stringify([heavy.zero, heavy.socMaxY, heavy.level, heavy.below]),
  );
  const two = await read(
    frame(page, 'The whole house · two batteries without their capacity')
      .locator('fluvy-energy-card')
      .first(),
  );
  check(
    'two batteries that do not say their capacity have no group charge: no line, "—"',
    two.soc === null && /^Battery —$/.test(two.level),
    JSON.stringify([two.soc, two.level]),
  );
  const bare = await read(
    frame(page, 'The whole house · no battery, no house line').locator('fluvy-energy-card').first(),
  );
  check(
    'without a battery and with show_house off: no charge, no house line, the sources and the export alone',
    bare.soc === null && bare.house === null && bare.level === '' && bare.below.join() === 'grid',
    JSON.stringify(bare),
  );
  await page.close();
}

/* ---------- issue #49: the scales, the gridlines, each source's own value, thin lines ---------- */
{
  const page = await open('flow', 360);
  const energy = (title, n = 0) => frame(page, title).locator('fluvy-energy-card').nth(n);
  /** A stacked chart's scales as drawn: the ticks (text, y, x), the gridlines, the zero line, the tags, the dots. */
  const scales = (c) =>
    c.evaluate((el) => {
      const root = el.shadowRoot;
      const svg = root.querySelector('.en-chart > svg:not(.en-chart__dots)');
      const num = (node, name) => Number(node.getAttribute(name));
      const ticks = [...root.querySelectorAll('.ax-tick')].map((t) => ({
        text: t.textContent.trim(),
        x: num(t, 'x'),
        y: num(t, 'y'),
      }));
      const zero = root.querySelector('line.en-zero');
      const hours = [...root.querySelectorAll('.fv-axis span')].map((s) => {
        const box = s.getBoundingClientRect();
        return { text: s.textContent.trim(), left: box.left, right: box.right };
      });
      const chart = root.querySelector('.en-chart').getBoundingClientRect();
      return {
        width: svg ? num(svg, 'width') : 0,
        plot: (root.querySelector('.en-chart')?.dataset.plot ?? '').split(' ').map(Number),
        // the power's ticks end on the plot's start; the charge's on the card's edge
        power: ticks.filter((t) => t.text.endsWith('%') === false),
        charge: ticks.filter((t) => t.text.endsWith('%')),
        unit: root.querySelector('.ax-unit')?.textContent.trim() ?? '',
        grid: [...root.querySelectorAll('.ax-grid')].map((g) => ({
          y: num(g, 'y1'),
          x1: num(g, 'x1'),
          x2: num(g, 'x2'),
        })),
        zero: zero ? { y: num(zero, 'y1'), dash: getComputedStyle(zero).strokeDasharray } : null,
        tags: [...root.querySelectorAll('.en-chart__tag')].map((t) => t.textContent.trim()),
        hours: hours.map((h) => ({ ...h, left: h.left - chart.left, right: h.right - chart.left })),
        soc: [...root.querySelectorAll('path.en-soc')].flatMap((p) =>
          [...p.getAttribute('d').matchAll(/[\d.]+,([\d.]+)/g)].map((m) => Number(m[1])),
        ),
        dots: [...root.querySelectorAll('.en-band-dot')].map((d) => ({
          ink: [...d.classList].find((k) => k.startsWith('en-ink--')),
          y: num(d, 'cy'),
          r: num(d, 'r'),
          ring: d.classList.contains('is-ring'),
        })),
        charged: root.querySelector('.en-soc-dot')
          ? num(root.querySelector('.en-soc-dot'), 'cy')
          : null,
        // the scale's words and the card under them
        inks: {
          card: getComputedStyle(root.querySelector('.fv-card')).backgroundColor,
          ticks: [...root.querySelectorAll('.ax-tick, .ax-unit')].map(
            (t) => getComputedStyle(t).fill,
          ),
          hours: getComputedStyle(root.querySelector('.fv-axis')).color,
        },
        ring: root.querySelector('.en-cursor-dot')
          ? num(root.querySelector('.en-cursor-dot'), 'cy')
          : null,
        own: root.querySelectorAll('.en-area.is-own').length,
        areas: root.querySelectorAll('.en-area').length,
        line: getComputedStyle(root.querySelector('.en-area-line')).strokeWidth,
        house: root.querySelector('.en-house')
          ? getComputedStyle(root.querySelector('.en-house')).strokeWidth
          : '',
        reading: (root.querySelector('.ef-top .fv-readout')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
        legend: [...root.querySelectorAll('.en-legend__item')].map((i) =>
          i.textContent.replace(/\s+/g, ''),
        ),
      };
    });
  /** A power's y on a chart, from its ticks (a tick's label sits 4 under its line). */
  const yOf = (s, kw) => {
    const [a, b] = s.power;
    const ka = Number(a.text.replace('−', '-'));
    const kb = Number(b.text.replace('−', '-'));
    return a.y - 4 + ((kw - ka) * (b.y - a.y)) / (kb - ka);
  };

  const wide = energy('Issue #49 · the whole house, scaled');
  const w = await scales(wide);
  const [left, width] = w.plot;
  check(
    'issue #49: the power’s scale at the start (nice steps, negatives, kW rotated) and the charge’s 0–100 % at the end, on the same gridlines',
    w.power.map((t) => t.text).join() === '−5,0,5,10' &&
      w.power.every((t) => t.x === left - 8) &&
      w.unit === 'kW' &&
      w.charge.map((t) => t.text).join() === '0 %,50 %,100 %' &&
      w.charge.every((t) => t.x === w.width) &&
      // the charge's 0 % on the zero line, 50 % and 100 % on the power's 5 and 10
      w.charge.every((t, i) => t.y === w.power[i + 1]?.y),
    JSON.stringify([w.power, w.charge, w.unit, w.plot]),
  );
  const words = [...w.inks.ticks, w.inks.hours].map(toHex);
  check(
    'issue #49: the scale reads in one ink — ticks, unit and hours — at 4.5:1 or more on the card (11 px words)',
    words.every((ink) => ink !== null && ink === words[0]) &&
      contrastRatio(words[0], toHex(w.inks.card)) >= 4.5,
    JSON.stringify(w.inks),
  );
  check(
    'issue #49: dashed gridlines across the plot at every tick but zero, whose line is the solid baseline',
    w.grid.length === 3 &&
      w.grid.every((g) => g.x1 === left && Math.abs(g.x2 - (left + width)) < 0.01) &&
      w.zero?.dash === 'none' &&
      Math.abs(w.zero.y - (w.power[1].y - 4)) <= 0.5,
    JSON.stringify([w.grid, w.zero]),
  );
  check(
    'issue #49: the charge’s scale takes the "100 %" tag’s place; the scale says what is below the line (no tag there)',
    w.tags.join() === 'Sources' &&
      w.soc.length > 0 &&
      Math.max(...w.soc) <= (w.zero?.y ?? 0) + 0.5 &&
      Math.min(...w.soc) >= yOf(w, 10) - 0.5,
    JSON.stringify([w.tags, Math.min(...w.soc), Math.max(...w.soc), w.zero]),
  );
  check(
    'issue #49: 00:00 · 06:00 · 12:00 · 18:00 · 24:00 under the plot, each centred on its hour',
    w.hours.map((h) => h.text).join() === '00:00,06:00,12:00,18:00,24:00' &&
      w.hours.every((h, i) => Math.abs((h.left + h.right) / 2 - (left + (width * i) / 4)) <= 1),
    JSON.stringify(w.hours),
  );

  // the reporter's moment: 11:57, the sun 5.6 kW and the battery 4.2 on top of it
  const wplot = await plotOf(wide);
  await page.mouse.move(wplot.x(11.95), wplot.y);
  await page.waitForTimeout(200);
  const noon = await scales(wide);
  check(
    'issue #49: read at 11:57, the house’s 9.8 kW is the sun’s 5.6 and the battery’s 4.2, each source its own value in the legend',
    /^11:5\d 9\.8 ?kW$/.test(noon.reading) &&
      noon.legend.join(' | ') ===
        'Solar5.6kW | Battery4.2kW | Grid0.0kW | Charged0.0kW | Exported0.0kW',
    JSON.stringify([noon.reading, noon.legend]),
  );
  const solarDot = noon.dots.find((d) => d.ink === 'en-ink--solar');
  check(
    'issue #49: stacked, a dot marks the sun’s own edge (5.6) under the battery’s, whose top is the stack’s 9.8 (the ring)',
    solarDot !== undefined &&
      Math.abs(solarDot.y - yOf(noon, 5.6)) < 1.5 &&
      noon.ring !== null &&
      Math.abs(noon.ring - yOf(noon, 9.8)) < 1.5,
    JSON.stringify([noon.dots, noon.ring, yOf(noon, 5.6), yOf(noon, 9.8)]),
  );
  check(
    'issue #49: at 11:57 the charge’s dot (56 %) sits on the sun’s edge (5.6): the sun’s is a ring round it, so both read',
    solarDot !== undefined &&
      noon.charged !== null &&
      Math.abs(solarDot.y - noon.charged) < 4.5 &&
      solarDot.ring &&
      solarDot.r === 5 &&
      noon.dots.every((d) => d.ring === Math.abs(d.y - noon.charged) < 4.5),
    JSON.stringify([noon.dots, noon.charged]),
  );
  await page.mouse.move(0, 0);

  // stack: false — every source from zero, the battery's 4.2 under the sun's 5.6; thin lines
  const own = energy('Issue #49 · each source from zero, thin lines');
  const oplot = await plotOf(own);
  await page.mouse.move(oplot.x(11.95), oplot.y);
  await page.waitForTimeout(200);
  const o = await scales(own);
  await page.mouse.move(0, 0);
  const dot = (ink) => o.dots.find((d) => d.ink === ink)?.y ?? Number.NaN;
  check(
    'issue #49: `stack: false` draws every source from zero, seen through: the battery’s 4.2 under the sun’s 5.6',
    o.own === o.areas &&
      o.areas > 0 &&
      Math.abs(dot('en-ink--battery') - yOf(o, 4.2)) < 1.5 &&
      Math.abs(dot('en-ink--solar') - yOf(o, 5.6)) < 1.5 &&
      o.legend[0] === 'Solar5.6kW' &&
      o.legend[1] === 'Battery4.2kW',
    JSON.stringify([o.own, o.areas, o.dots, o.legend]),
  );
  check(
    'issue #49: `line_width: thin` draws the bands’ edges and the house’s line 1 px (2 px by default)',
    o.line === '1px' && o.house === '1px' && w.line === '2px' && w.house === '2px',
    JSON.stringify([o.line, o.house, w.line, w.house]),
  );

  // a phone keeps both scales and the five hours; half a column folds the charge's into its readout
  const phone = await scales(energy('Issue #49 · a phone'));
  const apart = (hours) =>
    hours.every((h, i) => i === 0 || h.left - (hours[i - 1]?.right ?? 0) >= 11.5);
  check(
    'issue #49: on a phone both scales and the five hours, 12 apart',
    phone.power.length === 4 &&
      phone.charge.length === 3 &&
      phone.hours.length === 5 &&
      apart(phone.hours) &&
      phone.plot[1] >= 200,
    JSON.stringify([phone.plot, phone.hours]),
  );
  const half = await scales(energy('Issue #49 · half a column'));
  check(
    'issue #49: in half a column the charge’s scale folds into its readout ("100 %" back as a tag), the power’s stays',
    half.charge.length === 0 &&
      half.power.length === 4 &&
      half.tags.join() === 'Sources,100 %' &&
      half.plot[0] + half.plot[1] === half.width &&
      apart(half.hours),
    JSON.stringify([half.plot, half.tags, half.hours]),
  );

  // by source: the same scale, and the legend lists each origin's power while read
  const sources = energy('Issue #49 · by source');
  const splot = await plotOf(sources);
  await page.mouse.move(splot.x(11.95), splot.y);
  await page.waitForTimeout(200);
  const s = await scales(sources);
  await page.mouse.move(0, 0);
  check(
    'issue #49: by source, the same scale and gridlines, and each origin’s power while read',
    s.power.map((t) => t.text).join() === '−5,0,5,10' &&
      s.charge.length === 0 &&
      s.grid.length === 3 &&
      /^11:5\d 9\.8 ?kW$/.test(s.reading) &&
      s.legend.slice(0, 2).join(' | ') === 'Solar5.6kW | Battery4.2kW',
    JSON.stringify([s.power, s.reading, s.legend]),
  );

  // both off: the chart as before, on the day's own extremes, the tag under the line back
  const bare = await scales(energy('Issue #49 · no scale, no gridlines'));
  check(
    '`show_axis: false` and `show_grid: false`: no scale, no gridlines, the whole width, the tags as before',
    bare.power.length === 0 &&
      bare.grid.length === 0 &&
      bare.plot[0] === 0 &&
      bare.plot[1] === bare.width &&
      bare.tags.length === 3 &&
      bare.zero?.dash !== 'none',
    JSON.stringify([bare.plot, bare.tags, bare.zero]),
  );

  // A7: an unavailable or missing sensor keeps the card's size and anatomy
  const heights = (title) =>
    frame(page, title)
      .locator('fluvy-energy-card')
      .evaluateAll((cards) => cards.map((c) => c.getBoundingClientRect().height));
  for (const title of [
    'Energy · live and unavailable',
    'Energy · live and not found',
    'The whole house · live and unavailable',
  ]) {
    const [live, dead] = await heights(title);
    check(
      `A7: ${title} — the same height`,
      live > 0 && Math.abs(live - dead) <= 0.5,
      JSON.stringify([live, dead]),
    );
  }
  const missing = await energy('Energy · live and not found', 1).evaluate((el) => ({
    empty: el.shadowRoot.querySelector('.fv-card--empty') !== null,
    chart: el.shadowRoot.querySelector('.ef-chart') !== null,
    axis: el.shadowRoot.querySelector('.fv-axis') !== null,
    value: (el.shadowRoot.querySelector('.fv-readout__value')?.textContent ?? '').trim(),
  }));
  check(
    'A7: a sensor that is not there keeps the card’s anatomy (its reading "—", the chart’s room, the hours)',
    !missing.empty && missing.chart && missing.axis && missing.value === '—',
    JSON.stringify(missing),
  );
  await page.close();
}

/* ---------- 1.3's YAML still draws ---------- */
{
  const page = await open('energy');
  const legacy = frame(page, 'Flow').locator('fluvy-energy-flow-card').first();
  check(
    '1.3 keys (solar_power, grid_power, battery_*) draw the same diagram',
    (await legacy.locator('.en-node').count()) === 4 &&
      (await legacy.locator('.en-flow').count()) === 3,
  );
  await page.close();
}

await suite.finish();
