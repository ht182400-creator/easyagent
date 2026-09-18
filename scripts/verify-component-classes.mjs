#!/usr/bin/env node
/**
 * verify-component-classes.mjs — 校验「源码里写的自定义组件类名」确实有定义
 *
 * ── 为什么需要它 ──
 * 本仓库已**三次**踩到同一类病灶：**引用了不存在的定义，且不报错**。
 *
 * | 时间 | 现象 | 后果 |
 * |------|------|------|
 * | P0-5 | `tailwind.config.js` 引用未定义的 CSS 变量 | 样式静默失效，被父级色兜底掩盖 |
 * | v0.6.29 | `PluginsMarket` 用了 `prose prose-invert`，但项目未装 `@tailwindcss/typography` | README 长期无排版 |
 * | v0.6.36 | `Providers.tsx`/`Sessions.tsx` 用了 `badge-green`/`badge-blue`/`badge-yellow`，CSS 里只有 `badge-success/warning/error/info/neutral` | 6 处徽章**无样式裸奔** |
 *
 * 共同点：写错类名**不会报错**，只会"看起来有点不对"，肉眼极易放过。
 * `verify-css-tokens.mjs` 只覆盖 Tailwind 令牌类名，不覆盖 `.badge-*` 这类
 * **在 index.css 中手写的组件类** —— 本脚本补的就是这个缺口。
 *
 * ── 判定规则 ──
 * 对每个「项目组件类家族」（见 COMPONENT_FAMILIES）：
 *   源码中出现的 `<家族>-*` 类名，必须能在样式文件中找到定义。
 *
 * ⚠️ 为什么用**显式家族列表**而不是从 CSS 自动派生前缀：
 *    自动派生会把 Tailwind 自身的命名空间也算进来（CSS 里定义了 `.overflow-overlay`，
 *    就会去校验源码里的 `overflow-hidden`、`overflow-y-auto` …… 全是误报）。
 *    因此这里只登记**确定由本项目手写维护**的家族。
 *
 * **新增组件类家族时，必须把家族名加进 COMPONENT_FAMILIES**，否则该家族不受保护。
 *
 * ── 用法 ──
 *   node scripts/verify-component-classes.mjs            # 校验（失败退出码 1）
 *   node scripts/verify-component-classes.mjs --quiet    # 仅输出结论
 *
 * 退出码：0 = 通过；1 = 存在未定义的组件类
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');

/**
 * 受保护的项目组件类家族（前缀）
 *
 * 只放**本项目手写维护**、且不会与 Tailwind 命名空间冲突的家族。
 * 判定方式是从类名里取第一段（`badge-success` → `badge`）。
 */
const COMPONENT_FAMILIES = [
  'badge',
  'btn',
  'tool-call',
  'tool-header',
  'chat-bubble',
  'connection-dot',
  'pulse-dot',
  'typing-dot',
  'markdown-body',
];

/** 样式文件（自定义组件类的定义处） */
const STYLE_FILES = [
  'packages/frontend/src/styles/index.css',
  'packages/web/src/styles/index.css',
  'packages/desktop/src/styles/index.css',
];

/** 需要扫描的源码根目录 */
const SOURCE_ROOTS = [
  'packages/frontend/src',
  'packages/web/src',
  'packages/desktop/src',
];

// ===================== 工具 =====================

/** 递归收集指定扩展名的文件 */
function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // 目录不存在则跳过（web/desktop 可能没有独立 src）
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      collectFiles(full, out);
    } else if (/\.(tsx?|jsx?|html)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** 从样式文件中提取所有已定义的类名 */
function collectDefinedClasses() {
  const defined = new Set();
  for (const rel of STYLE_FILES) {
    let css;
    try {
      css = readFileSync(join(PROJECT_ROOT, rel), 'utf-8');
    } catch {
      continue; // 该包没有样式文件
    }
    // 匹配 `.class-name` 形式的类选择器定义
    for (const m of css.matchAll(/\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g)) {
      defined.add(m[1]);
    }
  }
  return defined;
}

/**
 * 从源码文本中提取「本项目组件类」的使用
 *
 * 只在 **className / class 字符串字面量** 里找，避免把注释、
 * 变量名、文档示例误判成类名使用。
 *
 * @param text - 源码内容
 * @returns 命中的类名集合
 */
function extractUsedComponentClasses(text) {
  const used = new Set();
  // 抓取 className="..." / class="..." / className={`...`} 里的内容
  const attrRe = /(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{['"]([^'"]*)['"]\})/g;
  for (const m of text.matchAll(attrRe)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    // 从字面量里切出候选类名（模板串中的 ${...} 会被切碎，不影响家族匹配）
    for (const token of raw.split(/[\s"'`{}()?:,]+/)) {
      if (!token) continue;
      for (const family of COMPONENT_FAMILIES) {
        if (token === family || token.startsWith(`${family}-`)) {
          used.add(token);
        }
      }
    }
  }
  return used;
}

// ===================== 主流程 =====================

function main() {
  const defined = collectDefinedClasses();
  if (defined.size === 0) {
    console.error('❌ 未能从样式文件中解析出任何类名 —— 检查 STYLE_FILES 路径是否正确');
    console.log('__VERIFY_STATUS__=FAIL');
    return 1;
  }

  /** 类名 → 使用它的文件列表 */
  const usage = new Map();
  const files = SOURCE_ROOTS.flatMap((r) => collectFiles(join(PROJECT_ROOT, r)));

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const cls of extractUsedComponentClasses(text)) {
      if (!usage.has(cls)) usage.set(cls, []);
      usage.get(cls).push(file.replace(`${PROJECT_ROOT}${process.platform === 'win32' ? '\\' : '/'}`, ''));
    }
  }

  // 找出「被使用但未定义」的类
  const missing = [...usage.entries()]
    .filter(([cls]) => !defined.has(cls))
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (!QUIET) {
    console.log(`[verify-component-classes] 样式文件中已定义类名: ${defined.size} 个`);
    console.log(`[verify-component-classes] 受保护家族: ${COMPONENT_FAMILIES.join(', ')}`);
    console.log(`[verify-component-classes] 扫描源码文件: ${files.length} 个`);
    console.log(`[verify-component-classes] 组件类使用点: ${usage.size} 个不同类名`);
  }

  if (missing.length === 0) {
    console.log('✅ 组件类名一致性校验通过（无未定义引用）');
    console.log('__VERIFY_STATUS__=PASS');
    return 0;
  }

  console.error(`❌ 发现 ${missing.length} 个**未定义**的组件类名（会静默失效、无任何报错）：`);
  for (const [cls, filesUsing] of missing) {
    console.error(`   · .${cls}`);
    for (const f of [...new Set(filesUsing)].slice(0, 3)) {
      console.error(`       ${f}`);
    }
  }
  console.error('');
  console.error('   修复：改用 styles/index.css 中已存在的类名，或在该文件里补上定义。');
  console.error('   （已定义的徽章类为 badge-success / badge-warning / badge-error / badge-info / badge-neutral）');
  console.log('__VERIFY_STATUS__=FAIL');
  return 1;
}

const code = main();
process.exitCode = code;
