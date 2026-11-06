<!--
  @component PassDeck
  A vertical deck: the focused card in front, newer cards peeking out above
  it and older ones below. Drag, swipe, or scroll to move through it; a hard flick
  travels several cards, then snaps to the nearest one.

  The deck has one continuous position (in cards). A drag sets it directly;
  a release or wheel gesture hands it to a spring that runs only while it
  moves, so nothing ticks at rest. Horizontal gestures are left alone
  (`touch-action: pan-x`), so the stack carousel around it keeps native
  swiping.
-->
<script lang="ts" generics="T">
  import { type Snippet, untrack } from "svelte";
  import { trackDrag } from "../utils/drag";
  import { haptic, passLift, prefersReducedMotion } from "../utils/motion";

  interface Props {
    items: readonly T[];
    key: (item: T) => string;
    /** Index of the front card; set it to glide there. */
    index: number;
    item: Snippet<[T, boolean]>;
  }

  let { items, key, index = $bindable(), item }: Props = $props();

  /** Cards drawn behind the front one; deeper ones fade out. */
  const MAX_BEHIND = 2;
  /** How far (px) each card behind peeks out below the one before it. */
  const PEEK = 14;
  /** Drag distance per card, as a share of the deck height. */
  const STEP_SHARE = 0.5;
  /** How far ahead (ms) a release's velocity carries the deck. */
  const PROJECTION_MS = 240;
  /** Spring stiffness (1/s²) and damping ratio; just under critical. */
  const STIFFNESS = 260;
  const DAMPING = 0.86;
  /** Quiet gap that ends a wheel gesture and snaps to a card. */
  const WHEEL_QUIET_MS = 140;

  let height = $state(0);
  /** Continuous position: 0 is the newest card in front. */
  let pos = $state(untrack(() => index));
  let target = untrack(() => index);
  let velocity = 0;
  let frame = 0;
  let lastTime = 0;
  let wheelTimer = 0;
  let wheelStart = 0;

  const step = $derived(Math.max(1, height * STEP_SHARE));
  const last = $derived(Math.max(0, items.length - 1));

  // A new card on top: shift the position so nothing jumps, then glide.
  // If the old top card is still here (pushed back), the new one settles
  // down onto the front; if it left (claimed), the new one comes forward
  // from behind while the old one lifts away.
  let topKey: string | undefined;
  $effect.pre(() => {
    const top = items[0] && key(items[0]);
    const previous = topKey;
    topKey = top;
    if (previous === undefined || top === previous) {
      return;
    }
    const pushedTo = untrack(() => items.findIndex((it) => key(it) === previous));
    pos = untrack(() => pos) + (pushedTo > 0 ? pushedTo : -1);
    glide(untrack(() => index), 0);
  });

  // Follow outside changes (arrow keys, a new card, a shorter deck).
  $effect(() => {
    const wanted = Math.min(index, last);
    if (wanted !== index) {
      index = wanted;
    } else if (wanted !== target && !wheelTimer) {
      glide(wanted, 0);
    }
  });

  /** Softens travel past either end, in cards; never beyond ~1/6 card. */
  function rubber(p: number): number {
    if (p < 0) {
      return p / (1 - p * 6);
    }
    if (p > last) {
      const over = p - last;
      return last + over / (1 + over * 6);
    }
    return p;
  }

  function glide(to: number, fromVelocity: number) {
    target = to;
    velocity = fromVelocity;
    if (prefersReducedMotion()) {
      pos = to;
      return;
    }
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function stopGlide() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  // Damped spring, integrated in small fixed steps so it is frame-rate
  // independent; stops itself once it is at rest.
  function tick(now: number) {
    let dt = Math.min(0.064, (now - lastTime) / 1000);
    lastTime = now;
    const damping = 2 * Math.sqrt(STIFFNESS) * DAMPING;
    let p = pos;
    while (dt > 0) {
      const h = Math.min(dt, 0.004);
      velocity += (-STIFFNESS * (p - target) - damping * velocity) * h;
      p += velocity * h;
      dt -= h;
    }
    if (Math.abs(p - target) < 0.0015 && Math.abs(velocity) < 0.02) {
      pos = target;
      frame = 0;
      return;
    }
    pos = p;
    frame = requestAnimationFrame(tick);
  }

  /** Lands on card `to` and makes it the front card. */
  function settle(to: number, fromVelocity: number) {
    const clamped = Math.min(last, Math.max(0, to));
    if (clamped !== index) {
      haptic(6);
    }
    index = clamped;
    glide(clamped, fromVelocity);
  }

  function handlePointerDown(e: PointerEvent) {
    const startPos = pos;
    trackDrag(e, "y", {
      onMove: (dy) => {
        stopGlide();
        pos = rubber(startPos - dy / step);
      },
      onEnd: (dy, v) => {
        // px/ms → cards/s, upward drags moving forward through the deck.
        const cardsPerSecond = (-v / step) * 1000;
        const projected = pos + (cardsPerSecond * PROJECTION_MS) / 1000;
        settle(dy === 0 ? index : Math.round(projected), cardsPerSecond);
      },
    });
  }

  // Wheel and trackpad steer the spring's target, so a mouse notch glides
  // rather than jumps; when the wheel goes quiet the deck snaps onward in
  // the direction it was moving.
  function handleWheel(e: WheelEvent) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
      return;
    }
    if (!wheelTimer) {
      wheelStart = index;
    }
    clearTimeout(wheelTimer);
    const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    glide(Math.min(last + 0.3, Math.max(-0.3, target + delta / step)), velocity);
    wheelTimer = setTimeout(() => {
      wheelTimer = 0;
      const moved = target - wheelStart;
      settle(
        moved > 0 ? Math.ceil(target - 0.2) : Math.floor(target + 0.2),
        velocity,
      );
    }, WHEEL_QUIET_MS);
  }

  /**
   * Where card `i` sits for the current position.
   *
   * Newer cards (d < 0) tuck in above the front card and older ones below,
   * each peeking out by {@link PEEK}. A card leaving the front follows the
   * finger up and fades out on top; past halfway it reappears in the strip
   * above, behind the new front card, so the swap never shows a jump.
   */
  function layerStyle(i: number): string {
    const d = i - pos;
    const a = Math.abs(d);
    if (d < 0 && a < 0.5) {
      return `transform: translateY(${d * step}px) scale(${1 + d * 0.06});
        transform-origin: 50% 0%; opacity: ${1 - a * 2}; z-index: 101;`;
    }
    const k = Math.min(a, MAX_BEHIND + 1);
    const fadeIn = d < 0 ? (a - 0.5) * 2 : 1;
    const shown = Math.max(0, Math.min(1, MAX_BEHIND + 1 - a, fadeIn));
    return `transform: translateY(${Math.sign(d) * k * PEEK}px)
        scale(${1 - k * 0.05});
      transform-origin: 50% ${d < 0 ? "0%" : "100%"};
      opacity: ${shown}; z-index: ${100 - Math.round(a * 10)};`;
  }
</script>

<div
  class="deck"
  bind:offsetHeight={height}
  style:margin-block={`${Math.min(last, MAX_BEHIND) * PEEK}px`}
  role="group"
  aria-roledescription="card stack"
  onpointerdown={handlePointerDown}
  onwheel={handleWheel}
>
  {#each items as it, i (key(it))}
    <div
      class="layer"
      style={layerStyle(i)}
      inert={i !== index}
    >
      <div class="layer-motion" out:passLift>
        {@render item(it, i === index)}
      </div>
    </div>
  {/each}
</div>

<style>
  .deck {
    display: grid;
    /* minmax(0, …): long text truncates instead of widening the card. */
    grid-template-columns: minmax(0, 1fr);
    touch-action: pan-x;
  }

  .layer {
    grid-area: 1 / 1;
    transform-origin: 50% 100%;
  }
</style>
