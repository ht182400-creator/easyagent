/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#6366f1', hover: '#4f46e5' },
        surface: {
          sidebar: 'var(--surface-sidebar)',
          hover: 'var(--surface-hover)',
          overlay: 'var(--surface-overlay)',
          raised: 'var(--surface-raised)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          focus: 'var(--border-focus)',
        },
      },
    },
  },
  plugins: [],
};
