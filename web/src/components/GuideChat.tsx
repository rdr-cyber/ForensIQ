"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getGuideAnswer, type GuideReply } from "@/lib/guideBrain";
import { requestTour, type TourId } from "@/components/tour/TourRunner";

type Msg = { role: "user" | "guide"; text: string; chips?: string[] };

const WELCOME: Msg = {
  role: "guide",
  text: "Hi! I'm the **Jocky guide** — I walk you through the whole process: signing in, running forensic scripts, reading the audit chain, and exporting signed evidence bundles. Ask me anything, or tap a topic.",
  chips: ["How do I sign in?", "How do I run a script?", "What is the audit chain?", "How do I generate a report?"],
};

/** Renders **bold** and `code` spans from the guide brain's markdown. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, li) => (
        <span key={li} className="block">
          {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, pi) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={pi} className="font-semibold text-slate-100">
                {part.slice(2, -2)}
              </strong>
            ) : part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
              <code
                key={pi}
                className="rounded bg-navy-950/70 px-1 py-0.5 font-mono text-[11px] text-accent/90"
              >
                {part.slice(1, -1)}
              </code>
            ) : (
              <span key={pi}>{part}</span>
            ),
          )}
        </span>
      ))}
    </>
  );
}

export default function GuideChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Route-aware nudge: when the page changes while the chat is open, the
  // guide volunteers where you are (once per route).
  const lastRouteRef = useRef<string>("");
  useEffect(() => {
    if (!open || !pathname) return;
    if (lastRouteRef.current === pathname) return;
    lastRouteRef.current = pathname;
    const reply: GuideReply = getGuideAnswer("what now", { path: pathname });
    setMessages((m) => [...m, { role: "guide", text: reply.text ?? "", chips: reply.chips }]);
  }, [pathname, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    const reply = getGuideAnswer(q, { path: pathname ?? "/" });
    setMessages((m) => [...m, { role: "user", text: q }, { role: "guide", text: reply.text, chips: reply.chips }]);
    setDraft("");
  }

  function toggle() {
    setOpen((o) => {
      if (!o) setUnread(false);
      return !o;
    });
  }

  // Contextual replay: offer the tour matching the current page.
  const tourForPage: TourId | null = /^\/dashboard/.test(pathname ?? "")
    ? "dashboard"
    : /^\/case\/[^/]+$/.test(pathname ?? "")
      ? "case"
      : null;

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Close guide" : "Open guide"}
        className={`fixed bottom-5 right-5 z-50 grid h-12 w-12 place-items-center rounded-full border border-accent/40 bg-navy-800 text-accent shadow-glow-accent transition hover:bg-navy-700 active:scale-95 ${
          open ? "rotate-90" : ""
        }`}
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
            <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z" />
          </svg>
        )}
        {unread && !open && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Jocky guide"
          className="fixed bottom-20 right-5 z-50 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-navy-900 shadow-card"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">Jocky guide</p>
              <p className="font-mono text-[10px] text-muted-faint">
                step-by-step · every page explained
              </p>
            </div>
            {tourForPage && (
              <button
                type="button"
                onClick={() => requestTour(tourForPage)}
                className="ml-auto flex-none rounded-full border border-line px-2.5 py-1 text-[10px] text-muted transition hover:border-accent/50 hover:text-accent"
              >
                ↻ replay tour
              </button>
            )}
          </div>

          <div ref={scrollRef} className="log-scroll flex-1 space-y-3 overflow-y-auto px-3.5 py-3">            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-accent/15 text-slate-100"
                      : "border border-line bg-navy-800 text-muted"
                  }`
                  }
                >
                  <RichText text={m.text} />
                </div>
                {m.role === "guide" && m.chips && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.chips.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => send(c)}
                        className="rounded-full border border-line bg-navy-800 px-2.5 py-1 text-[11px] text-muted transition hover:border-accent/50 hover:text-accent"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 border-t border-line px-3 py-2.5"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about any step…"
              aria-label="Ask the guide"
              className="min-w-0 flex-1 rounded-lg border border-line bg-navy-800 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-muted-faint/70 focus:border-accent"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-accent text-navy-950 transition hover:brightness-110 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
