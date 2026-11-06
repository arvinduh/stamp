/**
 * @fileoverview Tries to break the schema's access rules and stack rules.
 *
 * Runs the real migration in PGlite (Postgres in WebAssembly) on top of a
 * stub of Supabase's auth schema, then acts as different users: an owner, a
 * friend who joins through an invite, a stranger, and a signed-out visitor.
 * Run with `npm run test:db`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = new URL(".", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, here), "utf8");

const OWNER = "00000000-0000-4000-8000-000000000001";
const FRIEND = "00000000-0000-4000-8000-000000000002";
const STRANGER = "00000000-0000-4000-8000-000000000003";
const CARD = "10000000-0000-4000-8000-000000000001";

const db = new PGlite();
await db.exec(read("auth_stub.sql"));
await db.exec(read("../migrations/20261106000000_init.sql"));
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values
     ($1, 'owner@example.com', '{"full_name": "Olive Owner"}'),
     ($2, 'friend@example.com', '{"name": "Alex"}'),
     ($3, 'stranger@example.com', '{}')`,
  [OWNER, FRIEND, STRANGER],
);

/** Runs `sql` as `user` (signed in), or as a signed-out visitor for null. */
async function as<T = Record<string, unknown>>(
  user: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec(user ? "set role authenticated" : "set role anon");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user ?? "",
  ]);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

/** Asserts that `sql` as `user` fails with a message matching `pattern`. */
async function rejects(
  user: string | null,
  sql: string,
  params: unknown[],
  pattern: RegExp,
): Promise<void> {
  await assert.rejects(as(user, sql, params), pattern);
}

/** A row with a stamp count, keyed by its database column name. */
interface Counted {
  instance: number;
  // biome-ignore lint/style/useNamingConvention: database column name.
  max_stamps: number;
}

/** A profile row, keyed by its database column name. */
interface Named {
  // biome-ignore lint/style/useNamingConvention: database column name.
  display_name: string;
}

/** The part of `get_state()` these tests read. */
interface State {
  cards: Counted[];
  passes: Counted[];
  stamps: unknown[];
  profiles: Named[];
}

async function stateOf(user: string): Promise<State> {
  const [row] = await as<{ state: State }>(user, "select get_state() as state");
  return row.state;
}

async function stamp(user: string, instance: number, slot: number) {
  await as(user, "select stamp($1, $2, $3)", [CARD, instance, slot]);
}

describe("accounts", () => {
  it("names profiles from Google, falling back to the email", async () => {
    const rows = await db.query<Named>(
      "select display_name from public.profiles order by id",
    );
    assert.deepEqual(
      rows.rows.map((r) => r.display_name),
      ["Olive Owner", "Alex", "stranger"],
    );
  });
});

describe("a new card", () => {
  it("is created with its owner and first pass", async () => {
    await as(
      OWNER,
      "select create_card($1, 'Coffee', 3, 'coffee', '#8a6a4f', '')",
      [CARD],
    );
    const state = await stateOf(OWNER);
    assert.equal(state.cards.length, 1);
    assert.deepEqual(
      state.passes.map((p) => [p.instance, p.max_stamps]),
      [[0, 3]],
    );
  });

  it("is invisible to strangers", async () => {
    const state = await stateOf(STRANGER);
    assert.equal(state.cards.length, 0);
    assert.equal(state.passes.length, 0);
    assert.deepEqual(
      state.profiles.map((p) => p.display_name),
      ["stranger"],
    );
  });

  it("cannot be stamped or changed by strangers", async () => {
    await rejects(
      STRANGER,
      "select stamp($1, 0, 0)",
      [CARD],
      /no longer exists/,
    );
    await rejects(
      STRANGER,
      "select update_card($1, 'Mine', 3, 'coffee', '#000000', '', '')",
      [CARD],
      /no longer exists/,
    );
    await rejects(
      STRANGER,
      "select delete_card($1)",
      [CARD],
      /no longer exists/,
    );
    await rejects(
      STRANGER,
      "delete from cards where id = $1",
      [CARD],
      /permission denied/,
    );
  });

  it("refuses signed-out visitors entirely", async () => {
    await rejects(null, "select get_state()", [], /permission denied/);
    await rejects(null, "select * from cards", [], /permission denied/);
  });
});

