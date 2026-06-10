/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rail: {
          bg: '#050816',
          'bg-surface': '#071120',
          'bg-elevated': '#0B1328',
          surface: '#10192E',
          'surface-2': '#131E37',
          accent: '#4E7CFF',
          success: '#20D97C',
          warning: '#FFB547',
          danger: '#FF5757',
          secondary: '#8FA7D9',
          border: '#1A2540',
          'border-2': '#243154',
        },
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        'heading-1': ['44px', { lineHeight: '1.1', fontWeight: '700' }],
        'heading-2': ['28px', { lineHeight: '1.2', fontWeight: '600' }],
        'heading-3': ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        label: ['12px', { lineHeight: '1.5', fontWeight: '500' }],
      },
      transitionDuration: {
        hover: '120ms',
        panel: '180ms',
        page: '250ms',
      },
      transitionTimingFunction: {
        default: 'ease',
      },
    },
  },
  plugins: [],
}