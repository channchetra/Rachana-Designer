/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /**
         * Rachana Designer brand scale.
         * `brand.700` is the product main colour (#1C4076) and is also the
         * dark stop of the supplied logo gradient, so the palette, the logo
         * and the icon stay visually consistent.
         */
        brand: {
          50: "#eef3fa",
          100: "#d6e2f2",
          200: "#aec5e6",
          300: "#7fa2d6",
          400: "#4d78bd",
          500: "#2b5797",
          600: "#224a86",
          700: "#1C4076",
          800: "#16325c",
          900: "#102444",
          950: "#0a1830",
        },
        /** Accent lifted from the light stop of the supplied logo gradient. */
        accent: {
          50: "#eaf7fd",
          100: "#cdeefa",
          200: "#9ddcf4",
          300: "#61c4ea",
          400: "#26A5DE",
          500: "#1a8ec4",
          600: "#14719e",
          700: "#125a7d",
          800: "#124b67",
          900: "#133f56",
        },
        /** Neutral shell colours (the original editor shell is a dark UI). */
        shell: {
          950: "#0d1220",
          900: "#121a2c",
          850: "#161f33",
          800: "#1b263d",
          700: "#2a3752",
          600: "#3a4867",
        },
        /**
         * Cambodia Government Web Design System tokens (`design.md` §3.1/§67).
         *
         * These back the government sample pages and are exposed under the
         * `gov-*` prefix the specification mandates, so templates read
         * `bg-gov-primary` / `text-gov-gray-700` rather than raw hex.
         *
         * `gov-primary` is #1C4076 — the same value as `brand.700` and the
         * logo gradient's dark stop, so the editor chrome and the government
         * templates share one identity colour.
         */
        gov: {
          primary: "#1c4076",
          "primary-dark": "#003194",
          "primary-deep": "#002266",
          navy: "#003a8a",
          secondary: "#3da3cf",
          link: "#0f71bb",
          highlight: "#f07d03",
          success: "#0a8217",
          warning: "#f79009",
          danger: "#d7260f",
          info: "#0f71bb",
          "gray-100": "#f7f7f9",
          "gray-200": "#e4e7ec",
          "gray-300": "#d0d5dd",
          "gray-400": "#98a2b3",
          "gray-500": "#667085",
          "gray-600": "#344054",
          "gray-700": "#1d2939",
          "surface-soft": "#f4f6fa",
          "pale-blue": "#ebf1ff",
          "danger-soft": "#fff4f3",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["Fira Code", "Cascadia Code", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255,255,255,0.04), 0 8px 24px -12px rgba(0,0,0,0.6)",
        brand: "0 8px 24px -10px rgba(28,64,118,0.8)",
        /* design.md §5.3 — restrained elevation. Never use glowing shadows. */
        "gov-xs": "0 1px 2px rgba(16, 24, 40, 0.05)",
        "gov-sm": "0 2px 8px rgba(16, 24, 40, 0.08)",
        "gov-md": "0 8px 20px rgba(16, 24, 40, 0.10)",
        "gov-dropdown": "0 8px 16px rgba(16, 24, 40, 0.12)",
      },
      borderRadius: {
        /* design.md §5.1 / §67 */
        "gov-xs": "4px",
        "gov-sm": "6px",
        "gov-md": "10px",
        "gov-lg": "12px",
        "gov-xl": "16px",
      },
      /** design.md §6.1 — the specification's own breakpoints. */
      screens: {
        "gov-sm": "576px",
        "gov-md": "768px",
        "gov-lg": "992px",
        "gov-xl": "1200px",
        "gov-2xl": "1400px",
      },
      maxWidth: {
        /* design.md §6.2 — container widths. */
        "gov-container": "1320px",
        "gov-wrapper": "1440px",
        "gov-reading": "760px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
      },
    },
  },
  plugins: [],
};
