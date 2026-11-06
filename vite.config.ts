/**
 * @fileoverview Vite build and dev server configuration for Stamp.
 *
 * Builds with a relative base for GitHub Pages. The backend is Supabase,
 * configured through `.env.local` (see `.env.example`).
 */

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// biome-ignore lint/style/noDefaultExport: Vite loads this config by default export.
export default defineConfig({
  plugins: [svelte()],
  base: "./",
});
