import Link from "next/link";

const TRIANGLE = [
  {
    title: "script_hash",
    tag: "what ran",
    body: "The exact .fzq bytes executed, SHA-256 bound into every evidence bundle — no post-hoc script swaps.",
    icon: (
      <path d="M9 3h6l4 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm6 0v5h5" />
    ),
  },
  {
    title: "audit chain",
    tag: "nothing edited mid-run",
    body: "Every action is hash-chained to the previous one. Editing any historical entry visibly breaks every hash after it.",
    icon: (
      <path d="M5 5m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 19m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M19 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M7 6.5 17 11M7 17.5 17 13" />
    ),
  },
  {
    title: "signature",
    tag: "who produced it",
    body: "Bundles are Ed25519-signed by the operator key before they touch disk. Post-signing tampering is detectable anywhere.",
    icon: (
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Zm-2.5 9 2 2 3.5-4" />
    ),
  },
];

// The four independent security layers (see SYSTEM_DESIGN.md §6). Each
// catches a different class of tampering; "admin" privilege touches only
// layer 1 (row visibility) and never the chain or the signature.
const LAYERS = [
  {
    n: "01",
    title: "RLS",
    tag: "who sees what row",
    body: "Postgres Row Level Security scopes every query to the signed-in analyst via definer helpers. Admins only widen read scope — never write into evidence.",
    icon: (
      <path d="M4 5h16M4 12h16M4 19h16M8 5v14" />
    ),
  },
  {
    n: "02",
    title: "sandboxing",
    tag: "what a script can touch",
    body: "Every run executes in a throwaway temp directory. Read-only, allowlist primitives — no memory access, no process spawn, no eval, no path traversal.",
    icon: (
      <path d="M12 3l8 4v6c0 4-3.4 7.2-8 8-4.6-.8-8-4-8-8V7l8-4Z" />
    ),
  },
  {
    n: "03",
    title: "audit chain",
    tag: "edited mid-run?",
    body: "Each action is hash-chained to the previous from a fixed genesis root. Editing or splicing any historical entry visibly breaks every hash after it.",
    icon: (
      <path d="M5 5m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 19m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M19 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M7 6.5 17 11M7 17.5 17 13" />
    ),
  },
  {
    n: "04",
    title: "signature",
    tag: "edited after signing?",
    body: "The whole bundle is Ed25519-signed by the operator key before it touches disk. Verification is pure cryptography — it never trusts the producing machine.",
    icon: (
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Zm-2.5 9 2 2 3.5-4" />
    ),
  },
];

// The request pipeline, matching the SYSTEM_DESIGN.md §1 architecture
// diagram: every action crosses these five hops in order. The browser never
// talks to the interpreter or the database directly — only to Next API routes,
// which are the single place auth (the analyst's own token) is attached.
const FLOW = [
  {
    n: "1",
    title: "Browser",
    body: "Next.js app. No secrets, no DB keys — the client only ever holds the signed-in analyst's own token.",
    icon: <path d="M3 5h18v14H3zM3 9h18M7 7h.01M10 7h.01" />,
  },
  {
    n: "2",
    title: "API routes",
    body: "/api/run-script · generate-report · verify-chain. The one hop that attaches auth and forwards to the sandbox.",
    icon: <path d="M8 8 4 12l4 4M16 8l4 4-4 4M13 6l-2 12" />,
  },
  {
    n: "3",
    title: "Sandbox",
    body: "FastAPI service runs each script in a throwaway temp dir — allowlist primitives only, no eval, no path traversal.",
    icon: <path d="M12 3l8 4v6c0 4-3.4 7.2-8 8-4.6-.8-8-4-8-8V7l8-4Z" />,
  },
  {
    n: "4",
    title: "Interpreter",
    body: "The .fzq lexer → parser → interpreter emits every action into the hash-chained audit log as it executes.",
    icon: <path d="M7 7h10v10H7zM9 4v3M15 4v3M9 17v3M15 17v3M4 9h3M4 15h3M17 9h3M17 15h3" />,
  },
  {
    n: "5",
    title: "Supabase",
    body: "Postgres (RLS-scoped rows), Storage (signed evidence bundles), Auth (Google + password). Every read is row-filtered.",
    icon: <path d="M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
  },
];

