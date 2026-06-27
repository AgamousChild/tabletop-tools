import tailwindPreset from '@tabletop-tools/ui/tailwind-preset'
import type { Config } from 'tailwindcss'

const config: Config = {
  presets: [tailwindPreset as Config],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [],
}

export default config
