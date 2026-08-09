/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F7F7',
        ink: '#12232B',
        'ink-soft': '#4B5D66',
        'ink-faint': '#7C8B92',
        surface: '#FFFFFF',
        'surface-alt': '#EFF3F3',
        hairline: '#DCE4E4',
        violet: '#6C4AB6',
        sienna: '#B5651D',
        harbor: '#3B6EA5',
        sky: '#1E77B8',
        leaf: '#1E8A5F',
        gold: '#C0872A',
        coral: '#C4425A',
        slateState: '#8A97A0',
        clinic: {
          50: '#E7F5F1',
          100: '#D2EAE5',
          200: '#A8D1C8',
          500: '#1E8A72',
          600: '#0E5E5E',
          700: '#0E5E5E',
          800: '#0A4747',
          900: '#12232B',
        },
        canvas: '#F5F7F7',
      },
      boxShadow: {
        card: 'none',
        lift: '0 8px 24px rgba(18, 35, 43, .08)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
