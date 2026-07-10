/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#f8f9fa',
        'sidebar-border': '#e9ecef',
        accent: '#6366f1',
      },
    },
  },
  plugins: [],
};
