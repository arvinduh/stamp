<!--
  @component CardEditor
  Creates a card type, or edits it, with a live preview. Icon, color, and
  photo come from the icon popover, opened from the preview's icon or the
  button below it. Editing also shows who the card is shared with.

  A changed stamp count applies to the card in progress and to future ones;
  finished cards keep theirs. It cannot drop below a stamp already used.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import type { Card, Member, StampRecord } from "../types";
  import type { Pass } from "../lib/stacks";
  import { PALETTE } from "../lib/palette";
  import { newUuid } from "../utils/id";
  import Icon from "./Icon.svelte";
  import IconPicker from "./IconPicker.svelte";
  import Modal from "./Modal.svelte";
  import PassCard from "./PassCard.svelte";
  import ShareSection from "./ShareSection.svelte";

  interface Props {
    /** The card to edit; omit to create a new one. */
    card?: Card;
    userName: string;
    /** Lowest allowed stamp count: one past the highest used slot. */
    minStamps: number;
    members: Member[];
    onSave: (card: Card) => void;
    /** Deletes the card being edited, with all its history. */
    onDelete?: () => void;
    onInvite?: () => Promise<string>;
    onRevokeInvites?: () => void;
    onRemoveMember?: (userId: string) => void;
    onClose: () => void;
  }

  let {
    card,
    userName,
    minStamps,
    members,
    onSave,
    onDelete,
    onInvite,
    onRevokeInvites,
    onRemoveMember,
    onClose,
  }: Props = $props();

  const MIN_STAMPS = 1;
  const MAX_STAMPS = 50;
  const DEFAULT_ICON = "coffee";

  // Seeded once from the card being edited; later prop changes are ignored.
  const initial = untrack(() => card);
  const isEdit = initial !== undefined;
  const defaultColor =
    initial?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)];

  // Deleting wipes every pass and stamp, which no tap can bring back, so it
  // asks once more (removing a single stamp does not).
  let confirmingDelete = $state(false);
  let title = $state(initial?.title ?? "");
  let rewardText = $state(initial?.rewardText ?? "");
  let stampsText = $state(String(initial?.maxStamps ?? 10));
  let look = $state({
    icon: initial?.icon ?? DEFAULT_ICON,
    color: defaultColor,
    background: initial?.background ?? "",
  });
  let pickerAnchor = $state<HTMLElement | null>(null);

  const lowest = $derived(Math.max(MIN_STAMPS, minStamps));
  const maxStamps = $derived(Math.trunc(Number(stampsText)));
  const stampsValid = $derived(
    Number.isInteger(maxStamps) &&
      maxStamps >= lowest &&
      maxStamps <= MAX_STAMPS,
  );
  const canSave = $derived(title.trim() !== "" && stampsValid);

  const previewCard: Card = $derived({
    ...look,
    id: initial?.id ?? "preview",
    ownerId: initial?.ownerId ?? "",
    photoPath: initial?.photoPath ?? "",
    title: title.trim() || "new card",
    maxStamps: stampsValid ? maxStamps : 10,
    rewardText: rewardText.trim(),
    createdAt: initial?.createdAt ?? "",
  });

  // A couple of stamps make the preview show what a filled slot looks like.
  const previewPass: Pass = $derived({
    instance: 0,
    maxStamps: previewCard.maxStamps,
    startedAt: "",
    startedBy: userName,
    stamps: new Map<number, StampRecord>(
      Array.from({ length: Math.min(2, previewCard.maxStamps) }, (_, i) => [
        i,
        {
          cardId: previewCard.id,
          cardInstance: 0,
          slotIndex: i,
          user: userName,
          timestamp: "",
          note: "",
        },
      ]),
    ),
    isComplete: false,
    completedAt: "",
  });

  function save() {
    if (!canSave) {
      return;
    }
    const fields = {
      ...look,
      title: title.trim(),
      rewardText: rewardText.trim(),
      maxStamps,
    };
    onSave(
      initial
        ? { ...initial, ...fields }
        : {
            ...fields,
            id: newUuid(),
            ownerId: "",
            photoPath: "",
            createdAt: "",
          },
    );
  }
</script>

