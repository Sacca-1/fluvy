import { reducedMotion } from '@fluvy/ui';
import { pulseFrames, type Cubic } from './geometry.js';

/**
 * The pulses of a flow diagram. Every pulse is a comet carried along its lane by the Web Animations API — transform
 * and opacity only, the lane sampled once — so the compositor runs them without the main thread:
 *
 * - The pace is constant in px/s, 24 → 72 px/s as the flow's share of the house's peak (`max_power`): a long lane is
 *   not faster than a short one, and a trickle crawls.
 * - One to three pulses a lane by its power, one more per 140 px of lane, and never more than eight on a card: every
 *   flowing lane gets its first pulse (the strongest first), then the extras go to the strongest. `calm` keeps one
 *   pulse a lane at a slower pace; `off` and reduced motion keep none.
 * - A lane's pulses are masked by the lane itself (its trimmed path, stroked at its width): a comet's tail never shows
 *   before the lane starts, past its head, or off its curve.
 * - A reading that changes only the power retunes the pace (`updatePlaybackRate`, which keeps each pulse where it is);
 *   a lane that changes its way, its colour or its count fades its pulses out and the new ones in.
 * - Off screen (IntersectionObserver) or in a hidden tab, every pulse is paused.
 */

export type MotionMode = 'full' | 'calm' | 'off';
export const MOTION_MODES: readonly MotionMode[] = ['full', 'calm', 'off'];

export interface Pulse {
  /** The lane and the way it is travelled: a lane that reverses is a new key. */
  readonly key: string;
  /** The lane as travelled, from where the energy comes from. */
  readonly path: Cubic;
  /** How far a pulse travels: up to the arrowhead's base. */
  readonly run: number;
  /** Watts on the lane (only lanes above their threshold are given). */
  readonly watts: number;
  /** The origin's ink class (`en-ink--solar`) and, for a source with a colour of its own, its accent. */
  readonly ink: string;
  readonly accent?: string | undefined;
  /** A 2.5 px lane (legs): a thin comet. */
  readonly thin?: boolean;
  /** Its lane is drawn over the others (the cross's bridge): its pulses travel over them too. */
  readonly over?: boolean;
  /** The lane's body as drawn (up to its head): the pulses' mask. */
  readonly body: string;
}

const MAX_PULSES = 8;
const COMET = { lane: { lead: 23, thickness: 6 }, thin: { lead: 14.75, thickness: 2.5 } } as const;

/** 24 → 72 px/s by the flow's share of the peak (square root: the small flows still read as moving). */
export const pace = (watts: number, peak: number): number =>
  24 + 48 * Math.sqrt(Math.min(1, Math.max(0, watts) / Math.max(1, peak)));

/** Pulses a lane asks for: one under 1 kW, two under 3 kW, three above, and one more per 140 px of lane. */
export const density = (watts: number, run: number): number =>
  (watts < 1000 ? 1 : watts < 3000 ? 2 : 3) + Math.floor(run / 140);

/**
 * How many pulses each lane gets, eight on the card at most: every flowing lane its first (the strongest first when
 * there are more than eight), then the extras by strength.
 */
export function budget(pulses: readonly Pulse[], mode: MotionMode): Map<string, number> {
  const counts = new Map<string, number>();
  const strongest = [...pulses].sort((a, b) => b.watts - a.watts);
  let left = MAX_PULSES;
  for (const p of strongest) {
    counts.set(p.key, left > 0 ? 1 : 0);
    left = Math.max(0, left - 1);
  }
  if (mode === 'calm') return counts;
  for (const p of strongest) {
    const more = Math.min(left, density(p.watts, p.run) - 1);
    if (more <= 0) continue;
    counts.set(p.key, (counts.get(p.key) ?? 0) + more);
    left -= more;
  }
  return counts;
}

interface Running {
  readonly shape: string;
  /** The layer's size the pulses were masked for: a re-laid-out layer takes new ones at once. */
  readonly size: string;
  readonly group: HTMLElement;
  readonly layer: HTMLElement;
  readonly animations: Animation[];
  /** The duration the pulses were started with: a new pace is a playback rate against it. */
  readonly base: number;
}

/** A card's two layers of pulses: under the bridge, and over it. */
const layerOf = (root: ParentNode, over: boolean | undefined): HTMLElement | null =>
  root.querySelector<HTMLElement>(
    over ? '.en-pulses-layer--over' : '.en-pulses-layer:not(.en-pulses-layer--over)',
  );

export class PulseEngine {
  private readonly running = new Map<string, Running>();
  private observer: IntersectionObserver | undefined;
  private onScreen = true;

  constructor(private readonly host: HTMLElement) {}

