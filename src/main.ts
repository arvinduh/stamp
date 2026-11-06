/**
 * @fileoverview Main entry point mounting the Svelte 5 Stamp application.
 */

import "@fontsource-variable/geist/wght.css";
import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/global.css";

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Failed to find target element #app to mount Stamp.");
}

const app = mount(App, {
  target: rootElement,
});

export { app };
