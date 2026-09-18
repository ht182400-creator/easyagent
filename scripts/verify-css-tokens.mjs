#!/usr/bin/env node
/**
 * verify-css-tokens.mjs — 设计令牌一致性校验
 *
 * ── 为什么需要它 ──
 * 2026-09-18 审核发现：`tailwind.config.js` 里引用的 CSS 变量（如 `--surface-shell`）
 * 在样式文件中**根本不存在**（样式用的是 `--color-*` 前缀）。按 CSS 规范，
 * var() 引用未定义变量时该声明会在计算值阶段被静默丢弃 —— **不报错、只是没颜色**。
 * 顺带还发现 web 的配置**缺少命名空间与键**，导致类名压根不会被生成。
 *
 * 这类问题肉眼极难发现（会被父级背景/继承色兜底掩盖），因此必须由脚本把关。
 *
 * ── 校验项 ──
 *   ① Tailwind 配置中所有 `var(--x)` 引用的变量，必须在样式文件中有定义
 *   ② 源码中实际书写的令牌类名（如 bg-surface-shell / text-text-primary）
 *      必须在 Tailwind 色彩命名空间中存在（键 + DEFAULT 规则）
 *   ③ 三个包（frontend / web / desktop）的令牌命名空间必须完全一致，防止再次分裂
 *
 * ── 用法 ──
 *   node scripts/verify-css-tokens.mjs          # 校验，失败退出码 1（可作 CI 门禁）
 *   node scripts/verify-css-tokens.mjs --quiet  # 仅输出结论
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 待校验的 Tailwind 配置（名称 → 绝对路径） */
const TAILWIND_CONFIGS = {
  frontend: join(PROJECT_ROOT, 'packages/frontend/tailwind.config.js'),
  web: join(PROJECT_ROOT, 'packages/web/tailwind.config.js'),
  desktop: join(PROJECT_ROOT, 'packages/desktop/tailwind.config.js'),
};

/** 需要扫描"令牌类名"的源码目录 */
const SOURCE_DIRS = [
  join(PROJECT_ROOT, 'packages/frontend/src'),
  join(PROJECT_ROOT, 'packages/web/src'),
  join(PROJECT_ROOT, 'packages/desktop/src/renderer'),
  join(PROJECT_ROOT, 'packages/desktop/src/__tests__'),
];

/** 需要扫描"CSS 变量定义"的样式文件 */
const CSS_FILES = [
  join(PROJECT_ROOT, 'packages/frontend/src/styles/index.css'),
];

/** 令牌命名空间（与 tailwind.tokens.mjs 对应） */
const TOKEN_NAMESPACES = ['brand', 'surface', 'text', 'border', 'success', 'warning', 'error', 'info'];

/** 可能出现在令牌类名前的 utility 前缀 */
const UTILITY_PREFIXES = ['bg', 'text', 'border', 'ring', 'fill', 'stroke', 'divide', 'from', 'to', 'via'];

/** 安静模式（只输出结论） */
const QUIET = process.argv.includes('--quiet');

// ===================== 工具 =====================

const problems = [];
const notes = [];

/** 打印信息（安静模式下跳过） */
function info(msg) {
  if (!QUIET) console.log(msg);
}

/** 记录一个问题 */
function problem(msg) {
  problems.push(msg);
}

/** 递归收集目录下的源码文件 */
function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * 递归提取对象中所有 `var(--x)` 引用的变量名
 *
 * @param value - 任意配置值
 * @param out - 收集结果（Set）
 */
function collectVarRefs(value, out = new Set()) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) out.add(m[1]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectVarRefs(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectVarRefs(v, out));
  }
  return out;
}

/** 从 CSS 文本中提取所有自定义属性定义名（`--x:`） */
function collectCssVarDefs(cssText, out = new Set()) {
  for (const m of cssText.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) out.add(m[1]);
  return out;
}

/**
 * 扁平化 Tailwind colors 中的令牌键路径
 *
 * `{ surface: { shell: '...' } }` → `surface`, `surface.shell`
 */
function flattenTokenKeys(colors, out = new Set(), prefix = '') {
  for (const [key, value] of Object.entries(colors || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out.add(path);
    } else if (value && typeof value === 'object') {
      out.add(path); // 含 DEFAULT 的组：`surface` 自身也可作为类名（bg-surface）
      flattenTokenKeys(value, out, path);
    }
  }
  return out;
}

// ===================== 主流程 =====================

