import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Inter mapped to feel as close to SF Pro / Segoe UI as web fonts allow.
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
        display: ["var(--font-inter)", "-apple-system", "system-ui", "sans-serif"],
      },
      colors: {
        // System-blue accent (Apple #0071E3 / Microsoft #0078D4 — blended)
        accent: "#0071E3",
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#0A84FF",        // Apple system blue (dark)
          600: "#0071E3",        // Apple system blue (light)
          700: "#005BBF",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        // Neutral grayscale — Apple-style cool tints
        ink: {
          50:  "#FBFBFD",
          100: "#F5F5F7",        // page bg light
          150: "#EFEFF1",
          200: "#E5E5EA",        // separators light
          300: "#D2D2D7",
          400: "#A1A1A6",        // tertiary text
          500: "#86868B",        // secondary text
          600: "#6E6E73",
          700: "#3A3A3C",
          800: "#2C2C2E",        // surface dark
          850: "#1C1C1E",        // elevated dark
          900: "#0B0B0F",        // page bg dark
          950: "#000000",
        },
        // Semantic — Apple system colors
        success: { 50: "#E8F8EC", 500: "#34C759", 600: "#248A3D" },
        warning: { 50: "#FFF4E6", 500: "#FF9500", 600: "#C77800" },
        danger:  { 50: "#FFEDEC", 500: "#FF3B30", 600: "#C20F0F" },
      },
      boxShadow: {
        // Subtle by default; layered only when needed (Apple does very little shadow)
        card: "0 1px 2px rgba(15, 23, 42, 0.04)",
        soft: "0 4px 16px -2px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04)",
        lift: "0 12px 32px -8px rgba(15, 23, 42, 0.10), 0 4px 8px -4px rgba(15, 23, 42, 0.06)",
        glow: "0 0 0 4px rgba(10, 132, 255, 0.10), 0 4px 12px rgba(10, 132, 255, 0.20)",
        ring: "0 0 0 1px rgba(15, 23, 42, 0.06)",
        // Dark-mode counterparts
        "card-dark": "0 1px 2px rgba(0, 0, 0, 0.30)",
        "soft-dark": "0 4px 16px -2px rgba(0, 0, 0, 0.32)",
      },
      borderRadius: {
        // Apple's preferred radii
        sm: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
        "3xl": "22px",
      },
      backgroundImage: {
        // Apple "tint" gradients — subtle, never loud
        "brand-tint":
          "linear-gradient(135deg, rgba(10,132,255,0.10), rgba(10,132,255,0.02))",
        "subtle-light":
          "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(245,245,247,0.55) 100%)",
        "card-frost":
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.84) 100%)",
      },
      keyframes: {
        "fade-in":    { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "fade-in-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "fade-in":    "fade-in 200ms ease-out both",
        "fade-in-up": "fade-in-up 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
