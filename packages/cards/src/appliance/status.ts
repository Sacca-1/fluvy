import type { ApplianceKind } from './kinds.js';

/*
 * What an appliance is doing, whatever its integration calls it: Home Connect's nine operation states, Miele's
 * nineteen statuses, LG's eighty-odd current states, SmartThings' machine states, Matter's operational states,
 * Whirlpool's cycle states, hOn's numbers, Electrolux's appliance states, each folded into the few a card draws. The
 * words a card writes stay Home Assistant's (the state as it translates it); the status decides the tone, the bar,
 * the buttons and the line under the head. The phase a cycle is at is folded the same way into the steps a bar can
 * show: a washer washes, rinses and spins; a dishwasher prewashes, washes, rinses and dries; a dryer dries, cools and
 * keeps the load from creasing.
 */

export type ApplianceStatus =
  | 'off'
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'preheating'
  | 'paused'
  | 'attention'
  | 'finished'
  | 'error'
  | 'offline';

export const APPLIANCE_STATUSES: readonly ApplianceStatus[] = [
  'off',
  'idle',
  'scheduled',
  'running',
  'preheating',
  'paused',
  'attention',
  'finished',
  'error',
  'offline',
];

/** The words every integration shares, by the status they say; lower case, spaces and hyphens as underscores. */
const STATUSES: ReadonlyArray<readonly [ApplianceStatus, readonly string[]]> = [
  ['offline', ['unavailable', 'offline', 'not_connected', 'disconnected']],
  // LG's sleep is its washer's display asleep: off to the eye, and it wakes only by its own button
  ['off', ['off', 'power_off', 'inactive', 'sleep']],
  [
    'scheduled',
    [
      'delayedstart',
      'delayed_start',
      'waiting_to_start',
      'delay_countdown',
      'delay_paused',
      'delay_wait',
      'smart_delay',
      'reservation',
      'reserved',
      'scheduled',
      'scheduled_start',
    ],
  ],
  [
    'preheating',
    ['preheat', 'preheating', 'pre_heating', 'fast_preheat', 'heating_up', 'superheating'],
  ],
  // a rinse hold is the programme paused in its rinse water, until the person lets it spin
  [
    'paused',
    [
      'pause',
      'paused',
      'user_paused',
      'rinse_hold',
      'smart_grid_pause',
      'frozen_prevent_pause',
      'pausing',
    ],
  ],
  ['attention', ['actionrequired', 'action_required', 'service']],
  [
    'finished',
    [
      'finished',
      'finish',
      'end',
      'complete',
      'completed',
      'done',
      'program_ended',
      'end_of_cycle',
      'cook_complete',
      'cleaning_is_done',
      'running_end',
    ],
  ],
  [
    'error',
    [
      'error',
      'failure',
      'failed',
      'fault',
      'alarm',
      'hard_stop_or_error',
      'power_failure',
      'power_fail',
      'program_interrupted',
      'interrupted',
      'exception',
    ],
  ],
  [
    'idle',
    [
      'idle',
      'on',
      'ready',
      'ready_to_start',
      'initial',
      'standby',
      'stop',
      'stopped',
      'force_stopped',
      'none',
      'not_running',
      'programmed',
      'setting',
      'cancel',
      'cancelled',
      'power_on',
      'test',
      // an appliance updating, starting up or being set, LG's and Whirlpool's
      'firmware',
      'fota',
      'initializing',
      'diagnosis',
      'oven_setting',
      'preference',
      'setdate',
      'lock',
      'stay',
      'frozen_prevent_initial',
      'customer_focus_mode',
      'demo_mode',
      'factory_diagnostic_mode',
      'service_diagnostic_mode',
      'life_test',
      'system_initialize',
    ],
  ],
];

/** The words that say a cycle finished, every integration's (hOn says it with its 7). */
export const FINISHED_WORDS: readonly string[] =
  STATUSES.find(([status]) => status === 'finished')?.[1] ?? [];

