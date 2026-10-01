/**
 * Jocky Guide — deterministic assistant brain.
 *
 * Answers questions about the whole workflow (auth → cases → scripts →
 * reports → audit → admin) with route-aware next steps. Pure functions, no
 * network: predictable in a demo, zero cost, no rate limits.
 *
 * To upgrade to a real LLM later: keep getGuideAnswer()'s signature, fetch
 * the answer from your provider when an API key env var is present, and fall
 * back to this brain otherwise.
 */

export type GuideContext = { path: string };

export type GuideReply = {
  text: string;
  chips?: string[];
};

type Topic = {
  id: string;
  keywords: string[];
  answer: string;
  chips?: string[];
  paths?: RegExp[];
};

const ROUTE_HINTS: { match: RegExp; hint: string }[] = [
  {
    match: /^\/$/,
    hint: "You're on the landing page — **Login** gets you into your workspace, or scroll to see the four security layers explained.",
  },
  {
    match: /^\/login/,
    hint: "You're on the sign-in page — the **Demo access** box at the bottom can fill the seeded analyst credentials for you (eye icon reveals the password).",
  },
  {
    match: /^\/signup/,
    hint: "You're on the signup page — create an account and the system provisions your analyst profile automatically.",
  },
  {
    match: /^\/dashboard/,
    hint: "You're on the dashboard — pick a case to work in, or create one with **New Case**.",
  },
  {
    match: /^\/case\/[^/]+\/audit/,
    hint: "You're viewing an audit trail — every row extends the SHA-256 chain; the verifier re-walks prev_hash links from the GENESIS root.",
  },
  {
    match: /^\/case\//,
    hint: "You're in a case — write a `.fzq` script on the left, **Run Script** to see output + chain status, **Generate Report** to sign a bundle.",
  },
  {
    match: /^\/admin/,
    hint: "You're in the admin console — all cases across analysts, with view-only audit trails. Admins never get write access to evidence.",
  },
];

