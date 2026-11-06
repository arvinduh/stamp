/** @fileoverview Svelte compiler config: TypeScript and CSS via Vite. */

import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// biome-ignore lint/style/noDefaultExport: Svelte loads this config by default export.
export default {
  preprocess: vitePreprocess(),
};
