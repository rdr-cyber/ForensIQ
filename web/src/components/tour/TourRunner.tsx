"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * First-run walkthrough tours.
 *
 * A tour is an ordered list of steps; each step either targets an element
 * via its data-tour attribute (spotlight + anchored tooltip) or is a
 * centered interstitial. First visit to /dashboard and /case/* auto-starts
 * the matching tour exactly once (localStorage); the guide panel can replay
 * any tour on demand. Reduced-motion users get instant transitions.
 */

export type TourStep = {
  /** data-tour attribute value to spotlight; omit for a centered card. */
  target?: string;
  title: string;
  body: string;
  /** Tooltip placement relative to the target (auto-flips near edges). */
  side?: "top" | "bottom" | "left" | "right";
};

export type TourId = "dashboard" | "case";

export const TOURS: Record<TourId, { title: string; steps: TourStep[] }> = {
  dashboard: {
    title: "Dashboard tour",
    steps: [
      {
        title: "Welcome to your case workspace",
        body: "This tour takes ~30 seconds: what each control does, and how a forensic run becomes signed evidence. You can replay it anytime from the guide (sparkle button, bottom-right).",
      },
      {
        target: "dashboard-new-case",
        title: "Create a case",
        body: "Every investigation starts as a case. You only see cases you own or belong to — that filter is enforced by Postgres RLS, not by the UI.",
        side: "bottom",
      },
      {
        target: "dashboard-case-list",
        title: "Your cases",
        body: "Each row is one investigation with its status badge. Click one to open the script editor, audit trail and evidence bundles.",
        side: "bottom",
      },
      {
        target: "dashboard-signout",
        title: "That's the dashboard",
        body: "Sign out anytime from here. Next: open a case and the case-page tour continues from where this one ends.",
        side: "bottom",
      },
    ],
  },
  case: {
    title: "Case page tour",
    steps: [
      {
        title: "Inside a case",
        body: "This is where forensic work happens: write a script, run it in the sandbox, watch the audit chain, then export signed evidence.",
      },
      {
        target: "case-editor",
        title: "The .fzq script editor",
        body: "Write your script here — one statement per line: acquire, hash, log, report. The demo script is ready to run as-is; 'reset' restores it.",
        side: "right",
      },
      {
        target: "case-run",
        title: "Run Script",
        body: "Executes in a throwaway sandbox on the service: no eval, no process spawn, no path traversal. Output streams into the right pane.",
        side: "bottom",
      },
      {
        target: "case-output",
        title: "Output + chain status",
        body: "The pill shows INTACT (hash chain verified) or BROKEN (tampering detected). Every action of the run was appended to the audit chain as it executed.",
        side: "left",
      },
      {
        target: "case-report",
        title: "Generate Report",
        body: "Verifies the chain, then Ed25519-signs an evidence bundle and stores it privately. This is the artifact you can defend years later.",
        side: "bottom",
      },
      {
        target: "case-bundles",
        title: "Evidence bundles",
        body: "Each bundle keeps its sha256 and a 'signed URL' button — a 5-minute download link that only case members can obtain. Verify offline with the CLI: python -m forensiq.main verify-report bundle.json",
        side: "left",
      },
      {
        target: "case-audit-link",
        title: "Audit log",
        body: "The vertical chain graph: every action with its hash and prev_hash, rooted at GENESIS. Edit one row and everything after it visibly breaks.",
        side: "bottom",
      },
      {
        title: "You're ready",
        body: "That's the whole loop: script → run → signed evidence. Stuck anywhere? The guide (sparkle button) answers questions on every page.",
      },
    ],
  },
};

const STORAGE_KEY = "jocky-tour-done";
const REPLAY_EVENT = "jocky:tour-replay";
const SPOT_PAD = 8;

/** Ask the mounted TourRunner to (re)start a tour. Used by the guide panel. */
export function requestTour(id: TourId) {
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT, { detail: id }));
}

type Rect = { top: number; left: number; width: number; height: number };

function readDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Paste-over highlight for the targeted element. */
function Spotlight({ rect }: { rect: Rect }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-xl ring-2 ring-accent shadow-glow-accent transition-all duration-200"
      style={{
        top: rect.top - SPOT_PAD,
        left: rect.left - SPOT_PAD,
        width: rect.width + SPOT_PAD * 2,
        height: rect.height + SPOT_PAD * 2,
      }}
    />
  );
}

