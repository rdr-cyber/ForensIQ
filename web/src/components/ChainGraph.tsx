"use client";

import { GENESIS_HASH } from "@/lib/types";

export type GraphRow = {
  seq: number;
  action: string;
  ts: string;
  hash: string;
  prev_hash: string;
  detail?: Record<string, unknown>;
};

const ACTION_COLORS: Record<string, string> = {
  acquire: "border-accent/40 bg-accent/10 text-accent",
  hash: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  log: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  report: "border-signal/40 bg-signal/10 text-signal",
  error: "border-danger/40 bg-danger/10 text-danger",
};

/**
 * Vertical chain graph: each audit entry is a node card on a connected rail.
 * A node whose prev_hash is the genesis constant starts a new run (fresh
 * chain); a node whose prev_hash matches NO fetched row's hash is a broken
 * link -> red rail segment + flash, never color-only (icon + text included).
 */
export default function ChainGraph({
  rows,
  brokenAt,
}: {
  rows: GraphRow[];
  brokenAt?: string | null;
}) {
  const linkedHashes = new Set(rows.map((r) => r.hash));

  return (
    <ol className="relative space-y-0" aria-label="Audit chain">
      {rows.map((row, i) => {
        const startsRun = row.prev_hash === GENESIS_HASH;
        const linked = startsRun || linkedHashes.has(row.prev_hash);
        const isBrokenAt = brokenAt != null && row.hash === brokenAt;
        const brokenLink = !linked || isBrokenAt;

        return (
          <li
            key={row.hash + i}
            className="relative flex gap-4 pb-1 animate-node-in"
          >
            {/* rail + connector */}
            <div className="relative flex w-6 flex-none flex-col items-center">
              <span
                className={`z-10 mt-4 grid h-3.5 w-3.5 place-items-center rounded-full border-2 transition-colors duration-500 ${
                  brokenLink
                    ? "border-danger bg-danger/25 shadow-glow-danger"
                    : "border-signal/70 bg-signal/15"
                }`}
                aria-hidden="true"
              />
              {i < rows.length - 1 && (
                <span
                  className={`w-0.5 flex-1 origin-top animate-link-draw rounded-full ${
                    brokenLink ? "bg-danger/70" : "bg-signal/30"
                  }`}
                  style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
                  aria-hidden="true"
                />
              )}
            </div>

            {/* node card */}
            <div
              className={`mb-3 flex-1 rounded-lg border bg-navy-900 p-3 transition-colors duration-500 ${
                brokenLink
                  ? "border-danger/50 shadow-glow-danger animate-break-flash"
                  : "border-line hover:border-line-strong hover:bg-navy-800"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-faint">
                  seq {row.seq}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                    ACTION_COLORS[row.action] ?? "border-line-strong bg-navy-800 text-muted"
                  }`}
                >
                  {row.action}
                </span>
                <span className="font-mono text-[11px] text-muted-faint">
                  {row.ts}
                </span>
                <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px]">
                  {brokenLink ? (
                    <>
                      <svg
                        viewBox="0 0 12 12"
                        className="h-3 w-3 text-danger"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
                      </svg>
                      <span className="text-danger">
                        {startsRun ? "genesis → new run" : "link broken"}
                      </span>
                    </>
                  ) : (
                    <span
                      className="text-muted-faint"
                      title={`prev_hash ${row.prev_hash}`}
                    >
                      ← {row.prev_hash.slice(0, 10)}…
                    </span>
                  )}
                </span>
              </div>
              <p
                className={`mt-1.5 font-mono text-xs ${
                  brokenLink ? "text-danger" : "text-muted"
                }`}
              >
                hash {brokenLink ? row.hash.slice(0, 18) + "…" : row.hash.slice(0, 16) + "…"}
              </p>
              {brokenLink && !startsRun && (
                <p className="mt-1 text-xs text-danger/90">
                  prev_hash does not match any recorded entry — this run&apos;s
                  chain was modified after the fact.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
