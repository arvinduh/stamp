<!--
  @component Modal
  A centered glass dialog with a title, a close button, and optional actions
  along the bottom. Built on the native <dialog>, which supplies focus
  trapping, Escape, and an inert page behind it.

  The caller owns visibility: render it inside an `{#if}` and drop it in
  `onClose`; the exit animation plays as it unmounts.
-->
<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { onMount, type Snippet } from "svelte";
  import {
    fadeMotion,
    popIn,
    popOut,
    sheetIn,
    sheetOut,
  } from "../utils/motion";

  interface Props {
    title: string;
    onClose: () => void;
    children: Snippet;
    /** Buttons along the bottom edge, right-aligned. */
    actions?: Snippet;
  }

  let { title, onClose, children, actions }: Props = $props();

  /** Phone widths get a bottom sheet; matches the media query below. */
  const SHEET_QUERY = "(max-width: 600px)";

  const titleId = $props.id();
  const asSheet = matchMedia(SHEET_QUERY).matches;
  const enter = asSheet ? sheetIn : popIn;
  const leave = asSheet ? sheetOut : popOut;
  let dialog: HTMLDialogElement;

  onMount(() => {
    dialog.showModal();
  });

  function handleCancel(e: Event) {
    e.preventDefault();
    onClose();
  }
</script>

<dialog
  bind:this={dialog}
  class="modal-host"
  aria-labelledby={titleId}
  oncancel={handleCancel}
>
  <button
    type="button"
    class="scrim"
    aria-label="Close"
    tabindex="-1"
    onclick={onClose}
    transition:fadeMotion|global
  ></button>
  <section class="modal" in:enter|global out:leave|global>
    <header class="modal-head">
      <h2 id={titleId} class="modal-title">{title}</h2>
      <button
        type="button"
        class="close"
        aria-label="Close"
        onclick={onClose}
      >
        <X size={18} />
      </button>
    </header>
    <div class="modal-body">
      {@render children()}
    </div>
    {#if actions}
      <footer class="modal-actions">{@render actions()}</footer>
    {/if}
  </section>
</dialog>

<style>
  .modal-host {
    align-items: center;
    background: none;
    border: 0;
    display: flex;
    height: 100%;
    justify-content: center;
    max-height: none;
    max-width: none;
    overflow: hidden;
    padding: 16px;
    width: 100%;
  }

  .modal-host::backdrop {
    background: transparent;
  }

  .scrim {
    background: rgb(15 23 42 / 22%);
    cursor: default;
    inset: 0;
    position: fixed;
  }

  .modal {
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    background: rgb(255 255 255 / 84%);
    border: 1px solid var(--glass-border-highlight);
    border-radius: var(--radius-xl);
    box-shadow: var(--glass-shadow-hover);
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 32px);
    max-width: 420px;
    position: relative;
    width: 100%;
  }

  .modal-head {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 18px 16px 4px 22px;
  }

  .modal-title {
    font-size: 1.2rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .close {
    background: var(--glass-surface-sunken);
    border-radius: var(--radius-full);
    color: var(--color-text-muted);
    display: grid;
    flex: none;
    height: 32px;
    place-items: center;
    transition: transform 0.4s var(--ease-spring);
    width: 32px;
  }

  .close:active {
    transform: scale(0.88);
  }

  .modal-body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px 22px 20px;
  }

  .modal-actions {
    border-top: 1px solid var(--glass-border-subtle);
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 16px;
  }

  /* Phones: a bottom sheet, within thumb reach. */
  @media (max-width: 600px) {
    .modal-host {
      align-items: flex-end;
      padding: 0;
    }

    .modal {
      border-bottom: 0;
      border-radius: 28px 28px 0 0;
      max-height: 90dvh;
      max-width: none;
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
