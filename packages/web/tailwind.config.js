/**
 * Tailwind 配置 — Web 壳
 *
 * 【2026-09-18 修复】此前本文件只定义了 `surface` 的部分键（DEFAULT/hover/container/
 * lowest/raised）且**完全没有 text / border 命名空间**，也没有 shell / sidebar / main /
 * overlay。而组件（packages/frontend/src）实际书写的是：
 *   bg-surface-shell / bg-surface-main / bg-surface-sidebar / bg-surface-overlay /
 *   text-text-primary / text-text-secondary / text-text-muted /
 *   border-border-subtle / border-border-focus
 * 这些类名在本配置下**根本不会被生成** → Web 端大面积丢背景色/文字色/边框色，
 * 而 Desktop 因为用了另一份"键齐全"的硬编码配置所以看起来正常。
 *
 * 现改为直接展开 `tailwind.tokens.mjs` 的共享令牌（指向 index.css 的 --color-* 变量），
 * 与 Desktop 保持完全一致的视觉表现与单一真源。
 *
 * 校验脚本：`node scripts/verify-css-tokens.mjs`
 */
import { tokenColors, tokenFontFamily, tokenFontSize } from '../frontend/tailwind.tokens.mjs';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // 关键：Web 复用 frontend 包的全部 UI 组件，Tailwind JIT 必须扫描它们
    '../frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  // 亮色主题由 index.css 的 [data-theme='light'] 驱动；默认（无 data-theme）即为暗色
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: tokenFontFamily,
      fontSize: tokenFontSize,
      colors: {
        // 保留历史调色板（组件中可能以 primary-500 / accent-400 等形式引用）
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#3b0764',
        },
        // 共享设计令牌（surface / text / border / brand / 语义色）
        ...tokenColors,
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      borderRadius: {
        '2xl': '20px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s var(--ease-out-expo)',
        'scale-in': 'scaleIn 0.2s var(--ease-out-back)',
        shimmer: 'shimmer 2s infinite',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
};
