<!--
  @component PassCard
  One stamp card: a header showing the card's photo (or its color with a
  large scalloped shape), and a softly tinted body with the title, stamps,
  and progress.

  Hover and focus effects are transform-only and run on the compositor.
  Purely presentational: the parent decides what each tap means.
-->
<script lang="ts">
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Gift from "@lucide/svelte/icons/gift";
  import Minus from "@lucide/svelte/icons/minus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Plus from "@lucide/svelte/icons/plus";
  import type { Card } from "../types";
  import type { Pass } from "../lib/stacks";
  import { formatDate } from "../utils/time";
  import Icon from "./Icon.svelte";
  import StampSlot from "./StampSlot.svelte";

  interface Props {
    card: Card;
    pass: Pass;
    interactive: boolean;
    /** Makes the icon tappable and shows the edit pencil, springing in. */
    controls?: boolean;
    /** Plays the completion shine and stamp wave. */
    celebrating?: boolean;
    /** Grays the card out, for claimed cards. */
    muted?: boolean;
    /** Taps on an empty slot. */
    onStamp?: (slot: number) => void;
    /** Taps on a filled slot; receives the slot to anchor a popover. */
    onInspect?: (slot: number, anchor: HTMLElement) => void;
    /** The counter's minus button, for cards over 12 stamps. */
    onUnstamp?: (slot: number) => void;
    /** Taps on the icon; receives the badge to anchor a popover. */
    onIcon?: (anchor: HTMLElement) => void;
    onEdit?: () => void;
    /** Taps anywhere on the card outside its buttons, for its summary. */
    onInfo?: () => void;
  }

  let {
    card,
    pass,
    interactive,
    controls = false,
    celebrating = false,
    muted = false,
    onStamp,
    onInspect,
    onUnstamp,
    onIcon,
    onEdit,
    onInfo,
  }: Props = $props();

  /** Above this, a grid would be too dense; show a counter instead. */
  const MAX_GRID = 12;

  const filled = $derived(pass.stamps.size);
  const isCounter = $derived(pass.maxStamps > MAX_GRID);
  const columns = $derived(gridColumns(pass.maxStamps));
  const slots = $derived(Array.from({ length: pass.maxStamps }, (_, i) => i));
  const status = $derived(
    pass.redemption
      ? `claimed ${formatDate(pass.redemption.timestamp)}`
      : pass.isComplete
        ? `completed ${formatDate(pass.completedAt)}`
        : `${filled} of ${pass.maxStamps}`,
  );
  // Done cards say so in the header chip, so the line under the title stays short.
  const meta = $derived(
    pass.isComplete
      ? `card ${pass.instance + 1}`
      : `card ${pass.instance + 1} · ${status}`,
  );

  /** Balanced rows: 10 → 5×2, 8 → 4×2, 9 → 3×3, 7 → 4+3. */
  function gridColumns(n: number): number {
    if (n <= 5) {
      return n;
    }
    return [5, 4, 3].find((c) => n % c === 0) ?? 4;
  }

  function handleTap(slot: number, anchor: HTMLElement) {
    if (pass.stamps.has(slot)) {
      onInspect?.(slot, anchor);
    } else {
      onStamp?.(slot);
    }
  }

  /** A tap on the card itself, not on one of its controls. */
  function handleCardClick(e: MouseEvent) {
    if (e.target instanceof Element && e.target.closest("button, input")) {
      return;
    }
    onInfo?.();
  }

  function addNext() {
    const slot = slots.find((i) => !pass.stamps.has(i));
    if (slot !== undefined) {
      onStamp?.(slot);
    }
  }

  function removeLast() {
    const slot = slots.findLast((i) => pass.stamps.has(i));
    if (slot !== undefined) {
      onUnstamp?.(slot);
    }
  }
</script>

<!-- Pointer shortcut only; the title-line button is the accessible way in. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article
  class="pass"
  class:muted
  class:celebrating
  class:controls
  class:openable={onInfo !== undefined}
  class:has-photo={card.background !== ""}
  style:--tint={card.color}
  aria-label={`${card.title}, card ${pass.instance + 1}, ${status}`}
  onclick={handleCardClick}
