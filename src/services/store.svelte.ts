/**
 * @fileoverview Reactive app data with optimistic mutations.
 *
 * The store owns the signed-in session and every record the user can see.
 * Each mutation updates local state at once, then queues the write; a
 * refused write surfaces an error and reloads, since the database is the
 * source of truth. Changes from anyone (including our own writes) arrive as
 * live events that trigger a reload. UI effects belong to the views.
 */

import { buildStacks, type Pass, type Stack } from "../lib/stacks";
import {
  enqueue,
  fetchState,
  isConfigured,
  removePhoto,
  rpc,
  signOut,
  uploadPhoto,
  watchChanges,
  watchSession,
} from "./api";
import { takeParkedInvite } from "./invite_link";
import type {
  Card,
  Member,
  PassRecord,
  RedemptionRecord,
  StampRecord,
} from "../types";

/** Reload on focus only when the last load is at least this old. */
const STALE_MS = 15000;

export class StampStore {
  /** Signed-in account id; null when signed out, undefined while checking. */
  userId = $state<string | null | undefined>(isConfigured ? undefined : null);
  myName = $state("");
  cards = $state.raw<Card[]>([]);
  members = $state.raw<Member[]>([]);
  passes = $state.raw<PassRecord[]>([]);
  stamps = $state.raw<StampRecord[]>([]);
  redemptions = $state.raw<RedemptionRecord[]>([]);
  /** True once the first load has succeeded. */
  loaded = $state(false);
  syncing = $state(false);
  error = $state("");
  /** A card just joined through an invite, for the view to bring forward. */
  joinedCardId = $state("");

  readonly stacks: Stack[] = $derived(
    buildStacks(this.cards, this.stamps, this.redemptions, this.passes),
  );

  // Bumped on every optimistic change, so a read that started earlier knows
  // its result is already out of date.
  private mutationCount = 0;
  private lastSyncAt = 0;
  private stopWatching: (() => void) | null = null;

  constructor() {
    if (isConfigured) {
      watchSession((id) => this.handleSession(id));
    }
  }

  async signOut(): Promise<void> {
    await signOut();
  }

  isOwner(card: Card): boolean {
    return card.ownerId === this.userId;
  }

  membersOf(cardId: string): Member[] {
    return this.members.filter((m) => m.cardId === cardId);
  }

  /**
   * Replaces local records with the database's.
   *
   * Reads queue behind pending writes. If the user changed something while
   * the read was in flight, the result is dropped and the read repeats.
   */
  async refresh(): Promise<void> {
    const user = this.userId;
    if (!user) {
      return;
    }
    const seen = this.mutationCount;
    this.syncing = true;
    try {
      const data = await enqueue(fetchState);
      if (user !== this.userId) {
        return;
      }
      if (seen !== this.mutationCount) {
        return this.refresh();
      }
      this.myName = data.myName;
      this.cards = data.cards;
      this.members = data.members;
      this.passes = data.passes;
      this.stamps = data.stamps;
      this.redemptions = data.redemptions;
      this.loaded = true;
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : "Could not load cards.";
    } finally {
      this.syncing = false;
      this.lastSyncAt = Date.now();
    }
  }

  /** Reloads when returning to the app after a while away. */
  refreshIfStale(): void {
    if (Date.now() - this.lastSyncAt >= STALE_MS) {
      void this.refresh();
    }
  }

  /** Stamps a slot on the stack's newest pass; a no-op if not allowed. */
  stamp(stack: Stack, slotIndex: number): void {
    const pass = stack.current;
    if (pass.redemption || pass.stamps.has(slotIndex)) {
      return;
    }
    this.stamps = [
      ...this.stamps,
      {
        cardId: stack.card.id,
        cardInstance: pass.instance,
        slotIndex,
        user: this.myName,
        timestamp: new Date().toISOString(),
        note: "",
      },
    ];
    this.commit(() =>
      rpc("stamp", {
        card: stack.card.id,
        instance: pass.instance,
        slot: slotIndex,
      }),
    );
  }

