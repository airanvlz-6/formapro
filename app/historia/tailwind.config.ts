import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          400: "#FF8C42",
          500: "#FF6B00",
          600: "#E55A00",
        },
      },
    },
  },
  plugins: [],
};
export default config;