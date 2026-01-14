import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        mono: ["var(--font-geist-mono)", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        effect: {
          keystroke: "hsl(var(--effect-keystroke))",
          annotation: "hsl(var(--effect-annotation))",
          zoom: "hsl(var(--effect-zoom))",
          screen: "hsl(var(--effect-screen))",
          webcam: "hsl(var(--effect-webcam))",
        },
        glass: {
          bg: "hsl(var(--glass-bg))",
          text: "hsl(var(--glass-text))",
          "text-secondary": "hsl(var(--glass-text-secondary))",
          border: "hsl(var(--glass-border) / var(--glass-border-opacity))",
        },
        overlay: {
          scrim: "hsl(var(--overlay-scrim))",
          hover: "hsl(var(--overlay-hover) / var(--overlay-hover-opacity))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        pill: "var(--radius-macos-pill)",
        xl: "var(--radius-lg)", // 12px
        "2xl": "1rem", // 16px
        "3xl": "1.5rem", // 24px
        // Semantic border radius
        control: "6px",
        card: "12px",
        dialog: "16px",
        surface: "20px",
        // DEPRECATED - keep for migration, remove later
        "10": "10px",
        "14": "14px",
      },
      zIndex: {
        ground: "0",
        elevated: "10",
        panel: "20",
        floating: "50",
        overlay: "60",
        modal: "70",
        critical: "100",
        max: "9999",
      },
      boxShadow: {
        control: "var(--shadow-control)",
        elevated: "var(--shadow-elevated)",
        floating: "var(--shadow-floating)",
        modal: "var(--shadow-modal)",
      },
      fontSize: {
        "4xs": ["9px", { lineHeight: "12px" }],
        "3xs": ["10px", { lineHeight: "14px" }],
        "2xs": ["11px", { lineHeight: "14px" }],
        "xs": ["12px", { lineHeight: "16px" }],
        "sm": ["14px", { lineHeight: "20px" }],
        "base": ["16px", { lineHeight: "24px" }],
        "ui-sm": ["13px", { lineHeight: "18px" }],
        "ui-base": ["15px", { lineHeight: "22px" }],
        // Display headings
        "display-sm": ["20px", { lineHeight: "26px", letterSpacing: "-0.01em" }],
        "display": ["26px", { lineHeight: "32px", letterSpacing: "-0.02em" }],
        "display-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em" }],
      },
      spacing: {
        "4.5": "1.125rem", // 18px
        "13": "3.25rem", // 52px
        "15": "3.75rem", // 60px
        sidebar: "300px",
        popover: "240px",
        dialog: "420px",
        "dialog-sm": "460px", // Wait, sm:max-w-[460px]
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      transitionDuration: {
        80: "80ms",
        3000: "3000ms",
      },
      transitionTimingFunction: {
        sharp: "cubic-bezier(0.2,0,0,1)",
        standard: "cubic-bezier(0.25,0.1,0.25,1)",
        spring: "cubic-bezier(0.34,1.56,0.64,1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
