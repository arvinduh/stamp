/**
 * @fileoverview Turns a picked photo into a compact card header image, plus
 * a matching card tint.
 */

import { dominantTint } from "../lib/palette";

/** Photo aspect ratio (width / height), matching the card header. */
const ASPECT = 2.8;
/** About 440 KB once decoded; well under the storage bucket's 2 MB cap. */
const MAX_DATA_URL_CHARS = 600000;
const WIDTHS = [1200, 960, 800, 640];
const QUALITIES = [0.82, 0.72, 0.6];

/** A compressed background and the tint sampled from it. */
export interface PreparedImage {
  dataUrl: string;
  color: string;
}

/**
 * Center-crops, downsizes, and re-encodes `file` until it is under the size cap.
 *
 * Errors: throws when the file cannot be decoded as an image, or when even
 * the smallest encoding is still over the cap.
 */
export async function prepareBackground(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const srcAspect = bitmap.width / bitmap.height;
  const cropW = srcAspect > ASPECT ? bitmap.height * ASPECT : bitmap.width;
  const cropH = cropW / ASPECT;
  const sx = (bitmap.width - cropW) / 2;
  const sy = (bitmap.height - cropH) / 2;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("This browser cannot process images.");
  }

  const color = sampleTint(ctx, bitmap, sx, sy, cropW, cropH);
  for (const width of WIDTHS) {
    canvas.width = Math.round(Math.min(width, cropW));
    canvas.height = Math.round(canvas.width / ASPECT);
    ctx.drawImage(
      bitmap,
      sx,
      sy,
      cropW,
      cropH,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    for (const quality of QUALITIES) {
      const dataUrl = encode(canvas, quality);
      if (dataUrl.length <= MAX_DATA_URL_CHARS) {
        bitmap.close();
        return { dataUrl, color };
      }
    }
  }
  bitmap.close();
  throw new Error("That image is too detailed to save. Try another one.");
}

/** Prefers WebP; falls back to JPEG where the browser cannot encode WebP. */
function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) {
    return webp;
  }
  return canvas.toDataURL("image/jpeg", quality);
}

/** Edge (px) of the thumbnail the dominant color is measured on. */
const SAMPLE_SIZE = 32;

/**
 * Finds the card tint for an already-saved photo (a data or https URL).
 *
 * Errors: rejects when the image cannot be loaded or decoded.
 */
export async function colorFromImage(src: string): Promise<string> {
  // createImageBitmap, unlike img.decode(), resolves even while the page
  // is not being drawn (a background tab).
  const res = await fetch(src);
  const bitmap = await createImageBitmap(await res.blob());
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("This browser cannot process images.");
  }
  const color = sampleTint(ctx, bitmap, 0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return color;
}

/** Measures the dominant tint of a region at thumbnail size. */
function sampleTint(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  w: number,
  h: number,
): string {
  ctx.canvas.width = SAMPLE_SIZE;
  ctx.canvas.height = SAMPLE_SIZE;
  ctx.drawImage(source, sx, sy, w, h, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return dominantTint(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
}
