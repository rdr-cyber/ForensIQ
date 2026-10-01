import type { Config } from "tailwindcss";

/**
 * Jocky design tokens.
 *
 * Palette: deep navy/charcoal surfaces, one "signal" accent reserved for
 * INTACT/healthy states, one "danger" for BROKEN, muted grays for secondary
 * text. Status is never color-only: components pair it with icons + text.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        navy: {
          950: "#070b12", // page background
          900: "#0b1120", // raised surface
          800: "#111a2e", // cards / inputs
          700: "#1a2440", // hover surface
        },
        line: {
          DEFAULT: "#1e293b", // hairline borders
          strong: "#334155",
        },
        signal: {
          DEFAULT: "#34d399", // INTACT / healthy
          dim: "#065f46",
        },
        danger: {
          DEFAULT: "#f87171", // BROKEN / tampered
          dim: "#7f1d1d",
        },
        accent: {
          DEFAULT: "#22d3ee", // primary actions
          dim: "#155e75",
        },
        muted: {
          DEFAULT: "#94a3b8", // secondary text
          faint: "#64748b", // tertiary / timestamps
        },
      },
      boxShadow: {
        "glow-signal": "0 0 0 1px rgba(52,211,153,.35), 0 0 18px rgba(52,211,153,.18)",
        "glow-danger": "0 0 0 1px rgba(248,113,113,.4), 0 0 20px rgba(248,113,113,.22)",
        "glow-accent": "0 0 0 1px rgba(34,211,238,.35), 0 0 16px rgba(34,211,238,.15)",
        card: "0 1px 0 rgba(255,255,255,.02) inset, 0 8px 24px rgba(2,6,23,.5)",
      },
      keyframes: {
        "pill-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(52,211,153,0)" },
          "50%": { boxShadow: "0 0 0 4px rgba(52,211,153,.14)" },
        },
        "pill-pulse-danger": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(248,113,113,0)" },
          "50%": { boxShadow: "0 0 0 4px rgba(248,113,113,.18)" },
        },
        "link-draw": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        "node-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "break-flash": {
          "0%, 100%": { backgroundColor: "rgba(248,113,113,0)" },
          "40%": { backgroundColor: "rgba(248,113,113,.16)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "icon-in": {
          from: { opacity: "0", transform: "rotate(-90deg) scale(.6)" },
          to: { opacity: "1", transform: "rotate(0) scale(1)" },
        },
      },
      animation: {
        "pill-pulse": "pill-pulse 2.4s ease-in-out infinite",
        "pill-pulse-danger": "pill-pulse-danger 1.8s ease-in-out infinite",
        "link-draw": "link-draw .45s ease-out both",
        "node-in": "node-in .35s ease-out both",
        "break-flash": "break-flash 1.2s ease-in-out 2",
        shimmer: "shimmer 1.6s linear infinite",
        "icon-in": "icon-in .35s cubic-bezier(.2,.9,.3,1.4) both",
      },
    },
  },
  plugins: [],
};

export default config;
