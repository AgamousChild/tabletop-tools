import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#0f172a',
        surface: '#0f172a',
        border: '#1e293b',
        accent: {
          DEFAULT: '#fbbf24',
        },
      },
    },
  },
  plugins: [],
}

export default config
