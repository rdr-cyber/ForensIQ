"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getSessionReady } from "@/components/auth/authErrors";
import ChainStatus from "@/components/ChainStatus";
import StatusBadge from "@/components/StatusBadge";
import { SkeletonBlock } from "@/components/Skeleton";
import type {
  CaseRow,
  EvidenceBundleRow,
  GenerateReportResult,
  RunScriptResult,
} from "@/lib/types";

// The interpreter service runs each script in a sandbox containing the
// script itself (script.fzq) plus any files sent alongside it, so hashing
// "script.fzq" always works out of the box.
const DEFAULT_SCRIPT = `# Jocky demo: hash the script itself inside the sandbox
acquire file "script.fzq"
hash sha256
log "hash computed"
report "bundle.json"
`;

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [runBusy, setRunBusy] = useState(false);
  const [runResult, setRunResult] = useState<RunScriptResult | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportResult, setReportResult] = useState<GenerateReportResult | null>(null);
  const [bundleUrl, setBundleUrl] = useState<string | null>(null);
  const [bundles, setBundles] = useState<EvidenceBundleRow[]>([]);

  const scriptName = useMemo(
    () => script.trim().split("\n")[0]?.replace(/^#\s*/, "") || "untitled script",
    [script],
  );

  // Auth guard + case load + latest saved script.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = getSupabase();
      // OAuth returns can resolve the session a beat late; retry first.
      const session = await getSessionReady(client);
      if (!session) {
        router.push("/login");
        return;
      }
      const { data, error } = await client
        .from("cases")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCaseRow(data);
      setLoading(false);
      // Persistent evidence bundle index for this case.
      const { data: bundleRows } = await client
        .from("evidence_bundles")
        .select("id, storage_path, sha256, created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: false });
      if (!cancelled && bundleRows) setBundles(bundleRows);
      const { data: rows } = await client
        .from("scripts")
        .select("source_code")
        .eq("case_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cancelled && rows && rows.length > 0) setScript(rows[0].source_code);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  // Persist to `scripts`, then run via /api/run-script (FastAPI service).
  const runScript = useCallback(async () => {
    setRunBusy(true);
    setRunResult(null);
    setReportResult(null);
    setBundleUrl(null);
    try {
      const session = await getSupabase().auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("/api/run-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          case_id: id,
          name: scriptName,
          content: script,
        }),
      });
      setRunResult(await res.json());
    } finally {
      setRunBusy(false);
    }
  }, [id, script, scriptName]);

  // Fetch a short-lived signed URL from Storage (RLS decides) and download.
  const downloadBundle = useCallback(async (path: string) => {
    const session = await getSupabase().auth.getSession();
    const token = session.data.session?.access_token;
    const res = await fetch("/api/bundle-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank", "noopener");
  }, []);

  // Generate the signed evidence bundle via /api/generate-report.
  const generateReport = useCallback(async () => {
    setReportBusy(true);
    setReportResult(null);
    try {
      const session = await getSupabase().auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          case_id: id,
          name: scriptName,
          content: script,
        }),
      });
      const data: GenerateReportResult = await res.json();
      setReportResult(data);
      if (data.ok) {
        const blob = new Blob([JSON.stringify(data.signed_bundle, null, 2)], {
          type: "application/json",
        });
        setBundleUrl(URL.createObjectURL(blob));
        // Refresh the persistent bundle list (new Storage-backed row).
        const client = getSupabase();
        const { data: bundleRows } = await client
          .from("evidence_bundles")
          .select("id, storage_path, sha256, created_at")
          .eq("case_id", id)
          .order("created_at", { ascending: false });
        if (bundleRows) setBundles(bundleRows);
      }
    } finally {
      setReportBusy(false);
    }
  }, [id, script, scriptName]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <p className="text-sm text-muted">
          Case not found or not assigned to you.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-4 rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
        >
          Back to dashboard
        </button>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-6" role="status" aria-label="Loading case">
        <div className="mb-5 flex items-center gap-3">
          <SkeletonBlock className="h-6 w-52" />
          <SkeletonBlock className="h-5 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonBlock className="h-[420px] w-full rounded" />
          <SkeletonBlock className="h-[420px] w-full rounded" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-100">
              {caseRow?.title ?? "…"}
            </h1>
            {caseRow && <StatusBadge status={caseRow.status} />}
          </div>
          <p className="font-mono text-xs text-muted-faint">case {id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push(`/case/${id}/audit`)}
            data-tour="case-audit-link"
            className="rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
          >
            Audit log →
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
          >
            Dashboard
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: script editor */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Script (.fzq)</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setScript(DEFAULT_SCRIPT)}
                className="rounded border border-line px-2.5 py-1 font-mono text-xs text-muted hover:text-slate-200"
              >
                reset
              </button>
              <button
                onClick={runScript}
                disabled={runBusy}
                data-tour="case-run"
                className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-navy-950 hover:brightness-110 disabled:opacity-50"
              >
                {runBusy ? "Running…" : "Run Script"}
              </button>
            </div>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            spellCheck={false}
            data-tour="case-editor"
            className="log-scroll h-[420px] w-full resize-none rounded border border-line bg-navy-800 p-3 font-mono text-[13px] leading-relaxed text-slate-200 outline-none focus:border-accent"
          />
          <p className="mt-1 font-mono text-[11px] text-muted-faint">
            every run persists to the scripts table (RLS-protected)
          </p>
        </section>

        {/* Right: output + report */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Output</h2>
            {runResult && (
              <ChainStatus intact={runResult.chain_status === "INTACT"} />
            )}
          </div>
          <div
            data-tour="case-output"
            className="log-scroll h-[420px] overflow-auto rounded border border-line bg-navy-800 p-3 font-mono text-[13px] leading-relaxed"
          >
            {!runResult && (
              <p className="text-muted-faint">
                Run a script to see interpreter output and the audit chain here.
              </p>
            )}
            {runResult && !runResult.ok && (
              <p className="text-danger">{runResult.error ?? "run failed"}</p>
            )}
            {runResult?.ok && (
              <>
                <pre className="whitespace-pre-wrap text-slate-300">
                  {runResult.stdout}
                </pre>
                <div className="mt-3 border-t border-line pt-2 text-[11px] text-muted-faint">
                  <p>audit entries captured: {runResult.audit_entries.length}</p>
                  <p className="mt-0.5">
                    head hash:{" "}
                    <span className="text-muted">
                      {runResult.audit_entries.at(-1)?.hash.slice(0, 16) ?? "—"}
                    </span>
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between" data-tour="case-report">
            <button
              onClick={generateReport}
              disabled={reportBusy}
              className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {reportBusy ? "Signing…" : "Generate Report"}
            </button>
            {bundleUrl && (
              <a
                href={bundleUrl}
                download="jocky_bundle.json"
                className="rounded border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20"
              >
                Download signed bundle ↓
              </a>
            )}
          </div>
          {reportResult?.ok && (
            <p className="mt-2 font-mono text-xs text-signal">
              Evidence bundle signed ✓ (chain {reportResult.chain_status},{" "}
              {reportResult.audit_entries.length} entries)
            </p>
          )}
          {reportResult && !reportResult.ok && (
            <p className="mt-2 font-mono text-xs text-danger">
              {reportResult.error ?? "report failed"}
            </p>
          )}

          {/* Persistent evidence bundles (Storage-backed) */}
          {bundles.length > 0 && (
            <div data-tour="case-bundles" className="mt-4 rounded-lg border border-line bg-navy-900">
              <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-faint">
                Evidence bundles · signed &amp; stored
              </p>
              <ul className="divide-y divide-line">
                {bundles.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-slate-300">
                        {b.storage_path.split("/")[1]}
                      </p>
                      <p className="font-mono text-[10px] text-muted-faint">
                        sha256 {b.sha256.slice(0, 12)}… ·{" "}
                        {new Date(b.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadBundle(b.storage_path)}
                      className="flex-none rounded border border-signal/40 bg-signal/10 px-2.5 py-1 text-xs font-medium text-signal hover:bg-signal/20"
                    >
                      ↓ signed URL
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
