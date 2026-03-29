/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Remap the entire gray palette to CSS variables.
      // Format: "rgb(var(--twg-N) / <alpha-value>)" so Tailwind's opacity
      // modifiers (bg-gray-900/40, text-gray-400/60, etc.) keep working.
      // CSS vars are defined in index.css and swapped by the .light class.
      colors: {
        gray: {
          50:  'rgb(var(--twg-50)  / <alpha-value>)',
          100: 'rgb(var(--twg-100) / <alpha-value>)',
          200: 'rgb(var(--twg-200) / <alpha-value>)',
          300: 'rgb(var(--twg-300) / <alpha-value>)',
          400: 'rgb(var(--twg-400) / <alpha-value>)',
          500: 'rgb(var(--twg-500) / <alpha-value>)',
          600: 'rgb(var(--twg-600) / <alpha-value>)',
          700: 'rgb(var(--twg-700) / <alpha-value>)',
          800: 'rgb(var(--twg-800) / <alpha-value>)',
          900: 'rgb(var(--twg-900) / <alpha-value>)',
          950: 'rgb(var(--twg-950) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
