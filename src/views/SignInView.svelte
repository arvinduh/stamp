<!--
  @component SignInView
  Signed-out screen. Email sign-in comes first: type your address, get a
  one-time code, type it in; no password. Buttons for Google or GitHub follow
  when they are switched on in the Supabase dashboard. Mentions a pending
  invite so people opening a shared link know why they are here.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    isConfigured,
    type Provider,
    sendEmailCode,
    signIn,
    signInMethods,
    type SignInMethods,
    verifyEmailCode,
  } from "../services/api";
  import { hasParkedInvite } from "../services/invite_link";
  import { popIn } from "../utils/motion";

  const LABELS: Record<Provider, string> = {
    google: "continue with Google",
    github: "continue with GitHub",
  };
  /** Supabase codes are 6 to 10 digits, depending on project settings. */
  const CODE_PATTERN = /^\d{6,10}$/;
  /** Wait before offering to send another code. */
  const RESEND_MS = 30000;

  const inviting = hasParkedInvite();

  let methods = $state<SignInMethods | null>(null);
  let email = $state("");
  /** The address a code was sent to; empty until then. */
  let sentTo = $state("");
  let code = $state("");
  let busy = $state(false);
  let canResend = $state(false);
  let redirecting = $state<Provider | null>(null);
  let error = $state("");
  let codeInput: HTMLInputElement | undefined = $state();
  let resendTimer = 0;

  const emailValid = $derived(/^\S+@\S+\.\S+$/.test(email.trim()));
  const codeValid = $derived(CODE_PATTERN.test(code.trim()));
  const nothingOn = $derived(
    methods !== null && !methods.email && methods.providers.length === 0,
  );

  onMount(() => {
    if (isConfigured) {
      signInMethods().then(
        (m) => {
          methods = m;
        },
        (err: unknown) => {
          error = message(err, "Could not reach Supabase.");
        },
      );
    }
    return () => clearTimeout(resendTimer);
  });

  function message(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }

  async function sendCode(e?: SubmitEvent) {
    e?.preventDefault();
    if (!emailValid || busy) {
      return;
    }
    busy = true;
    error = "";
    const address = email.trim().toLowerCase();
    try {
      await sendEmailCode(address);
      sentTo = address;
      code = "";
      canResend = false;
      clearTimeout(resendTimer);
      resendTimer = window.setTimeout(() => (canResend = true), RESEND_MS);
      queueMicrotask(() => codeInput?.focus());
    } catch (err: unknown) {
      error = message(err, "Could not send a code.");
    } finally {
      busy = false;
    }
  }

  async function verify(e: SubmitEvent) {
    e.preventDefault();
    if (!codeValid || busy) {
      return;
    }
    busy = true;
    error = "";
    try {
      // On success the session listener swaps this screen for the app.
      await verifyEmailCode(sentTo, code.trim());
    } catch (err: unknown) {
      error = message(err, "That code didn't work.");
      busy = false;
    }
  }

  function changeEmail() {
    sentTo = "";
    code = "";
    error = "";
  }

  async function start(provider: Provider) {
    redirecting = provider;
    error = "";
    try {
      await signIn(provider);
    } catch (err: unknown) {
      redirecting = null;
      error = message(err, "Could not start sign-in.");
    }
  }
</script>

<main class="sign-in">
  <div class="card" in:popIn>
    <header class="hero">
      <img class="logo" src="./favicon.svg" alt="" />
      <h1>stamp</h1>
      <p>
        {inviting
          ? "sign in to join the card you were invited to"
          : "loyalty cards you share with friends"}
      </p>
    </header>

    {#if !isConfigured}
      <p class="note">
        No Supabase project is set up yet. Copy <code>.env.example</code> to
        <code>.env.local</code>, fill in your project's URL and key, and restart
        the dev server.
      </p>
    {:else if nothingOn}
      <p class="note">
        No sign-in method is on yet. Turn one on in Supabase under
        Authentication → Sign In / Providers.
      </p>
    {:else if methods}
      {#if methods.email}
        {#if sentTo}
          <form class="form" onsubmit={verify}>
            <p class="note">
              We sent a code to <strong>{sentTo}</strong>.
            </p>
            <input
              bind:this={codeInput}
              class="input code"
              bind:value={code}
              placeholder="code"
              aria-label="Sign-in code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength={10}
            />
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!codeValid || busy}
            >
              {busy ? "checking…" : "sign in"}
            </button>
            <div class="links">
              <button type="button" class="link" onclick={changeEmail}>
                use another email
              </button>
              <button
                type="button"
                class="link"
                disabled={!canResend || busy}
                onclick={() => sendCode()}
              >
                send again
              </button>
            </div>
          </form>
        {:else}
          <form class="form" onsubmit={sendCode}>
            <input
              class="input"
              type="email"
              bind:value={email}
              placeholder="you@example.com"
              aria-label="Email"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
            />
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!emailValid || busy}
            >
              {busy ? "sending…" : "email me a code"}
            </button>
          </form>
        {/if}
      {/if}

      {#if methods.providers.length > 0 && !sentTo}
        {#if methods.email}
          <p class="divider" aria-hidden="true">or</p>
        {/if}
        {#each methods.providers as provider (provider)}
          <button
            type="button"
            class="btn provider"
            disabled={redirecting !== null}
            onclick={() => start(provider)}
          >
            {#if provider === "google"}
              <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path
                  fill="#ea4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285f4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#fbbc05"
                  d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34a853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
            {:else}
              <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
            {/if}
            {redirecting === provider ? "opening…" : LABELS[provider]}
          </button>
        {/each}
      {/if}
    {/if}

    {#if error}
      <p class="field-error" role="alert">{error}</p>
    {/if}
  </div>
</main>

<style>
  .sign-in {
    align-items: center;
    display: flex;
    justify-content: center;
    min-height: 100dvh;
    padding: 24px 16px;
  }

  .card {
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    background: var(--glass-surface-card);
    border: 1px solid var(--glass-border-highlight);
    border-radius: var(--radius-xl);
    box-shadow: var(--glass-shadow);
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 360px;
    padding: 32px 24px 24px;
    width: 100%;
  }

  .hero {
    align-items: center;
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
    text-align: center;
  }

  .logo {
    border-radius: 15px;
    box-shadow: 0 8px 22px -6px rgb(75 63 196 / 45%);
    height: 60px;
    margin-bottom: 14px;
    width: 60px;
  }

  h1 {
    font-size: 1.8rem;
    font-weight: 650;
    letter-spacing: -0.03em;
  }

  .hero p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .code {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.3em;
    text-align: center;
  }

  .links {
    display: flex;
    justify-content: space-between;
  }

  .link {
    color: var(--color-accent-blue);
    font-size: 0.82rem;
    font-weight: 600;
    padding: 4px 0;
  }

  .link:disabled {
    color: var(--color-text-light);
  }

  .divider {
    color: var(--color-text-light);
    font-size: 0.8rem;
    text-align: center;
  }

  .provider {
    background: #fff;
    border: 1px solid var(--glass-border-subtle);
    box-shadow: var(--glass-shadow-sm);
    color: var(--color-text-main);
    padding: 12px 18px;
    width: 100%;
  }

  .note {
    color: var(--color-text-muted);
    font-size: 0.88rem;
    text-align: center;
  }

  code {
    background: var(--glass-surface-sunken);
    border-radius: 6px;
    font-size: 0.82rem;
    padding: 1px 5px;
  }
</style>