export default function TourRunner() {
  const pathname = usePathname();
  const [active, setActive] = useState<TourId | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const finish = useCallback((id: TourId) => {
    setActive(null);
    setRect(null);
    const done = readDone();
    done[id] = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    } catch {
      /* private mode: tours just replay next visit */
    }
  }, []);

  const start = useCallback((id: TourId) => {
    setActive(id);
    setStepIdx(0);
    setRect(null);
  }, []);

  // Auto-start once per page on first visit. No startedRef gate here:
  // StrictMode's mount -> cleanup -> mount would cancel the first timer and
  // skip the second (the guard makes run 2 a no-op), killing auto-start on
  // full page loads. The effect is idempotent instead: it re-reads
  // localStorage each run and simply re-schedules; finish() persists the
  // done flag so revisits never re-trigger.
  useEffect(() => {
    if (!pathname) return;
    let candidate: TourId | null = null;
    if (/^\/dashboard/.test(pathname)) candidate = "dashboard";
    else if (/^\/case\/[^/]+$/.test(pathname)) candidate = "case";
    if (!candidate) return;
    const done = readDone();
    if (done[candidate]) return;
    // small delay so the page's own loading skeletons settle first
    const t = setTimeout(() => start(candidate!), 900);
    return () => clearTimeout(t);
  }, [pathname, start]);

  // Replay requests from the guide panel (window event bus).
  useEffect(() => {
    function onReplay(e: Event) {
      const id = (e as CustomEvent).detail as TourId;
      if (id === "dashboard" || id === "case") start(id);
    }
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [start]);

  const tour = active ? TOURS[active] : null;
  const step = tour?.steps[stepIdx];

  // Track the spotlight target (re-measure on resize/scroll).
  useEffect(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step?.target, stepIdx, active]);

  if (!active || !tour || !step) return null;

  const last = stepIdx === tour.steps.length - 1;
  const side = step.side ?? "bottom";

  // Tooltip position: anchored to the spotlight when there is one, else
  // centered. Auto-flips (bottom<->top, right<->left->bottom) and clamps so
  // the card is always fully inside the viewport — tall targets like the
  // script editor would otherwise push it below the fold.
  const tooltipStyle: React.CSSProperties = rect
    ? (() => {
        const w = 300;
        const h = 200; // conservative card height estimate
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const roomRight = rect.left + rect.width + w + 24 <= vw;
        const roomLeft = rect.left >= w + 24;
        const roomBelow = rect.top + rect.height + 12 + h <= vh;
        const roomAbove = rect.top >= h + 24;
        let effSide = side;
        if (effSide === "right" && !roomRight) effSide = "bottom";
        if (effSide === "left" && !roomLeft) effSide = "bottom";
        if (effSide === "bottom" && !roomBelow && roomAbove) effSide = "top";
        if (effSide === "top" && !roomAbove && roomBelow) effSide = "bottom";
        const base: React.CSSProperties = { position: "fixed", maxWidth: w };
        if (effSide === "bottom") {
          base.top = Math.min(vh - h - 12, rect.top + rect.height + 12);
          base.left = Math.max(12, Math.min(vw - w - 12, rect.left + rect.width / 2 - w / 2));
        } else if (effSide === "top") {
          base.bottom = Math.max(12, vh - rect.top + 12);
          base.left = Math.max(12, Math.min(vw - w - 12, rect.left + rect.width / 2 - w / 2));
        } else if (effSide === "left") {
          base.top = Math.max(12, Math.min(vh - h - 12, rect.top));
          base.right = vw - rect.left + 12;
        } else {
          base.top = Math.max(12, Math.min(vh - h - 12, rect.top));
          base.left = rect.left + rect.width + 12;
        }
        return base;
      })()
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", maxWidth: 340 };

  return (
    <div className="fixed inset-0 z-[60]">
      {/* dimmer (click-through is intentional: the spotlight marks, it doesn't trap) */}
      <div className="absolute inset-0 bg-navy-950/70" onClick={() => (last ? finish(active) : setStepIdx((i) => i + 1))} />

      {rect && <Spotlight rect={rect} />}

      <div
        role="dialog"
        aria-label={`${tour.title} — step ${stepIdx + 1} of ${tour.steps.length}`}
        className="w-[300px] rounded-xl border border-line bg-navy-900 p-4 shadow-card"
        style={tooltipStyle}
      >
        <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
          {tour.title} · {stepIdx + 1}/{tour.steps.length}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">{step.title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => finish(active)}
            className="text-[11px] text-muted-faint transition hover:text-slate-300"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => i - 1)}
                className="rounded border border-line px-2.5 py-1 text-xs text-muted transition hover:text-slate-200"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish(active) : setStepIdx((i) => i + 1))}
              className="rounded bg-accent px-3 py-1 text-xs font-semibold text-navy-950 transition hover:brightness-110"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
