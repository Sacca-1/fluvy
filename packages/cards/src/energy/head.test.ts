// @vitest-environment happy-dom
import { nothing } from 'lit';
import { describe, expect, it } from 'vitest';
import { HeadFit } from './head.js';

/** A fitter on a host that only registers controllers; its ruler is a stub — 8 px a glyph, a pill adds its sides. */
function fitter(): HeadFit {
  const host = {
    addController() {},
    removeController() {},
    requestUpdate() {},
    renderRoot: undefined,
  } as unknown as ConstructorParameters<typeof HeadFit>[0];
  const fit = new HeadFit(host);
  Object.assign(fit as unknown as { ruler: unknown }, {
    ruler: {
      width: (_class: string, text: string) => text.length * 8,
      pill: (_class: string, text: string, sides: number) => text.length * 8 + sides,
      clear() {},
    },
  });
  return fit;
}

const badge = { text: 'On', tone: 'solar' as const };

describe('a fitted head', () => {
  it('keeps everything when the column holds it', () => {
    const fitted = fitter().fit({
      width: 300,
      title: 'Energy',
      sub: 'South roof · 5.4 kWp',
      badge,
    });
    expect(fitted.sub).toBe('South roof · 5.4 kWp');
    expect(fitted.badge).not.toBe(nothing);
    expect(fitted.icon).toBe(true);
  });

  it('lets the badge go first, then the sub’s trailing segments, and keeps the icon', () => {
    // 160 − 56 (icon) − 56 (badge + gap) leaves 48: "Energy flow" (88) sends the badge aside; 104 holds it
    const fitted = fitter().fit({ width: 160, title: 'Energy flow', sub: 'Live · 5 s ago', badge });
    expect(fitted.badge).toBe(nothing);
    expect(fitted.sub).toBe('Live');
    expect(fitted.icon).toBe(true);
  });

  it('lets the badge go before a single segment of the sub does', () => {
    // 300 − 56 − 56 leaves 188: "Peak price · 0.42 €/kWh" (184) fits beside it; at 280 (168) the badge goes, the sub stays whole
    const peak = { width: 280, title: 'Energy flow', sub: 'Peak price · 0.42 €/kWh', badge };
    expect(fitter().fit({ ...peak, width: 300 }).badge).not.toBe(nothing);
    const fitted = fitter().fit(peak);
    expect(fitted.badge).toBe(nothing);
    expect(fitted.sub).toBe('Peak price · 0.42 €/kWh');
  });

  it('lets the icon go last, and the sub takes the room back', () => {
    // 132 − 56 leaves 76 for an 88 px title: the circle goes; 132 then holds title and sub in full
    const fitted = fitter().fit({ width: 132, title: 'Energy flow', sub: 'Live · 5 s ago', badge });
    expect(fitted.icon).toBe(false);
    expect(fitted.badge).toBe(nothing);
    expect(fitted.sub).toBe('Live · 5 s ago');
  });

  it('lets the icon go for a sub whose first segment the column cannot hold beside it', () => {
    // 158 − 56 leaves 102: "Where" (40) fits, "Desde medianoche" (128) does not; 158 holds it
    const fitted = fitter().fit({ width: 158, title: 'Where', sub: 'Desde medianoche · 17,7 kWh' });
    expect(fitted.icon).toBe(false);
    expect(fitted.sub).toBe('Desde medianoche');
  });
});

describe('a badge that is the card’s alert (badgeFirst)', () => {
  it('keeps the badge while the sub’s trailing segments give way', () => {
    // 220 − 56 (icon) − 36 (the badge "On" and its gap) leaves 128: "6 sensors · 3 rooms" (152) loses its rooms
    const sub = '6 sensors · 3 rooms';
    const plain = fitter().fit({ width: 220, title: 'Doors', sub, badge });
    expect(plain.badge).toBe(nothing);
    const first = fitter().fit({ width: 220, title: 'Doors', sub, badge, badgeFirst: true });
    expect(first.badge).not.toBe(nothing);
    expect(first.sub).toBe('6 sensors');
  });

  it('lets the badge go only where the sub’s first segment would not hold beside it', () => {
    const fitted = fitter().fit({
      width: 180,
      title: 'Doors',
      sub: 'Eighteen sensors · 3 rooms',
      badge,
      badgeFirst: true,
    });
    expect(fitted.badge).toBe(nothing);
    expect(fitted.sub).toBe('Eighteen sensors');
  });
});

