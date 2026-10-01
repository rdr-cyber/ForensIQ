"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Landing for users redirected away from /admin. Deliberately generic: it
 * does not reveal whether /admin exists for them — real enforcement is the
 * redirect + the 0006 RLS policies, not this page.
 */
export default function AdminDeniedPage() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-navy-900 p-8 text-center">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg border border-danger/40 bg-danger/10 text-danger">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="10" width="14" height="10" rx="1.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <h1 className="mt-4 text-base font-semibold text-slate-100">
          Access denied
        </h1>
        <p className="mt-2 text-sm text-muted">
          This area is restricted to administrators. The attempt is not
          penalized — you simply have no route here.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800"
          >
            Back to dashboard
          </button>
          <Link
            href="/"
            className="rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-slate-200"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
