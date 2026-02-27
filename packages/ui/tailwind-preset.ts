export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        base: ['0.8125rem', { lineHeight: '1.25rem' }],  // 13px base
        sm: ['0.75rem', { lineHeight: '1.125rem' }],     // 12px
        xs: ['0.6875rem', { lineHeight: '1rem' }],       // 11px
        lg: ['0.9375rem', { lineHeight: '1.375rem' }],   // 15px
        xl: ['1.0625rem', { lineHeight: '1.5rem' }],     // 17px
      },
      colors: {
        background: '#0f172a',
        surface: '#0f172a',
        border: '#1e293b',
        accent: { DEFAULT: '#fbbf24' },
      },
    },
  },
}