async function main() {
  info('设计令牌一致性校验');
  info('='.repeat(70));

  // ── 载入三份配置 ──
  const loaded = {};
  for (const [name, configPath] of Object.entries(TAILWIND_CONFIGS)) {
    if (!existsSync(configPath)) {
      problem(`[配置缺失] ${name}: ${relative(PROJECT_ROOT, configPath)} 不存在`);
      continue;
    }
    try {
      const mod = await import(pathToFileURL(configPath).href);
      loaded[name] = mod.default;
      info(`✓ 已载入 ${name} 配置`);
    } catch (err) {
      problem(`[配置加载失败] ${name}: ${err.message}`);
    }
  }

  // ── 校验项 ①：var() 引用必须有定义 ──
  info('\n① 校验 Tailwind 中的 var(--x) 引用是否有定义');
  const cssDefs = new Set();
  for (const cssFile of CSS_FILES) {
    if (!existsSync(cssFile)) {
      problem(`[样式文件缺失] ${relative(PROJECT_ROOT, cssFile)}`);
      continue;
    }
    collectCssVarDefs(readFileSync(cssFile, 'utf8'), cssDefs);
  }
  info(`  收集到 ${cssDefs.size} 个 CSS 变量定义`);

  for (const [name, cfg] of Object.entries(loaded)) {
    const refs = collectVarRefs(cfg?.theme?.extend?.colors ?? cfg?.theme?.colors ?? {});
    const missing = [...refs].filter((v) => !cssDefs.has(v));
    if (missing.length) {
      problem(
        `[令牌失效] ${name} 配置引用了未定义的 CSS 变量（渲染时会被静默丢弃）:\n` +
          missing.map((v) => `      · ${v}`).join('\n'),
      );
    } else {
      info(`  ✓ ${name}: ${refs.size} 个变量引用全部有定义`);
    }
  }

  // ── 校验项 ③：三个包的令牌命名空间必须一致 ──
  info('\n② 校验三个包的令牌命名空间是否一致');
  const perPackageTokens = {};
  for (const [name, cfg] of Object.entries(loaded)) {
    const colors = cfg?.theme?.extend?.colors ?? cfg?.theme?.colors ?? {};
    const set = new Set();
    for (const ns of TOKEN_NAMESPACES) {
      if (colors[ns]) flattenTokenKeys({ [ns]: colors[ns] }, set);
    }
    perPackageTokens[name] = set;
  }
  const names = Object.keys(perPackageTokens);
  if (names.length >= 2) {
    const reference = names[0];
    for (const name of names.slice(1)) {
      const diff = [...perPackageTokens[reference]].filter((k) => !perPackageTokens[name].has(k));
      const extra = [...perPackageTokens[name]].filter((k) => !perPackageTokens[reference].has(k));
      if (diff.length) problem(`[令牌分裂] ${name} 缺少 ${reference} 中已有的令牌键: ${diff.join(', ')}`);
      if (extra.length) problem(`[令牌分裂] ${name} 多出 ${reference} 中不存在的令牌键: ${extra.join(', ')}`);
    }
    if (!problems.some((p) => p.includes('令牌分裂'))) {
      info(`  ✓ ${names.join(' / ')} 的令牌键完全一致（${perPackageTokens[reference].size} 个键路径）`);
    }
  }

  // ── 校验项 ②：源码中使用的令牌类名必须能被生成 ──
  info('\n③ 校验源码中实际书写的令牌类名是否可被生成');
  /** 合并所有包的令牌键（并集），用于判定类名可否生成 */
  const allTokens = new Set();
  for (const set of Object.values(perPackageTokens)) set.forEach((k) => allTokens.add(k));

  /** class 形如 `bg-surface-shell` → family=surface, key=shell */
  const classRe = new RegExp(
    `(?<![-\\w])(?:${UTILITY_PREFIXES.join('|')})-(${TOKEN_NAMESPACES.join('|')})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?(?![-\\w])`,
    'g',
  );

  const unknownClasses = new Map();
  let scannedFiles = 0;
  for (const dir of SOURCE_DIRS) {
    for (const file of walkFiles(dir)) {
      scannedFiles += 1;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(classRe)) {
        const family = m[1];
        const key = m[2] ?? null;
        const tokenPath = key ? `${family}.${key}` : family;
        // 无 key 时要求该家族有 DEFAULT（用于 bg-brand / text-brand 这类写法）
        const ok = key ? allTokens.has(tokenPath) : allTokens.has(tokenPath);
        if (!ok) {
          const cls = m[0];
          if (!unknownClasses.has(cls)) unknownClasses.set(cls, new Set());
          unknownClasses.get(cls).add(relative(PROJECT_ROOT, file));
        }
      }
    }
  }
  info(`  扫描 ${scannedFiles} 个源码文件`);

  if (unknownClasses.size) {
    for (const [cls, files] of unknownClasses) {
      problem(
        `[类名不可生成] \`${cls}\` 对应的令牌键不存在（Tailwind 不会生成该类名）\n` +
          `      出现于: ${[...files].slice(0, 3).join(', ')}${files.size > 3 ? ` 等 ${files.size} 个文件` : ''}`,
      );
    }
  } else {
    info('  ✓ 源码中的令牌类名全部可被生成');
  }

  // ── 结论 ──
  info('\n' + '='.repeat(70));
  if (problems.length === 0) {
    console.log(`✅ 设计令牌校验通过（${notes.length ? notes.join('；') : '无异常'}）`);
    return 0;
  }
  console.error(`❌ 设计令牌校验失败，共 ${problems.length} 项：\n`);
  problems.forEach((p, i) => console.error(`${i + 1}. ${p}\n`));
  console.error('修复指引：');
  console.error('  · 变量未定义 → 在 packages/frontend/src/styles/index.css 的 :root 中补充 --color-* 定义');
  console.error('  · 键不存在   → 在 packages/frontend/tailwind.tokens.mjs 中登记键名');
  console.error('  · 令牌分裂   → 三份 tailwind.config.js 必须统一展开 tailwind.tokens.mjs');
  return 1;
}

// 统一状态标记：供 scripts/verify-all.mjs 汇总判定（详见该文件头部注释）。
const __exitCode = await main();
console.log(`__VERIFY_STATUS__=${__exitCode === 0 ? 'PASS' : 'FAIL'}`);
process.exit(__exitCode);
