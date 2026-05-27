import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pc: {
          obsidian: '#0A0A12',
          ink:      '#15151F',
          ink2:     '#1F1F2B',
          gold:     '#C9A961',
          goldHi:   '#E2C77A',
          goldDeep: '#8E7333',
          cream:    '#F6F2E8',
          paper:    '#FBF8F1',
          mute:     '#7A7787',
          muteDk:   '#9A95A7',
          line:     '#E8E2D2',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', '"Playfair Display"', 'Georgia', 'serif'],
        sans:  ['"SF Pro Text"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out forwards',
        'slide-in': 'slideIn 0.2s ease-out',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
