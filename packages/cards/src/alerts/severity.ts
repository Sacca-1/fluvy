import type { MessageKey } from '@fluvy/core';
import { TONES, type ChoosableTone, type Tone } from '@fluvy/ui';

/*
 * How much an alert matters, as data: the order alerts read in and the tone each is drawn in. A severity sets both;
 * a tone asked for by name (`tone: heat`) outranks the severity's, as everywhere in the language ("only a tone asked
 * for by name outranks a status"); a `color` paints the alert's identity (its circle, its rest wash), never the
 * severity's fill, and never its place in the order.
 */

export const SEVERITIES = ['critical', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** The tone an alert may be asked for by name: any tone a card may be given (`danger`, the critical one, among them). */
export type AlertTone = ChoosableTone;

/**
 * Each severity's tone: critical the danger fill, warning the warning's, info the notice — the accent where the
 * palette's accent never reads as a warning or a danger, else the status blue (Ember's peach, Flamingo's pink).
 */
export const SEVERITY_TONE: Readonly<Record<Severity, Tone>> = {
  critical: 'danger',
  warning: 'warning',
  info: 'notice',
};

/** Each severity's word (the editor's choices, a row's label). */
export const SEVERITY_WORDS: Readonly<Record<Severity, MessageKey>> = {
  critical: 'alerts.severity.critical',
  warning: 'alerts.severity.warning',
  info: 'alerts.severity.info',
};

export const isSeverity = (value: unknown): value is Severity =>
  typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);

/** A tone a config may ask for by name. */
export const isAlertTone = (value: unknown): value is AlertTone =>
  typeof value === 'string' && (TONES as readonly string[]).includes(value);

/** Most severe first: < 0 when `a` reads before `b`. */
export const bySeverity = (a: Severity, b: Severity): number =>
  SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b);

/** The more severe of two. */
export const graver = (a: Severity, b: Severity): Severity => (bySeverity(a, b) <= 0 ? a : b);

/** What an alert is drawn in: the tone by name, else its severity's; its own colour beside, for its identity only. */
export interface AlertLook {
  readonly tone: Tone;
  readonly color: string | undefined;
}

export function lookOf(
  severity: Severity,
  own: { readonly tone?: AlertTone | undefined; readonly color?: string | undefined },
): AlertLook {
  return { tone: own.tone ?? SEVERITY_TONE[severity], color: own.color };
}
