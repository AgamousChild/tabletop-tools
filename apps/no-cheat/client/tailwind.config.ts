import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      colors: {
        // NoCheat design tokens
        background: '#0f172a',
        surface: '#0f172a',
        border: '#1e293b',
        accent: {
          DEFAULT: '#fbbf24', // amber-400
        },
        result: {
          fair: '#34d399',   // emerald-400
          loaded: '#f87171', // red-400
        },
      },
    },
  },
  plugins: [],
}

export default config
