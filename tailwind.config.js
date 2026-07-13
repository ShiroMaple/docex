/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: "#f5f4ed",
        ivory: "#faf9f5",
        "warm-sand": "#e8e6dc",
        "near-black": "#141413",
        "olive-gray": "#5e5d59",
        "stone-gray": "#87867f",
        "border-cream": "#f0eee6",
        terracotta: {
          DEFAULT: "#c96442",
          hover: "#b24f2e",
        },
      },
      fontFamily: {
        serif: ["Georgia", "serif"],
        sans: ["Plus Jakarta Sans", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        halo: "0 0 0 1px #e8e6dc",
      },
    },
  },
  plugins: [],
}