>
  <header class="hero">
    {#if card.background}
      <img class="photo" src={card.background} alt="" draggable="false" />
    {:else}
      <span class="shape" aria-hidden="true"></span>
    {/if}
    <button
      type="button"
      class="chip badge"
      disabled={!controls || !onIcon}
      aria-label="Change icon, color, and photo"
      onclick={(e) => onIcon?.(e.currentTarget)}
    >
      <Icon name={card.icon} size={20} />
    </button>
    {#if onEdit}
      <button
        type="button"
        class="chip edit"
        disabled={!controls}
        aria-hidden={!controls}
        tabindex={controls ? 0 : -1}
        aria-label={`Edit ${card.title}`}
        onclick={onEdit}
      >
        <Pencil size={16} />
      </button>
    {/if}
    {#if pass.redemption}
      <span class="chip status">
        <Gift size={14} strokeWidth={2.4} />
        claimed {formatDate(pass.redemption.timestamp)}
      </span>
    {:else if pass.isComplete}
      <span class="chip status">
        <CircleCheck size={14} strokeWidth={2.4} />
        completed {formatDate(pass.completedAt)}
      </span>
    {/if}
  </header>

  <div class="body">
    <div class="heading">
      <h3 class="title">{card.title}</h3>
      {#if onInfo}
        <button
          type="button"
          class="meta meta-button"
          aria-label={`Card ${pass.instance + 1}, ${status}. Show summary`}
          onclick={onInfo}
        >
          {meta}
        </button>
      {:else}
        <p class="meta">{meta}</p>
      {/if}
    </div>

    {#if isCounter}
      <div class="counter">
        <button
          type="button"
          class="step"
          aria-label="Remove last stamp"
          disabled={!interactive || filled === 0}
          onclick={removeLast}
        >
          <Minus size={20} />
        </button>
        <p class="count" aria-live="polite">
          <span class="count-value">{filled}</span>
          <span class="count-of">of {pass.maxStamps}</span>
        </p>
        <button
          type="button"
          class="step step-add"
          aria-label="Add a stamp"
          disabled={!interactive || pass.isComplete}
          onclick={addNext}
        >
          <Plus size={20} />
        </button>
      </div>
    {:else}
      <div class="slots" style:--cols={columns}>
        {#each slots as slot (slot)}
          {@const stamp = pass.stamps.get(slot)}
          <StampSlot
            index={slot}
            isStamped={stamp !== undefined}
            hasNote={Boolean(stamp?.note)}
            icon={card.icon}
            {interactive}
            inspectable={onInspect !== undefined}
            onTap={handleTap}
          />
        {/each}
      </div>
    {/if}

    <footer class="foot">
      <span class="reward">{card.rewardText}</span>
      <span class="meter" aria-hidden="true">
        <span style:--progress={filled / pass.maxStamps}></span>
      </span>
    </footer>

    <span class="shine" aria-hidden="true"></span>
  </div>
</article>

<style>
  .pass {
    background: color-mix(in srgb, var(--tint) 6%, #fff);
    border-radius: 32px;
    box-shadow:
      0 1px 3px rgb(15 23 42 / 6%),
      0 22px 44px -22px color-mix(in srgb, var(--tint) 50%, transparent);
    display: flex;
    flex-direction: column;
    /* clip, not hidden: a hidden box still scrolls to reveal a focused
       slot when content overflows, shifting the whole card. */
    overflow: clip;
    position: relative;
    transition:
      box-shadow 0.4s ease,
      translate 0.6s var(--ease-spring);
    user-select: none;
    width: 100%;
  }

  /* Washed out but opaque, so a deck never shows cards through it. */
  .pass.muted {
    filter: grayscale(0.9) brightness(1.04) contrast(0.9);
  }

  .hero {
    align-items: flex-start;
    aspect-ratio: 2.8;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--tint) 82%, #fff),
      var(--tint) 55%,
      color-mix(in srgb, var(--tint) 85%, #000)
    );
    display: flex;
    isolation: isolate;
    justify-content: space-between;
    overflow: clip;
    padding: 14px;
    position: relative;
  }

  .photo {
    height: 100%;
    inset: 0;
    object-fit: cover;
    position: absolute;
    transition: scale 0.9s var(--ease-out);
    width: 100%;
    z-index: -2;
  }

  /* Keeps the white chips legible over bright photos. */
  .has-photo .hero::after {
    background: linear-gradient(rgb(0 0 0 / 28%), transparent 55%);
    content: "";
    inset: 0;
    position: absolute;
    z-index: -1;
  }

  /* An oversized scallop in a lighter shade of the card color. */
  .shape {
    aspect-ratio: 1;
    background: color-mix(in srgb, var(--tint) 70%, #fff);
    bottom: -70%;
    clip-path: var(--shape-cookie);
    opacity: 0.55;
    position: absolute;
    right: -6%;
    transition: rotate 1.1s var(--ease-spring);
    width: 52%;
    z-index: -1;
  }

  .chip {
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    backdrop-filter: blur(10px) saturate(160%);
    background: rgb(255 255 255 / 22%);
    border: 1px solid rgb(255 255 255 / 40%);
    border-radius: var(--radius-full);
    color: #fff;
    display: grid;
    height: 38px;
    place-items: center;
    transition:
      background-color 0.2s ease,
      opacity 0.25s ease,
      transform 0.55s var(--ease-spring);
    width: 38px;
  }

  .badge {
    height: 42px;
    width: 42px;
  }

  .chip:disabled {
    cursor: default;
  }

  /* Completed / claimed, with its date, along the bottom of the header. */
  .status {
    align-items: center;
    bottom: 12px;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    gap: 6px;
    grid-auto-flow: column;
    height: 30px;
    left: 14px;
    padding: 0 12px 0 9px;
    position: absolute;
    width: auto;
  }

  /* The pencil arrives just after its card settles, with a small spin. */
  .edit:disabled {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.4) rotate(-60deg);
    transition-delay: 0s;
  }

  .controls .edit {
    transition-delay: 0.12s;
  }

  .chip:active:not(:disabled) {
    transform: scale(0.86);
    transition-duration: 90ms;
  }

  @media (hover: hover) {
    .pass.controls:hover {
      box-shadow:
        0 2px 6px rgb(15 23 42 / 6%),
        0 30px 56px -24px color-mix(in srgb, var(--tint) 60%, transparent);
      translate: 0 -4px;
    }

    .pass.controls:hover .photo {
      scale: 1.05;
    }

    .pass.controls:hover .shape {
      rotate: 40deg;
    }

    .chip:hover:not(:disabled) {
      background: rgb(255 255 255 / 34%);
      transform: scale(1.08);
    }
  }

  .body {
    overflow: clip;
    padding: 16px 18px;
    position: relative;
  }

  .heading {
    margin-bottom: 14px;
  }

  .title {
    font-size: 1.2rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: color-mix(in srgb, var(--tint) 35%, #64748b);
    font-size: 0.78rem;
    font-weight: 600;
  }

  /* Reads as plain text; the whole card is the pointer target. */
  .meta-button {
    text-align: left;
  }

  .openable {
    cursor: pointer;
  }

  .slots {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  }

  .counter {
    align-items: center;
    display: flex;
    justify-content: space-between;
    padding: 4px 4px 10px;
  }

  .step {
    background: color-mix(in srgb, var(--tint) 12%, #fff);
    border-radius: 50%;
    color: var(--color-text-main);
    display: grid;
    height: 48px;
    place-items: center;
    transition: transform 0.4s var(--ease-spring);
    width: 48px;
  }

  .step-add {
    background: var(--tint);
    color: #fff;
  }

  .step:active:not(:disabled) {
    transform: scale(0.88);
  }

  .step:disabled {
    opacity: 0.35;
  }

  .count {
    align-items: center;
    display: flex;
    flex-direction: column;
  }

  .count-value {
    color: var(--tint);
    font-size: 3rem;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .count-of {
    color: var(--color-text-muted);
    font-size: 0.82rem;
    font-weight: 600;
  }

  .foot {
    align-items: center;
    display: flex;
    gap: 12px;
    margin-top: 14px;
  }

  .reward {
    color: var(--color-text-muted);
    flex: 1;
    font-size: 0.82rem;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meter {
    background: color-mix(in srgb, var(--tint) 14%, #fff);
    border-radius: var(--radius-full);
    flex: 0 0 72px;
    height: 6px;
    overflow: hidden;
  }

  .meter span {
    background: var(--tint);
    border-radius: inherit;
    display: block;
    height: 100%;
    transform: scaleX(var(--progress));
    transform-origin: left;
    transition: transform 0.5s var(--ease-spring);
  }

  /* Glossy sweep across the body when the card fills up. */
  .shine {
    background: linear-gradient(
      105deg,
      transparent 35%,
      rgb(255 255 255 / 70%) 50%,
      transparent 65%
    );
    inset: 0;
    opacity: 0;
    pointer-events: none;
    position: absolute;
    transform: translateX(-100%);
  }

  .celebrating .shine {
    animation: sweep 1.1s var(--ease-out) 0.25s;
  }

  @keyframes sweep {
    from {
      opacity: 1;
      transform: translateX(-100%);
    }

    to {
      opacity: 1;
      transform: translateX(100%);
    }
  }
</style>