describe('the circle gives way only where that helps the name (#42)', () => {
  it('goes in the reporter’s half a phone section, where the switch leaves the name no room beside it', () => {
    // 136 − 56 − 68 leaves 12 for "Living room ceiling" (152): under a name's start (96), so the circle goes
    const fitted = fitter().fit({ width: 136, title: 'Living room ceiling', trailing: 56 });
    expect(fitted.icon).toBe(false);
    expect(fitted.cut).toBe(true);
  });

  it('goes where its room makes the name whole', () => {
    // 171 − 56 − 56 leaves 59 for "Actions" (56): whole beside it
    expect(fitter().fit({ width: 171, title: 'Actions', trailing: 44 }).icon).toBe(true);
    // "Groceries" (72) needs the circle's room: 115 holds it whole
    const fitted = fitter().fit({ width: 171, title: 'Groceries', trailing: 44 });
    expect(fitted.icon).toBe(false);
    expect(fitted.cut).toBe(false);
  });

  it('stays where the name would be cut anyway and keeps its start beside the circle', () => {
    // 300 − 56 leaves 244 for a 320 px name: 300 would not hold it either, and 244 is well past a start
    const fitted = fitter().fit({ width: 300, title: 'A'.repeat(40) });
    expect(fitted.icon).toBe(true);
    expect(fitted.cut).toBe(true);
  });

  it('obeys the card: `always` keeps it however long the name, `never` draws none however short', () => {
    // 211's 171 − 56 − 68 leaves 47: the floor (40) and more, the name ending in its ellipsis
    const always = fitter().fit({
      width: 171,
      title: 'Living room ceiling',
      trailing: 56,
      icon: 'always',
    });
    expect([always.icon, always.small, always.cut]).toEqual([true, false, true]);
    const never = fitter().fit({ width: 300, title: 'Hall', icon: 'never' });
    expect(never.icon).toBe(false);
    expect(never.cut).toBe(false);
  });

  it('keeps an `always` name its floor beside the switch: the smaller circle first, then none (#42)', () => {
    const lamp = (width: number, title = 'Living room ceiling') =>
      fitter().fit({ width, title, sub: 'On · 66 %', trailing: 56, icon: 'always' });
    // 164 − 56 − 68 leaves the name its 40: the full circle
    expect([lamp(164).icon, lamp(164).small]).toEqual([true, false]);
    // 162 leaves 38 beside the full circle, 42 beside the smaller one (40 and its 12)
    expect([lamp(162).icon, lamp(162).small, lamp(162).cut]).toEqual([true, true, true]);
    // half a phone's section (172: 132 of content; 152: 112): not even the smaller circle leaves a name, so none —
    // never "L…" or an empty name beside a circle
    for (const width of [132, 112]) {
      const fitted = lamp(width);
      expect([fitted.icon, fitted.small], `${width}`).toEqual([false, false]);
      expect(fitted.sub, `${width}`).not.toBe('');
    }
    // a name shorter than the floor needs only its own width: "TV" (16) keeps the full circle at 140
    expect([lamp(140, 'TV').icon, lamp(140, 'TV').small, lamp(140, 'TV').cut]).toEqual([
      true,
      false,
      false,
    ]);
    // `auto` is as it was: the circle goes where the name would end before it had begun
    expect(fitter().fit({ width: 162, title: 'Living room ceiling', trailing: 56 }).icon).toBe(
      false,
    );
  });

  it('reads `show_icon` from the card it fits', () => {
    const fit = fitter();
    Object.assign((fit as unknown as { host: object }).host, { showIcon: 'never' });
    expect(fit.fit({ width: 300, title: 'Hall' }).icon).toBe(false);
  });
});

