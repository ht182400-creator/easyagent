/**
 * Markdown 渲染与安全消毒（统一出口）
 *
 * ── 为什么废弃原先的自研正则渲染器 ──
 * `components/Chat/MessageList.tsx` 里曾有一个 40 余行的正则拼字符串实现，存在两类问题：
 *
 *   **能力缺失**：不支持表格、有序列表、嵌套列表、代码块高亮 —— 对一个编程助手来说，
 *               AI 输出的大段代码/表格根本没法看。
 *   **安全缺口（严重）**：
 *     ① 只转义了 `& < >`，**没转义 `"`** → 链接的 `href="$2"` 可被 `" onmouseover=...` 挣脱属性；
 *     ② **`javascript:` / `data:` 等 URI 完全没过滤** → `[click](javascript:alert(1))` 直接可执行。
 *
 * 本模块用成熟的 `markdown-it`（`html:false`，原始 HTML 一律转义）+ 链接协议白名单替换掉它，
 * 并为「远程不可信 HTML」（如 GitHub README）提供 DOMPurify 消毒入口。
 *
 * ── 唯一渲染路径 ──
 *
 * 本模块只有 {@link renderMarkdown} 一条渲染路径，**所有** Markdown 内容都走它：
 *   · AI 回复 / 流式输出 / 知识库文档
 *   · GitHub 插件市场 README —— 服务端已改为取**原始 Markdown**
 *     （`Accept: application/vnd.github.raw`，见 `server/src/utils/githubClient.ts`）
 *
 * ⚠️ 曾经存在第二条路径 `sanitizeHtml()`（DOMPurify），用于消毒服务端返回的远程 HTML。
 * 现已被**删除**：与其"取回不可信 HTML 再过滤"，不如"根本不引入不可信 HTML"。
 * 若将来确实出现无法避免的远程 HTML 渲染场景，请恢复该能力并配套
 * `__tests__/markdown.test.ts` 中的消毒回归用例，并使用 jsdom 环境
 * （DOMPurify 在 happy-dom 下行为不可靠，详见测试文件头部注释）。
 *
 * @module utils/markdown
 */

import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';

// 代码高亮主题（浅色/深色由 highlight.js 提供，这里选与暗色 UI 匹配的深色主题）
// 从 TS 引入而非在 CSS 里 @import：Vite 原生支持，vitest（`css: false`）会自动忽略。
import 'highlight.js/styles/github-dark.css';

// ===================== 代码高亮语言集 =====================

// 只注册常用语言以控制包体（highlight.js 全量注册会显著增大产物）。
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import diff from 'highlight.js/lib/languages/diff';
import ini from 'highlight.js/lib/languages/ini';

/** 已注册的语言定义表 */
const LANGUAGES: Record<string, unknown> = {
  javascript,
  typescript,
  python,
  bash,
  json,
  css,
  xml,
  markdown,
  yaml,
  sql,
  java,
  go,
  rust,
  cpp,
  diff,
  ini,
};

for (const [name, def] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, def as Parameters<typeof hljs.registerLanguage>[1]);
}

/**
 * 代码块常用别名 → 已注册语言
 *
 * highlight.js 的语言定义自带部分别名，但 AI 生成的代码围栏标签极其随意
 * （`js` / `node` / `sh` / `py` / `html` …），这里补齐高频映射。
 */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  node: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  html: 'xml',
  vue: 'xml',
  svg: 'xml',
  c: 'cpp',
  'c++': 'cpp',
  golang: 'go',
  rs: 'rust',
  properties: 'ini',
  toml: 'ini',
  env: 'ini',
};

/** 解析围栏语言标签，返回 highlight.js 支持的语言名；不支持则返回 null */
function resolveLanguage(lang: string): string | null {
  const key = lang.toLowerCase().trim();
  if (!key) return null;
  if (hljs.getLanguage(key)) return key;
  const alias = LANG_ALIASES[key];
  if (alias && hljs.getLanguage(alias)) return alias;
  return null;
}

// ===================== 安全：链接协议白名单 =====================

/**
 * 允许的 URL 协议（小写，不含冒号）
 *
 * `javascript:` / `data:` / `vbscript:` 一律拒绝 —— 这是原先自研渲染器缺失的关键防护。
 */
const ALLOWED_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * 校验链接是否安全
 *
 * 放行三类：① 协议白名单内的绝对 URL；② 相对路径 / 锚点（不以 `scheme:` 开头即视为安全）；
 * 其余一律拒绝。
 *
 * @param url - markdown-it 解析出的原始 URL
 * @returns true 表示允许渲染为链接
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  // 相对路径与锚点：不含冒号，或冒号出现在首个 `/`、`?`、`#` 之后（如 `foo/bar:baz`）
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!schemeMatch) return true;
  return ALLOWED_PROTOCOLS.has(schemeMatch[1].toLowerCase());
}

// ===================== Markdown 渲染器 =====================

/**
 * 单例 MarkdownIt 实例
 *
 * 关键配置：
 *   · `html: false` —— **不渲染原始 HTML**（这是防 XSS 的根本措施）
 *   · `linkify: true` —— 自动识别裸链接
 *   · `breaks: false` —— 保留标准 Markdown 换行语义（AI 输出多为标准 Markdown）
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

md.validateLink = isSafeUrl;

/** 代码高亮钩子：失败时返回空串，由 markdown-it 兜底输出转义后的纯文本 */
md.options.highlight = (code: string, lang: string): string => {
  const resolved = resolveLanguage(lang || '');
  if (!resolved) return '';
  try {
    const result = hljs.highlight(code, { language: resolved, ignoreIllegals: true });
    return `<pre class="hljs" data-lang="${escapeAttr(lang)}"><code>${result.value}</code></pre>`;
  } catch {
    // 高亮异常不应让整条消息渲染失败 —— 降级为 markdown-it 的默认转义输出
    return '';
  }
};

// 外链统一带 target/rel（沿用旧渲染器行为，并补上 noreferrer）
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/** HTML 属性值转义（用于 data-lang 这类我们自行拼接的属性） */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===================== 对外 API =====================

/**
 * 将 Markdown 文本渲染为安全 HTML
 *
 * 安全保证：
 *   ① 原始 HTML 被转义（`html: false`）—— `<script>` 只会显示为文本；
 *   ② 链接协议白名单（见 {@link isSafeUrl}）—— `javascript:` 不会被渲染成 href；
 *   ③ 代码内容由 highlight.js 转义。
 *
 * @param text - Markdown 原文（可为 null/undefined）
 * @returns 可直接用于 `dangerouslySetInnerHTML` 的 HTML
 */
export function renderMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  try {
    return md.render(text);
  } catch (err) {
    // 渲染异常时宁可不显示，也不能把未处理的原文塞进 innerHTML
    // eslint-disable-next-line no-console
    console.error('[markdown] 渲染失败:', err);
    return '';
  }
}

/**
 * Markdown 中含 CJK 的字数估算（供 UI 显示用）
 *
 * 本项目多处需要展示文档规模，这里提供统一口径：中日韩字符按 1 计，避免按空白分词低估。
 *
 * @param text - 原文
 */
export function estimateWordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return Array.from(text).length;
}
