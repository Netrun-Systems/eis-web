/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // WEB-015: dark mode follows the OS (`media`) — no toggle. Components are
  // authored light-first with `dark:` variants; every surface paints an
  // explicit background on both grounds.
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // WEB-004 charter palette, extended by WEB-015 for dual-ground use.
        // Stone/dust neutrals for surfaces and text, petrol-teal for
        // interactive elements, rust strictly for hazard/error, amber for
        // WARN, info (slate-blue) for the `generated` classification.
        // Named tokens only — no inline hex in components.
        //
        // Ground conventions:
        //   light: page dust-50, card dust-0, sunken dust-100, border dust-200
        //          body text dust-800 (≈13:1), secondary dust-600 (≥7:1),
        //          decorative-only dust-500 and lighter
        //   dark:  page dust-900, card dust-800, sunken dust-900, border dust-700
        //          body text dust-100, secondary dust-300, meta dust-400
        dust: {
          0: '#fcfaf5', // card surface (light)
          50: '#f4f1e9', // page surface (light)
          100: '#e8e4dc', // sunken/hover surface (light) · primary text (dark)
          200: '#d8d2c4', // borders / dividers (light)
          300: '#b5aea1', // secondary text (dark)
          400: '#98917f', // meta text (dark) · decorative (light)
          500: '#7d766a', // disabled / decorative only — both grounds
          600: '#4c483f', // secondary text (light, ≥7:1 on dust-50)
          700: '#3a3a36', // borders / dividers (dark)
          800: '#26262c', // card surface (dark) · body text (light)
          900: '#1b1b20', // page surface (dark) · headings (light)
        },
        petrol: {
          light: '#6db8c4', // interactive text on dark
          DEFAULT: '#3a8a99', // accents, hover borders
          dark: '#25606c', // pressed / borders on dark
          ink: '#1f5560', // interactive text on light (≥7:1 on dust-50)
          tint: '#22434a', // interactive backgrounds (dark)
          wash: '#dcebeb', // interactive backgrounds (light)
        },
        rust: {
          light: '#d98b6c', // hazard text on dark
          DEFAULT: '#b0563a', // hazard accents / borders on light
          dark: '#6e3423', // hazard borders on dark · hazard text on light
          tint: '#3a241d', // hazard chip/banner background (dark)
          wash: '#f2ded2', // hazard chip/banner background (light)
        },
        // WEB-005: WARN-severity findings — deliberately distinct from rust,
        // which stays reserved for ERROR/hazard.
        amber: {
          light: '#d9b56c', // warning text on dark
          DEFAULT: '#a8802e', // warning accents / borders on light
          dark: '#6e5423', // warning borders on dark
          ink: '#5d451a', // warning text on light (≥7:1 on dust-50)
          tint: '#38301d', // warning chip/banner background (dark)
          wash: '#f0e6cd', // warning chip/banner background (light)
        },
        // Quiet slate-blue for the `generated` classification chip — a fact,
        // not a hazard; replaces the untokenized eis-info blue.
        info: {
          light: '#84aecf',
          DEFAULT: '#41799e',
          dark: '#2a5069',
          ink: '#215070',
          tint: '#1f2f3a',
          wash: '#dfeaf2',
        },
      },
      fontFamily: {
        // WEB-015 type roles, matching the charter document's identity:
        //   display — Big Shoulders (industrial condensed): page titles,
        //             workflow stage numerals. Never body text.
        //   sans    — Inter: all interface text.
        //   serif   — Source Serif 4: long-form reading ONLY (the
        //             /philosophy reader, method quotes). Never chrome.
        //   mono    — JetBrains Mono: table names, RowNames, hashes, IDs,
        //             paths, grid cells.
        display: [
          '"Big Shoulders Display"',
          '"Arial Narrow"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['"JetBrains Mono"', 'Consolas', '"Courier New"', 'monospace'],
      },
      letterSpacing: {
        eyebrow: '0.16em',
      },
    },
  },
  plugins: [],
};
