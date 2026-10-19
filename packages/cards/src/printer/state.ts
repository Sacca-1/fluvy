/*
 * What a printer is doing, whatever its integration calls it: OctoPrint's nineteen states, PrusaLink's, Bambu Lab's
 * gcode states, Moonraker's and the Snapmaker U1's print states, Creality's, Elegoo's many (its self-tests, its
 * homing and levelling, its filament loading), Anycubic's and FlashForge's, each folded into the few a card draws.
 * The words a card writes stay Home Assistant's (the state as it translates it); the phase decides the tone, the
 * progress bar and the buttons. A job's times are the appliances' too: `shared/job-time.ts`.
 */

export type PrinterPhase =
  'printing' | 'preparing' | 'paused' | 'finished' | 'stopped' | 'error' | 'idle' | 'offline';

const PHASES: ReadonlyArray<readonly [PrinterPhase, readonly string[]]> = [
  [
    'printing',
    [
      'printing',
      'printing_sd',
      'printing_streaming',
      'running',
      'busy',
      'resuming',
      'processing',
      'printing_recovery',
      // a resin printer's plate between layers
      'dropping',
      'lifting',
    ],
  ],
  [
    'preparing',
    [
      'prepare',
      'slicing',
      'init',
      'starting',
      'starting_sd',
      'starting_streaming',
      'transferring_file',
      'finishing',
      'self_testing',
      'homing',
      'homing_completed',
      'leveling',
      'auto_leveling_completed',
      'preheating',
      'preheating_completed',
      'heating',
      'calibrating',
      'file_checking',
      'printers_checking',
      'devices_testing',
      'exposure_testing',
      'resonance_testing',
      'resonance_testing_completed',
      'input_shaping',
      'pid_tuning',
      'file_transferring',
      'loading',
      'loading_unloading',
      'auto_feeding',
      'filament_unloading',
      'print_started',
      'recovery',
    ],
  ],
  ['paused', ['paused', 'pausing', 'pause', 'attention', 'filament_unload_paused']],
  ['finished', ['finished', 'finish', 'complete', 'completed']],
  ['stopped', ['stopped', 'cancelled', 'cancelling', 'stopping']],
  ['error', ['error', 'failed', 'offline_after_error', 'filament_unload_abnormal']],
  [
    'offline',
    ['offline', 'unavailable', 'connecting', 'detect_serial', 'open_serial', 'disconnected', 'off'],
  ],
];

/**
 * The phase of a status (a printer's state as its integration reports it), lower-cased; a binary "printing" sensor
 * where there is no status. Anything else — operational, idle, ready, standby, free, unknown, unrecognized — is idle.
 */
export function printerPhase(status: string | undefined, printing?: boolean): PrinterPhase {
  const state = (status ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (state) for (const [phase, states] of PHASES) if (states.includes(state)) return phase;
  if (!state && printing) return 'printing';
  return 'idle';
}

/** A job is under way: there is progress to draw and something to pause or stop. */
export const busy = (phase: PrinterPhase): boolean =>
  phase === 'printing' || phase === 'preparing' || phase === 'paused';
