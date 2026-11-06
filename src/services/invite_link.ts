/**
 * @fileoverview Invite links: `<app url>?join=<token>`.
 *
 * Opening a link may first send the visitor through Google sign-in, which
 * returns to the bare app URL, so the token is parked in sessionStorage
 * until the store can accept it.
 */

const PARAM = "join";
const STORAGE_KEY = "stamp_pending_invite";

// Also kept in memory, for when storage is blocked and no redirect happens.
let parked = "";

/** The shareable link for an invite token. */
export function inviteUrl(token: string): string {
  const link = new URL(location.pathname, location.origin);
  link.searchParams.set(PARAM, token);
  return link.toString();
}

/**
 * Moves a token from the address bar into storage, so a reload or the sign-in
 * round trip cannot lose or reuse the visible link.
 *
 * Side effects: rewrites the address bar without the `join` parameter.
 */
export function parkInviteFromUrl(): void {
  const here = new URL(location.href);
  const token = here.searchParams.get(PARAM);
  if (!token) {
    return;
  }
  parked = token;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage blocked (private mode): only the in-memory copy remains.
  }
  here.searchParams.delete(PARAM);
  history.replaceState(history.state, "", here);
}

/** Returns and forgets the parked token, or "" when there is none. */
export function takeParkedInvite(): string {
  let token = parked;
  parked = "";
  try {
    token ||= sessionStorage.getItem(STORAGE_KEY) ?? "";
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the in-memory copy is all there is.
  }
  return token;
}

/** Whether a token is waiting for sign-in, without consuming it. */
export function hasParkedInvite(): boolean {
  if (parked) {
    return true;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
