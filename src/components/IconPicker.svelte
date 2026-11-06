<!--
  @component IconPicker
  A small glass popover for a card's look: icon search and grid, color
  swatches, and a background photo. With a photo, the first swatch is the
  photo itself, which sets the color to the photo's dominant hue.

  Uses the native Popover API, which supplies top-layer stacking, light
  dismiss on outside taps, and Escape. Positioned under its anchor, flipping
  above when there is no room below. Render it inside an open modal dialog,
  never beside it, or the dialog makes it inert.
-->
<script lang="ts">
  import ImagePlus from "@lucide/svelte/icons/image-plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";
  import type { Card } from "../types";
  import { ICON_ENTRIES } from "../lib/card_icons";
  import { isNearColor, PALETTE } from "../lib/palette";
  import { colorFromImage, prepareBackground } from "../utils/image";
  import { popIn } from "../utils/motion";

  /** The parts of a card this picker edits. */
  type Look = Pick<Card, "icon" | "color" | "background">;

  interface Props {
    /** The element the popover hangs from. */
    anchor: HTMLElement;
    look: Look;
    /** Values that Reset restores. */
    defaultIcon: string;
    defaultColor: string;
    onChange: (look: Look) => void;
    onClose: () => void;
  }

  let { anchor, look, defaultIcon, defaultColor, onChange, onClose }: Props =
    $props();

  const WIDTH = 272;
  const GAP = 8;
  const MARGIN = 12;

  let panel: HTMLDivElement;
  let searchInput: HTMLInputElement;
  let query = $state("");
  let top = $state(0);
  let left = $state(0);
  let photoColor = $state("");
  let processing = $state(false);
  let photoError = $state("");

  const inheritsPhoto = $derived(
    photoColor !== "" && isNearColor(look.color, photoColor),
  );

  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? ICON_ENTRIES.filter((e) => e.tags.includes(q)) : ICON_ENTRIES;
  });

  // Measure the saved photo's color once, for the "from photo" swatch.
  $effect(() => {
    const src = look.background;
    photoColor = "";
    if (!src) {
      return;
    }
    let live = true;
    colorFromImage(src).then(
      (c) => {
        if (live) {
          photoColor = c;
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  });

  onMount(() => {
    panel.showPopover();
    place();
    // Skip on touch screens, where focusing would throw up the keyboard.
    if (matchMedia("(pointer: fine)").matches) {
      searchInput.focus();
    }
  });

  function place() {
    const rect = anchor.getBoundingClientRect();
    const height = panel.offsetHeight;
    const below = rect.bottom + GAP;
    const fitsBelow = below + height <= innerHeight - MARGIN;
    top = fitsBelow ? below : Math.max(MARGIN, rect.top - GAP - height);
    left = Math.min(Math.max(MARGIN, rect.left), innerWidth - WIDTH - MARGIN);
  }

  function handleToggle(e: ToggleEvent) {
    if (e.newState === "closed") {
      onClose();
    }
  }

  async function handleFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    processing = true;
    photoError = "";
    try {
      const prepared = await prepareBackground(file);
      // A new photo brings its own color along.
      onChange({ ...look, background: prepared.dataUrl, color: prepared.color });
    } catch (err: unknown) {
      photoError =
        err instanceof Error ? err.message : "That photo could not be used.";
    } finally {
      processing = false;
    }
  }
</script>

<svelte:window onresize={place} />

<div
  bind:this={panel}
  class="picker"
  popover="auto"
  style:top={`${top}px`}
  style:left={`${left}px`}
  style:--tint={look.color}
  ontoggle={handleToggle}
>
  <div class="panel" in:popIn>
    <label class="search">
      <Search size={16} />
      <input
        bind:this={searchInput}
        bind:value={query}
        placeholder="search icons"
        aria-label="Search icons"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    <div class="grid" role="listbox" aria-label="Icons">
      {#each matches as entry (entry.key)}
        {@const Glyph = entry.component}
        <button
          type="button"
          class="cell"
          class:selected={entry.key === look.icon}
          role="option"
          aria-selected={entry.key === look.icon}
          aria-label={entry.key}
          title={entry.key}
          onclick={() => onChange({ ...look, icon: entry.key })}
        >
          <Glyph size={18} />
        </button>
      {:else}
        <p class="empty">No icons match “{query}”.</p>
      {/each}
    </div>

    <div class="swatches" role="radiogroup" aria-label="Color">
      {#if look.background && photoColor}
        <button
          type="button"
          class="swatch from-photo"
          class:selected={inheritsPhoto}
          role="radio"
          aria-checked={inheritsPhoto}
          aria-label="Color from photo"
          title="from photo"
          style:--swatch={photoColor}
          style:background-image={`url("${look.background}")`}
          onclick={() => onChange({ ...look, color: photoColor })}
        ></button>
      {/if}
      {#each PALETTE as swatch (swatch)}
        <button
          type="button"
          class="swatch"
          class:selected={swatch === look.color}
          role="radio"
          aria-checked={swatch === look.color}
          aria-label={swatch}
          style:--swatch={swatch}
          onclick={() => onChange({ ...look, color: swatch })}
        ></button>
      {/each}
    </div>

    <div class="footer">
      <label class="action" class:busy={processing}>
        <ImagePlus size={15} />
        {processing ? "preparing…" : look.background ? "change photo" : "add photo"}
        <input
          class="visually-hidden"
          type="file"
          accept="image/*"
          disabled={processing}
          onchange={handleFile}
        />
      </label>
      {#if look.background}
        <button
          type="button"
          class="action"
          aria-label="Remove photo"
          onclick={() => onChange({ ...look, background: "" })}
        >
          <X size={15} />
        </button>
      {/if}
      <button
        type="button"
        class="action"
        title="Reset icon and color"
        onclick={() =>
          onChange({ ...look, icon: defaultIcon, color: defaultColor })}
      >
        <RotateCcw size={14} /> reset
      </button>
    </div>
    {#if photoError}
      <p class="error" role="alert">{photoError}</p>
    {/if}
  </div>
</div>

<style>
  .picker {
    background: none;
    border: 0;
    inset: auto;
    margin: 0;
    overflow: visible;
    padding: 0;
    position: fixed;
    width: 272px;
  }

  .panel {
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    background: rgb(255 255 255 / 82%);
    border: 1px solid var(--glass-border-highlight);
    border-radius: 18px;
    box-shadow: var(--glass-shadow-hover);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
  }

  .search {
    align-items: center;
    background: var(--glass-surface-pill);
    border: 1px solid var(--glass-border-subtle);
    border-radius: 10px;
    color: var(--color-text-light);
    display: flex;
    gap: 8px;
    padding: 0 10px;
  }

  .search:focus-within {
    border-color: var(--tint);
  }

  .search input {
    background: none;
    border: 0;
    flex: 1;
    font-size: 0.9rem;
    min-width: 0;
    outline: none;
    padding: 8px 0;
  }

  .grid {
    display: grid;
    gap: 2px;
    grid-template-columns: repeat(7, 1fr);
    max-height: 196px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .cell {
    aspect-ratio: 1;
    border-radius: 9px;
    color: var(--tint);
    display: grid;
    place-items: center;
    transition:
      background-color 0.12s ease,
      transform 0.4s var(--ease-spring);
  }

  .cell:hover {
    background: color-mix(in srgb, var(--tint) 10%, transparent);
  }

  .cell:active {
    transform: scale(0.88);
  }

  .cell.selected {
    background: color-mix(in srgb, var(--tint) 18%, transparent);
  }

  .empty {
    color: var(--color-text-light);
    font-size: 0.8rem;
    grid-column: 1 / -1;
    padding: 12px 4px;
    text-align: center;
  }

  .swatches {
    border-top: 1px solid var(--glass-border-subtle);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: space-between;
    padding: 10px 2px 0;
  }

  .swatch {
    background: var(--swatch);
    border-radius: 50%;
    height: 20px;
    transition: transform 0.4s var(--ease-spring);
    width: 20px;
  }

  /* The photo itself, ringed in the color it yields. */
  .from-photo {
    background-position: center;
    background-size: cover;
    box-shadow: inset 0 0 0 2px var(--swatch);
  }

  .swatch.selected {
    box-shadow:
      0 0 0 2px #fff,
      0 0 0 4px var(--swatch);
  }

  .swatch:hover {
    transform: scale(1.12);
  }

  .swatch:active {
    transform: scale(0.85);
  }

  .footer {
    display: flex;
    gap: 4px;
  }

  .action {
    align-items: center;
    border-radius: 9px;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    font-size: 0.82rem;
    font-weight: 600;
    gap: 6px;
    justify-content: center;
    padding: 7px 9px;
  }

  .action:first-child {
    flex: 1;
  }

  .action:hover {
    background: var(--glass-surface-sunken);
  }

  .busy {
    opacity: 0.6;
  }

  .error {
    color: var(--color-danger);
    font-size: 0.78rem;
    font-weight: 600;
    text-align: center;
  }
</style>
