"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import ChainStatus from "@/components/ChainStatus";
import ChainGraph, { type GraphRow } from "@/components/ChainGraph";
import { SkeletonTable } from "@/components/Skeleton";
import { GENESIS_HASH } from "@/lib/types";

type DbAuditRow = {
  seq: number;
  action: string;
  ts: string;
  hash: string;
  prev_hash: string;
  detail: Record<string, unknown>;
};

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [rows, setRows] = useState<DbAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verify, setVerify] = useState<{ intact: boolean; brokenAt: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const client = getSupabase();
      const { data: session } = await client.auth.getSession();
      if (!session.session) {
        router.push("/login");
        return;
      }
      const { data, error } = await client
        .from("audit_logs")
        .select("seq, action, ts, hash, prev_hash, detail")
        .eq("case_id", id)
        .order("seq", { ascending: true });
      if (error) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [id, router]);

  // Server-side re-walk of the chain (node:crypto), independent of the rows
  // currently in the table state -- "Verify Chain" never trusts the view.
  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      const client = getSupabase();
      const session = await client.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("/api/verify-chain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ case_id: id }),
      });
      setVerify(await res.json());
      // Re-fetch rows so the table reflects any edits made since mount
      // (e.g. a tampered hash gets the red broken-row highlight).
      const { data } = await client
        .from("audit_logs")
        .select("seq, action, ts, hash, prev_hash, detail")
        .eq("case_id", id)
        .order("seq", { ascending: true });
      if (data) setRows(data);
    } finally {
      setVerifying(false);
    }
  }, [id]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <p className="text-sm text-muted">No audit rows visible for this case.</p>
        <button
          onClick={() => router.push(`/case/${id}`)}
          className="mt-4 rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
        >
          Back to case
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Audit Chain</h1>
          <p className="font-mono text-xs text-muted-faint">case {id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {verify && <ChainStatus intact={verify.intact} />}
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {verifying ? "Verifying…" : "Verify Chain"}
          </button>
          <button
            onClick={() => router.push(`/case/${id}`)}
            className="rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
          >
            ← Case
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : rows.length === 0 ? (
        <p className="rounded border border-dashed border-line p-8 text-center text-sm text-muted-faint">
          No audit entries recorded for this case yet. Run a script first.
        </p>
      ) : (        <ChainGraph
          rows={rows as GraphRow[]}
          brokenAt={verify && !verify.intact ? verify.brokenAt : null}
        />
      )}
    </main>
  );
}
