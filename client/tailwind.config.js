/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Earkick-inspired light theme colors
        background: "#ffffff",
        foreground: "#0f172a",
        card: "#ffffff",
        "card-foreground": "#0f172a",
        primary: {
          DEFAULT: "#a855f7", // Purple
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#ec4899", // Pink
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#f1f5f9",
          foreground: "#64748b",
        },
        accent: {
          DEFAULT: "#f3e8ff",
          foreground: "#a855f7",
        },
        border: "#e2e8f0",
        input: "#e2e8f0",
        ring: "#a855f7",
        dark: {
          background: "#0B0F1A",
          foreground: "#ffffff",
          card: "#111827",
          "card-foreground": "#ffffff",
          muted: {
            DEFAULT: "#1f2937",
            foreground: "#d1d5db",
          },
          border: "#1f2937",
        },
      },
      fontFamily: {
        sans: ["Poppins", "sans-serif"],
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
        "gradient-radial": "radial-gradient(circle, var(--tw-gradient-stops))",
      },
      animation: {
        gradient: "gradient 8s linear infinite",
        float: "float 3s ease-in-out infinite",
      },
      keyframes: {
        gradient: {
          "0%, 100%": {
            "background-size": "200% 200%",
            "background-position": "left center",
          },
          "50%": {
            "background-size": "200% 200%",
            "background-position": "right center",
          },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};
