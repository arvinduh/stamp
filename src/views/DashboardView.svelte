<!--
  @component DashboardView
  The main screen. Stacks sit side by side in a carousel (swipe or drag
  left and right); each stack is a deck of its unclaimed cards, newest in
  front (swipe, drag, or scroll up and down). Below sit the actions for the
  card in front. "Show all" lays every card of the stack, claimed ones
  included, out in a plain scrolling list.

  Owns UI state only (focus, open dialogs, transient effects). Every data
  change goes through the store.
-->
<script lang="ts">
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import Plus from "@lucide/svelte/icons/plus";
  import Settings from "@lucide/svelte/icons/settings";
  import type { Card, StampRecord } from "../types";
  import type { Pass, Stack } from "../lib/stacks";
  import type { StampStore } from "../services/store.svelte";
  import { celebrateRedeem } from "../utils/confetti";
  import { fadeMotion, haptic, popIn } from "../utils/motion";
  import { formatDate } from "../utils/time";
  import CardEditor from "../components/CardEditor.svelte";
  import IconPicker from "../components/IconPicker.svelte";
  import PassCard from "../components/PassCard.svelte";
  import PassCarousel from "../components/PassCarousel.svelte";
  import PassDeck from "../components/PassDeck.svelte";
  import NoteBar from "../components/NoteBar.svelte";
  import PassSummary from "../components/PassSummary.svelte";
  import StampPopover from "../components/StampPopover.svelte";

  interface Props {
    store: StampStore;
    onOpenSettings: () => void;
  }

  let { store, onOpenSettings }: Props = $props();

  /** Identifies one slot on one card, independent of object identity. */
  interface SlotRef {
    cardId: string;
    cardInstance: number;
    slotIndex: number;
  }

  /** An open card summary. */
  interface SummaryRef {
    cardId: string;
    cardInstance: number;
  }

  /** An open stamp popover and the slot it hangs from. */
  interface InspectState extends SlotRef {
    anchor: HTMLElement;
  }

  /** An open icon popover and the card as it was when it opened. */
  interface PickerState {
    anchor: HTMLElement;
    original: Card;
  }

  const CELEBRATE_MS = 1500;

  let index = $state(0);
  /** Front card of each deck, by card id; missing means the newest. */
  let deckIndex = $state<Record<string, number>>({});
  let showAll = $state(false);
  let editing = $state<Card | "new" | null>(null);
  let summary = $state<SummaryRef | null>(null);
  let inspecting = $state<InspectState | null>(null);
  let noteTarget = $state<SlotRef | null>(null);
  let noteKey = $state(0);
  let celebratingId = $state<string | null>(null);
  let picker = $state<PickerState | null>(null);

  const stacks = $derived(store.stacks);
  const active: Stack | undefined = $derived(
    stacks[Math.min(index, stacks.length - 1)],
  );
  const activeDeck = $derived(active ? deckOf(active) : []);
  const focused: Pass | undefined = $derived(
    active && activeDeck[Math.min(deckIndex[active.card.id] ?? 0, activeDeck.length - 1)],
  );
  const allPasses = $derived(active ? [active.current, ...active.history] : []);
  const pickerCard = $derived(
    picker && store.cards.find((c) => c.id === picker?.original.id),
  );
  // Resolved from live data, so the summary follows syncs and edits.
  const summaryStack = $derived(
    summary && stacks.find((s) => s.card.id === summary?.cardId),
  );
  const summaryPass = $derived(
    summary && summaryStack ? findPass(summaryStack, summary.cardInstance) : undefined,
  );
  // Live too: a sync that removes the stamp closes its popover.
  const inspectStack = $derived(
    inspecting && stacks.find((s) => s.card.id === inspecting?.cardId),
  );
  const inspected = $derived(inspecting ? findStamp(inspecting) : undefined);
  const editingStack = $derived.by(() => {
    const target = editing;
    return target && target !== "new"
      ? stacks.find((s) => s.card.id === target.id)
      : undefined;
  });

  // Bring a card joined through an invite link to the front.
  $effect(() => {
    const joined = store.joinedCardId;
    const at = stacks.findIndex((s) => s.card.id === joined);
    if (joined && at >= 0) {
      index = at;
      store.joinedCardId = "";
    }
  });

  /**
   * The smallest stamp count the card in progress allows: every used slot
   * must still exist. A finished card does not constrain it.
   */
  function minStamps(stack: Stack): number {
    const pass = stack.current;
    if (pass.isComplete || pass.redemption) {
      return 1;
    }
    return Math.max(1, ...[...pass.stamps.keys()].map((slot) => slot + 1));
  }

  /** The cards a deck shows: newest first, claimed ones left out. */
  function deckOf(stack: Stack): Pass[] {
    return [stack.current, ...stack.history.filter((p) => !p.redemption)];
  }

  function findPass(stack: Stack, instance: number): Pass | undefined {
    return [stack.current, ...stack.history].find((p) => p.instance === instance);
  }

  function findStamp(ref: SlotRef): StampRecord | undefined {
    const stack = stacks.find((s) => s.card.id === ref.cardId);
    return stack && findPass(stack, ref.cardInstance)?.stamps.get(ref.slotIndex);
  }

  function saveNote(note: string) {
    const target = noteTarget && findStamp(noteTarget);
    if (target) {
      store.saveNote(target, note);
    }
  }

  function openSummary(stack: Stack, pass: Pass) {
    summary = { cardId: stack.card.id, cardInstance: pass.instance };
  }

  function inspect(stack: Stack, pass: Pass, slotIndex: number, anchor: HTMLElement) {
    inspecting = {
      cardId: stack.card.id,
      cardInstance: pass.instance,
      slotIndex,
      anchor,
    };
  }

  function stamp(stack: Stack, slotIndex: number) {
    const willComplete =
      stack.current.stamps.size + 1 >= stack.current.maxStamps;
    store.stamp(stack, slotIndex);
    noteTarget = {
      cardId: stack.card.id,
      cardInstance: stack.current.instance,
      slotIndex,
    };
    noteKey += 1;
    if (!willComplete) {
      haptic();
      return;
    }
    haptic([12, 60, 18]);
    celebratingId = stack.card.id;
    setTimeout(() => {
      if (celebratingId === stack.card.id) {
        celebratingId = null;
      }
    }, CELEBRATE_MS);
  }

  function claim(stack: Stack, pass: Pass) {
    store.redeem(stack, pass);
    haptic([10, 40, 10]);
    celebrateRedeem(stack.card.color);
  }

  function startNext(stack: Stack) {
    store.startNext(stack);
    deckIndex[stack.card.id] = 0;
  }

  function saveCard(card: Card) {
    if (editing === "new") {
      store.createCard(card);
      index = stacks.length - 1;
    } else {
      store.updateCard(card);
    }
    editing = null;
  }

  function deleteEditing() {
    const card = editing;
    if (!card || card === "new") {
      return;
    }
    editing = null;
    delete deckIndex[card.id];
    store.deleteCard(card.id);
    index = Math.max(0, Math.min(index, stacks.length - 1));
  }

  /** Persists the picker's choices once, when it closes. */
  function closePicker() {
    const card = pickerCard;
    const original = picker?.original;
    picker = null;
    if (
      card &&
      original &&
      (card.icon !== original.icon ||
        card.color !== original.color ||
        card.background !== original.background)
    ) {
      store.updateCard(card);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement;
    if (typing || !active || document.querySelector("dialog[open], :popover-open")) {
      return;
    }
    if (showAll) {
      if (e.key === "Escape") {
        showAll = false;
      }
      return;
    }
    const id = active.card.id;
    const front = deckIndex[id] ?? 0;
    if (e.key === "ArrowLeft" && index > 0) {
      index -= 1;
    } else if (e.key === "ArrowRight" && index < stacks.length - 1) {
      index += 1;
    } else if (e.key === "ArrowDown" && front < activeDeck.length - 1) {
      deckIndex[id] = front + 1;
    } else if (e.key === "ArrowUp" && front > 0) {
      deckIndex[id] = front - 1;
    }
  }

  function remaining(stack: Stack): number {
    return stack.current.maxStamps - stack.current.stamps.size;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<nav class="controls" aria-label="App">
  <button
    type="button"
    class="round-button"
    aria-label="New card"
    onclick={() => (editing = "new")}
  >
    <Plus size={20} />
  </button>
  <button
    type="button"
    class="round-button"
    class:syncing={store.syncing}
    aria-label="Settings"
    onclick={onOpenSettings}
  >
    <Settings size={19} />
  </button>
</nav>

<div class="ambient" style:--ambient={active?.card.color} aria-hidden="true"></div>

<main class="dashboard">
  {#if !store.loaded}
    <div class="placeholder" aria-label="Loading cards"></div>
  {:else if stacks.length === 0}
    <button
      type="button"
      class="add-card"
      in:popIn
      onclick={() => (editing = "new")}
    >
      <span class="add-mark"><Plus size={26} strokeWidth={2.4} /></span>
      new card
    </button>
  {:else}
    <div class="deck-view" class:away={showAll} inert={showAll}>
    <PassCarousel
      items={stacks}
      key={(s) => s.card.id}
      labelFor={(s) => s.card.title}
      bind:index
    >
      {#snippet slide(stack, isActive)}
        <PassDeck
          items={deckOf(stack)}
          key={(p) => String(p.instance)}
          bind:index={
            () => deckIndex[stack.card.id] ?? 0,
            (v) => (deckIndex[stack.card.id] = v)
          }
        >
          {#snippet item(pass, isFront)}
            {@const live = pass === stack.current}
            <PassCard
              card={stack.card}
              {pass}
              interactive={isActive && isFront && live && !pass.redemption}
              celebrating={live && celebratingId === stack.card.id}
              muted={Boolean(pass.redemption)}
              controls={isActive && isFront}
              onStamp={(slot) => stamp(stack, slot)}
              onInspect={(slot, anchor) => inspect(stack, pass, slot, anchor)}
              onUnstamp={(slot) => store.unstamp(stack, slot)}
              onIcon={store.isOwner(stack.card)
                ? (anchor) => (picker = { anchor, original: stack.card })
                : undefined}
              onEdit={store.isOwner(stack.card)
                ? () => (editing = stack.card)
                : undefined}
              onInfo={() => openSummary(stack, pass)}
            />
          {/snippet}
        </PassDeck>
      {/snippet}
    </PassCarousel>

    {#if active && focused}
      <div class="below" style:--tint={active.card.color}>
        {#key `${active.card.id}:${focused.instance}:${focused.isComplete}:${Boolean(focused.redemption)}`}
          <div class="actions" in:popIn>
            {#if focused.redemption}
              {@const redemption = focused.redemption}
              <p class="hint">
                claimed {formatDate(redemption.timestamp)}
                <button
                  type="button"
                  class="inline-action"
                  onclick={() => store.unredeem(redemption)}
                >
                  undo
                </button>
              </p>
              {#if focused === active.current}
                <button
                  type="button"
                  class="btn btn-accent"
                  onclick={() => startNext(active)}
                >
                  start a new card
                </button>
              {/if}
            {:else if focused.isComplete}
              <div class="action-row" class:single={focused !== active.current}>
                <button
                  type="button"
                  class="btn btn-accent"
                  onclick={() => claim(active, focused)}
                >
                  claim reward
                </button>
                {#if focused === active.current}
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onclick={() => startNext(active)}
                  >
                    new card
                  </button>
                {/if}
              </div>
            {:else if focused === active.current}
              <p class="hint">
                {remaining(active)} to go{active.card.rewardText
                  ? ` · ${active.card.rewardText}`
                  : ""}
              </p>
            {:else}
              <p class="hint">
                {focused.stamps.size} of {focused.maxStamps}
              </p>
            {/if}
          </div>
        {/key}

        {#if allPasses.length > 1}
          <button
            type="button"
            class="show-all"
            onclick={() => (showAll = true)}
          >
            show all · {allPasses.length}
          </button>
        {/if}
      </div>
    {/if}
    </div>
  {/if}
</main>

{#if showAll && active}
  {@const stack = active}
  <section
    class="all"
    style:--tint={stack.card.color}
    aria-label={`All ${stack.card.title} cards`}
    transition:fadeMotion
  >
    <button type="button" class="back" onclick={() => (showAll = false)}>
      <ChevronLeft size={18} />
      {stack.card.title}
    </button>
    <ol class="all-list">
      {#each allPasses as pass, i (pass.instance)}
        <li style:--i={Math.min(i, 6)}>
          <PassCard
            card={stack.card}
            {pass}
            interactive={false}
            muted={Boolean(pass.redemption)}
            onInspect={(slot, anchor) => inspect(stack, pass, slot, anchor)}
            onInfo={() => openSummary(stack, pass)}
          />
          {#if pass.redemption}
            {@const redemption = pass.redemption}
            <button
              type="button"
              class="inline-action"
              onclick={() => store.unredeem(redemption)}
            >
              undo claim
            </button>
          {:else if pass.isComplete}
            <button
              type="button"
              class="btn btn-accent"
              onclick={() => claim(stack, pass)}
            >
              claim reward
            </button>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

{#if picker && pickerCard}
  <IconPicker
    anchor={picker.anchor}
    look={pickerCard}
    defaultIcon={picker.original.icon}
    defaultColor={picker.original.color}
    onChange={(look) => store.previewCard({ ...pickerCard, ...look })}
    onClose={closePicker}
  />
{/if}


{#if noteTarget}
  {#key noteKey}
    <NoteBar onSave={saveNote} onDismiss={() => (noteTarget = null)} />
  {/key}
{/if}

{#if editing}
  {@const card = editing === "new" ? undefined : editing}
  <CardEditor
    {card}
    userName={store.myName}
    minStamps={editingStack ? minStamps(editingStack) : 1}
    members={card ? store.membersOf(card.id) : []}
    onSave={saveCard}
    onDelete={card ? deleteEditing : undefined}
    onInvite={card ? () => store.createInvite(card.id) : undefined}
    onRevokeInvites={card ? () => store.revokeInvites(card.id) : undefined}
    onRemoveMember={card
      ? (userId) => store.removeMember(card.id, userId)
      : undefined}
    onClose={() => (editing = null)}
  />
{/if}

{#if summary && summaryStack && summaryPass}
  {@const stack = summaryStack}
  <PassSummary
    card={stack.card}
    pass={summaryPass}
    members={store.membersOf(stack.card.id)}
    canRemove={summaryPass === stack.current && !summaryPass.redemption}
    onSaveNote={(target, note) => store.saveNote(target, note)}
    onRemove={(slot) => store.unstamp(stack, slot)}
    onLeave={store.isOwner(stack.card)
      ? undefined
      : () => {
          summary = null;
          store.removeMember(stack.card.id, store.userId ?? "");
        }}
    onClose={() => (summary = null)}
  />
{/if}

{#if inspecting && inspectStack && inspected}
  {@const stack = inspectStack}
  {@const record = inspected}
  <StampPopover
    anchor={inspecting.anchor}
    stamp={record}
    color={stack.card.color}
    canRemove={record.cardInstance === stack.current.instance &&
      !stack.current.redemption}
    onSaveNote={(target, note) => store.saveNote(target, note)}
    onRemove={(target) => {
      // Unstamp first: clearing `inspecting` empties `stack` and `record`.
      store.unstamp(stack, target.slotIndex);
      inspecting = null;
    }}
    onClose={() => (inspecting = null)}
  />
{/if}

<style>
  .controls {
    display: flex;
    gap: 8px;
    position: fixed;
    right: 16px;
    top: calc(16px + env(safe-area-inset-top));
    z-index: 30;
  }

  .syncing {
    animation: breathe 1.4s ease-in-out infinite;
  }

  @keyframes breathe {
    50% {
      opacity: 0.5;
    }
  }

  /* The card group sits in the middle of the screen; the page never scrolls. */
  .dashboard {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    justify-content: center;
    overflow: hidden;
    padding: calc(64px + env(safe-area-inset-top)) 0
      calc(16px + env(safe-area-inset-bottom));
  }

  .below {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0 auto;
    max-width: 440px;
    /* Reserved, so switching cards never shifts the card above. */
    min-height: 116px;
    padding: 14px 16px 0;
    width: 100%;
  }

  .actions {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-align: center;
    width: 100%;
  }

  .action-row {
    display: grid;
    gap: 10px;
    grid-template-columns: 1.4fr 1fr;
    width: 100%;
  }

  .action-row.single {
    grid-template-columns: 1fr;
  }

  .hint {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .inline-action {
    color: var(--color-accent-blue);
    font-weight: 600;
    margin-left: 6px;
  }

  .show-all {
    background: var(--glass-surface-subtle);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    color: var(--color-text-muted);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 5px 12px;
    transition:
      background-color 0.2s ease,
      transform 0.45s var(--ease-spring);
  }

  .show-all:active {
    transform: scale(0.94);
  }

  @media (hover: hover) {
    .show-all:hover {
      background: var(--glass-surface-pill);
      color: var(--color-text-main);
    }
  }

  /*
   * A soft glow in the focused card's color behind everything. It moves
   * only when the focus changes (a registered-property transition), so it
   * costs nothing at rest.
   */
  .ambient {
    background:
      radial-gradient(
        60% 42% at 50% 40%,
        color-mix(in srgb, var(--ambient) 30%, transparent),
        transparent 72%
      ),
      radial-gradient(
        70% 30% at 50% 105%,
        color-mix(in srgb, var(--ambient) 22%, transparent),
        transparent 70%
      );
    inset: 0;
    pointer-events: none;
    position: fixed;
    transition: --ambient 0.9s ease;
    z-index: -1;
  }

  .deck-view {
    display: flex;
    flex-direction: column;
    transition:
      opacity 0.3s ease,
      transform 0.6s var(--ease-spring);
  }

  .deck-view.away {
    opacity: 0;
    transform: scale(0.94);
  }

  /* "Show all": every card of the stack in a plain scrolling list. */
  .all {
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: calc(76px + env(safe-area-inset-top)) 16px
      calc(32px + env(safe-area-inset-bottom));
    position: fixed;
    z-index: 20;
  }

  .back {
    align-items: center;
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    background: var(--glass-surface-pill);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    box-shadow: var(--glass-shadow-sm);
    display: inline-flex;
    font-size: 0.9rem;
    font-weight: 650;
    gap: 2px;
    height: 42px;
    left: 16px;
    max-width: calc(100vw - 140px);
    overflow: hidden;
    padding: 0 16px 0 10px;
    position: fixed;
    text-overflow: ellipsis;
    top: calc(16px + env(safe-area-inset-top));
    transition: transform 0.45s var(--ease-spring);
    white-space: nowrap;
    z-index: 25;
  }

  .back:active {
    transform: scale(0.94);
  }

  .all-list {
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(0, 1fr);
    list-style: none;
    margin: 0 auto;
    padding: 0;
    width: var(--pass-width);
  }

  .all-list li {
    align-items: center;
    animation: rise 0.7s var(--ease-spring) both;
    animation-delay: calc(var(--i) * 50ms);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(36px) scale(0.96);
    }
  }

  .placeholder {
    animation: breathe 1.6s ease-in-out infinite;
    aspect-ratio: 1;
    background: var(--glass-surface-subtle);
    border-radius: var(--radius-xl);
    margin: 0 auto;
    width: var(--pass-width);
  }

  /* No cards yet: a card-shaped outline in the middle of the screen. */
  .add-card {
    align-items: center;
    aspect-ratio: 1.1;
    background: var(--glass-surface-subtle);
    border: 2px dashed rgb(15 23 42 / 14%);
    border-radius: 32px;
    color: var(--color-text-muted);
    display: flex;
    flex-direction: column;
    font-size: 0.95rem;
    font-weight: 600;
    gap: 12px;
    justify-content: center;
    margin: 0 auto;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.45s var(--ease-spring);
    width: var(--pass-width);
  }

  .add-mark {
    background: var(--color-text-main);
    clip-path: var(--shape-cookie);
    color: #fff;
    display: grid;
    height: 64px;
    place-items: center;
    transition: rotate 0.7s var(--ease-spring);
    width: 64px;
  }

  .add-card:active {
    transform: scale(0.97);
  }

  @media (hover: hover) {
    .add-card:hover {
      background: var(--glass-surface-pill);
      border-color: rgb(15 23 42 / 24%);
      color: var(--color-text-main);
    }

    .add-card:hover .add-mark {
      rotate: 40deg;
    }
  }
</style>
