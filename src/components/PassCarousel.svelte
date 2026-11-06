<!--
  @component PassCarousel
  Horizontal, snap-scrolling row of slides with the neighbors peeking in.
  Tapping a neighbor or a page dot brings it to the center.

  Native scrolling supplies momentum and snapping for touch and trackpads;
  a mouse can click and drag, which settles on the nearest slide (or the
  next one, after a flick). Depth (scale and fade away from center) is a
  CSS scroll-driven animation, so no script runs per frame; browsers
  without it fall back to an active-class transition.
-->
<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import { trackDrag } from "../utils/drag";

  interface Props {
    items: readonly T[];
    key: (item: T) => string;
    labelFor: (item: T) => string;
    /** Index of the centered slide; set it to scroll there. */
    index: number;
    slide: Snippet<[T, boolean]>;
  }

  let { items, key, labelFor, index = $bindable(), slide }: Props = $props();

  /** Release speed (px/ms) that advances one slide past the nearest. */
  const FLICK_SPEED = 0.3;
  /** Longest a smooth settle can take before snapping is restored. */
  const SETTLE_MS = 700;

  let scroller: HTMLDivElement;
  // The index the scroll position currently shows. Lets the effect below
  // tell a parent-driven change (scroll to it) from a swipe (already there).
  let shownIndex = 0;
  let frame = 0;
  // Snapping is off while the mouse drags and while it settles afterward.
  let freeScroll = $state(false);

  $effect(() => {
    const target = Math.min(index, items.length - 1);
    if (target >= 0 && target !== shownIndex) {
      shownIndex = target;
      scrollToIndex(target);
    }
  });

  function slideAt(i: number): HTMLElement | undefined {
    const el = scroller.children[i];
    return el instanceof HTMLElement ? el : undefined;
  }

  function scrollToIndex(i: number) {
    const el = slideAt(i);
    if (!el) return;
    const left = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
    scroller.scrollTo({ left, behavior: "smooth" });
  }

  function handleScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const center = scroller.scrollLeft + scroller.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < items.length; i++) {
        const el = slideAt(i);
        if (!el) continue;
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
        if (d < bestDistance) {
          best = i;
          bestDistance = d;
        }
      }
      if (best !== index) {
        shownIndex = best;
        index = best;
      }
    });
  }

  function select(i: number) {
    index = i;
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType !== "mouse" || items.length < 2) {
      return;
    }
    const startLeft = scroller.scrollLeft;
    const startIndex = index;
    trackDrag(e, "x", {
      onMove: (dx) => {
        freeScroll = true;
        scroller.scrollLeft = startLeft - dx;
      },
      onEnd: (dx, velocity) => {
        let target = index;
        if (Math.abs(velocity) > FLICK_SPEED && target === startIndex) {
          target = startIndex + (velocity < 0 ? 1 : -1);
        }
        settle(Math.min(items.length - 1, Math.max(0, target)));
      },
    });
  }

  /** Glides to slide `i`, then turns snapping back on. */
  function settle(i: number) {
    shownIndex = i;
    index = i;
    scrollToIndex(i);
    const restore = () => {
      freeScroll = false;
    };
    scroller.addEventListener("scrollend", restore, { once: true });
    setTimeout(restore, SETTLE_MS);
  }
</script>

<div
  bind:this={scroller}
  class="carousel"
  class:free-scroll={freeScroll}
  role="region"
  aria-roledescription="carousel"
  aria-label="Cards"
  onscroll={handleScroll}
  onpointerdown={handlePointerDown}
>
  {#each items as item, i (key(item))}
    <div
      class="slide"
      class:active={i === index}
      role="group"
      aria-roledescription="slide"
      aria-label={labelFor(item)}
    >
      <div class="slide-depth">
        {@render slide(item, i === index)}
      </div>
      {#if i !== index}
        <button
          type="button"
          class="slide-hit"
          aria-label={`Show ${labelFor(item)}`}
          onclick={() => select(i)}
        ></button>
      {/if}
    </div>
  {/each}
</div>

{#if items.length > 1}
  <div class="dots">
    {#each items as item, i (key(item))}
      <button
        type="button"
        class="dot"
        class:active={i === index}
        aria-label={`Show ${labelFor(item)}`}
        aria-current={i === index}
        onclick={() => select(i)}
      ></button>
    {/each}
  </div>
{/if}

<style>
  .carousel {
    align-items: start;
    display: grid;
    gap: 12px;
    grid-auto-columns: var(--pass-width);
    grid-auto-flow: column;
    /* Room for pass shadows, which the scroll box would otherwise clip. */
    margin-block: -28px -44px;
    overflow: auto hidden;
    overscroll-behavior-x: contain;
    padding: 28px calc(50% - var(--pass-width) / 2) 44px;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    user-select: none;
  }

  .carousel.free-scroll {
    cursor: grabbing;
    scroll-snap-type: none;
  }

  .carousel::-webkit-scrollbar {
    display: none;
  }

  .slide {
    min-width: 0;
    position: relative;
    scroll-snap-align: center;
    scroll-snap-stop: always;
  }

  .slide-hit {
    cursor: pointer;
    inset: 0;
    position: absolute;
    z-index: 5;
  }

  .slide-depth {
    will-change: transform;
  }

  /*
   * Only transform and opacity animate, so the compositor runs this off the
   * main thread. The translate pulls each neighbor toward the center slide
   * as it shrinks, keeping its peek visible.
   */
  @supports (animation-timeline: view()) {
    .slide-depth {
      animation: depth linear both;
      animation-timeline: view(inline);
    }

    @keyframes depth {
      0% {
        opacity: 0.6;
        transform: translateX(-5%) scale(0.9);
      }

      50% {
        opacity: 1;
        transform: none;
      }

      100% {
        opacity: 0.6;
        transform: translateX(5%) scale(0.9);
      }
    }
  }

  @supports not (animation-timeline: view()) {
    .slide-depth {
      transition:
        opacity 0.4s var(--ease-out),
        transform 0.5s var(--ease-spring);
    }

    .slide:not(.active) .slide-depth {
      opacity: 0.55;
      transform: scale(0.92);
    }
  }

  .dots {
    display: flex;
    gap: 2px;
    justify-content: center;
    margin-top: 14px;
  }

  .dot {
    display: grid;
    height: 20px;
    place-items: center;
    width: 16px;
  }

  .dot::before {
    background: rgb(15 23 42 / 18%);
    border-radius: 4px;
    content: "";
    height: 7px;
    transition:
      background-color 300ms ease,
      width 0.5s var(--ease-spring);
    width: 7px;
  }

  .dot.active::before {
    background: var(--color-text-main);
    width: 18px;
  }

  .dot.active {
    width: 26px;
  }
</style>
