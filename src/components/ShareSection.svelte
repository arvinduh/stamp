<!--
  @component ShareSection
  The people on a card and how to add more, for its owner: the member list
  (with remove), a fresh invite link (shared through the phone's share sheet,
  or copied), and a way to turn off links already sent.
-->
<script lang="ts">
  import Link from "@lucide/svelte/icons/link";
  import X from "@lucide/svelte/icons/x";
  import type { Member } from "../types";
  import { inviteUrl } from "../services/invite_link";

  interface Props {
    members: Member[];
    /** Makes a new invite and resolves to its token. */
    onInvite: () => Promise<string>;
    onRevokeInvites: () => void;
    onRemoveMember: (userId: string) => void;
  }

  let { members, onInvite, onRevokeInvites, onRemoveMember }: Props =
    $props();

  let status = $state<"idle" | "working" | "copied" | "revoked">("idle");
  let error = $state("");

  async function share() {
    status = "working";
    error = "";
    let url: string;
    try {
      url = inviteUrl(await onInvite());
    } catch (err: unknown) {
      status = "idle";
      error = err instanceof Error ? err.message : "Could not make a link.";
      return;
    }
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: "Join my stamp card", url });
      } catch {
        // Closing the share sheet is not an error.
      }
      status = "idle";
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      status = "copied";
    } catch {
      status = "idle";
      error = `Copy this link: ${url}`;
    }
  }

  function revoke() {
    onRevokeInvites();
    status = "revoked";
  }
</script>

<section class="share" aria-labelledby="share-heading">
  <h3 id="share-heading" class="field-label">people</h3>
  <ul class="people">
    {#each members as member (member.userId)}
      <li class="person">
        <span class="initial" aria-hidden="true">
          {member.name.slice(0, 1).toUpperCase()}
        </span>
        <span class="name">{member.name}</span>
        {#if member.role === "owner"}
          <span class="role">owner</span>
        {:else}
          <button
            type="button"
            class="remove"
            aria-label={`Remove ${member.name}`}
            title="remove"
            onclick={() => onRemoveMember(member.userId)}
          >
            <X size={15} />
          </button>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="actions">
    <button
      type="button"
      class="btn btn-secondary"
      disabled={status === "working"}
      onclick={share}
    >
      <Link size={15} />
      {status === "copied" ? "link copied" : "invite link"}
    </button>
    <button type="button" class="btn btn-quiet" onclick={revoke}>
      {status === "revoked" ? "old links off" : "turn off old links"}
    </button>
  </div>
  {#if error}
    <p class="field-error" role="alert">{error}</p>
  {:else}
    <p class="field-hint">Anyone with a link can join for 14 days.</p>
  {/if}
</section>

<style>
  .share {
    border-top: 1px solid var(--glass-border-subtle);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }

  .people {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .person {
    align-items: center;
    display: flex;
    gap: 10px;
    min-height: 36px;
  }

  .initial {
    background: var(--glass-surface-sunken);
    border-radius: 50%;
    display: grid;
    flex: none;
    font-size: 0.78rem;
    font-weight: 650;
    height: 28px;
    place-items: center;
    width: 28px;
  }

  .name {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role {
    color: var(--color-text-light);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .remove {
    border-radius: 50%;
    color: var(--color-text-light);
    display: grid;
    height: 30px;
    place-items: center;
    width: 30px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  @media (hover: hover) {
    .remove:hover {
      background: color-mix(in srgb, var(--color-danger) 10%, transparent);
      color: var(--color-danger);
    }
  }
</style>
