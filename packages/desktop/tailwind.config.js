/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 设计令牌 - 暗色主题
        brand: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          active: '#4f46e5',
        },
        surface: {
          shell: '#09090b',
          sidebar: '#0f0f12',
          main: '#131316',
          raised: '#1a1a1f',
          overlay: '#22222a',
          hover: '#2a2a33',
        },
        text: {
          primary: '#f4f4f5',
          secondary: '#a1a1aa',
          muted: '#71717a',
        },
        border: {
          DEFAULT: '#27272a',
          subtle: '#1f1f24',
          focus: '#6366f1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-in-left': 'slideInLeft 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slideInRight 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scaleIn 150ms ease-out',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
