/** RazeKit design system — boxy, precise, media-first creator marketplace. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (mapped to CSS vars in index.css)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-ink': 'rgb(var(--primary-ink) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '14px',
      },
      boxShadow: {
        xs: '0 1px 2px rgb(11 21 36 / 0.05)',
        sm: '0 1px 2px rgb(11 21 36 / 0.06), 0 1px 3px rgb(11 21 36 / 0.08)',
        md: '0 2px 4px rgb(11 21 36 / 0.06), 0 6px 16px -6px rgb(11 21 36 / 0.14)',
        lg: '0 8px 30px -8px rgb(11 21 36 / 0.20)',
        glow: '0 6px 20px -6px rgb(var(--primary) / 0.5)',
      },
      maxWidth: { shell: '1400px' },
      // ── Motion system ──────────────────────────────────────────────────
      // One decelerating curve for things entering, one accelerating for
      // things leaving, and a soft spring reserved for interactions that
      // should feel physical. Motion is only ever used to communicate change,
      // relationship, progress or confirmation — never decoration.
      transitionTimingFunction: {
        brand: 'cubic-bezier(0.22, 1, 0.36, 1)',      // enter / settle
        exit: 'cubic-bezier(0.4, 0, 1, 1)',            // leave
        spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',    // press / pop
      },
      transitionDuration: {
        // Exit is deliberately faster than enter: a UI that lingers on the way
        // out feels slow even when it is not.
        instant: '90ms',
        fast: '140ms',
        base: '220ms',
        slow: '320ms',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        // Toasts and sheets enter from the edge they belong to, so their
        // origin is legible rather than arbitrary.
        'slide-in-right': { '0%': { opacity: 0, transform: 'translateX(12px)' }, '100%': { opacity: 1, transform: 'none' } },
        'slide-in-bottom': { '0%': { opacity: 0, transform: 'translateY(16px)' }, '100%': { opacity: 1, transform: 'none' } },
        'slide-out-right': { '0%': { opacity: 1, transform: 'none' }, '100%': { opacity: 0, transform: 'translateX(12px)' } },
        'slide-out-bottom': { '0%': { opacity: 1, transform: 'none' }, '100%': { opacity: 0, transform: 'translateY(16px)' } },
        'scale-in': { '0%': { opacity: 0, transform: 'scale(0.97)' }, '100%': { opacity: 1, transform: 'none' } },
        // A value that meaningfully changed, marked once rather than looping.
        'pulse-once': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-bottom': 'slide-in-bottom 220ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-out-right': 'slide-out-right 140ms cubic-bezier(0.4,0,1,1) both',
        'slide-out-bottom': 'slide-out-bottom 140ms cubic-bezier(0.4,0,1,1) both',
        'scale-in': 'scale-in 180ms cubic-bezier(0.22,1,0.36,1) both',
        'pulse-once': 'pulse-once 600ms ease-in-out 1',
      },
    },
  },
  plugins: [],
};
