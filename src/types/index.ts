/**
 * @fileoverview Records the client keeps, mirroring the database tables.
 *
 * Rows arrive from Supabase in snake_case and are mapped to these shapes in
 * `services/api.ts`; people are referenced by account id, with the display
 * name resolved at load time. Derived view models (stacks, passes) live in
 * `lib/stacks.ts`.
 */

/** A stamp card type; every card type owns one stack of passes. */
export interface Card {
  id: string;
  ownerId: string;
  title: string;
  /** Stamps a new pass starts with, 1–50. Each pass keeps its own count. */
  maxStamps: number;
  /** Built-in icon name, emoji, or image URL. */
  icon: string;
  /** Hex tint for the pass; always dark enough to carry white text. */
  color: string;
  /** Storage path of the card photo, or "" for none. */
  photoPath: string;
  /**
   * Displayable photo: a signed URL for a saved photo, or a data URL for one
   * chosen but not uploaded yet; "" for none.
   */
  background: string;
  rewardText: string;
  createdAt: string;
}

/** One person's membership of one card. */
export interface Member {
  cardId: string;
  userId: string;
  name: string;
  role: "owner" | "member";
}

/** The start of one pass in a stack, with the stamp count it was given. */
export interface PassRecord {
  cardId: string;
  /** Zero-based pass number within the card's stack. */
  cardInstance: number;
  maxStamps: number;
  user: string;
  timestamp: string;
}

/** One filled slot on one pass. */
export interface StampRecord {
  cardId: string;
  cardInstance: number;
  slotIndex: number;
  /** Display name of whoever gave the stamp. */
  user: string;
  timestamp: string;
  note: string;
}

/** A completed pass whose reward was claimed. */
export interface RedemptionRecord {
  cardId: string;
  cardInstance: number;
  user: string;
  timestamp: string;
}

/** Everything the signed-in user can see. */
export interface AppData {
  /** The signed-in account's id. */
  me: string;
  /** The signed-in account's display name. */
  myName: string;
  cards: Card[];
  members: Member[];
  passes: PassRecord[];
  stamps: StampRecord[];
  redemptions: RedemptionRecord[];
}
