/**
 * @fileoverview Card tint palette and color helpers.
 *
 * Every tint must carry white text, so colors from photos are clamped to a
 * safe lightness range before use.
 */

/** Tints offered in the card editor, each legible under white text. */
export const PALETTE: readonly string[] = [
  "#d63a3a",
  "#d9661e",
  "#8a6a4f",
  "#2f9e5b",
  "#11829b",
  "#2f6fde",
  "#5a4fcf",
  "#9b45c9",
  "#d23f7a",
  "#3a3a3c",
];

/** Picks a stable palette tint for cards saved without a color. */
export function paletteColorFor(id: string): string {
  let hash = 0;
  for (const ch of id) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/**
 * Converts an average RGB color into a white-text-safe tint.
 *
 * Keeps the hue, lifts dull saturation a little, and holds lightness between
 * 28% and 46%.
 */
export function tintFromRgb(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
  const sat = s < 0.08 ? s : Math.min(0.85, s * 1.2 + 0.1);
  return hslToHex(h, sat, Math.min(0.46, Math.max(0.28, l)));
}

/** Per-channel difference treated as "the same color" by {@link isNearColor}. */
const NEAR_CHANNEL = 18;

/**
 * Whether two hex colors are close enough to count as one.
 *
 * A photo's tint is measured from the original upload and later from the
 * compressed copy; lossy encoding nudges the result by a few units.
 */
export function isNearColor(a: string, b: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) {
    return a === b;
  }
  for (let i = 1; i < 7; i += 2) {
    const ca = Number.parseInt(a.slice(i, i + 2), 16);
    const cb = Number.parseInt(b.slice(i, i + 2), 16);
    if (Math.abs(ca - cb) > NEAR_CHANNEL) {
      return false;
    }
  }
  return true;
}

/** Hue buckets (20° each) used to find a photo's dominant color. */
const HUE_BINS = 18;

/**
 * Picks the dominant vivid color of an image as a card tint.
 *
 * `rgba` is raw pixel data (4 bytes per pixel). Pixels are grouped by hue and
 * weighted by how saturated and well lit they are, so a sunset reads as
 * orange rather than averaging to brown. Each bucket also borrows half its
 * neighbors' weight, so a hue straddling a bucket edge is not split. Falls
 * back to the plain average for gray images.
 */
export function dominantTint(rgba: Uint8ClampedArray): string {
  const weight = new Float64Array(HUE_BINS);
  const sums = new Float64Array(HUE_BINS * 3);
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    const [h, s, l] = rgbToHsl(
      rgba[i] / 255,
      rgba[i + 1] / 255,
      rgba[i + 2] / 255,
    );
    if (s < 0.18 || l < 0.12 || l > 0.9) {
      continue;
    }
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    const bin = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS;
    weight[bin] += w;
    sums[bin * 3] += rgba[i] * w;
    sums[bin * 3 + 1] += rgba[i + 1] * w;
    sums[bin * 3 + 2] += rgba[i + 2] * w;
  }

  let best = -1;
  let bestScore = 0;
  for (let bin = 0; bin < HUE_BINS; bin++) {
    const score =
      weight[bin] +
      0.5 *
        (weight[(bin + 1) % HUE_BINS] +
          weight[(bin + HUE_BINS - 1) % HUE_BINS]);
    if (score > bestScore) {
      best = bin;
      bestScore = score;
    }
  }

  if (best < 0) {
    const n = rgba.length / 4;
    return tintFromRgb(r / n, g / n, b / n);
  }
  const w = weight[best];
  return tintFromRgb(
    sums[best * 3] / w,
    sums[best * 3 + 1] / w,
    sums[best * 3 + 2] / w,
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return [0, 0, l];
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) {
    h = ((g - b) / d + 6) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
