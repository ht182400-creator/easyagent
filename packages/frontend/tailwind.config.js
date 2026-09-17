/**
 * Tailwind 配置 — frontend 共享包（Web 与 Desktop 的共同 UI 源）
 *
 * 【2026-09-18 修复】此前本文件把 `colors.surface / text / border` 指向
 * `var(--surface-*)` / `var(--text-*)` / `var(--border-*)`，但 `index.css` 中
 * 从未定义这些变量（它用的是 `--color-*` 前缀）。按 CSS 规范，var() 引用未定义
 * 变量时该声明会在计算值阶段被**静默丢弃**，导致 15 个语义令牌类名全部失效。
 * 同时缺少 `surface.shell` / `surface.main` 两个键，对应类名根本没被生成。
 *
 * 现统一改为引用 `tailwind.tokens.mjs` 中的共享令牌（其值指向 `--color-*` 变量），
 * 三个包（frontend / web / desktop）共用同一份定义，杜绝此类漂移。
 *
 * 校验脚本：`node scripts/verify-css-tokens.mjs`
 */
import { tokenColors } from './tailwind.tokens.mjs';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: tokenColors,
    },
  },
  plugins: [],
};