  /** Removes a stamp from the stack's newest pass. */
  unstamp(stack: Stack, slotIndex: number): void {
    const stamp = stack.current.stamps.get(slotIndex);
    if (!stamp || stack.current.redemption) {
      return;
    }
    this.stamps = this.stamps.filter((s) => s !== stamp);
    this.commit(() =>
      rpc("unstamp", {
        card: stamp.cardId,
        instance: stamp.cardInstance,
        slot: slotIndex,
      }),
    );
  }

  saveNote(stamp: StampRecord, note: string): void {
    this.stamps = this.stamps.map((s) =>
      isSameSlot(s, stamp) ? { ...s, note } : s,
    );
    this.commit(() =>
      rpc("save_note", {
        card: stamp.cardId,
        instance: stamp.cardInstance,
        slot: stamp.slotIndex,
        note,
      }),
    );
  }

  /**
   * Redeems a full pass. Redeeming the newest pass also starts a fresh one,
   * so the stack is ready for the next stamp.
   */
  redeem(stack: Stack, pass: Pass): void {
    if (!pass.isComplete || pass.redemption) {
      return;
    }
    this.redemptions = [
      ...this.redemptions,
      {
        cardId: stack.card.id,
        cardInstance: pass.instance,
        user: this.myName,
        timestamp: new Date().toISOString(),
      },
    ];
    this.commit(() =>
      rpc("redeem", { card: stack.card.id, instance: pass.instance }),
    );
    if (pass.instance === stack.current.instance) {
      this.startNext(stack);
    }
  }

  unredeem(redemption: RedemptionRecord): void {
    this.redemptions = this.redemptions.filter((r) => r !== redemption);
    this.commit(() =>
      rpc("unredeem", {
        card: redemption.cardId,
        instance: redemption.cardInstance,
      }),
    );
  }

  /** Starts a new pass on a stack whose newest pass is full. */
  startNext(stack: Stack): void {
    if (!stack.current.isComplete) {
      return;
    }
    const instance = stack.current.instance + 1;
    this.passes = [
      ...this.passes,
      {
        cardId: stack.card.id,
        cardInstance: instance,
        maxStamps: stack.card.maxStamps,
        user: this.myName,
        timestamp: new Date().toISOString(),
      },
    ];
    this.commit(() =>
      rpc("start_next_pass", { card: stack.card.id, instance }),
    );
  }

  createCard(card: Card): void {
    const user = this.userId;
    if (!user) {
      return;
    }
    const now = new Date().toISOString();
    this.cards = [...this.cards, { ...card, ownerId: user, createdAt: now }];
    this.members = [
      ...this.members,
      { cardId: card.id, userId: user, name: this.myName, role: "owner" },
    ];
    this.passes = [
      ...this.passes,
      {
        cardId: card.id,
        cardInstance: 0,
        maxStamps: card.maxStamps,
        user: this.myName,
        timestamp: now,
      },
    ];
    this.commit(async () => {
      await rpc("create_card", {
        id: card.id,
        title: card.title,
        maxStamps: card.maxStamps,
        icon: card.icon,
        color: card.color,
        rewardText: card.rewardText,
      });
      if (card.background.startsWith("data:")) {
        await this.savePhoto(card, "");
      }
    });
  }

  /**
   * Saves a card's look, details, and stamp count. A new count also reshapes
   * the pass in progress (the database refuses it if a used stamp would fall
   * outside); finished passes keep theirs.
   */
  updateCard(card: Card): void {
    const before = this.cards.find((c) => c.id === card.id);
    if (!before) {
      return;
    }
    this.previewCard(card);
    if (card.maxStamps !== before.maxStamps) {
      this.reshapeCurrentPass(card);
    }
    this.commit(() => this.savePhoto(card, before.photoPath));
  }

  /**
   * Shows a card change locally without saving it, for live previews such as
   * the icon picker; follow with `updateCard` to persist.
   */
  previewCard(card: Card): void {
    this.mutationCount += 1;
    this.cards = this.cards.map((c) => (c.id === card.id ? card : c));
  }

  /** Deletes a card along with every stamp, redemption, and pass it owns. */
  deleteCard(cardId: string): void {
    this.dropCardLocally(cardId);
    this.commit(async () => {
      const photo = await rpc<string>("delete_card", { card: cardId });
      await removePhoto(photo);
    });
  }

