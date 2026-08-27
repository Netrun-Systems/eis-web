/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        eis: {
          green: '#90b9ab',
          'green-dark': '#6a9a8a',
          'green-light': '#b0d4c8',
          bg: '#0f1419',
          'bg-light': '#1a2028',
          'bg-card': '#1e2630',
          'bg-hover': '#252f3a',
          border: '#2a3544',
          text: '#e0e6ed',
          'text-secondary': '#8b99a8',
          'text-muted': '#5a6878',
          danger: '#e55b5b',
          warning: '#e5a84b',
          info: '#5b9ee5',
        },
        // WEB-004 charter palette. Stone/dust neutrals for surfaces and text,
        // petrol-teal for interactive elements, rust strictly for hazard
        // chips/banners. Named tokens only — no inline hex in components.
        dust: {
          100: '#e8e4dc', // primary text on dark surfaces
          300: '#b5aea1', // secondary text
          500: '#7d766a', // muted text / disabled
          700: '#3a3a36', // borders / dividers
          800: '#26262c', // raised card surface
          900: '#1b1b20', // page surface
        },
        petrol: {
          light: '#6db8c4', // hover / emphasis on dark
          DEFAULT: '#3a8a99', // interactive: links, buttons, active nav
          dark: '#25606c', // pressed / borders
          tint: '#22434a', // subtle interactive backgrounds
        },
        rust: {
          light: '#d98b6c', // hazard text on dark
          DEFAULT: '#b0563a', // hazard chips / banners
          dark: '#6e3423', // hazard borders
          tint: '#3a241d', // hazard chip/banner background
        },
        // WEB-005: WARN-severity findings — deliberately distinct from rust,
        // which stays reserved for ERROR/hazard.
        amber: {
          light: '#d9b56c', // warning text on dark
          DEFAULT: '#a8802e', // warning chips
          dark: '#6e5423', // warning borders
          tint: '#38301d', // warning chip/banner background
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