export default function LandingPage() {
  return (
    <main className="relative mx-auto max-w-5xl px-6 py-20">
      {/* backdrop glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent/10 to-transparent"
      />

      <section className="relative text-center">
        <p className="mb-3 font-mono text-xs tracking-[0.3em] text-accent">
          JOCKY · SIH26148
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
          Forensic scripting that survives the
          <span className="text-accent"> security stack</span> it runs on.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted">
          A purpose-built DSL for computer &amp; network forensics whose
          operations are the ones EDRs allowlist — plain reads, streamed
          hashing, structured parsing — with every action recorded in a
          tamper-evident, signed evidence chain. Not evasion: attribution.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded bg-accent px-5 py-2.5 text-sm font-semibold text-navy-950 shadow-glow-accent transition hover:brightness-110"
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            className="rounded border border-line-strong px-5 py-2.5 text-sm font-medium text-muted transition hover:border-accent/50 hover:text-slate-200"
          >
            Open dashboard
          </Link>
        </div>
      </section>

      <section className="relative mt-20" aria-label="The evidence triangle">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-faint">
          The evidence triangle
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {TRIANGLE.map((card) => (
            <div
              key={card.title}
              className="group rounded-xl border border-line bg-navy-900 p-6 shadow-card transition hover:border-accent/40 hover:bg-navy-800"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent transition group-hover:shadow-glow-accent">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {card.icon}
                </svg>
              </span>
              <h3 className="mt-4 font-mono text-sm font-semibold text-slate-100">
                {card.title}
              </h3>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-accent/80">
                {card.tag}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-20" aria-label="How it works">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-faint">
          How it works · four independent layers
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted">
          Defence in depth: each layer is independently sufficient to catch a
          different kind of tampering. Privilege — including the admin role —
          ever touches the first layer, never the chain or the signature.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {LAYERS.map((layer) => (
            <div
              key={layer.n}
              className="group rounded-xl border border-line bg-navy-900 p-5 shadow-card transition hover:border-accent/40 hover:bg-navy-800"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent transition group-hover:shadow-glow-accent">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {layer.icon}
                  </svg>
                </span>
                <span className="font-mono text-xs text-muted-faint">
                  {layer.n}
                </span>
              </div>
              <h3 className="mt-3 font-mono text-sm font-semibold text-slate-100">
                {layer.title}
              </h3>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-accent/80">
                {layer.tag}
              </p>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                {layer.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-20" aria-label="Architecture">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-faint">
          How a request flows
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted">
          One line per hop — the browser never touches the interpreter or the
          database directly. Auth is attached exactly once, at the API-route
          boundary, and every downstream read is still row-filtered by RLS.
        </p>
        <div className="mt-8 flex flex-col items-stretch gap-3 md:flex-row md:items-stretch">
          {FLOW.map((step, i) => (
            <div key={step.n} className="contents">
              <div className="min-w-0 flex-1 break-words rounded-xl border border-line bg-navy-900 p-4 shadow-card transition hover:border-accent/40 hover:bg-navy-800">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {step.icon}
                    </svg>
                  </span>
                  <span className="font-mono text-[10px] text-muted-faint">
                    {step.n}
                  </span>
                  <h3 className="font-mono text-sm font-semibold text-slate-100">
                    {step.title}
                  </h3>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
              {i < FLOW.length - 1 && (
                <div
                  aria-hidden="true"
                  className="flex flex-none items-center justify-center text-muted-faint"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 rotate-90 md:rotate-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-16 rounded-xl border border-line bg-navy-900 p-6 text-center">
        <p className="text-sm text-muted">
          Built for Smart India Hackathon problem statement{" "}
          <span className="font-mono text-slate-300">SIH26148 (NTRO)</span> —
          request access from your team lead to join an active case.
        </p>
        <Link
          href="/signup"
          className="mt-3 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Request access →
        </Link>
      </section>
    </main>
  );
}
