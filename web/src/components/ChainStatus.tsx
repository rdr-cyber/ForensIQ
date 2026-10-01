/**
 * Chain status pill. Status is never color-only: paired icon + text, plus
 * an aria-live label. The INTACT↔BROKEN flip animates (icon crossfade +
 * rotate, color/glow pulse) rather than swapping text.
 */
export default function ChainStatus({
  intact,
  size = "md",
}: {
  intact: boolean;
  size?: "sm" | "md";
}) {
  const base =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      role="status"
      aria-label={intact ? "Audit chain intact" : "Audit chain broken"}
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded border font-mono font-semibold tracking-widest transition-colors duration-500 ${base} ${
        intact
          ? "border-signal/40 bg-signal/10 text-signal animate-pill-pulse"
          : "border-danger/50 bg-danger/10 text-danger animate-pill-pulse-danger"
      }`}
    >
      {/* icon: keyed swap so the rotate-in plays on every state flip */}
      <span className="grid h-3 w-3 place-items-center">
        <svg
          key={intact ? "check" : "cross"}
          viewBox="0 0 12 12"
          className="h-3 w-3 animate-icon-in"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          {intact ? (
            <path d="M2 6.5 5 9.5 10 3" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
          )}
        </svg>
      </span>
      {intact ? "CHAIN: INTACT" : "CHAIN: BROKEN"}

      {/* one-shot danger flash ring when broken */}
      {!intact && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-break-flash"
        />
      )}
    </span>
  );
}
