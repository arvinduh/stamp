<!--
  @component PassSummary
  Everything about one card at a glance: when it started, each stamp with
  who gave it, when, and its note, then when it was completed and claimed.

  Notes are edited right in place: each stamp's note is a real text field,
  saved when it loses focus. Below the log: who the card is shared with,
  and a way for members (not the owner) to leave it.
-->
<script lang="ts">
  import Trash from "@lucide/svelte/icons/trash-2";
  import type { Card, Member, StampRecord } from "../types";
  import type { Pass } from "../lib/stacks";
  import { formatDateTime } from "../utils/time";
  import Modal from "./Modal.svelte";

  interface Props {
    card: Card;
    pass: Pass;
    members: Member[];
    /** False on cards that no longer take changes, such as claimed ones. */
    canRemove: boolean;
    onSaveNote: (stamp: StampRecord, note: string) => void;
    onRemove: (slot: number) => void;
    /** Leaves the card; omitted for its owner. */
    onLeave?: () => void;
    onClose: () => void;
  }

  let {
    card,
    pass,
    members,
    canRemove,
    onSaveNote,
    onRemove,
    onLeave,
    onClose,
  }: Props = $props();

  // Leaving drops every stamp from view, so it asks once more.
  let confirmingLeave = $state(false);

  const stamps = $derived(
    [...pass.stamps.values()].sort((a, b) => a.slotIndex - b.slotIndex),
  );
  const progress = $derived(
    pass.redemption
      ? "claimed"
      : pass.isComplete
        ? "complete"
        : `${pass.stamps.size} of ${pass.maxStamps}`,
  );

  function saveNote(stamp: StampRecord, field: HTMLTextAreaElement) {
    const note = field.value.trim();
    if (note !== stamp.note) {
      onSaveNote(stamp, note);
    }
  }

  function close() {
    // Blurring commits a note that is still being typed.
    if (document.activeElement instanceof HTMLTextAreaElement) {
      document.activeElement.blur();
    }
    onClose();
  }
</script>

<Modal title={card.title} onClose={close}>
  <p class="sub">card {pass.instance + 1} · {progress}</p>

  <ol class="log" style:--tint={card.color}>
    {#if pass.startedAt}
      <li class="event">
        started {formatDateTime(pass.startedAt)}{pass.startedBy
          ? ` by ${pass.startedBy}`
          : ""}
      </li>
    {/if}

    {#each stamps as stamp (stamp.slotIndex)}
      <li class="stamp">
        <div class="stamp-head">
          <span class="mini" aria-hidden="true">{stamp.slotIndex + 1}</span>
          <p class="who">
            stamped by <strong>{stamp.user || "someone"}</strong>
            <time datetime={stamp.timestamp}>{formatDateTime(stamp.timestamp)}</time>
          </p>
          {#if canRemove}
            <button
              type="button"
              class="remove"
              aria-label={`Remove stamp ${stamp.slotIndex + 1}`}
              title="remove stamp"
              onclick={() => onRemove(stamp.slotIndex)}
            >
              <Trash size={16} />
            </button>
          {/if}
        </div>
        <textarea
          class="note-field"
          value={stamp.note}
          placeholder="add a note"
          aria-label={`Note for stamp ${stamp.slotIndex + 1}`}
          maxlength={120}
          rows={1}
          onblur={(e) => saveNote(stamp, e.currentTarget)}
        ></textarea>
      </li>
    {:else}
      <li class="event">no stamps yet</li>
    {/each}

    {#if pass.completedAt}
      <li class="event done">completed {formatDateTime(pass.completedAt)}</li>
    {/if}
    {#if pass.redemption}
      {@const redemption = pass.redemption}
      <li class="event done">
        claimed {formatDateTime(redemption.timestamp)}{redemption.user
          ? ` by ${redemption.user}`
          : ""}
      </li>
    {/if}
  </ol>

  {#if members.length > 1 || onLeave}
    <footer class="people">
      <p>
        shared by {members.map((m) => m.name).join(", ")}
      </p>
      {#if onLeave}
        {#if confirmingLeave}
          <span class="leave-confirm">
            leave “{card.title}”?
            <button type="button" class="inline-danger" onclick={onLeave}>
              leave
            </button>
            <button
              type="button"
              class="inline-quiet"
              onclick={() => (confirmingLeave = false)}
            >
              stay
            </button>
          </span>
        {:else}
          <button
            type="button"
            class="inline-danger"
            onclick={() => (confirmingLeave = true)}
          >
            leave card
          </button>
        {/if}
      {/if}
    </footer>
  {/if}
</Modal>

<style>
  .sub {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    margin: -6px 0 14px;
  }

  .log {
    display: flex;
    flex-direction: column;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .log > li + li {
    border-top: 1px solid var(--glass-border-subtle);
  }

  .event {
    color: var(--color-text-muted);
    font-size: 0.82rem;
    padding: 10px 0;
  }

  .event.done {
    color: var(--tint);
    font-weight: 600;
  }

  .people {
    align-items: center;
    border-top: 1px solid var(--glass-border-subtle);
    color: var(--color-text-muted);
    display: flex;
    flex-wrap: wrap;
    font-size: 0.82rem;
    gap: 6px 12px;
    justify-content: space-between;
    margin-top: 6px;
    padding-top: 12px;
  }

  .leave-confirm {
    align-items: center;
    display: flex;
    gap: 10px;
  }

  .inline-danger {
    color: var(--color-danger);
    font-size: 0.82rem;
    font-weight: 600;
  }

  .inline-quiet {
    color: var(--color-text-muted);
    font-size: 0.82rem;
    font-weight: 600;
  }

  .stamp {
    padding: 10px 0 8px;
  }

  .stamp-head {
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
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    height: 28px;
    place-items: center;
    width: 28px;
  }

  .who {
    color: var(--color-text-muted);
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    font-size: 0.85rem;
    gap: 0 8px;
    min-width: 0;
  }

  .who strong {
    color: var(--color-text-main);
    font-weight: 650;
  }

  time {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    margin-left: auto;
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

  /* A real text field that reads as plain text until touched. */
  .note-field {
    background: transparent;
    border: 0;
    border-radius: 10px;
    display: block;
    field-sizing: content;
    font-size: 0.9rem;
    line-height: 1.4;
    margin: 4px 0 0 32px;
    min-height: 1.4em;
    outline: none;
    padding: 6px 8px;
    resize: none;
    transition: background-color 0.2s ease;
    width: calc(100% - 32px);
  }

  .note-field::placeholder {
    color: var(--color-text-light);
  }

  .note-field:focus {
    background: color-mix(in srgb, var(--tint) 8%, #fff);
    box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--tint) 45%, transparent);
  }

  @media (hover: hover) {
    .note-field:hover:not(:focus) {
      background: var(--glass-surface-sunken);
    }

    .remove:hover {
      background: color-mix(in srgb, var(--color-danger) 10%, transparent);
      color: var(--color-danger);
    }
  }
</style>