describe('a list’s circles (rowsKeepIcon) by what ends each row', () => {
  it('counts a chevron’s 44 or a switch’s 56, not an empty value', () => {
    // 200 − 56 − 12 − 44 leaves 88 for "Front door" (80): kept; a switch's 56 leaves 76: given
    expect(fitter().rowsKeepIcon(200, [{ title: 'Front door', value: '', end: 44 }])).toBe(true);
    expect(fitter().rowsKeepIcon(200, [{ title: 'Front door', value: '', end: 56 }])).toBe(false);
    // no end and no value: only the circle and the gap (the old reading of a chevron row)
    expect(fitter().rowsKeepIcon(160, [{ title: 'Front door', value: '' }])).toBe(true);
  });

  it('gives every circle with the one row that needs it', () => {
    const rows = [
      { title: 'Gate', value: 'Locked' },
      { title: 'Living room motion', value: 'Not detected' },
    ];
    expect(fitter().rowsKeepIcon(250, rows)).toBe(false);
    expect(fitter().rowsKeepIcon(360, rows)).toBe(true);
  });

  it('measures a row’s room without its circle once given', () => {
    expect(fitter().rowRoom(200, '', { icon: false, end: 44 })).toBe(200 - 12 - 44);
    expect(fitter().rowRoom(200, 'Open', { end: 0 })).toBe(200 - 56 - 12);
  });
});

describe('a line that is not cut (1.9): its shorter forms, a row’s words, an empty panel’s line', () => {
  it('takes the sub’s shorter form where not even its first segment holds', () => {
    // 152 − 56 (the round's 44 and its gap) leaves 96 once the circle went for "Energy" (48 in 40): "Updated 32 days
    // ago" (152) does not hold, "32 days ago" (88) does
    const fitted = fitter().fit({
      width: 152,
      title: 'Energy',
      sub: 'Updated 32 days ago',
      trailing: 44,
      shorter: ['32 days ago'],
    });
    expect(fitted.sub).toBe('32 days ago');
    // where the line holds, its shorter forms are never read
    const wide = fitter().fit({
      width: 300,
      title: 'Energy',
      sub: 'Since midnight',
      shorter: ['Today'],
    });
    expect(wide.sub).toBe('Since midnight');
    expect(wide.icon).toBe(true);
  });

  it('lets the line go where its last shorter form is none', () => {
    const fitted = fitter().fit({
      width: 112,
      title: 'Maison',
      sub: 'Aujourd’hui · toute la maison',
      trailing: 44,
      shorter: [''],
    });
    expect(fitted.sub).toBe('');
  });

  it('gives a list’s circles to a row’s required words (`sub`) as to its name', () => {
    // beside a 56 circle, a 12 gap and "1.2 kW" (48) the words have 55 of 171: "64 %" (32) holds there
    const row = { title: 'Car', value: '1.2 kW' };
    expect(fitter().rowsKeepIcon(171, [{ ...row, sub: '64 %' }])).toBe(true);
    expect(fitter().rowsKeepIcon(171, [{ ...row, sub: 'descargando 500 W' }])).toBe(false);
  });

  it('keeps an empty panel’s words where they hold two lines between words, else its short form', () => {
    // half a section: 112 − 32 leaves 80, ten glyphs a line
    const fit = fitter();
    expect(fit.emptyText('No history yet', 112, 'No history')).toBe('No history yet');
    expect(fit.emptyText('Ancora nessuna cronologia', 112, 'Nessuna cronologia')).toBe(
      'Nessuna cronologia',
    );
    // a word wider than the line ("geschiedenis", 96) would break inside it
    expect(fit.emptyText('Nog geen geschiedenis', 112, 'Geen historie')).toBe('Geen historie');
    expect(fit.emptyText('Nog geen geschiedenis', 112)).toBe('Nog geen geschiedenis');
  });
});
