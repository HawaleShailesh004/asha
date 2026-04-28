/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Dark theme palette ──────────────────────────────────────────
        surface: {
          DEFAULT: '#111620',
          '2':     '#161c28',
          '3':     '#1c2333',
        },
        teal:    { DEFAULT: '#00d4a0', dim: 'rgba(0,212,160,0.12)' },
        ink:     '#e8eaf0',
        muted:   '#8892a4',
        ghost:   '#4a5568',

        // ── Clinical light palette ──────────────────────────────────────
        // Prefix: cl-
        'cl-bg':       '#f8fafc',
        'cl-surface':  '#ffffff',
        'cl-surface2': '#f1f5f9',
        'cl-border':   '#e2e8f0',
        'cl-text':     '#0f172a',
        'cl-text2':    '#334155',
        'cl-text3':    '#64748b',
        'cl-text4':    '#94a3b8',

        // Clinical brand (forest green, accessible on white)
        'cl-primary': {
          DEFAULT: '#166534',
          mid:     '#15803d',
          lt:      '#dcfce7',
          bg:      '#f0fdf4',
        },

        // Clinical risk tiers (WCAG AA on white bg)
        'cl-high':     { DEFAULT: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
        'cl-elevated': { DEFAULT: '#d97706', bg: '#fffbeb', border: '#fde68a' },
        'cl-low':      { DEFAULT: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
        'cl-blue':     { DEFAULT: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },

        // ── Risk aliases (dark theme) ──────────────────────────────────
        high:     { DEFAULT: '#ff4757', dim: 'rgba(255,71,87,0.12)' },
        elevated: { DEFAULT: '#ffa502', dim: 'rgba(255,165,2,0.12)'  },
        low:      { DEFAULT: '#2ed573', dim: 'rgba(46,213,115,0.10)' },
      },

      fontFamily: {
        sans:  ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono:  ['DM Mono', 'Courier New', 'monospace'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },

      boxShadow: {
        // Clinical shadows (subtle, professional)
        'cl-sm': '0 1px 2px 0 rgba(15,23,42,0.05)',
        'cl':    '0 1px 3px 0 rgba(15,23,42,0.08), 0 1px 2px -1px rgba(15,23,42,0.04)',
        'cl-md': '0 4px 6px -1px rgba(15,23,42,0.07), 0 2px 4px -2px rgba(15,23,42,0.05)',
        'cl-lg': '0 10px 15px -3px rgba(15,23,42,0.08), 0 4px 6px -4px rgba(15,23,42,0.04)',
        'cl-xl': '0 20px 25px -5px rgba(15,23,42,0.08), 0 8px 10px -6px rgba(15,23,42,0.04)',
        // Dark shadows
        'dark':  '0 4px 20px rgba(0,0,0,0.3)',
        'dark-xl':'0 8px 32px rgba(0,0,0,0.4)',
      },

      borderRadius: {
        'xl':  '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '28px',
      },

      // Clinical spacing
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112':'28rem',
        '128':'32rem',
      },

      animation: {
        'cl-fade-up':  'cl-fadeUp 0.3s ease-out both',
        'cl-shimmer':  'cl-shimmer 1.6s ease-in-out infinite',
        'cl-urgent':   'urgentPulse 2.5s ease-in-out infinite',
        'fade-up':     'fadeUp 0.35s ease-out both',
        'slide-in':    'slideIn 0.4s cubic-bezier(0.22,1,0.36,1)',
        'live-dot':    'pulseDot 2s ease-in-out infinite',
        'bounce-dots': 'bounce 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}