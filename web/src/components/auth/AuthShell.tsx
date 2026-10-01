"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for /login and /signup.
 * Left: brand panel with the three trust pillars (the product's pitch).
 * Right: the form. Single-column under lg — the brand panel stacks on top
 * and collapses to a one-line header, so mobile keeps the form first.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-stretch bg-navy-950">
      {/* Brand panel */}
      <aside className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-line p-10 lg:flex">
        {/* glow accents */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-signal/10 blur-3xl"
        />

        <Link
          href="/"
          className="relative flex items-center gap-2 font-semibold text-slate-100"
        >
          <LogoMark className="h-7 w-7" />
          <span className="text-lg tracking-tight">Jocky</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-2xl font-semibold leading-snug text-slate-100">
            Every action, hashed and signed.
            <br />
            <span className="text-accent">Deny nothing, prove everything.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Jocky runs your forensic scripts in a sandbox and records each
            step into a tamper-evident hash chain, sealed with an Ed25519
            signature.
          </p>
          <ul className="mt-8 space-y-4">
            <TrustItem
              title="Tamper-evident audit trail"
              body="Every interpreter action extends a SHA-256 chain rooted at GENESIS. One flipped byte and verification says BROKEN."
              icon={<ChainIcon />}
            />
            <TrustItem
              title="Signed evidence bundles"
              body="Reports are Ed25519-signed artifacts you can verify offline, years later, with the public key alone."
              icon={<DocIcon />}
            />
            <TrustItem
              title="Scoped by default"
              body="Row-level security means an analyst sees only their cases — enforced by Postgres, not by the UI."
              icon={<ShieldIcon />}
            />
          </ul>
        </div>

        <p className="relative font-mono text-[11px] text-muted-faint">
          SIH26148 · forensic scripting DSL
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          {/* mobile header (brand panel is hidden under lg) */}
          <Link
            href="/"
            className="mb-8 flex items-center justify-center gap-2 lg:hidden"
          >
            <LogoMark className="h-6 w-6" />
            <span className="text-base font-semibold tracking-tight text-slate-100">
              Jocky
            </span>
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}

function TrustItem({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg border border-line bg-navy-800 text-accent">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}

export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="7"
        className="fill-navy-800 stroke-accent/60"
        strokeWidth="1.5"
      />
      {/* three linked chain nodes */}
      <circle cx="11" cy="16" r="3" className="fill-signal" />
      <circle cx="21" cy="16" r="3" className="stroke-accent" strokeWidth="1.8" />
      <path
        d="M14 16h4"
        className="stroke-muted"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 12l-2.2 2.2a3.5 3.5 0 0 0 5 5L13 17" />
      <path d="M16 12l2.2-2.2a3.5 3.5 0 0 0-5-5L11 7" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 15l2 2 4-4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </svg>
  );
}
