/**
 * @fileoverview Spring easing, Svelte transitions, and haptics.
 *
 * The spring here matches the `--ease-spring` curve in `variables.css`, so
 * JS-driven and CSS-driven motion feel like one system. Every transition
 * collapses to zero duration under `prefers-reduced-motion`.
 */

import type { TransitionConfig } from "svelte/transition";

const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/** Whether the user asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return reducedMotion?.matches ?? false;
}

function duration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

/** Damped spring with about 3% overshoot, normalized to land on 1. */
export function springOut(t: number): number {
  return t >= 1 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(5 * t);
}

/** Exponential ease-out for exits, which should not bounce. */
function expoOut(t: number): number {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

/** The call shape of a Svelte transition directive. */
type Transition = (node: Element) => TransitionConfig;

/** A dialog or popover lifting into place with a soft spring. */
export const popIn: Transition = () => ({
  duration: duration(420),
  easing: springOut,
  css: (t, u) =>
    `opacity: ${Math.min(1, t * 2.5)};
     transform: translateY(${u * 14}px) scale(${0.96 + 0.04 * t});`,
});

/** The quick, bounce-free exit that pairs with {@link popIn}. */
export const popOut: Transition = () => ({
  duration: duration(160),
  easing: expoOut,
  css: (t) => `opacity: ${t}; transform: scale(${0.98 + 0.02 * t});`,
});

/** A bottom sheet gliding up from the screen edge; no overshoot, so no gap. */
export const sheetIn: Transition = () => ({
  duration: duration(440),
  easing: expoOut,
  css: (t) => `transform: translateY(${(1 - t) * 100}%);`,
});

/** A bottom sheet dropping back off the screen edge. */
export const sheetOut: Transition = () => ({
  duration: duration(240),
  easing: expoOut,
  css: (t) => `transform: translateY(${(1 - t) * 100}%);`,
});

/**
 * Plain opacity fade for scrims and secondary chrome.
 *
 * Svelte always passes a params object (empty when none are given), so
 * options must be destructured, never taken positionally.
 */
export const fadeMotion: Transition = () => ({
  duration: duration(260),
  easing: expoOut,
  css: (t) => `opacity: ${t};`,
});

/** Rubber-stamp press: drops in large and tilted, then settles with a bounce. */
export const stampPress: Transition = () => ({
  duration: duration(460),
  css: (t) => {
    const e = springOut(t);
    const scale = 1.55 - 0.55 * e;
    const rotate = -14 * (1 - e);
    return `opacity: ${Math.min(1, t * 4)};
      transform: scale(${scale}) rotate(${rotate}deg);`;
  },
});

/** Ink ring that spreads out from a fresh stamp and fades away. */
export const inkRing: Transition = () => ({
  delay: duration(90),
  duration: duration(620),
  easing: expoOut,
  css: (t) => `opacity: ${0.55 * (1 - t)}; transform: scale(${1 + 0.7 * t});`,
});

/** Quick shrink-and-fade for a removed stamp. */
export const stampLift: Transition = () => ({
  duration: duration(180),
  easing: expoOut,
  css: (t) => `opacity: ${t}; transform: scale(${0.6 + 0.4 * t});`,
});

/**
 * A claimed pass lifting off the top of its deck and fading, the same way a
 * card leaves when flipped past.
 */
export const passLift: Transition = () => ({
  duration: duration(460),
  easing: expoOut,
  css: (t, u) =>
    `opacity: ${Math.min(1, t * 1.6)}; pointer-events: none;
     transform: translateY(${-u * 45}%) scale(${1 - 0.06 * u});`,
});

/** A short tap on devices that support vibration; a no-op elsewhere. */
export function haptic(pattern: number | number[] = 8): void {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
