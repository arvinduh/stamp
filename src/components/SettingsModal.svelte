<!--
  @component SettingsModal
  Edits the display name shown on your stamps, and signs out.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import Modal from "./Modal.svelte";

  interface Props {
    name: string;
    onRename: (name: string) => void;
    onSignOut: () => void;
    onClose: () => void;
  }

  let { name, onRename, onSignOut, onClose }: Props = $props();

  // Seeded once; edits stay local until saved.
  const initial = untrack(() => name);
  let draft = $state(initial);

  const clean = $derived(draft.trim());
  const canSave = $derived(clean !== "" && clean.length <= 40);

  function save() {
    if (!canSave) {
      return;
    }
    if (clean !== initial) {
      onRename(clean);
    }
    onClose();
  }
</script>

<Modal title="settings" {onClose}>
  <form
    class="settings"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <div class="form-field">
      <label for="settings-name">your name</label>
      <input
        id="settings-name"
        class="input"
        bind:value={draft}
        maxlength={40}
        autocomplete="name"
      />
      <p class="field-hint">
        Shown to people you share cards with. Names don't need to be unique.
      </p>
    </div>

    <button
      type="button"
      class="btn btn-quiet btn-danger sign-out"
      onclick={onSignOut}
    >
      sign out
    </button>
  </form>

  {#snippet actions()}
    <button type="button" class="btn btn-quiet" onclick={onClose}>
      cancel
    </button>
    <button
      type="button"
      class="btn btn-primary"
      disabled={!canSave}
      onclick={save}
    >
      save
    </button>
  {/snippet}
</Modal>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .sign-out {
    align-self: flex-start;
  }
</style>
