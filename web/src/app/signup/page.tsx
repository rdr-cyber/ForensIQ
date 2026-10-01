"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthField, Spinner } from "@/components/auth/AuthField";
import { GoogleButton } from "@/components/auth/GoogleButton";
import {
  friendlyAuthError,
  describeOAuthReturnError,
} from "@/components/auth/authErrors";

/**
 * Self-service signup. The 0003 DB trigger auto-provisions the analysts
 * profile row with role='analyst' — nothing extra to insert here. If the
 * project requires email confirmation, we show the "check your inbox"
 * state instead of navigating onward.
 */
export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  // OAuth return errors (cancelled consent, expired link, misconfigured
  // redirect) land here as ?error=… — show them, then scrub the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    const oauthDesc = params.get("error_description");
    if (oauthError) {
      setError(describeOAuthReturnError(oauthError, oauthDesc));
      window.history.replaceState({}, "", "/signup");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    });
    setBusy(false);
    if (error) {
      setError(friendlyAuthError(error));
      return;
    }
    if (data.session) {
      // email confirmation disabled -> signed in straight away
      router.push("/dashboard");
      return;
    }
    setPendingConfirm(true);
  }

  if (pendingConfirm) {
    return (
      <AuthShell>
        <div className="rounded-xl border border-line bg-navy-900 p-6 text-center shadow-card">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-signal/40 bg-signal/10 text-signal">
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
              <path d="M4 6h16v12H4z" />
              <path d="M4 7l8 6 8-6" />
            </svg>
          </span>
          <h1 className="mt-4 text-base font-semibold text-slate-100">
            Confirm your email
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We sent a confirmation link to{" "}
            <span className="font-mono text-slate-300">{email}</span>.
            Confirming activates your analyst account.
          </p>
          <p className="mt-3 text-xs text-muted-faint">
            Didn't arrive? Check spam, or wait a minute — free-tier projects
            limit emails per hour.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-lg border border-line px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent hover:text-accent"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold tracking-tight text-slate-100">
        Create your account
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        analyst access · scoped by RLS from day one
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="analyst@agency.gov.in"
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="min. 8 characters"
        />
        <p className="-mt-2 text-[11px] text-muted-faint">
          At least 8 characters. A passphrase you don't reuse elsewhere works
          best.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-navy-950 shadow-glow-accent transition hover:brightness-110 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Spinner />}
          {busy ? "Creating account…" : "Create analyst account"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-faint">
          or
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton onError={setError} />

      <p className="mt-5 text-center text-xs text-muted-faint">
        Already have access?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
