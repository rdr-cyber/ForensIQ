"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getSessionReady } from "@/components/auth/authErrors";
import StatusBadge from "@/components/StatusBadge";
import { SkeletonList } from "@/components/Skeleton";
import type { CaseStatus } from "@/lib/types";

// Exactly the columns the list query selects.
type CaseListItem = {
  id: string;
  title: string;
  status: CaseStatus;
  created_at: string;
  created_by: string | null;
};

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [memberCaseIds, setMemberCaseIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState<CaseStatus>("open");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getSupabase()
      .from("cases")
      .select("id, title, status, created_at, created_by")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error(error.message);
      return;
    }
    setCases(data ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const client = getSupabase();
      // OAuth returns can resolve the session a beat late; retry first.
      const session = await getSessionReady(client);
      if (!session) {
        router.push("/login");
        return;
      }
      const userId = session.user.id;
      setUid(userId);
      // Own profile row decides whether to RENDER the admin tab at all.
      // This is UX only — RLS (0006) still enforces every read server-side,
      // so a tampered client that forces the tab on sees nothing extra.
      const { data: me } = await client
        .from("analysts")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();
      const admin = me?.role === "admin";
      setIsAdmin(admin);
      if (admin) {
        // Cases this admin owns or belongs to, used to scope the "Your cases"
        // tab. "All cases" ignores this and relies on cases_select_admin.
        const { data: memberships } = await client
          .from("case_members")
          .select("case_id")
          .eq("analyst_id", userId);
        setMemberCaseIds(
          new Set((memberships ?? []).map((m) => m.case_id as string)),
        );
      }
      loadCases();
    })();
  }, [router, loadCases]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const client = getSupabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    const { error } = await client.from("cases").insert({
      title: newTitle.trim(),
      status: newStatus,
      created_by: user?.id ?? null,
    });
    setCreating(false);
    if (error) {
      setCreateError(error.message);
      return;
    }
    setModalOpen(false);
    setNewTitle("");
    setNewStatus("open");
    loadCases();
  }

  // Non-admins: RLS already scopes the list. Admins: "All cases" is what RLS
  // read-all returns; "Your cases" narrows to owned-or-member cases locally.
  const visibleCases = useMemo(() => {
    if (!isAdmin || tab === "all") return cases;
    return cases.filter(
      (c) => c.created_by === uid || memberCaseIds.has(c.id),
    );
  }, [cases, isAdmin, tab, uid, memberCaseIds]);

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Cases</h1>
          <p className="font-mono text-xs text-muted-faint">
            {!isAdmin
              ? "rows filtered by RLS to your assigned cases"
              : tab === "all"
              ? "admin · read-all via RLS (0006) — every case"
              : "admin · cases you own or belong to"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setModalOpen(true)}
            data-tour="dashboard-new-case"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-navy-950 hover:brightness-110"
          >
            New Case
          </button>
          {isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              className="rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
            >
              Admin console
            </button>
          )}
          <button
            onClick={() =>
              getSupabase().auth.signOut().then(() => router.push("/login"))
            }
            data-tour="dashboard-signout"
            className="rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-slate-200"
          >
            Sign out
          </button>
        </div>
      </div>

      {isAdmin && (
        <div
          role="tablist"
          aria-label="Case scope"
          className="mb-5 inline-flex rounded-lg border border-line bg-navy-900 p-1"
        >
          <button
            role="tab"
            aria-selected={tab === "mine"}
            onClick={() => setTab("mine")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "mine"
                ? "bg-accent text-navy-950"
                : "text-muted hover:text-slate-200"
            }`}
          >
            Your cases
          </button>
          <button
            role="tab"
            aria-selected={tab === "all"}
            onClick={() => setTab("all")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "all"
                ? "bg-accent text-navy-950"
                : "text-muted hover:text-slate-200"
            }`}
          >
            All cases
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : visibleCases.length === 0 ? (
        <div className="rounded border border-dashed border-line p-8 text-center">
          <p className="mb-4 text-sm text-muted-faint">
            {isAdmin && tab === "mine"
              ? "You don't own or belong to any cases yet. Switch to All cases."
              : "No cases visible to you yet."}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-navy-950 hover:brightness-110"
          >
            Create your first case
          </button>
        </div>
      ) : (
        <ul
          data-tour="dashboard-case-list"
          className="divide-y divide-line rounded-lg border border-line bg-navy-900"
        >
          {visibleCases.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => router.push(`/case/${c.id}`)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-navy-800"
              >
                <div>
                  <p className="text-sm font-medium text-slate-200">{c.title}</p>
                  <p className="font-mono text-xs text-muted-faint">
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line bg-navy-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-base font-semibold text-slate-100">
              New Case
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Title
                </label>
                <input
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded border border-line bg-navy-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                  placeholder="Disk image analysis — workstation 12"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as CaseStatus)}
                  className="w-full rounded border border-line bg-navy-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                >
                  <option value="open">open</option>
                  <option value="under_review">under_review</option>
                  <option value="closed">closed</option>
                </select>
              </div>
              {createError && (
                <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {createError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-navy-950 hover:brightness-110 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
