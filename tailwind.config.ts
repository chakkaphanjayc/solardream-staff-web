import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "bg-main": "#F0EEE9",
        "solar-dark": "#0F172A",
        "admin-surface": "#161B22",
        "admin-canvas": "#0D1117",
      },
      fontFamily: {
        notoSansThai: ["var(--font-noto-sans-thai)", "sans-serif"],
      },
    },
  },
};

export default config;
