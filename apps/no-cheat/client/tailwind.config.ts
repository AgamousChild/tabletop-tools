import type { Config } from 'tailwindcss'
import tailwindPreset from '@tabletop-tools/ui/tailwind-preset'

const config: Config = {
  presets: [tailwindPreset as Config],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
