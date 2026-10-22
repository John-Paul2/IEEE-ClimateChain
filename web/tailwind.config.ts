import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0B1220",
        surface: "#111A2E",
        border: "#1F2A44",
        text: "#E6EDF7",
        muted: "#8FA0BF",
        verified: "#2DD4BF",
        flagged: "#F43F5E",
        warning: "#F59E0B",
        info: "#60A5FA",
        // Surface variants for depth & contrast hierarchy
        "surface-card": "#111A2E",
        "surface-raised": "#16233B",
        "surface-sunken": "#080D18",
        "border-subtle": "#172036",
        "border-strong": "#2D3E64",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
