/**
 * 设计令牌 — Tailwind 色彩命名空间的**唯一真源**
 *
 * ── 存在意义 ──
 * 本项目有三个 Tailwind 配置（frontend / web / desktop），它们扫描的是**同一套组件源码**
 * （`packages/frontend/src/**`）。此前三份配置各自维护颜色：
 *   · frontend：引用 `--surface-*` / `--text-*` / `--border-*` 变量，但这些变量在 CSS 中
 *     **从未定义**（CSS 用的是 `--color-*` 前缀）→ 15 个令牌类名全部静默失效；
 *   · web：只定义了 surface 的部分键，且**缺少 shell / sidebar / main / overlay
 *     以及整个 text / border 命名空间** → `bg-surface-shell`、`text-text-primary`
 *     这类类名根本没被生成；
 *   · desktop：硬编码一份 zinc 色板（键齐全）→ 只有桌面端显示正常。
 *
 * 结果：同一段组件代码在 Desktop 与 Web 上呈现完全不同的配色，且 Web 端大面积丢色。
 *
 * ── 本文件的做法 ──
 * 全部指向 `packages/frontend/src/styles/index.css` 中定义的 `--color-*` CSS 变量。
 * 好处：
 *   1. **单一真源**：色值只存在于 CSS 一处，改主题只改 CSS；
 *   2. **亮暗主题自动跟随**：`[data-theme='light']` 覆盖同一批变量，无需在 JS 里重复；
 *   3. **三个包行为一致**：Desktop 与 Web 渲染同一套组件得到同一套颜色。
 *
 * ⚠️ 新增令牌时必须同时满足两处，否则类名会静默失效（无报错、只是没颜色）：
 *   1. 在 `index.css` 的 `:root` 中定义对应的 `--color-*` 变量；
 *   2. 在本文件的对应命名空间中登记键名。
 *   自动化校验脚本：`node scripts/verify-css-tokens.mjs`（已接入 CI）。
 *
 * 命名规则（Tailwind 会按 `命名空间-键` 拼接类名）：
 *   colors.surface.shell  → `bg-surface-shell` / `text-surface-shell` / `border-surface-shell`
 *   colors.text.primary   → `text-text-primary`  ← 注意是双写 text（组件中确实如此书写）
 *   colors.border.subtle  → `border-border-subtle`
 */

/** 语义化色彩命名空间（值统一为 CSS 变量引用，勿写死色值） */
export const tokenColors = {
  /** 品牌色 */
  brand: {
    DEFAULT: 'var(--color-brand)',
    hover: 'var(--color-brand-hover)',
    active: 'var(--color-brand-active)',
    light: 'var(--color-brand-light)',
  },

  /** 表面层级：shell(最外层) > main(内容区) > sidebar(侧栏) > raised(抬升面板) > overlay(浮层) */
  surface: {
    DEFAULT: 'var(--color-surface)',
    shell: 'var(--color-surface-shell)',
    sidebar: 'var(--color-surface-sidebar)',
    main: 'var(--color-surface-main)',
    raised: 'var(--color-surface-raised)',
    overlay: 'var(--color-surface-overlay)',
    hover: 'var(--color-surface-hover)',
    container: 'var(--color-surface-container)',
    lowest: 'var(--color-surface-container-lowest)',
  },

  /** 文字层级 */
  text: {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    muted: 'var(--color-text-muted)',
    disabled: 'var(--color-text-disabled)',
  },

  /** 边框层级 */
  border: {
    DEFAULT: 'var(--color-border)',
    subtle: 'var(--color-border-subtle)',
    focus: 'var(--color-border-focus)',
    hover: 'var(--color-border-hover)',
  },

  /** 语义色 */
  success: {
    DEFAULT: 'var(--color-success)',
    light: 'var(--color-success-light)',
  },
  warning: {
    DEFAULT: 'var(--color-warning)',
    light: 'var(--color-warning-light)',
  },
  error: {
    DEFAULT: 'var(--color-error)',
    light: 'var(--color-error-light)',
  },
  info: {
    DEFAULT: 'var(--color-info)',
    light: 'var(--color-info-light)',
  },
};

/** 三个包共用的字体栈（保持平台间一致） */
export const tokenFontFamily = {
  sans: [
    "'Inter'",
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    "'Segoe UI'",
    "'PingFang SC'",
    "'Microsoft YaHei'",
    "'Hiragino Sans GB'",
    "'Helvetica Neue'",
    'Arial',
    'sans-serif',
  ],
  mono: [
    "'JetBrains Mono'",
    "'Fira Code'",
    "'Cascadia Code'",
    "'Consolas'",
    "'Source Code Pro'",
    "'Courier New'",
    'monospace',
  ],
};

/** 三个包共用的字号阶梯（与 index.css 的 --text-* 保持一致） */
export const tokenFontSize = {
  '2xs': ['0.6875rem', { lineHeight: '1rem' }],
  sm: ['0.8125rem', { lineHeight: '1.25rem' }],
  base: ['0.9375rem', { lineHeight: '1.5rem' }],
};

export default { tokenColors, tokenFontFamily, tokenFontSize };
