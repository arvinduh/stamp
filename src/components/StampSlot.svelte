<!--
  @component StampSlot
  One stamp on a pass. An empty slot is a tinted circle showing its number;
  hovering morphs it toward a scalloped "cookie", previewing the stamp. A
  filled slot is a solid cookie in the card color that presses in like a
  rubber stamp.

  Shapes are the 72-point polygons from `variables.css`, so the morph is a
  plain clip-path transition. Enter/exit motion plays only when this slot
  toggles, never when the whole card first renders.
-->
<script lang="ts">
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Icon from "./Icon.svelte";
  import { inkRing, popIn, stampLift, stampPress } from "../utils/motion";

  interface Props {
    index: number;
    isStamped: boolean;
    hasNote: boolean;
    icon: string;
    /** Empty slots take a stamp. */
    interactive: boolean;
    /** Filled slots open their info. */
    inspectable: boolean;
    /** Receives the slot element, to anchor a popover. */
    onTap: (index: number, slot: HTMLElement) => void;
  }

  let { index, isStamped, hasNote, icon, interactive, inspectable, onTap }: Props =
    $props();

  const label = $derived(
    `Stamp ${index + 1}, ${isStamped ? "stamped" : "empty"}${
      hasNote ? ", has a note" : ""
    }`,
  );
</script>

<button
  type="button"
  class="slot"
  class:stamped={isStamped}
  disabled={isStamped ? !inspectable : !interactive}
  aria-label={label}
  style:--i={index}
  onclick={(e) => onTap(index, e.currentTarget)}
>
  <span class="well" aria-hidden="true"></span>
  {#if isStamped}
    <span class="ink" in:stampPress out:stampLift>
      <Icon name={icon} size={24} />
    </span>
    <span class="ring" in:inkRing aria-hidden="true"></span>
    {#if hasNote}
      <span class="note-badge" aria-hidden="true" in:popIn>
        <MessageCircle size={10} strokeWidth={3} />
      </span>
    {/if}
  {:else}
    <span class="number" aria-hidden="true">{index + 1}</span>
  {/if}
</button>

<style>
  .slot {
    aspect-ratio: 1;
    display: grid;
    justify-self: center;
    max-width: 60px;
    place-items: center;
    position: relative;
    transition: transform 0.45s var(--ease-spring);
    width: 100%;
  }

  .slot > * {
    grid-area: 1 / 1;
  }

  .well {
    background: color-mix(in srgb, var(--tint) 11%, #fff);
    clip-path: var(--shape-circle);
    height: 100%;
    transition:
      background-color 0.2s ease,
      clip-path 0.55s var(--ease-spring),
      transform 0.7s var(--ease-spring);
    width: 100%;
  }

  /* Under a stamp the well takes the stamp's shape, so no halo shows. */
  .stamped .well {
    clip-path: var(--shape-cookie);
  }

  .number {
    color: color-mix(in srgb, var(--tint) 45%, #94a3b8);
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    transition: color 0.2s ease;
  }

  /* Previews the stamp: the well morphs toward its shape and color. */
  @media (hover: hover) {
    .slot:not(.stamped, :disabled):hover .well {
      background: color-mix(in srgb, var(--tint) 22%, #fff);
      clip-path: var(--shape-cookie-soft);
      transform: rotate(20deg);
    }

    .slot:not(.stamped, :disabled):hover .number {
      color: var(--tint);
    }

    .slot.stamped:not(:disabled):hover .ink::before {
      transform: rotate(40deg) scale(1.04);
    }
  }

  .slot:active:not(:disabled) {
    transform: scale(0.86);
    transition-duration: 90ms;
  }

  /* The ink: a solid cookie in the card's color; the icon stays upright
     while the shape behind it turns. */
  .ink {
    align-items: center;
    color: #fff;
    display: flex;
    height: 100%;
    isolation: isolate;
    justify-content: center;
    position: relative;
    width: 100%;
  }

  .ink::before {
    background: var(--tint);
    clip-path: var(--shape-cookie);
    content: "";
    inset: 0;
    position: absolute;
    transition: transform 0.7s var(--ease-spring);
    z-index: -1;
  }

  .ink :global(svg),
  .ink :global(img) {
    height: 42%;
    width: 42%;
  }

  .ink :global(svg) {
    stroke-width: 2.4;
  }

  .ring {
    border: 2px solid var(--tint);
    border-radius: 50%;
    height: 100%;
    opacity: 0;
    pointer-events: none;
    width: 100%;
  }

  /* A speech bubble on the corner marks a stamp that has a note. */
  .note-badge {
    align-self: start;
    background: #fff;
    border-radius: 50%;
    box-shadow:
      0 1px 3px rgb(15 23 42 / 18%),
      0 0 0 1.5px color-mix(in srgb, var(--tint) 25%, #fff);
    color: var(--tint);
    display: grid;
    height: 20px;
    justify-self: end;
    margin: -3px -3px 0 0;
    place-items: center;
    width: 20px;
  }

  /* Completion wave: each stamp pulses in turn. */
  :global(.celebrating) .stamped {
    animation: wave 700ms var(--ease-out) both;
    animation-delay: calc(var(--i) * 45ms);
  }

  @keyframes wave {
    40% {
      transform: scale(1.12) rotate(8deg);
    }
  }
</style>
