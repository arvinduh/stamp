<!--
  @component StampPopover
  A small glass card hanging from one stamp: who gave it and when, its note
  as a real text field, and remove.

  Uses the native Popover API for top-layer stacking, light dismiss, and
  Escape. A changed note is saved when the popover closes, however it
  closes. Positioned under the stamp, flipping above when there is no room.
-->
<script lang="ts">
  import Trash from "@lucide/svelte/icons/trash-2";
  import { onMount, untrack } from "svelte";
  import type { StampRecord } from "../types";
  import { formatDateTime } from "../utils/time";
  import { popIn } from "../utils/motion";

  interface Props {
    /** The stamp the popover hangs from. */
    anchor: HTMLElement;
    /** Read once on open; later changes are ignored. */
    stamp: StampRecord;
    color: string;
    /** False on cards that no longer take changes. */
    canRemove: boolean;
    onSaveNote: (stamp: StampRecord, note: string) => void;
    onRemove: (stamp: StampRecord) => void;
    onClose: () => void;
  }

  let {
    anchor,
    stamp: initial,
    color,
    canRemove,
    onSaveNote,
    onRemove,
    onClose,
  }: Props = $props();

  // Pinned at open: tapping another stamp swaps the prop before this popover
  // closes, and its draft must still be saved to the stamp it was typed on.
  const stamp = untrack(() => initial);

  const WIDTH = 264;
  const GAP = 8;
  const MARGIN = 12;

  let panel: HTMLDivElement;
  let top = $state(0);
  let left = $state(0);
  // Seeded once; a sync while open must not clobber typing.
  let draft = $state(stamp.note);
  let removed = false;

  onMount(() => {
    panel.showPopover();
    place();
  });

  function place() {
    const rect = anchor.getBoundingClientRect();
    const height = panel.offsetHeight;
    const below = rect.bottom + GAP;
    const fitsBelow = below + height <= innerHeight - MARGIN;
    top = fitsBelow ? below : Math.max(MARGIN, rect.top - GAP - height);
    const centered = rect.left + rect.width / 2 - WIDTH / 2;
    left = Math.min(Math.max(MARGIN, centered), innerWidth - WIDTH - MARGIN);
  }

  function handleToggle(e: ToggleEvent) {
    if (e.newState !== "closed") {
      return;
    }
    if (!removed && draft.trim() !== stamp.note) {
      onSaveNote(stamp, draft.trim());
    }
    onClose();
  }

  function remove() {
    removed = true;
    onRemove(stamp);
    panel.hidePopover();
  }
</script>

<svelte:window onresize={place} />

<div
  bind:this={panel}
  class="popover"
  popover="auto"
  style:top={`${top}px`}
  style:left={`${left}px`}
  style:--tint={color}
  ontoggle={handleToggle}
>
  <div class="panel" in:popIn>
    <div class="head">
      <span class="mini" aria-hidden="true">{stamp.slotIndex + 1}</span>
      <div class="who">
        <p>stamped by <strong>{stamp.user || "someone"}</strong></p>
        <time datetime={stamp.timestamp}>{formatDateTime(stamp.timestamp)}</time>
      </div>
      {#if canRemove}
        <button
          type="button"
          class="remove"
          aria-label={`Remove stamp ${stamp.slotIndex + 1}`}
          title="remove stamp"
          onclick={remove}
        >
          <Trash size={16} />
        </button>
      {/if}
    </div>
    <textarea
      class="note-field"
      bind:value={draft}
      placeholder="add a note"
      aria-label={`Note for stamp ${stamp.slotIndex + 1}`}
      maxlength={120}
      rows={1}
    ></textarea>
  </div>
</div>

<style>
  .popover {
    background: none;
    border: 0;
    inset: auto;
    margin: 0;
    overflow: visible;
    padding: 0;
    position: fixed;
    width: 264px;
  }

  .panel {
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    background: rgb(255 255 255 / 86%);
    border: 1px solid var(--glass-border-highlight);
    border-radius: 20px;
    box-shadow: var(--glass-shadow-hover);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .head {
    align-items: center;
    display: flex;
    gap: 10px;
  }

  .mini {
    background: var(--tint);
    clip-path: var(--shape-cookie);
    color: #fff;
    display: grid;
    flex: none;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    height: 32px;
    place-items: center;
    width: 32px;
  }

  .who {
    color: var(--color-text-muted);
    flex: 1;
    font-size: 0.85rem;
    min-width: 0;
  }

  .who strong {
    color: var(--color-text-main);
    font-weight: 650;
  }

  time {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }

  .remove {
    border-radius: var(--radius-full);
    color: var(--color-text-light);
    display: grid;
    flex: none;
    height: 32px;
    place-items: center;
    transition:
      background-color 0.2s ease,
      color 0.2s ease,
      transform 0.45s var(--ease-spring);
    width: 32px;
  }

  .remove:active {
    transform: scale(0.86);
  }

  .note-field {
    background: var(--glass-surface-sunken);
    border: 0;
    border-radius: 12px;
    field-sizing: content;
    font-size: 0.9rem;
    line-height: 1.4;
    min-height: calc(1.4em + 16px);
    outline: none;
    padding: 8px 10px;
    resize: none;
    transition: box-shadow 0.2s ease;
  }

  .note-field::placeholder {
    color: var(--color-text-light);
  }

  .note-field:focus {
    box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--tint) 50%, transparent);
  }

  @media (hover: hover) {
    .remove:hover {
      background: color-mix(in srgb, var(--color-danger) 10%, transparent);
      color: var(--color-danger);
    }
  }
</style>
