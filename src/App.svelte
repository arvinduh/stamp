<!--
  @component App
  Root shell: owns the store, switches between sign-in and the dashboard,
  hosts the settings dialog and the error toast, and reloads when the app
  comes back to the foreground (live updates can drop while a phone sleeps).
-->
<script lang="ts">
  import { parkInviteFromUrl } from "./services/invite_link";
  import { StampStore } from "./services/store.svelte";
  import { fadeMotion, popIn } from "./utils/motion";
  import SettingsModal from "./components/SettingsModal.svelte";
  import DashboardView from "./views/DashboardView.svelte";
  import SignInView from "./views/SignInView.svelte";

  const TOAST_MS = 5000;

  // Before the store starts, so an invite in the address bar survives sign-in.
  parkInviteFromUrl();
  const store = new StampStore();
  let showSettings = $state(false);

  $effect(() => {
    if (!store.error) {
      return;
    }
    const timer = setTimeout(() => (store.error = ""), TOAST_MS);
    return () => clearTimeout(timer);
  });

  function handleVisibility() {
    if (document.visibilityState === "visible") {
      store.refreshIfStale();
    }
  }
</script>

<svelte:document onvisibilitychange={handleVisibility} />

{#if store.userId}
  <DashboardView {store} onOpenSettings={() => (showSettings = true)} />
  {#if showSettings}
    <SettingsModal
      name={store.myName}
      onRename={(name) => store.rename(name)}
      onSignOut={() => {
        showSettings = false;
        void store.signOut();
      }}
      onClose={() => (showSettings = false)}
    />
  {/if}
{:else if store.userId === null}
  <SignInView />
{/if}

{#if store.error}
  <div class="toast-wrap" role="alert" in:popIn out:fadeMotion>
    <button
      type="button"
      class="toast"
      aria-label={`${store.error} Dismiss.`}
      onclick={() => (store.error = "")}
    >
      {store.error}
    </button>
  </div>
{/if}

<style>
  .toast-wrap {
    display: flex;
    justify-content: center;
    left: 0;
    padding: 0 16px;
    pointer-events: none;
    position: fixed;
    right: 0;
    top: calc(16px + env(safe-area-inset-top));
    z-index: 60;
  }

  .toast {
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    backdrop-filter: blur(20px) saturate(180%);
    background: rgb(254 242 242 / 88%);
    border: 1px solid #fecaca;
    border-radius: var(--radius-full);
    box-shadow: var(--glass-shadow);
    color: var(--color-danger);
    font-size: 0.85rem;
    font-weight: 600;
    max-width: 420px;
    padding: 9px 16px;
    pointer-events: auto;
  }
</style>
