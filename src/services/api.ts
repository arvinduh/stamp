/**
 * @fileoverview The app's only door to Supabase: sign-in, loading, writes,
 * live updates, card photos, and invites.
 *
 * Every write is a database function (see `supabase/migrations`), which
 * checks permissions and stack rules; tables are read-only to the app.
 * Writes run through one FIFO queue, so they reach the database in the
 * order the user made them. This module only moves data; optimistic state
 * lives in the store.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { newUuid } from "../utils/id";
import type {
  AppData,
  Card,
  Member,
  PassRecord,
  RedemptionRecord,
  StampRecord,
} from "../types";

const PHOTO_BUCKET = "card-photos";
/** Signed photo URLs last a week; a reload signs them again. */
const PHOTO_URL_SECONDS = 7 * 24 * 60 * 60;
/** Changes arriving within this window are folded into one reload. */
const CHANGE_DEBOUNCE_MS = 250;

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

const client: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { flowType: "pkce" } }) : null;

/** Whether `.env.local` names a Supabase project. */
export const isConfigured = client !== null;

function db(): SupabaseClient {
  if (!client) {
    throw new Error("Supabase is not configured. See .env.example.");
  }
  return client;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` after every task queued before it, so writes land in the order
 * the user made them and a read never overtakes a pending write.
 */
export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next;
  return next;
}

// Auth --------------------------------------------------------------------

/**
 * Reports the signed-in account id now and whenever it changes (sign-in,
 * sign-out, or returning from Google); null when signed out.
 */
export function watchSession(onChange: (userId: string | null) => void): void {
  db().auth.onAuthStateChange((event, session) => {
    // Token refreshes keep the same account; nothing to reload.
    if (event !== "TOKEN_REFRESHED") {
      onChange(session?.user.id ?? null);
    }
  });
}

/** Sign-in providers the app offers as buttons, in the order shown. */
export const PROVIDERS = ["google", "github"] as const;

export type Provider = (typeof PROVIDERS)[number];

/** The ways to sign in that are switched on in the Supabase dashboard. */
export interface SignInMethods {
  /** Emailed one-time codes. */
  email: boolean;
  providers: Provider[];
}

/**
 * Reads which sign-in methods are switched on, so the sign-in screen never
 * offers one that cannot work.
 *
 * Errors: throws when Supabase cannot be reached.
 */
export async function signInMethods(): Promise<SignInMethods> {
  const res = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key ?? "" },
  });
  if (!res.ok) {
    throw new Error(`Supabase answered HTTP ${res.status}.`);
  }
  const settings: { external?: Record<string, boolean> } = await res.json();
  return {
    email: settings.external?.email === true,
    providers: PROVIDERS.filter((p) => settings.external?.[p] === true),
  };
}

/**
 * Emails a one-time sign-in code, creating the account on first use.
 *
 * Errors: throws with Supabase's message, for example when emails are being
 * sent too often.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await db().auth.signInWithOtp({ email });
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Signs in with an emailed code; the session listener then takes over.
 *
 * Errors: throws when the code is wrong or has expired.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<void> {
  const { error } = await db().auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Sends the browser to `provider`; it comes back to this page signed in. */
export async function signIn(provider: Provider): Promise<void> {
  const { error } = await db().auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function signOut(): Promise<void> {
  await db().auth.signOut();
}

// Reads -------------------------------------------------------------------

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

const photoUrls = new Map<string, string>();

/**
 * Loads everything the signed-in user can see in one round trip.
 *
 * Errors: throws when the request fails or is refused.
 */
export async function fetchState(): Promise<AppData> {
  const { data, error } = await db().rpc("get_state");
  if (error) {
    throw new Error(error.message);
  }
  const state = (data ?? {}) as Row;
  const names = new Map<string, string>();
  for (const p of rows(state.profiles)) {
    names.set(String(p.id), String(p.display_name));
  }
  const nameOf = (id: unknown) =>
    (typeof id === "string" && names.get(id)) || "someone";

  const cardRows = rows(state.cards);
  await signPhotos(cardRows.map((c) => String(c.photo_path ?? "")));

  const cards: Card[] = cardRows.map((c) => ({
    id: String(c.id),
    ownerId: String(c.owner_id),
    title: String(c.title),
    maxStamps: Number(c.max_stamps),
    icon: String(c.icon),
    color: String(c.color),
    photoPath: String(c.photo_path ?? ""),
    background: photoUrls.get(String(c.photo_path ?? "")) ?? "",
    rewardText: String(c.reward_text ?? ""),
    createdAt: String(c.created_at),
  }));
  const members: Member[] = rows(state.members).map((m) => ({
    cardId: String(m.card_id),
    userId: String(m.user_id),
    name: nameOf(m.user_id),
    role: m.role === "owner" ? "owner" : "member",
  }));
  const passes: PassRecord[] = rows(state.passes).map((p) => ({
    cardId: String(p.card_id),
    cardInstance: Number(p.instance),
    maxStamps: Number(p.max_stamps),
    user: nameOf(p.started_by),
    timestamp: String(p.started_at),
  }));
  const stamps: StampRecord[] = rows(state.stamps).map((s) => ({
    cardId: String(s.card_id),
    cardInstance: Number(s.instance),
    slotIndex: Number(s.slot),
    user: nameOf(s.stamped_by),
    timestamp: String(s.stamped_at),
    note: String(s.note ?? ""),
  }));
  const redemptions: RedemptionRecord[] = rows(state.redemptions).map((r) => ({
    cardId: String(r.card_id),
    cardInstance: Number(r.instance),
    user: nameOf(r.redeemed_by),
    timestamp: String(r.redeemed_at),
  }));
  const me = String(state.me ?? "");
  return {
    me,
    myName: nameOf(me),
    cards,
    members,
    passes,
    stamps,
    redemptions,
  };
}

/** Signs URLs for photos not seen before; known ones keep their URL. */
async function signPhotos(paths: string[]): Promise<void> {
  const fresh = [...new Set(paths)].filter((p) => p && !photoUrls.has(p));
  if (fresh.length === 0) {
    return;
  }
  const { data } = await db()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(fresh, PHOTO_URL_SECONDS);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      photoUrls.set(item.path, item.signedUrl);
    }
  }
}

/**
 * Calls `onChange` (debounced) whenever a row the user can see changes,
 * including their own writes. Returns a function that stops listening.
 */
export function watchChanges(onChange: () => void): () => void {
  let timer = 0;
  const channel = db()
    .channel("stamp-changes")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      clearTimeout(timer);
      timer = window.setTimeout(onChange, CHANGE_DEBOUNCE_MS);
    })
    .subscribe();
  return () => {
    clearTimeout(timer);
    void db().removeChannel(channel);
  };
}

// Writes ------------------------------------------------------------------

/** Turns `{ cardId: 1 }` into the database's `{ p_card_id: 1 }`. */
function toParams(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([name, value]) => [
      `p_${name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`,
      value,
    ]),
  );
}

/**
 * Runs database function `name`; wrap it in {@link enqueue} to keep order.
 *
 * Errors: throws with the database's message (for example a broken stack
 * rule) when the call is refused or fails.
 */
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db().rpc(name, toParams(args));
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}

/**
 * Uploads a photo (a data URL) for `cardId` and returns its storage path.
 *
 * Errors: throws when the upload is refused or fails.
 */
export async function uploadPhoto(
  cardId: string,
  dataUrl: string,
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${cardId}/${newUuid()}.${extension}`;
  const { error } = await db()
    .storage.from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type });
  if (error) {
    throw new Error(error.message);
  }
  // Show the photo we already have instead of downloading it again.
  photoUrls.set(path, dataUrl);
  return path;
}

/** Deletes a photo file; failures only leave an orphaned file behind. */
export async function removePhoto(path: string): Promise<void> {
  if (path) {
    await db().storage.from(PHOTO_BUCKET).remove([path]);
  }
}
