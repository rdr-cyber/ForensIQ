"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getSessionReady } from "@/components/auth/authErrors";
import ChainGraph, { type GraphRow } from "@/components/ChainGraph";
import ChainStatus from "@/components/ChainStatus";
import StatusBadge from "@/components/StatusBadge";
import { SkeletonList, SkeletonTable } from "@/components/Skeleton";
import type { AuditLogRow, CaseStatus } from "@/lib/types";

type AdminCase = {
  id: string;
  title: string;
  status: CaseStatus;
  created_at: string;
  created_by: string | null;
};

type AnalystLite = { id: string; name: string };

type VerifyResult = { intact: boolean; brokenAt: string | null };

/**
 * Admin console — read-only oversight across every case.
 *
 * Authorization is NOT decided here: this page only reads the caller's own
 * analysts.role to decide whether to render it; every query it makes (all
 * cases, all analysts, any case's audit trail) is separately enforced by the
 * 0006 admin RLS policies, so a tampered client gains nothing.
 *
 * The audit trail is rendered with the SAME ChainGraph + ChainStatus used on
 * the analyst-facing audit page, and chain verification is delegated to the
 * server route /api/verify-chain (node:crypto) — the browser never trusts the
 * rows it is displaying to recompute integrity. Trails are read-only by
 * design: no admin write path into audit_logs exists (RLS 0006).
 */
export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<AdminCase[]>([]);
  const [analysts, setAnalysts] = useState<AnalystLite[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>("");

  const [trail, setTrail] = useState<AuditLogRow[]>([]);
  const [trailLoading, setTrailLoading] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);

  useEffect(() => {
    (async () => {
      const client = getSupabase();
      // OAuth returns can resolve the session a beat late; retry first.
      const session = await getSessionReady(client);
      if (!session) {
        router.push("/login");
        return;
      }
      // Own profile row: readable by everyone; the role column decides routing.
      const uid = session.user.id;
      const { data: me } = await client
        .from("analysts")
        .select("id, name, role")
        .eq("id", uid)
        .maybeSingle();
      if (!me || me.role !== "admin") {
        router.replace("/admin/denied");
        return;
      }
      // Admin-only reads (RLS 0006: cases_select_admin, analysts_select_admin).
      const [{ data: caseRows }, { data: analystRows }] = await Promise.all([
        client
          .from("cases")
          .select("id, title, status, created_at, created_by")
          .order("created_at", { ascending: false }),
        client.from("analysts").select("id, name"),
      ]);
      setCases(caseRows ?? []);
      setAnalysts(analystRows ?? []);
      setLoading(false);
    })();
  }, [router]);

  // View-only audit trail for one case: fetch rows (RLS audit_logs_select_admin)
  // then verify server-side. Never trust the displayed rows for integrity.
  const openTrail = useCallback(async (caseId: string, title: string) => {
    setSelectedCaseId(caseId);
    setSelectedTitle(title);
    setTrailLoading(true);
    setTrail([]);
    setVerify(null);

    const client = getSupabase();
    const { data } = await client
      .from("audit_logs")
      .select("*")
      .eq("case_id", caseId)
      .order("seq", { ascending: true });
    setTrail((data as AuditLogRow[]) ?? []);

    // Chain verification via the server route (node:crypto).
    const session = await client.auth.getSession();
    const token = session.data.session?.access_token;
    try {
      const res = await fetch("/api/verify-chain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ case_id: caseId }),
      });
      const json = (await res.json()) as Partial<VerifyResult> & {
        error?: string;
      };
      if (typeof json.intact === "boolean") {
        setVerify({ intact: json.intact, brokenAt: json.brokenAt ?? null });
      }
    } catch {
      /* verification unavailable; graph still flags broken links locally */
    } finally {
      setTrailLoading(false);
    }
  }, []);

  const nameOf = (id: string | null) =>
    analysts.find((a) => a.id === id)?.name ?? (id ? id.slice(0, 8) + "…" : "—");

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="mb-6 text-lg font-semibold text-slate-100">Admin</h1>
        <SkeletonList rows={4} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Admin · all cases
          </h1>
          <p className="font-mono text-xs text-muted-faint">
            read-all granted by RLS (0006) · audit trails are view-only — no
            admin write path exists
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
          >
            Dashboard
          </button>
          <button
            onClick={() =>
              getSupabase().auth.signOut().then(() => router.push("/login"))
            }
            className="rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-slate-200"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: every case (cases_select_admin). Click to inspect its chain. */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-300">
            All cases · {cases.length}
          </h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-navy-900">
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => openTrail(c.id, c.title)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-navy-800 ${
                    selectedCaseId === c.id ? "bg-navy-800" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {c.title}
                    </p>
                    <p className="font-mono text-xs text-muted-faint">
                      {nameOf(c.created_by)} ·{" "}
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    <StatusBadge status={c.status} />
                    {selectedCaseId === c.id && (
                      <span className="font-mono text-[11px] text-accent">
                        trail ▾
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
            {cases.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-faint">
                No cases exist yet.
              </li>
            )}
          </ul>
        </section>

        {/* Right: read-only audit chain for the selected case. */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-slate-300">
              {selectedCaseId ? selectedTitle : "Audit chain"}
            </h2>
            {verify && <ChainStatus intact={verify.intact} />}
          </div>

          {!selectedCaseId ? (
            <p className="rounded border border-dashed border-line p-8 text-center text-sm text-muted-faint">
              Select a case to inspect its (read-only) audit chain.
            </p>
          ) : trailLoading ? (
            <SkeletonTable rows={6} />
          ) : trail.length === 0 ? (
            <p className="rounded border border-dashed border-line p-8 text-center text-sm text-muted-faint">
              No audit entries for this case yet.
            </p>
          ) : (
            <div className="log-scroll max-h-[540px] overflow-auto rounded-lg border border-line bg-navy-950/40 p-3">
              <ChainGraph
                rows={trail as unknown as GraphRow[]}
                brokenAt={verify && !verify.intact ? verify.brokenAt : null}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
