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
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
