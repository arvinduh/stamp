/**
 * @fileoverview Derives card stacks and passes from the flat records.
 *
 * A stack is every pass ever issued for one card type; the newest pass sits
 * on top and is the only one that takes stamps. These rules mirror the
 * database functions in `supabase/migrations`, which stay the source of
 * truth.
 */

import type { Card, PassRecord, RedemptionRecord, StampRecord } from "../types";

/** One physical card in a stack. */
export interface Pass {
  instance: number;
  /** Stamps this pass needs; set when it started, so it can differ by pass. */
  maxStamps: number;
  startedAt: string;
  startedBy: string;
  /** Filled slots keyed by slot index. */
  stamps: Map<number, StampRecord>;
  isComplete: boolean;
  /** Timestamp of the latest stamp once complete; empty otherwise. */
  completedAt: string;
  redemption?: RedemptionRecord;
}

/** All passes for one card type. */
export interface Stack {
  card: Card;
  /** The newest pass. */
  current: Pass;
  /** Older passes, newest first. */
  history: Pass[];
}

interface Bucket {
  stamps: Map<number, StampRecord>;
  redemption?: RedemptionRecord;
  started?: PassRecord;
}

/** Builds one stack per card in a single pass over the records. */
export function buildStacks(
  cards: readonly Card[],
  stamps: readonly StampRecord[],
  redemptions: readonly RedemptionRecord[],
  passes: readonly PassRecord[],
): Stack[] {
  const buckets = new Map<string, Map<number, Bucket>>();
  function bucket(cardId: string, instance: number): Bucket {
    let byInstance = buckets.get(cardId);
    if (!byInstance) {
      byInstance = new Map<number, Bucket>();
      buckets.set(cardId, byInstance);
    }
    let b = byInstance.get(instance);
    if (!b) {
      b = { stamps: new Map<number, StampRecord>() };
      byInstance.set(instance, b);
    }
    return b;
  }

  for (const s of stamps) {
    bucket(s.cardId, s.cardInstance).stamps.set(s.slotIndex, s);
  }
  for (const r of redemptions) {
    bucket(r.cardId, r.cardInstance).redemption = r;
  }
  for (const p of passes) {
    bucket(p.cardId, p.cardInstance).started = p;
  }

  return cards.map((card) => {
    const byInstance = buckets.get(card.id) ?? new Map<number, Bucket>();
    const latest = Math.max(0, ...byInstance.keys());
    const list: Pass[] = [];
    for (let n = latest; n >= 0; n--) {
      list.push(toPass(card, n, byInstance.get(n)));
    }
    return { card, current: list[0], history: list.slice(1) };
  });
}

function toPass(card: Card, instance: number, b: Bucket | undefined): Pass {
  const stamps = b?.stamps ?? new Map<number, StampRecord>();
  const maxStamps = b?.started?.maxStamps ?? card.maxStamps;
  const isComplete = stamps.size >= maxStamps;
  let completedAt = "";
  if (isComplete) {
    for (const s of stamps.values()) {
      if (s.timestamp > completedAt) {
        completedAt = s.timestamp;
      }
    }
  }
  return {
    instance,
    maxStamps,
    startedAt: b?.started?.timestamp ?? "",
    startedBy: b?.started?.user ?? "",
    stamps,
    isComplete,
    completedAt,
    redemption: b?.redemption,
  };
}