const TOPICS: Topic[] = [
  {
    id: "run-script",
    keywords: ["run", "execute", "script", "fzq", "interpreter", "output"],
    answer:
      "Running a script:\n1. Open a case from the `dashboard`.\n2. Write your `.fzq` script in the left editor (or keep the demo script).\n3. Press **Run Script** — the service sandboxes it and streams output on the right.\n4. The pill above the output shows the chain status: `INTACT` or `BROKEN`.\nEvery run is saved to the `scripts` table and its actions are appended to the hash-chained audit log.",
    chips: ["What statements does the DSL have?", "What does INTACT / BROKEN mean?", "How do I generate a report?"],
  },
  {
    id: "dsl",
    keywords: ["dsl", "statement", "acquire", "hash", "log", "report", "language", "syntax", "command"],
    answer:
      "The `.fzq` language has four statements, one per line:\n• `acquire file \"name\"` — capture a file into the evidence set (the sandbox always contains your own script).\n• `hash sha256` — hash everything acquired so far.\n• `log \"message\"` — record a note in the audit chain.\n• `report \"bundle.json\"` — finish and sign an evidence bundle.\nLines starting with `#` are comments. Example:\n`acquire file \"script.fzq\"`\n`hash sha256`\n`report \"bundle.json\"`",
    chips: ["How do I run a script?", "How do I verify a bundle offline?"],
  },
  {
    id: "chain",
    keywords: ["chain", "intact", "broken", "tamper", "hash", "genesis", "audit", "verify chain", "tampered"],
    answer:
      "The audit chain: every action hashes `seq ‖ timestamp ‖ action ‖ details ‖ previous hash`, so entry 1 roots at `SHA-256(\"GENESIS\")` and each later entry seals everything before it. `INTACT` means the verifier re-walked every `prev_hash` link successfully; `BROKEN` means some link (or the starting root) doesn't match — proof of tampering. Try editing a row in the audit view and re-verifying: every hash after it breaks.",
    chips: ["Where do I see the audit trail?", "How do I generate a report?"],
  },
  {
    id: "report",
    keywords: ["report", "bundle", "evidence", "download", "sign", "signed url", "export"],
    answer:
      "Evidence bundles:\n1. In a case, press **Generate Report** — Jocky verifies the chain, then signs the bundle with the operator's Ed25519 key.\n2. The bundle is stored in private Storage and listed under **Evidence bundles** with its `sha256`.\n3. **↓ signed URL** issues a 5-minute download link that works only for people who can access that case (RLS-checked).\nAnyone can verify the downloaded bundle offline with the public key — trust comes from cryptography, not the server.",
    chips: ["How do I verify a bundle offline?", "What does INTACT / BROKEN mean?"],
  },
  {
    id: "verify-cli",
    keywords: ["verify offline", "verify-report", "cli", "public key", "signature valid", "offline"],
    answer:
      "Offline verification: from the repo root run\n`python -m forensiq.main verify-report bundle.json`\nIt checks the chain inside the bundle and the Ed25519 signature against the operator public key, then prints `SIGNATURE VALID` or `SIGNATURE INVALID`. No server, no database — the math is the witness.",
    chips: ["How do I generate a report?", "What is the audit chain?"],
  },
  {
    id: "audit-view",
    keywords: ["audit trail", "audit log", "trail", "view audit", "history"],
    answer:
      "Audit trails: open a case and press **Audit log →** (top right). You get the vertical chain graph — each node is one action with its hash and `prev_hash`, drawn from the GENESIS root. Admins can also view every case's trail read-only from `/admin`.",
    chips: ["What does INTACT / BROKEN mean?", "What can an admin do?"],
  },
  {
    id: "new-case",
    keywords: ["new case", "create case", "case", "dashboard"],
    answer:
      "Cases: from the `dashboard`, press **New Case**, give it a title and status, and it appears instantly in your list. You only ever see cases you own or are a member of — that's Postgres RLS, not a UI filter.",
    chips: ["How do I run a script?", "What is RLS?"],
  },
  {
    id: "rls",
    keywords: ["rls", "row level security", "scope", "permission", "access control", "security", "see other"],
    answer:
      "RLS (Row Level Security): every query is scoped **inside Postgres**, not in the app. Analysts see rows for cases they own or belong to via `case_members`; policies resolve through a `security definer` helper `can_access_case()` so there's no recursion. Admins get a separate read-widening path via `is_admin()` — read-only for evidence, never write access to the chain.",
    chips: ["What can an admin do?", "How do I create a case?"],
  },
  {
    id: "admin",
    keywords: ["admin", "administrator", "promote", "role", "is_admin"],
    answer:
      "Admins: there is **no self-service promotion** — the column privilege `update(name) only` makes it impossible to grant yourself admin through the API (verified: the attempt is rejected with `permission denied`). An admin is set by direct SQL on the `analysts.role` column, then uses `/admin` to see all cases and view-only audit trails. Non-admins who open `/admin` are redirected away.",
    chips: ["What is RLS?", "How do I sign in?"],
  },
  {
    id: "login",
    keywords: ["login", "sign in", "password", "credentials", "demo", "locked out", "forgot"],
    answer:
      "Signing in: the **Demo access** box on this page has the seeded analyst credentials — tap the eye to reveal the password, or **Fill demo credentials** to populate both fields. One careful attempt is best: a burst of wrong tries trips the auth rate limiter for about a minute (wait ~60–90s, then retry once).",
    chips: ["Why is Google sign-in unavailable?", "What is the rate limit?"],
  },
  {
    id: "google",
    keywords: ["google", "oauth", "continue with google", "provider"],
    answer:
      "Google sign-in: the button is fully wired (it even pre-checks the provider), but the project's Google provider must be switched on in the Supabase dashboard first (Authentication → Providers → Google → client ID + secret → Save). Until then you'll see an honest inline notice instead of a dead redirect — password sign-in always works.",
    chips: ["How do I sign in?", "What is the rate limit?"],
  },
  {
    id: "signup",
    keywords: ["signup", "register", "new account", "request access", "confirm email"],
    answer:
      "Creating an account: use **Create an account** on the sign-in page. A database trigger provisions your `analysts` profile with `role='analyst'` automatically — for password signups and (once enabled) Google signups alike. If the project asks for email confirmation, check your inbox; free-tier projects limit emails per hour.",
    chips: ["How do I sign in?", "What can I do once inside?"],
  },
  {
    id: "rate-limit",
    keywords: ["rate limit", "too many attempts", "429", "wait"],
    answer:
      "Rate limiting: Supabase throttles login/email bursts per IP and per email. If you see **Too many attempts**, stop, wait ~60–90 seconds, then make a single attempt — retrying rapidly resets the window.",
    chips: ["How do I sign in?"],
  },
  {
    id: "sandbox",
    keywords: ["sandbox", "safe", "dangerous", "security layers", "edr", "allowlist"],
    answer:
      "Four independent security layers:\n1. `RLS` — Postgres scopes every row.\n2. `sandbox` — each run executes in a throwaway temp dir with allowlisted primitives only (no eval, no process spawn, no path traversal).\n3. `audit chain` — every action is hash-chained.\n4. `signature` — bundles are Ed25519-signed before touching disk.\nEach layer alone catches a different class of tampering; even an admin can't write into evidence.",
    chips: ["What is the audit chain?", "What is RLS?"],
  },
];

const FALLBACK: GuideReply = {
  text: "I guide the whole Jocky workflow — accounts, cases, `.fzq` scripts, audit chains, evidence bundles and admin. Pick a topic below, or ask something like “how do I run a script?”.",
  chips: ["How do I run a script?", "What is the audit chain?", "How do I generate a report?", "What can an admin do?"],
};

const GREETINGS = new Set(["hi", "hello", "hey", "help", "start", "guide", "what can you do"]);

export function getGuideAnswer(input: string, ctx: GuideContext): GuideReply {
  const q = input.toLowerCase().trim();

  if (!q || GREETINGS.has(q)) {
    const route = routeHint(ctx.path);
    return {
      text: `Hi! I'm the Jocky guide — I walk you through the whole process: signing in, running forensic scripts, audit chains and signed evidence bundles.\n\n${route ?? "Ask me anything about the workflow, or pick a topic below."}`,
      chips: ["How do I run a script?", "What is the audit chain?", "How do I generate a report?", "What can an admin do?"],
    };
  }

  let best: { topic: Topic; score: number } | null = null;
  for (const topic of TOPICS) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (q.includes(kw)) score += kw.includes(" ") ? 3 : 2;
    }
    if (topic.paths?.some((re) => re.test(ctx.path))) score += 1;
    if (score > (best?.score ?? 0)) best = { topic, score };
  }
  if (best && best.score >= 2) {
    return { text: best.topic.answer, chips: best.topic.chips };
  }

  // vague "what now" questions get a route-aware nudge
  const route = routeHint(ctx.path);
  if (route && /\b(what now|next|stuck|where|start|begin|how do i start)\b/.test(q)) {
    return { text: route, chips: FALLBACK.chips };
  }

  return FALLBACK;
}

export function routeHint(path: string): string | null {
  for (const r of ROUTE_HINTS) {
    if (r.match.test(path)) return r.hint;
  }
  return null;
}
