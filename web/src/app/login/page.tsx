"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthField, Spinner, Eye, EyeOff } from "@/components/auth/AuthField";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demoCredentials";
import { GoogleButton } from "@/components/auth/GoogleButton";
import {
  friendlyAuthError,
  describeOAuthReturnError,
} from "@/components/auth/authErrors";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [showDemoPassword, setShowDemoPassword] = useState(false);

  // Google/GoTrue bounces back here with ?error=… when something fails
  // upstream (cancelled consent, expired link). Surface it honestly, then
  // scrub the URL so a refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    const oauthDesc = params.get("error_description");
    if (oauthError) {
      setError(describeOAuthReturnError(oauthError, oauthDesc));
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setError(friendlyAuthError(error));
      return;
    }
    router.push("/dashboard");
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Enter your email above first, then tap reset.");
      return;
    }
    setResetBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await getSupabase().auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/login` },
    );
    setResetBusy(false);
    if (error) {
      setError(friendlyAuthError(error));
      return;
    }
    setNotice(`Reset link sent to ${email.trim()} — check inbox and spam.`);
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold tracking-tight text-slate-100">
        Sign in
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        to your Jocky analyst workspace
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && <ErrorBanner message={error} />}
        {notice && <NoticeBanner message={notice} />}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-navy-950 shadow-glow-accent transition hover:brightness-110 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Spinner />}
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleReset}
        disabled={resetBusy}
        className="mt-2 w-full rounded py-1 text-center text-xs text-muted-faint transition hover:text-accent disabled:opacity-50"
      >
        {resetBusy ? "Sending reset link…" : "Forgot password?"}
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-faint">
          or
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton onError={setError} />

      <p className="mt-5 text-center text-xs text-muted-faint">
        New analyst?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>

      {/* Demo box: the real seeded account. The credential is deliberately
          public for judging (web/src/lib/demoCredentials.ts) — never lost. */}
      <div className="mt-6 rounded-lg border border-line/60 bg-navy-800/40 p-3">
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-faint">
          Demo access
        </p>
        <p className="mt-1.5 text-center font-mono text-[11px] text-slate-300">
          {DEMO_EMAIL}
        </p>
        <div className="mt-1 flex items-center justify-center gap-1">
          <span className="font-mono text-[11px] text-slate-300">
            {showDemoPassword ? DEMO_PASSWORD : "\u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022"}
          </span>
          <button
            type="button"
            onClick={() => setShowDemoPassword((s) => !s)}
            aria-label={showDemoPassword ? "Hide demo password" : "Show demo password"}
            aria-pressed={showDemoPassword}
            className="rounded p-1 text-muted-faint transition hover:text-accent"
          >
            {showDemoPassword ? <Eye /> : <EyeOff />}
          </button>
        </div>
        <p className="mt-1 text-center text-[10px] leading-relaxed text-muted-faint">
          seeded analyst · owner of the demo case
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail(DEMO_EMAIL);
            setPassword(DEMO_PASSWORD);
            setError(null);
            setNotice(null);
          }}
          className="mx-auto mt-2 block rounded border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-accent hover:text-accent"
        >
          Fill demo credentials
        </button>
      </div>
    </AuthShell>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger"
    >
      {message}
    </p>
  );
}

function NoticeBanner({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-xs leading-relaxed text-signal"
    >
      {message}
    </p>
  );
}
