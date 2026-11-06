/**
 * @fileoverview A restrained burst of confetti for redeeming a reward.
 */

import confetti from "canvas-confetti";

/** Fires two soft waves in the card's tint, skipped under reduced motion. */
export function celebrateRedeem(tint: string): void {
  const colors = [tint, "#ffffff", "#ffd60a"];
  const base = {
    colors,
    disableForReducedMotion: true,
    gravity: 0.8,
    origin: { y: 0.42 },
    scalar: 0.8,
    shapes: ["circle" as const],
    ticks: 140,
  };
  void confetti({ ...base, particleCount: 36, spread: 70, startVelocity: 28 });
  setTimeout(() => {
    void confetti({
      ...base,
      particleCount: 22,
      spread: 110,
      startVelocity: 18,
    });
  }, 160);
}
