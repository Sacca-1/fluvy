import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  clockSeconds,
  durationSeconds,
  elapsedSeconds,
  finishedAt,
  jobClock,
  timeLeft,
  when,
  whenText,
  type JobSources,
} from './job-time.js';

/**
 * The house is on Kiritimati (UTC+14, a zone no test runner is in) and its people read the server's time: at 20:00
 * UTC on Thursday the 17th it is 10:00 on Friday the 18th there.
 */
const house = (language = 'en') =>
  ({
    language,
    config: { time_zone: 'Pacific/Kiritimati' },
    locale: { language, time_format: '24', time_zone: 'server', number_format: 'language' },
  }) as unknown as HomeAssistant;
const NOW = Date.parse('2026-09-17T20:00:00Z');
const HOUR = 3_600_000;

const sources = (given: Partial<JobSources>): JobSources => ({
  remaining: null,
  finish: null,
  total: null,
  elapsed: null,
  progress: null,
  started: null,
  ...given,
});

describe('a job’s times', () => {
  it('reads a duration in its unit, and the time left from a remaining time or a finish time', () => {
    expect(durationSeconds(72, 'min')).toBe(4320);
    expect(durationSeconds(1.5, 'h')).toBe(5400);
    expect(durationSeconds(90, 's')).toBe(90);
    expect(durationSeconds(5_400_000, 'ms')).toBe(5400);
    expect(durationSeconds(null, 'min')).toBeNull();
    const now = Date.parse('2026-09-17T12:00:00Z');
    expect(timeLeft(3600, null, now)).toEqual({ left: 3600, at: now + 3_600_000 });
    expect(timeLeft(null, now + 1_800_000, now)).toEqual({ left: 1800, at: now + 1_800_000 });
    expect(timeLeft(null, null, now)).toEqual({ left: null, at: null });
    // both known: the integration's finish time says when (it does not drift), its remaining time how long
    expect(timeLeft(3540, now + 3_600_000, now)).toEqual({ left: 3540, at: now + 3_600_000 });
  });

  it('reads a clock’s "HH:MM:SS" as seconds, and nothing shorter unless the job is counted in hours', () => {
    expect(clockSeconds('01:02:03')).toBe(3723);
    expect(clockSeconds('1:02:03')).toBe(3723);
    expect(clockSeconds('00:45:10')).toBe(2710);
    expect(clockSeconds('45:10')).toBeNull();
    expect(clockSeconds('01:60:00')).toBeNull();
    expect(clockSeconds('3723')).toBeNull();
    expect(clockSeconds(undefined)).toBeNull();
    // LG's older integration writes its times as hours, minutes and "00" (smartthinq_sensors device_helpers.py:81-98)
    expect(clockSeconds('1:05:00', 'h:mm')).toBe(3900);
    // an appliance's "1:35" is an hour and 35 minutes: no washer is timed to the second
    expect(clockSeconds('1:35', 'h:mm')).toBe(5700);
    expect(clockSeconds('0:07', 'h:mm')).toBe(420);
    expect(clockSeconds('1:75', 'h:mm')).toBeNull();
    expect(clockSeconds('135', 'h:mm')).toBeNull();
  });

  it('says when a finished job finished, never now, and how long a job has run', () => {
    const now = Date.parse('2026-09-17T12:00:00Z');
    // the finish time the job reported; else when its status changed
    expect(finishedAt(now - 1_800_000, now - 60_000, now)).toBe(now - 1_800_000);
    expect(finishedAt(null, now - 60_000, now)).toBe(now - 60_000);
    // a finish time still ahead (an estimate left over) is not when it finished
    expect(finishedAt(now + 3_600_000, now - 60_000, now)).toBe(now - 60_000);
    expect(elapsedSeconds(4200, null, now)).toBe(4200);
    expect(elapsedSeconds(null, now - 5_700_000, now)).toBe(5700);
    expect(elapsedSeconds(null, null, now)).toBeNull();
  });
});