/** hOn's numbers (gvigroux/hon translations/en.json "wash_mode", "dishwasher_mode", "tumbledryer_mode"). */
const HON: Readonly<Record<string, ApplianceStatus>> = {
  '0': 'offline',
  '1': 'idle',
  '2': 'running',
  '3': 'paused',
  '4': 'scheduled',
  '5': 'scheduled',
  '6': 'error',
  '7': 'finished',
  '8': 'idle',
  '9': 'running',
};
/** A dishwasher's are its own: 3 a delayed start, 5 one cancelled. */
const HON_DISHWASHER: Readonly<Record<string, ApplianceStatus>> = {
  ...HON,
  '3': 'scheduled',
  '5': 'idle',
};

/** A state word as the tables read it: lower case, spaces and hyphens as underscores (a dash alone is nothing). */
export const wordOf = (state: string | undefined): string =>
  (state ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** A word that says nothing: none, unknown, LG's older integration's dash (nothing once read) and "N/A". */
const NOTHING = new Set(['', 'unknown', 'n/a']);

/**
 * The status one state word says. hOn's numbers by its own table (a dishwasher's differ); Miele's "reserved" is a
 * status of its own, at rest; anything not idle, finished or off that the appliance says while it has a job is
 * running — a washer washing, rinsing or spinning, an oven cooking, a kettle heating. An empty word says nothing.
 */
export function statusOfWord(
  state: string | undefined,
  platform?: string,
  kind?: ApplianceKind,
): ApplianceStatus | undefined {
  const word = wordOf(state);
  if (NOTHING.has(word)) return undefined;
  if (platform === 'hon' && /^\d$/.test(word))
    return (kind === 'dishwasher' ? HON_DISHWASHER : HON)[word] ?? 'idle';
  if (platform === 'miele' && word === 'reserved') return 'idle';
  for (const [status, words] of STATUSES) if (words.includes(word)) return status;
  return 'running';
}

/** What a reading tells the status besides the state word. */
export interface StatusInput {
  /** The state role's raw state. */
  readonly state?: string | undefined;
  /** The phase role's raw state (SmartThings' job state "finish" while its machine is stopped). */
  readonly phase?: string | undefined;
  readonly platform?: string | undefined;
  readonly kind?: ApplianceKind | undefined;
  /** The power switch, where there is one and no state: on is at rest, off is off. */
  readonly power?: boolean | undefined;
  /** A running flag (a plug's threshold helper), where there is no state. */
  readonly running?: boolean | undefined;
  /** When the appliance last said a cycle finished (LG's "washing is completed", ms), if it did. */
  readonly completedAt?: number | null | undefined;
  readonly now: number;
  /** How long a finish is remembered (ms): LG's washers power off when done, and are done for this long. */
  readonly doneFor: number;
}

/**
 * The status of an appliance: its state word's, else its phase's; a finished phase over a stopped machine is
 * finished; an appliance that powered off within `doneFor` of saying it completed is finished (LG's washers power off
 * when done); with no state, a running flag or a power switch says what it can.
 */
export function applianceStatus(input: StatusInput): ApplianceStatus {
  const { platform, kind } = input;
  const said = statusOfWord(input.state, platform, kind);
  const phase = statusOfWord(input.phase, platform, kind);
  if (said === 'offline') return 'offline';
  if ((said === 'off' || said === 'idle') && input.completedAt != null) {
    const since = input.now - input.completedAt;
    if (since >= 0 && since <= input.doneFor) return 'finished';
  }
  if (said === 'idle' && phase === 'finished') return 'finished';
  if (said) return said;
  if (phase && phase !== 'idle') return phase;
  if (input.running !== undefined) return input.running ? 'running' : 'idle';
  if (input.power !== undefined) return input.power ? 'idle' : 'off';
  return phase ?? 'idle';
}

/** A job is under way: there is time to count, progress to draw and something to pause or stop. */
export const busy = (status: ApplianceStatus): boolean =>
  status === 'running' || status === 'preheating' || status === 'paused' || status === 'attention';

/* ---------- the steps of a cycle ---------- */

export type ApplianceStep = 'prewash' | 'wash' | 'rinse' | 'spin' | 'dry' | 'cool' | 'anti_crease';
export const APPLIANCE_STEPS: readonly ApplianceStep[] = [
  'prewash',
  'wash',
  'rinse',
  'spin',
  'dry',
  'cool',
  'anti_crease',
];

/**
 * The phase words of a cycle, by its step: Miele's programme phases, SmartThings' job states, LG's current states,
 * Whirlpool's cycle states, Electrolux's cycle phases, hOn's older words, LG's older integration's English.
 */
const STEPS: ReadonlyArray<readonly [ApplianceStep, readonly string[]]> = [
  [
    'prewash',
    [
      'prewash',
      'pre_wash',
      'pre_dishwash',
      'soak',
      'soaking',
      'cycle_soaking',
      'presteam',
      'steam_softening',
    ],
  ],
  [
    'wash',
    [
      'wash',
      'washing',
      'main_wash',
      'main_dishwash',
      'cycle_washing',
      'cycle_filling',
      'cycle_sensing',
      'ai_wash',
      'weight_sensing',
      'detecting',
      'detergent_amount',
      'running_maincycle',
      'cleaning',
      'steam',
    ],
  ],
  [
    'rinse',
    [
      'rinse',
      'rinsing',
      'rinses',
      'interim_rinse',
      'final_rinse',
      'cycle_rinsing',
      'ai_rinse',
      'rinse_hold',
    ],
  ],
  [
    'spin',
    [
      'spin',
      'spinning',
      'cycle_spinning',
      'ai_spin',
      'thermo_spin',
      'drain',
      'pre_drain',
      'running_postcycle',
    ],
  ],
  [
    'dry',
    [
      'dry',
      'drying',
      'ai_drying',
      'extra_dry',
      'normal',
      'normal_plus',
      'slightly_dry',
      'hand_iron',
      'hand_iron_1',
      'hand_iron_2',
      'machine_iron',
      'hygiene_drying',
      'timed_drying',
      'perfect_dry_active',
      'warm_air',
      'night_dry',
    ],
  ],
  [
    'cool',
    [
      'cool',
      'cooling',
      'cool_down',
      'cooling_down',
      'cooling_phase',
      'end_cooling',
      'safety_cooling',
    ],
  ],
  [
    'anti_crease',
    [
      'anti_crease',
      'anti_wrinkle',
      'wrinkle_prevent',
      'wrinkle_care',
      'smoothing',
      'steam_smoothing',
    ],
  ],
];

/** The steps a kind's bar shows, in order; a washer that prewashes shows it first. */
export function stepsOf(kind: ApplianceKind, current?: ApplianceStep): readonly ApplianceStep[] {
  switch (kind) {
    case 'washer':
      return current === 'prewash'
        ? ['prewash', 'wash', 'rinse', 'spin']
        : ['wash', 'rinse', 'spin'];
    case 'washer_dryer':
      return ['wash', 'rinse', 'spin', 'dry'];
    case 'dishwasher':
      return ['prewash', 'wash', 'rinse', 'dry'];
    case 'dryer':
      return ['dry', 'cool', 'anti_crease'];
    default:
      return [];
  }
}

/**
 * The step a phase word is, within what a kind's bar shows: a dishwasher's "drying" is its last step, a dryer's
 * "cooling" its second; a word the kind's steps do not hold says none. A dryer's drying levels ("normal", "extra dry")
 * are its drying.
 */
export function stepOf(kind: ApplianceKind, phase: string | undefined): ApplianceStep | undefined {
  const word = wordOf(phase);
  if (!word) return undefined;
  const step = STEPS.find(([, words]) => words.includes(word))?.[0];
  if (!step) return undefined;
  // a dishwasher's wash steps hold no spin: its drain is part of its rinse
  if (kind === 'dishwasher' && step === 'spin') return 'rinse';
  // a dryer's drying levels are words of its own; a washer's "normal" is not a step
  if (step === 'dry' && kind !== 'dryer' && kind !== 'washer_dryer' && kind !== 'dishwasher')
    return undefined;
  const steps = stepsOf(kind, step);
  return steps.includes(step) ? step : undefined;
}
