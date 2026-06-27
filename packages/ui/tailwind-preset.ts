/**
 * Semantic-token Tailwind preset shared across every app in the platform.
 *
 * Why: Project Rule 8 (Skinnable UI). Components reference *meaning*
 * (`bg-surface`, `text-foreground`, `border-default`) — never raw palette
 * names (`bg-slate-900`, `text-slate-100`). Swapping the values in this
 * file repaints every app from one source.
 *
 * Every token below maps to the exact Tailwind hex that the codebase
 * was previously using directly, so introducing this layer produces
 * zero visual diff. To re-skin, change the hex values; the names stay.
 */
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        base: ['0.8125rem', { lineHeight: '1.25rem' }], // 13px base
        sm: ['0.75rem', { lineHeight: '1.125rem' }], // 12px
        xs: ['0.6875rem', { lineHeight: '1rem' }], // 11px
        lg: ['0.9375rem', { lineHeight: '1.375rem' }], // 15px
        xl: ['1.0625rem', { lineHeight: '1.5rem' }], // 17px
      },
      colors: {
        // Surfaces — layered from the page background up to floating panels.
        background: '#020617', // was slate-950 — page chrome / app shell
        surface: '#0f172a', // was slate-900 — cards, inputs, panels
        'surface-raised': '#1e293b', // was slate-800 — popovers, tooltip body, code chips
        'surface-overlay': '#334155', // was slate-700 — small chips, icon wells
        'surface-overlay-hover': '#475569', // was slate-600 — hover state for surface-overlay

        // Borders — paired with the surface tokens above.
        border: '#1e293b', // was slate-800 — default hairline
        'border-strong': '#334155', // was slate-700 — emphasized edge (tooltips)

        // Foreground (text) — ordered loudest to quietest.
        foreground: '#f1f5f9', // was slate-100 — body text, headings
        'foreground-secondary': '#e2e8f0', // was slate-200 — markdown headers / strong
        'foreground-muted': '#cbd5e1', // was slate-300 — markdown body / list text
        'foreground-subtle': '#94a3b8', // was slate-400 — secondary labels, chrome links
        'foreground-faint': '#64748b', // was slate-500 — placeholders, count badges
        'foreground-disabled': '#475569', // was slate-600 — disabled chevrons, dim glyphs

        // Brand accent.
        accent: {
          DEFAULT: '#fbbf24', // was amber-400 — primary brand color
          hover: '#fcd34d', // was amber-300 — accent hover / active
        },

        // Status.
        danger: '#f87171', // was red-400 — error text
      },
    },
  },
}