<Modal title={isEdit ? "edit card" : "new card"} {onClose}>
  <form
    class="editor"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <div class="preview">
      <PassCard
        card={previewCard}
        pass={previewPass}
        interactive={false}
        controls
        onIcon={(anchor) => (pickerAnchor = anchor)}
      />
    </div>

    <button
      type="button"
      class="btn btn-secondary look"
      onclick={(e) => (pickerAnchor = e.currentTarget)}
    >
      <span class="icon-dot" style:--tint={look.color}>
        <Icon name={look.icon} size={14} />
      </span>
      icon, color & photo
    </button>

    <div class="form-field">
      <label for="card-title">title</label>
      <input
        id="card-title"
        class="input"
        bind:value={title}
        placeholder="Coffee Club"
        maxlength={40}
        autocomplete="off"
      />
    </div>

    <div class="row">
      <div class="form-field grow">
        <label for="card-reward">reward</label>
        <input
          id="card-reward"
          class="input"
          bind:value={rewardText}
          placeholder="Free drink (optional)"
          maxlength={60}
          autocomplete="off"
        />
      </div>
      <div class="form-field stamps">
        <label for="card-stamps">stamps</label>
        <input
          id="card-stamps"
          class="input"
          type="number"
          inputmode="numeric"
          min={lowest}
          max={MAX_STAMPS}
          bind:value={stampsText}
          aria-invalid={!stampsValid}
        />
      </div>
    </div>
    {#if !stampsValid}
      <p class="field-error">
        {lowest > MIN_STAMPS
          ? `Stamp ${lowest} is already used. Pick ${lowest} to ${MAX_STAMPS}.`
          : `Pick between 1 and ${MAX_STAMPS} stamps.`}
      </p>
    {:else if isEdit && maxStamps !== initial?.maxStamps}
      <p class="field-hint">
        Applies to the card in progress and new ones. Finished cards keep
        theirs.
      </p>
    {/if}

    {#if isEdit && onInvite && onRevokeInvites && onRemoveMember}
      <ShareSection
        {members}
        {onInvite}
        {onRevokeInvites}
        {onRemoveMember}
      />
    {/if}
  </form>

  <!-- Inside the dialog: a modal dialog makes everything outside it inert. -->
  {#if pickerAnchor}
    <IconPicker
      anchor={pickerAnchor}
      {look}
      defaultIcon={initial?.icon ?? DEFAULT_ICON}
      {defaultColor}
      onChange={(next) => (look = next)}
      onClose={() => (pickerAnchor = null)}
    />
  {/if}

  {#snippet actions()}
    {#if confirmingDelete && onDelete}
      <p class="confirm-text">Delete “{initial?.title}” and all its stamps?</p>
      <button
        type="button"
        class="btn btn-quiet"
        onclick={() => (confirmingDelete = false)}
      >
        keep
      </button>
      <button type="button" class="btn btn-danger-solid" onclick={onDelete}>
        delete
      </button>
    {:else}
      {#if isEdit && onDelete}
        <button
          type="button"
          class="btn btn-quiet btn-danger delete"
          onclick={() => (confirmingDelete = true)}
        >
          delete card
        </button>
      {/if}
      <button type="button" class="btn btn-quiet" onclick={onClose}>
        cancel
      </button>
      <button
        type="button"
        class="btn btn-primary"
        disabled={!canSave}
        onclick={save}
      >
        {isEdit ? "save" : "create"}
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  /* Pushed to the far left, away from save. */
  .delete {
    margin-right: auto;
  }

  .confirm-text {
    align-self: center;
    font-size: 0.85rem;
    font-weight: 600;
    margin-right: auto;
  }

  .btn-danger-solid {
    background: var(--color-danger);
    color: #fff;
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .preview {
    margin: 0 auto;
    max-width: 320px;
    width: 100%;
    zoom: 0.86;
  }

  .look {
    align-self: center;
    font-size: 0.85rem;
    padding: 9px 14px;
  }

  .row {
    display: flex;
    gap: 10px;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .stamps {
    flex: 0 0 92px;
  }

  .icon-dot {
    background: var(--tint);
    border-radius: 50%;
    color: #fff;
    display: grid;
    height: 22px;
    place-items: center;
    width: 22px;
  }
</style>
