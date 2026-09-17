/**
 * Tailwind 配置 — Desktop (Electron)
 *
 * 【2026-09-18 统一】此前本文件硬编码了一整套 zinc 色板（#09090b / #131316 / #f4f4f5 …），
 * 键虽然齐全所以桌面端显示正常，但它是**与 Web 端完全无关的第二套配色**：
 * 同一段组件代码（packages/frontend/src）在 Web 与 Desktop 上呈现不同颜色，
 * 且 `[data-theme='light']` 亮色主题在桌面端无对应色值（换肤会失效）。
 *
 * 现改为展开 `tailwind.tokens.mjs` 的共享令牌，全部指向 `index.css` 的 `--color-*`。
 * Desktop 与 Web 由此共用**同一份**设计令牌，亮暗主题也能正常跟随。
 *
 * ⚠️ 这是一次**可见的视觉变更**（zinc → 设计令牌色板）。如需回退，恢复本文件的
 * 硬编码 colors 即可；但请勿只改一半，否则两端会再次分裂。
 *
 * 校验脚本：`node scripts/verify-css-tokens.mjs`
 */
import { tokenColors, tokenFontFamily } from '../frontend/tailwind.tokens.mjs';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    // 关键：Desktop 通过 @/ alias 使用 frontend 包的所有 UI 组件，
    // Tailwind JIT 必须扫描这些文件才能生成对应的 utility 类
    '../frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: tokenColors,
      fontFamily: tokenFontFamily,
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
