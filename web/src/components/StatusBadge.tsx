import type { CaseStatus } from "@/lib/types";

const styles: Record<CaseStatus, string> = {
  open: "border-accent/40 bg-accent/10 text-accent",
  under_review: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  closed: "border-line-strong bg-navy-800 text-muted",
};

const labels: Record<CaseStatus, string> = {
  open: "OPEN",
  under_review: "UNDER REVIEW",
  closed: "CLOSED",
};

const icons: Record<CaseStatus, string> = {
  open: "M6 4h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", // folder
  under_review: "M12 8v4l2.5 2.5M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z", // clock
  closed: "M5 12l4 4 10-10M5 19h14", // done
};

export default function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium tracking-wide ${styles[status] ?? styles.closed}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icons[status] ?? icons.closed} />
      </svg>
      {labels[status] ?? status.toUpperCase()}
    </span>
  );
}