  /**
   * Makes a new invite link token for a card the user owns.
   *
   * Errors: throws with the database's message when refused.
   */
  createInvite(cardId: string): Promise<string> {
    return enqueue(() => rpc<string>("create_invite", { card: cardId }));
  }

  /** Stops every invite link for a card from working. */
  revokeInvites(cardId: string): void {
    this.commit(() => rpc("revoke_invites", { card: cardId }));
  }

  /** Removes someone from a card; removing yourself leaves it. */
  removeMember(cardId: string, userId: string): void {
    if (userId === this.userId) {
      this.dropCardLocally(cardId);
    } else {
      this.members = this.members.filter(
        (m) => !(m.cardId === cardId && m.userId === userId),
      );
    }
    this.commit(() => rpc("remove_member", { card: cardId, user: userId }));
  }

  rename(name: string): void {
    this.myName = name;
    this.commit(() => rpc("rename", { name }));
  }

  private handleSession(id: string | null): void {
    if (id === this.userId) {
      return;
    }
    this.stopWatching?.();
    this.stopWatching = null;
    this.reset();
    this.userId = id;
    if (!id) {
      return;
    }
    this.stopWatching = watchChanges(() => void this.refresh());
    void this.acceptInvite().then(() => this.refresh());
  }

  /** Joins the card behind an invite link the user arrived with, if any. */
  private async acceptInvite(): Promise<void> {
    const token = takeParkedInvite();
    if (!token) {
      return;
    }
    try {
      this.joinedCardId = await enqueue(() =>
        rpc<string>("accept_invite", { token }),
      );
    } catch (err: unknown) {
      this.error =
        err instanceof Error ? err.message : "Could not join that card.";
    }
  }

  /** Uploads a newly chosen photo if needed, then saves the card. */
  private async savePhoto(card: Card, oldPath: string): Promise<void> {
    let path = card.background ? card.photoPath : "";
    if (card.background.startsWith("data:")) {
      path = await uploadPhoto(card.id, card.background);
    }
    await rpc("update_card", {
      id: card.id,
      title: card.title,
      maxStamps: card.maxStamps,
      icon: card.icon,
      color: card.color,
      rewardText: card.rewardText,
      photoPath: path,
    });
    if (oldPath && oldPath !== path) {
      await removePhoto(oldPath);
    }
  }

  /** Mirrors the database: a new count applies to an unfinished newest pass. */
  private reshapeCurrentPass(card: Card): void {
    const stack = this.stacks.find((s) => s.card.id === card.id);
    const pass = stack?.current;
    if (!pass || pass.isComplete || pass.redemption) {
      return;
    }
    this.passes = this.passes.map((p) =>
      p.cardId === card.id && p.cardInstance === pass.instance
        ? { ...p, maxStamps: card.maxStamps }
        : p,
    );
  }

  private dropCardLocally(cardId: string): void {
    const other = (r: { cardId: string }) => r.cardId !== cardId;
    this.mutationCount += 1;
    this.cards = this.cards.filter((c) => c.id !== cardId);
    this.members = this.members.filter(other);
    this.passes = this.passes.filter(other);
    this.stamps = this.stamps.filter(other);
    this.redemptions = this.redemptions.filter(other);
  }

  /** Queues a write; a refused write shows its reason and reloads. */
  private commit(task: () => Promise<unknown>): void {
    this.mutationCount += 1;
    enqueue(task).catch((err: unknown) => {
      this.error =
        err instanceof Error ? err.message : "Could not save that change.";
      void this.refresh();
    });
  }

  private reset(): void {
    this.myName = "";
    this.cards = [];
    this.members = [];
    this.passes = [];
    this.stamps = [];
    this.redemptions = [];
    this.loaded = false;
    this.joinedCardId = "";
  }
}

function isSameSlot(a: StampRecord, b: StampRecord): boolean {
  return (
    a.cardId === b.cardId &&
    a.cardInstance === b.cardInstance &&
    a.slotIndex === b.slotIndex
  );
}
