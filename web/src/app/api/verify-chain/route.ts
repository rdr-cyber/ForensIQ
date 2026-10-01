import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase-route";
import { verifyChain } from "@/lib/chain";
import { GENESIS_HASH } from "@/lib/types";

/**
 * A "run" = one chain starting at a row whose prev_hash is SHA-256("GENESIS").
 * A case stores one chain per script execution, and rows ordered by seq alone
 * come back INTERLEAVED (run1:1, run2:1, run1:2, ...). So runs are rebuilt by
 * following prev_hash -> hash links from each genesis-rooted row -- never by
 * row order.
 */
type Row = {
  seq: number;
  action: string;
  ts: string;
  hash: string;
  prev_hash: string;
  detail: Record<string, unknown>;
};

function rebuildRuns(rows: Row[]): { runs: Row[][]; orphans: Row[] } {
  const byPrev = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byPrev.get(row.prev_hash) ?? [];
    list.push(row);
    byPrev.set(row.prev_hash, list);
  }

  const starts = rows.filter((r) => r.prev_hash === GENESIS_HASH);
  const runs: Row[][] = [];
  const visited = new Set<string>();

  for (const start of starts) {
    const chain: Row[] = [start];
    visited.add(start.hash);
    let cursor = start;
    // Follow the link: next row is the one whose prev_hash equals this row's hash.
    let next = (byPrev.get(cursor.hash) ?? [])[0];
    while (next && !visited.has(next.hash)) {
      chain.push(next);
      visited.add(next.hash);
      cursor = next;
      next = (byPrev.get(cursor.hash) ?? [])[0];
    }
    runs.push(chain);
  }

  const orphans = rows.filter((r) => !visited.has(r.hash));
  return { runs, orphans };
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const supabase = createRouteClient(auth);
  if (!supabase) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let caseId: string;
  try {
    const body = await req.json();
    caseId = body.case_id;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!caseId) {
    return NextResponse.json({ error: "case_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("audit_logs")
    .select("seq, action, ts, hash, prev_hash, detail")
    .eq("case_id", caseId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ intact: true, brokenAt: null, runs: 0 });
  }

  const { runs, orphans } = rebuildRuns(rows);

  // Any row not reachable from a genesis root means a broken/inserted link.
  if (orphans.length > 0) {
    return NextResponse.json({
      intact: false,
      brokenAt: orphans[0].hash,
      runs: runs.length,
    });
  }

  const results = runs.map((run) => verifyChain(run));
  const broken = results.find((r) => !r.intact);
  return broken
    ? NextResponse.json({
        intact: false,
        brokenAt: broken.brokenAt,
        runs: runs.length,
      })
    : NextResponse.json({ intact: true, brokenAt: null, runs: runs.length });
}
