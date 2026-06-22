import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // lib/ holds CRM stage colour classes (retreat/dfy STAGE_META) — scan it so
    // those Tailwind classes are generated (e.g. the Lost Lead rose swatch).
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#06070A',
          900: '#0B0D12',
          800: '#12141B',
          700: '#181B24',
          600: '#22262F',
          500: '#2E323D',
          400: '#454A57',
          300: '#6B6F7C',
          200: '#9CA0AC',
          100: '#D7D9E0',
          50: '#F2F3F6',
        },
        cyan: {
          50: '#E6F8FE',
          100: '#BFEDFB',
          200: '#80DBF6',
          300: '#40C9F1',
          400: '#1FBEEC',
          500: '#00B8E6',
          600: '#0093B8',
          700: '#006E8A',
          800: '#00495C',
          900: '#00252E',
        },
        /* Fear / urgency — restrained, editorial red */
        danger: {
          50: '#FDECEC',
          100: '#FACECE',
          200: '#F5A3A3',
          300: '#EE7373',
          400: '#E14848',
          500: '#D52828',
          600: '#B61E1E',
          700: '#8F1717',
          800: '#5E1010',
          900: '#330808',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-instrument)', 'Georgia', 'serif'],
        display: ['var(--font-orbitron)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 80px -20px rgba(0,184,230,0.30)',
        'glow-sm': '0 0 32px -10px rgba(0,184,230,0.25)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(ellipse at center, rgba(0,184,230,0.05) 0%, transparent 60%)',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
