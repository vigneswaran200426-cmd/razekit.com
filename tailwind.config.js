/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 6px)',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      colors: {
        /* Full Razekit blue ramp (spec §04) — keeps locked brand hues, adds depth */
        brand: {
          50:  '#EFF6FF', 100: '#E4F2FF', 200: '#C7E1FF', 300: '#93C5FF', 400: '#52B4FF',
          500: '#287FFF', 600: '#1A7BF8', 700: '#1457D9', 800: '#0B2F66', 900: '#071B3A',
        },
        ink: '#0C2444',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT:    'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT:    'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          50: '#FFF9E6',
        },
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT:              'hsl(var(--sidebar-background))',
          foreground:           'hsl(var(--sidebar-foreground))',
          primary:              'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent:               'hsl(var(--sidebar-accent))',
          'accent-foreground':  'hsl(var(--sidebar-accent-foreground))',
          border:               'hsl(var(--sidebar-border))',
          ring:                 'hsl(var(--sidebar-ring))',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        body:    ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono:    ['var(--font-mono)'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
      backgroundImage: {
        'razekit-gradient': 'linear-gradient(135deg, #1A7BF8 0%, #0B48E8 100%)',
        'sky-gradient':     'linear-gradient(180deg, #DCF8FF 0%, #EAF5FF 100%)',
      },
      boxShadow: {
        'elev-1': '0 1px 2px rgba(12,36,68,0.05), 0 4px 14px -8px rgba(12,36,68,0.10)',
        'elev-2': '0 4px 10px -4px rgba(12,36,68,0.08), 0 18px 40px -16px rgba(12,36,68,0.16)',
        'elev-3': '0 10px 24px -8px rgba(12,36,68,0.14), 0 40px 80px -24px rgba(12,36,68,0.22)',
        'glass': '0 2px 16px -4px rgba(12,36,68,0.08), 0 1px 3px -1px rgba(12,36,68,0.04)',
        'glass-lg': '0 8px 32px -8px rgba(12,36,68,0.12), 0 2px 8px -2px rgba(12,36,68,0.06)',
        'primary-glow': '0 4px 20px -4px rgba(26,123,248,0.35)',
      },
      zIndex: {
        base: '0', header: '30', sticky: '40', dropdown: '50', modal: '60', drawer: '70', toast: '80',
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      fontSize: {
        display:      ['clamp(2.2rem, 5vw, 3.4rem)',   { lineHeight: '1.06', letterSpacing: '-0.03em',  fontWeight: '800' }],
        'display-sm': ['clamp(1.8rem, 3.6vw, 2.4rem)', { lineHeight: '1.1',  letterSpacing: '-0.025em', fontWeight: '800' }],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
