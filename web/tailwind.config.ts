import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* Brand (DESIGN.md Section 2) */
        brand: {
          DEFAULT: "var(--brand)",
          pressed: "var(--brand-pressed)",
          "on-black": "var(--brand-on-black)",
        },
        "on-brand": "var(--on-brand)",

        /* Neutrals */
        ink: "var(--ink)",
        canvas: "var(--canvas)",
        band: "var(--band)",
        "surface-soft": "var(--surface-soft)",
        "surface-card": "var(--surface-card)",
        "surface-raised": "var(--surface-raised)",
        hairline: "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
        muted: {
          DEFAULT: "var(--muted)",
          strong: "var(--muted-strong)",
        },

        /* Status Colors */
        verified: {
          DEFAULT: "var(--verified)",
          soft: "rgba(14, 159, 110, 0.12)",
          border: "rgba(14, 159, 110, 0.35)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "rgba(217, 119, 6, 0.12)",
          border: "rgba(217, 119, 6, 0.35)",
        },
        flagged: {
          DEFAULT: "var(--flagged-ink)",
          bg: "var(--flagged-bg)",
          ink: "var(--flagged-ink)",
          border: "rgba(229, 56, 59, 0.35)",
        },

        /* Semantic Aliases */
        background: "var(--canvas)",
        surface: "var(--surface-card)",
        border: "var(--hairline)",
        "border-subtle": "var(--surface-soft)",
        "border-strong": "var(--hairline-strong)",
        text: "var(--ink)",
        info: "#2563EB",
        danger: "var(--brand)",
      },
      fontFamily: {
        heading: ["'Titillium Web'", "Inter", "sans-serif"],
        display: ["'Titillium Web'", "Inter", "sans-serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        chip: "12px",
        card: "24px",
        pill: "9999px",
      },
      spacing: {
        section: "48px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
        dock: "0 2px 8px -2px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
