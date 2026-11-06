<!--
  @component NoteBar
  Floating glass pill after a stamp: a check and a real note field, so a
  quick note never needs the card summary.

  It never focuses itself, so the keyboard stays down and stamping several
  slots in a row stays fast; untouched, it slips away on its own. Typing or
  focusing it holds it open, and Enter (or the send button) saves.
-->
<script lang="ts">
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import Check from "@lucide/svelte/icons/check";
  import { onDestroy } from "svelte";
  import { fadeMotion, popIn } from "../utils/motion";

  interface Props {
    onSave: (note: string) => void;
    onDismiss: () => void;
  }

  let { onSave, onDismiss }: Props = $props();

  const AUTO_DISMISS_MS = 4000;

  let note = $state("");
  let timer = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);

  onDestroy(() => clearTimeout(timer));

  function hold() {
    clearTimeout(timer);
  }

  /** Lets an untouched bar slip away again once focus leaves it. */
  function release() {
    if (!note.trim()) {
      timer = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const clean = note.trim();
    if (clean) {
      onSave(clean);
    }
    onDismiss();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onDismiss();
    }
  }
</script>

<div class="wrap" in:popIn out:fadeMotion>
  <form class="pill" onsubmit={submit}>
    <span class="check" aria-label="Stamped">
      <Check size={13} strokeWidth={3} />
    </span>
    <input
      class="note-input"
      bind:value={note}
      placeholder="add a note"
      maxlength={120}
      enterkeyhint="send"
      aria-label="Note for this stamp"
      onfocus={hold}
      onblur={release}
      onkeydown={handleKeydown}
    />
    {#if note.trim()}
      <button type="submit" class="send" aria-label="Save note" in:popIn>
        <ArrowUp size={16} strokeWidth={2.6} />
      </button>
    {/if}
  </form>
</div>

<style>
  .wrap {
    bottom: calc(24px + env(safe-area-inset-bottom));
    display: flex;
    justify-content: center;
    left: 0;
    padding: 0 16px;
    pointer-events: none;
    position: fixed;
    right: 0;
    z-index: 40;
  }

  .pill {
    align-items: center;
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    background: rgb(255 255 255 / 78%);
    border: 1px solid var(--glass-border-highlight);
    border-radius: var(--radius-full);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 90%),
      var(--glass-shadow-hover);
    display: flex;
    gap: 10px;
    height: 48px;
    max-width: 340px;
    padding: 0 6px 0 12px;
    pointer-events: auto;
    transition: box-shadow 0.2s ease;
    width: 100%;
  }

  .pill:focus-within {
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 90%),
      0 0 0 2px rgb(15 23 42 / 12%),
      var(--glass-shadow-hover);
  }

  .check {
    background: var(--color-success);
    border-radius: 50%;
    color: #fff;
    display: grid;
    flex: none;
    height: 22px;
    place-items: center;
    width: 22px;
  }

  .note-input {
    background: none;
    border: 0;
    flex: 1;
    font-size: 1rem;
    min-width: 0;
    outline: none;
    padding: 0;
  }

  .note-input::placeholder {
    color: var(--color-text-light);
  }

  .send {
    background: var(--color-text-main);
    border-radius: 50%;
    color: #fff;
    display: grid;
    flex: none;
    height: 36px;
    place-items: center;
    transition: transform 0.4s var(--ease-spring);
    width: 36px;
  }

  .send:active {
    transform: scale(0.9);
  }
</style>
