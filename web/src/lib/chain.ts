import { createHash } from "node:crypto";
import type { AuditEntry } from "./types";

/**
 * TypeScript port of forensiq.audit.verify(): re-walks the hash chain.
 *
 *   hash = SHA-256( seq || ts || action || canonical_json(detail) || prev_hash )
 *
 * canonical_json: sorted keys, no whitespace, non-ASCII escaped exactly like
 * Python's json.dumps(..., ensure_ascii=True). The genesis prev_hash is the
 * SHA-256 of the literal string "GENESIS".
 *
 * Runs under Node (route handler /api/verify-chain) -- node:crypto only.
 * The "Verify Chain" button posts the entries to that route.
 */
export const GENESIS_HASH = createHash("sha256").update("GENESIS").digest("hex");

function canonicalJson(value: unknown): string {
  // Python: json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.keys(val as Record<string, unknown>)
          .sort()
          .map((k) => [k, (val as Record<string, unknown>)[k]]),
      );
    }
    return val;
  });
}

export function verifyChain(entries: AuditEntry[]): {
  intact: boolean;
  brokenAt: string | null;
} {
  let prev = GENESIS_HASH;
  for (const entry of entries) {
    const payload =
      String(entry.seq) +
      entry.ts +
      entry.action +
      canonicalJson(entry.detail) +
      prev;
    const expected = createHash("sha256").update(payload, "utf8").digest("hex");
    if (expected !== entry.hash || entry.prev_hash !== prev) {
      return { intact: false, brokenAt: entry.hash };
    }
    prev = entry.hash;
  }
  return { intact: true, brokenAt: null };
}
