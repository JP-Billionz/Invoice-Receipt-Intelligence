import type { Config } from 'tailwindcss';

// AISB brand palette — see memory `reference-aisb-brand` and Plan §4.9.
// Exposed as `aisb-*` Tailwind tokens so usage stays grep-able and consistent.
const aisbBrand = {
  bg: '#0A0716',
  'bg-2': '#100B22',
  panel: '#18112B',
  'panel-2': '#221A3A',
  'panel-3': '#2B214B',
  ink: '#EDE9F5',
  'ink-soft': '#C8BEDD',
  muted: '#857BA0',
  rule: '#2D2447',
  'rule-soft': '#241B3D',
  green: '#9BD850',
  'green-deep': '#7BC02C',
  purple: '#A668E3',
  'purple-deep': '#6E2BAF',
  red: '#FF6A66',
};

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        aisb: aisbBrand,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
