"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { friendlyAuthError } from "./authErrors";

/**
 * "Continue with Google" that verifies the provider is actually enabled
 * before redirecting: if the dashboard toggle isn't on, the user gets an
 * honest inline explanation instead of a dead redirect or raw GoTrue JSON.
 * (State is fetched from GoTrue /auth/v1/settings with the publishable
 * anon key; result is cached for the page session.)
 */
export function GoogleButton({
  onError,
  onBusyChange,
}: {
  onError: (msg: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [providerOff, setProviderOff] = useState<boolean | null>(null); // null = unknown yet
  const [busy, setBusy] = useState(false);

  async function checkEnabled(): Promise<boolean> {
    if (providerOff === false) return true; // cached enabled
    try {
      const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
        { headers: { apikey: apiKey } },
      );
      if (!res.ok) return true; // can't tell -> let GoTrue decide
      const settings = await res.json();
      const enabled = settings?.external?.google === true;
      setProviderOff(!enabled);
      return enabled;
    } catch {
      return true; // can't tell -> let GoTrue decide
    }
  }

  async function handleClick() {
    onError(null);
    setBusy(true);
    onBusyChange?.(true);
    const enabled = await checkEnabled();
    if (!enabled) {
      setBusy(false);
      onBusyChange?.(false);
      onError(
        "Google sign-in isn't switched on for this project yet. An admin must enable it in the Supabase dashboard (Authentication → Providers → Google → Save). Password sign-in below works right now.",
      );
      return;
    }
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setBusy(false);
      onBusyChange?.(false);
      onError(friendlyAuthError(error));
    }
    // on success the browser navigates away; no state reset needed
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-describedby={providerOff ? "google-off-note" : undefined}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-navy-800 px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:border-line-strong hover:bg-navy-700 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <GoogleGlyph className="h-4 w-4" />
      {busy ? "Redirecting to Google…" : "Continue with Google"}
      {providerOff && <span className="sr-only">(currently unavailable)</span>}
    </button>
  );
}

export function GoogleGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.46 1.8 14.96.72 12 .72 7.44.72 3.56 3.36 1.68 7.26l3.66 2.84C6.24 7.14 8.88 5.04 12 5.04z"
      />
      <path
        fill="#4285F4"
        d="M23.28 12.26c0-.8-.08-1.56-.2-2.26H12v4.52h6.34c-.28 1.48-1.1 2.74-2.34 3.58l3.62 2.8c2.12-1.96 3.66-4.84 3.66-8.64z"
      />
      <path
        fill="#FBBC05"
        d="M5.34 14.28a7.06 7.06 0 0 1 0-4.56L1.68 6.88a11.28 11.28 0 0 0 0 10.24l3.66-2.84z"
      />
      <path
        fill="#34A853"
        d="M12 23.28c3.04 0 5.58-1 7.44-2.72l-3.62-2.8c-1 .68-2.28 1.08-3.82 1.08-3.12 0-5.76-2.1-6.66-5.04l-3.66 2.84c1.88 3.9 5.76 6.64 10.32 6.64z"
      />
    </svg>
  );
}