describe('a running job’s clock', () => {
  it('takes the progress from the total and the time left (LG: a finish time and a total in minutes)', () => {
    const clock = jobClock(sources({ finish: NOW + 30 * 60_000, total: 120 * 60 }), NOW);
    expect(clock).toEqual({
      left: 1800,
      at: NOW + 1_800_000,
      total: 7200,
      elapsed: 5400,
      progress: 75,
    });
  });

  it('takes it from what has run and what is left (Miele: elapsed and remaining minutes)', () => {
    const clock = jobClock(sources({ remaining: 1800, elapsed: 600 }), NOW);
    expect(clock.total).toBe(2400);
    expect(clock.progress).toBe(25);
    expect(clock.at).toBe(NOW + 1_800_000);
  });

  it('keeps the integration’s own progress, clamped (Home Connect: a percent and a finish time)', () => {
    const clock = jobClock(sources({ finish: NOW + HOUR, progress: 40 }), NOW);
    expect(clock.progress).toBe(40);
    expect(clock.left).toBe(3600);
    expect(jobClock(sources({ progress: 104 }), NOW).progress).toBe(100);
  });

  it('works the whole out from the start and the end, and says nothing it cannot know', () => {
    const started = jobClock(sources({ finish: NOW + HOUR, started: NOW - HOUR }), NOW);
    expect(started).toEqual({
      left: 3600,
      at: NOW + HOUR,
      total: 7200,
      elapsed: 3600,
      progress: 50,
    });
    // only a finish time: when it ends and how long is left, no progress, no total
    expect(jobClock(sources({ finish: NOW + HOUR }), NOW)).toEqual({
      left: 3600,
      at: NOW + HOUR,
      total: null,
      elapsed: null,
      progress: null,
    });
    // only a remaining time: the same, counted from now
    expect(jobClock(sources({ remaining: 600 }), NOW).at).toBe(NOW + 600_000);
    expect(jobClock(sources({}), NOW)).toEqual({
      left: null,
      at: null,
      total: null,
      elapsed: null,
      progress: null,
    });
  });
});

describe('when a job is, as a line says it', () => {
  it('reads the house’s calendar: Friday morning there is today, whatever the runner’s day', () => {
    const hass = house();
    // 22:30 UTC on the 17th is 12:30 on Friday the 18th on Kiritimati: today
    expect(when(hass, Date.parse('2026-09-17T22:30:00Z'), NOW)).toMatchObject({
      time: '12:30',
      days: 0,
      ago: '',
    });
    // 09:30 UTC on the 17th is 23:30 on Thursday there: yesterday, though only ten hours ago
    expect(when(hass, Date.parse('2026-09-17T09:30:00Z'), NOW)).toMatchObject({
      days: -1,
      ago: 'yesterday',
    });
    expect(when(hass, NOW - 3 * 24 * HOUR, NOW)).toMatchObject({ days: -3, ago: '3 days ago' });
  });

  it('says when it will be ready, when it starts and when it finished, across midnight', () => {
    const hass = house();
    expect(whenText(hass, 'ready', Date.parse('2026-09-17T22:32:00Z'), NOW)).toBe('Ready at 12:32');
    // 15:27 UTC on the 18th is 05:27 on Saturday the 19th there
    expect(whenText(hass, 'ready', Date.parse('2026-09-18T15:27:00Z'), NOW)).toBe(
      'Ready Sat at 05:27',
    );
    // a week out says its date, so it never reads like tomorrow
    expect(whenText(hass, 'ready', NOW + 8 * 24 * HOUR, NOW)).toMatch(
      /^Ready \w{3}, \w{3} \d+ at 10:00$/,
    );
    expect(whenText(hass, 'start', Date.parse('2026-09-18T12:00:00Z'), NOW)).toBe(
      'Starts Sat at 02:00',
    );
    expect(whenText(hass, 'start', NOW + 2 * HOUR, NOW)).toBe('Starts at 12:00');
    expect(whenText(hass, 'done', NOW - HOUR, NOW)).toBe('Finished at 09:00');
    expect(whenText(hass, 'done', Date.parse('2026-09-17T09:30:00Z'), NOW)).toBe(
      'Finished yesterday',
    );
    expect(whenText(hass, 'done', NOW - 2 * 24 * HOUR, NOW)).toBe('Finished 2 days ago');
  });

  it('says it in the house’s language, worded for any job', () => {
    expect(whenText(house('de'), 'done', NOW - 2 * 24 * HOUR, NOW)).toBe('Beendet vor 2 Tagen');
    expect(whenText(house('es'), 'ready', NOW + HOUR, NOW)).toBe('Termina a las 11:00');
  });
});