describe("sharing", () => {
  let token = "";

  it("lets only the owner make invites, and nobody read them", async () => {
    const [invite] = await as<{ token: string }>(
      OWNER,
      "select create_invite($1) as token",
      [CARD],
    );
    token = invite.token;
    assert.match(token, /^[0-9a-f]{64}$/);
    await rejects(
      STRANGER,
      "select create_invite($1)",
      [CARD],
      /no longer exists/,
    );
    await rejects(OWNER, "select * from card_invites", [], /permission denied/);
  });

  it("lets anyone with the link join as a member", async () => {
    const [joined] = await as<{ card: string }>(
      FRIEND,
      "select accept_invite($1) as card",
      [token],
    );
    assert.equal(joined.card, CARD);
    const state = await stateOf(FRIEND);
    assert.equal(state.cards.length, 1);
    assert.deepEqual(state.profiles.map((p) => p.display_name).sort(), [
      "Alex",
      "Olive Owner",
    ]);
  });

  it("rejects expired, revoked, or made-up links", async () => {
    await db.query(
      "update card_invites set expires_at = now() - interval '1 second'",
    );
    await rejects(STRANGER, "select accept_invite($1)", [token], /expired/);
    await rejects(STRANGER, "select accept_invite('nope')", [], /expired/);
    const [fresh] = await as<{ token: string }>(
      OWNER,
      "select create_invite($1) as token",
      [CARD],
    );
    await as(OWNER, "select revoke_invites($1)", [CARD]);
    await rejects(
      STRANGER,
      "select accept_invite($1)",
      [fresh.token],
      /expired or was revoked/,
    );
    await rejects(
      FRIEND,
      "select revoke_invites($1)",
      [CARD],
      /owner can share/,
    );
  });

  it("keeps members from editing, deleting, or forging rows", async () => {
    await rejects(
      FRIEND,
      "select update_card($1, 'Mine', 3, 'coffee', '#000000', '', '')",
      [CARD],
      /owner/,
    );
    await rejects(FRIEND, "select delete_card($1)", [CARD], /owner/);
    await rejects(
      FRIEND,
      "insert into stamps (card_id, instance, slot) values ($1, 0, 0)",
      [CARD],
      /permission denied/,
    );
    await rejects(
      FRIEND,
      "update cards set title = 'Mine' where id = $1",
      [CARD],
      /permission denied/,
    );
    await rejects(
      FRIEND,
      "select remove_member($1, $2)",
      [CARD, OWNER],
      /owner can remove/,
    );
    await rejects(
      OWNER,
      "select remove_member($1, $2)",
      [CARD, OWNER],
      /can't leave/,
    );
  });

  it("lets people rename only themselves", async () => {
    await as(FRIEND, "select rename('  Alex K  ')");
    const names = (await stateOf(OWNER)).profiles.map((p) => p.display_name);
    assert.ok(names.includes("Alex K"));
    await rejects(FRIEND, "select rename('')", [], /check constraint/);
    await rejects(
      FRIEND,
      "update profiles set display_name = 'x'",
      [],
      /permission denied/,
    );
  });
});

describe("stack rules", () => {
  it("only takes stamps in existing slots", async () => {
    await stamp(FRIEND, 0, 0);
    await stamp(FRIEND, 0, 0); // A double tap is harmless.
    await rejects(FRIEND, "select stamp($1, 0, 3)", [CARD], /does not exist/);
    assert.equal((await stateOf(OWNER)).stamps.length, 1);
  });

  it("saves notes on stamps that exist", async () => {
    await as(FRIEND, "select save_note($1, 0, 0, 'oat milk')", [CARD]);
    await rejects(FRIEND, "select save_note($1, 0, 2, 'x')", [CARD], /removed/);
  });

  it("starts a new pass only after the newest is full", async () => {
    await rejects(
      OWNER,
      "select start_next_pass($1, 1)",
      [CARD],
      /Finish the current card/,
    );
    await rejects(OWNER, "select redeem($1, 0)", [CARD], /not full/);
    await stamp(OWNER, 0, 1);
    await stamp(OWNER, 0, 2);
    await rejects(OWNER, "select start_next_pass($1, 2)", [CARD], /in order/);
  });

  it("redeems a full pass once, then freezes it", async () => {
    await as(FRIEND, "select redeem($1, 0)", [CARD]);
    await as(OWNER, "select redeem($1, 0)", [CARD]); // Idempotent.
    await rejects(
      OWNER,
      "select unstamp($1, 0, 1)",
      [CARD],
      /already redeemed/,
    );
    await as(FRIEND, "select start_next_pass($1, 1)", [CARD]);
    await as(OWNER, "select start_next_pass($1, 1)", [CARD]); // Already there.
    await rejects(OWNER, "select stamp($1, 0, 1)", [CARD], /newest card/);
  });
});

describe("changing the stamp count", () => {
  it("reshapes only the pass in progress", async () => {
    await stamp(OWNER, 1, 0);
    await stamp(OWNER, 1, 1);
    await as(
      OWNER,
      "select update_card($1, 'Coffee', 5, 'coffee', '#8a6a4f', '', '')",
      [CARD],
    );
    const state = await stateOf(FRIEND);
    assert.deepEqual(
      state.passes
        .map((p) => [p.instance, p.max_stamps])
        .sort((a, b) => a[0] - b[0]),
      [
        [0, 3],
        [1, 5],
      ],
    );
    assert.equal(state.cards[0].max_stamps, 5);
  });

  it("never drops a used stamp", async () => {
    await stamp(OWNER, 1, 4);
    await rejects(
      OWNER,
      "select update_card($1, 'Coffee', 4, 'coffee', '#8a6a4f', '', '')",
      [CARD],
      /Stamp 5 is already used/,
    );
  });

  it("leaves a full pass alone and applies to the next one", async () => {
    await stamp(OWNER, 1, 2);
    await stamp(OWNER, 1, 3);
    await as(
      OWNER,
      "select update_card($1, 'Coffee', 2, 'coffee', '#8a6a4f', '', '')",
      [CARD],
    );
    await as(OWNER, "select start_next_pass($1, 2)", [CARD]);
    const passes = (await stateOf(OWNER)).passes
      .map((p) => [p.instance, p.max_stamps])
      .sort((a, b) => a[0] - b[0]);
    assert.deepEqual(passes, [
      [0, 3],
      [1, 5],
      [2, 2],
    ]);
  });
});

describe("leaving and deleting", () => {
  it("lets a member leave and lose access", async () => {
    await as(FRIEND, "select remove_member($1, $2)", [CARD, FRIEND]);
    assert.equal((await stateOf(FRIEND)).cards.length, 0);
    await rejects(FRIEND, "select stamp($1, 2, 0)", [CARD], /no longer exists/);
  });

  it("lets the owner delete the card with all its history", async () => {
    const [res] = await as<{ photo: string }>(
      OWNER,
      "select delete_card($1) as photo",
      [CARD],
    );
    assert.equal(res.photo, "");
    for (const table of [
      "passes",
      "stamps",
      "redemptions",
      "card_members",
      "card_invites",
    ]) {
      const { rows } = await db.query(`select 1 from public.${table}`);
      assert.equal(rows.length, 0, table);
    }
  });
});