  private readonly onVisibility = (): void => this.applyPause();

  connect(): void {
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver((entries) => {
        this.onScreen = entries.some((entry) => entry.isIntersecting);
        this.applyPause();
      });
      this.observer.observe(this.host);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const run of this.running.values()) run.group.remove();
    this.running.clear();
  }

  /** Brings the card's pulses to what its lanes ask for now (`root`: where its pulse layers are, `size` its box). */
  sync(
    root: ParentNode | null,
    pulses: readonly Pulse[],
    mode: MotionMode,
    peak: number,
    size: readonly [number, number] = [0, 0],
  ): void {
    const still =
      !root || mode === 'off' || reducedMotion() || this.host.hasAttribute('reduced-motion');
    const counts = still ? new Map<string, number>() : budget(pulses, mode);
    const wanted = new Map(pulses.map((p) => [p.key, p]));
    const sized = `${size[0]}x${size[1]}`;
    // pulses no longer asked for (or whose layer went with a re-drawn diagram) fade out; a layer that changed size
    // has moved its lanes, and a comet fading out along the old ones would ride off its lane: those go at once
    for (const [key, run] of this.running) {
      const p = wanted.get(key);
      const n = counts.get(key) ?? 0;
      const layer = root && p ? layerOf(root, p.over) : null;
      if (
        p &&
        n > 0 &&
        layer === run.layer &&
        run.layer.isConnected &&
        run.shape === shapeOf(p, n) &&
        run.size === sized
      )
        continue;
      if (run.size === sized) this.retire(run);
      else run.group.remove();
      this.running.delete(key);
    }
    if (!root) return;
    for (const p of pulses) {
      const n = counts.get(p.key) ?? 0;
      const layer = layerOf(root, p.over);
      if (n === 0 || !layer) continue;
      const speed = pace(p.watts, peak) * (mode === 'calm' ? 0.6 : 1);
      const duration = (p.run / speed) * 1000;
      const current = this.running.get(p.key);
      if (current) {
        // only the power changed: a new pace, each pulse where it is
        const rate = current.base / duration;
        for (const animation of current.animations)
          if (Math.abs(animation.playbackRate - rate) > 0.01) animation.updatePlaybackRate(rate);
        continue;
      }
      this.running.set(p.key, this.start(layer, p, n, duration, size));
    }
    this.applyPause();
  }

  private start(
    layer: HTMLElement,
    p: Pulse,
    n: number,
    duration: number,
    [width, height]: readonly [number, number],
  ): Running {
    const size = p.thin ? COMET.thin : COMET.lane;
    const frames = pulseFrames(p.path, p.run, size.lead, size.thickness);
    const group = document.createElement('span');
    group.className = `en-pulses ${p.ink}`;
    // the lane itself is the pulses' mask: nothing of a comet shows off its lane
    const mask = `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${p.body}" fill="none" stroke="#000" stroke-width="${size.thickness}" stroke-linecap="round"/></svg>`,
    )}")`;
    group.style.cssText = `width:${width}px;height:${height}px;mask-image:${mask};-webkit-mask-image:${mask};mask-size:${width}px ${height}px;-webkit-mask-size:${width}px ${height}px;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat`;
    group.dataset['lane'] = p.key;
    group.dataset['run'] = p.run.toFixed(1);
    if (p.accent) group.dataset['accent'] = p.accent;
    const animations: Animation[] = [];
    for (let i = 0; i < n; i++) {
      const comet = document.createElement('i');
      comet.className = `en-comet${p.thin ? ' en-comet--thin' : ''}`;
      group.append(comet);
      animations.push(
        comet.animate(frames, {
          duration,
          iterations: Infinity,
          delay: -(duration * i) / n,
          easing: 'linear',
        }),
      );
    }
    layer.append(group);
    // in on the next frame, so the fade runs
    requestAnimationFrame(() => group.classList.add('is-on'));
    return {
      shape: shapeOf(p, n),
      size: `${width}x${height}`,
      group,
      layer,
      animations,
      base: duration,
    };
  }

  private retire(run: Running): void {
    run.group.classList.remove('is-on');
    window.setTimeout(() => run.group.remove(), 420);
  }

  private applyPause(): void {
    const play = this.onScreen && document.visibilityState !== 'hidden';
    for (const run of this.running.values())
      for (const animation of run.animations) {
        if (play && animation.playState === 'paused') animation.play();
        else if (!play && animation.playState === 'running') animation.pause();
      }
  }
}

/** What a lane's pulses depend on besides their pace: a change rebuilds them. */
const shapeOf = (p: Pulse, n: number): string =>
  `${n}|${p.ink}|${p.accent ?? ''}|${p.thin ? 't' : ''}|${p.body}`;
