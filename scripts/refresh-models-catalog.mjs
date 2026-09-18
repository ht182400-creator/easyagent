#!/usr/bin/env node
/**
 * refresh-models-catalog.mjs — 自动生成 / 刷新「模型目录」
 *
 * ── 为什么需要它 ──
 * 客户端的 ModelRegistry **早已支持自动拉取**远程目录（GitHub raw + jsDelivr 兜底，
 * 24 小时缓存）。但目录文件 `models-catalog.json` 此前是**人工维护**的 ——
 * 实测其 `generatedAt` 停留在 2026-06-19，也就是说客户端每天都在自动下载一份
 * **三个月前**的目录：**"自动拉取"有了，"自动升级"并没有**。
 *
 * 本脚本补上缺失的那一环：让**目录本身**也能自动更新。
 *
 * ── 数据来源与合并策略 ──
 *   1. `PROVIDER_PRESETS`（内置预设）—— **已知模型以它为准**。
 *      它带人工校准过的元数据（上下文、价格、能力），比厂商 `/models` 返回的字段更全。
 *   2. 厂商 `/models` API（需对应 `*_API_KEY`）—— **只用于发现新模型**。
 *      厂商一发布新模型，下次刷新就会自动进目录。
 *
 *   合并规则：
 *     · 预设中已有的模型 → 保留预设元数据（不覆盖）
 *     · API 中发现、预设里没有的 → **新增**，采用保守默认值并标记 `unverified: true`
 *     · 预设中有、API 里没有的 → **保留**（厂商端点可能滞后），仅记录到 `missingFromApi`
 *
 * ── 用法 ──
 *   node scripts/refresh-models-catalog.mjs              # 重新生成并写入
 *   node scripts/refresh-models-catalog.mjs --dry-run    # 只打印差异，不写入
 *   node scripts/refresh-models-catalog.mjs --check      # 只检查新鲜度（CI 门禁用）
 *   node scripts/refresh-models-catalog.mjs --max-age 30 # 配合 --check 指定阈值（默认 30 天）
 *
 * 退出码：0 = 成功/未过期；1 = 已过期或生成失败
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_FILE = join(PROJECT_ROOT, 'models-catalog.json');
const CORE_DIST = join(PROJECT_ROOT, 'packages', 'core', 'dist', 'index.js');

/** 目录新鲜度阈值（天）—— 超过则认为需要重新生成 */
const DEFAULT_MAX_AGE_DAYS = 30;

/** 拉取厂商 /models 的超时（毫秒） */
const FETCH_TIMEOUT_MS = 15_000;

/** 新发现模型的保守默认值 */
const NEW_MODEL_DEFAULTS = {
  maxContextTokens: 32768,
  maxOutputTokens: 8192,
  supportsTools: true,
  supportsVision: false,
  pricing: { input: 0, output: 0 },
};

// ===================== 参数 =====================

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CHECK_ONLY = argv.includes('--check');
const maxAgeIdx = argv.indexOf('--max-age');
const MAX_AGE_DAYS = maxAgeIdx >= 0 ? Number(argv[maxAgeIdx + 1]) || DEFAULT_MAX_AGE_DAYS : DEFAULT_MAX_AGE_DAYS;

// ===================== 工具 =====================

/** 读取现有目录 */
function readCatalog() {
  if (!existsSync(CATALOG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CATALOG_FILE, 'utf-8'));
  } catch (err) {
    console.error(`❌ 解析现有目录失败: ${err.message}`);
    return null;
  }
}

/** 目录年龄（天） */
function ageDays(generatedAt, now = Date.now()) {
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now - t) / (24 * 60 * 60 * 1000);
}

/** semver 补丁号 +1（1.0.0 → 1.0.1） */
function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!m) return '1.0.1';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

/** 带超时地拉取厂商模型列表 */
async function fetchProviderModels(baseURL, apiKey) {
  const url = `${baseURL.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return { ok: true, ids: list.map((m) => m.id || m.name).filter(Boolean) };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, reason: err.message };
  }
}

// ===================== 主流程 =====================

async function main() {
  const current = readCatalog();

  // ── --check：仅校验新鲜度 ──
  if (CHECK_ONLY) {
    if (!current) {
      console.error('❌ 未找到 models-catalog.json');
      return 1;
    }
    const age = ageDays(current.generatedAt);
    console.log(`[models-catalog] generatedAt=${current.generatedAt}  年龄=${age.toFixed(1)} 天  阈值=${MAX_AGE_DAYS} 天`);
    if (age > MAX_AGE_DAYS) {
      console.error(
        `❌ 模型目录已过期（${age.toFixed(0)} 天未更新）—— 客户端每天都在自动下载这份旧数据，\n` +
          `   厂商的新模型不会自动出现。请运行：node scripts/refresh-models-catalog.mjs`,
      );
      return 1;
    }
    console.log('✅ 模型目录在有效期内');
    return 0;
  }

  // ── 生成：需要 core 构建产物 ──
  if (!existsSync(CORE_DIST)) {
    console.error(`❌ 未找到 core 构建产物: ${CORE_DIST}`);
    console.error('   请先构建：pnpm --filter @easyagent/core build');
    return 1;
  }

  let presets;
  try {
    const mod = await import(`file://${CORE_DIST}`);
    presets = mod.PROVIDER_PRESETS;
  } catch (err) {
    console.error(`❌ 导入 PROVIDER_PRESETS 失败: ${err.message}`);
    return 1;
  }
  if (!Array.isArray(presets) || presets.length === 0) {
    console.error('❌ PROVIDER_PRESETS 为空');
    return 1;
  }

  console.log(`[models-catalog] 基于 ${presets.length} 个内置提供商预设生成目录`);

  const providers = [];
  const stats = { added: 0, apiEnriched: 0, apiFailed: 0 };

  for (const p of presets) {
    const known = new Map((p.models || []).map((m) => [m.id, m]));
    const models = [...(p.models || [])].map((m) => ({ ...m }));

    // 尝试从厂商 API 发现新模型（需要 API Key）
    const apiKey = p.apiKeyEnv ? process.env[p.apiKeyEnv] : '';
    let missingFromApi = [];
    if (apiKey && p.baseURL && p.apiFormat === 'openai') {
      const result = await fetchProviderModels(p.baseURL, apiKey);
      if (result.ok) {
        stats.apiEnriched++;
        const apiIds = new Set(result.ids);
        for (const id of apiIds) {
          if (!known.has(id)) {
            models.push({ id, name: id, ...NEW_MODEL_DEFAULTS, unverified: true });
            stats.added++;
          }
        }
        missingFromApi = [...known.keys()].filter((id) => !apiIds.has(id));
      } else {
        stats.apiFailed++;
        console.warn(`   ⚠️  ${p.id}: 拉取 /models 失败（${result.reason}），仅使用预设数据`);
      }
    }

    providers.push({
      provider: p.id,
      providerName: p.name,
      baseURL: p.baseURL,
      apiKeyEnv: p.apiKeyEnv,
      apiFormat: p.apiFormat,
      defaultModel: p.defaultModel,
      models,
      ...(missingFromApi.length > 0 ? { missingFromApi } : {}),
    });
  }

  const next = {
    version: bumpPatch(current?.version),
    generatedAt: new Date().toISOString().replace(/(\.\d{3})Z$/, '$1Z'),
    description:
      'EasyAgent 模型目录 — 由 scripts/refresh-models-catalog.mjs 自动生成。' +
      '启动时客户端自动下载更新（远程优先，本地缓存 24h，内置数据兜底）。',
    providers,
  };

  console.log(
    `[models-catalog] 生成完毕: ${providers.length} 个提供商 / ` +
      `${providers.reduce((s, p) => s + p.models.length, 0)} 个模型` +
      `（API 新增 ${stats.added} 个， enrich ${stats.apiEnriched} 家，失败 ${stats.apiFailed} 家）`,
  );

  if (DRY_RUN) {
    console.log('\n--dry-run：未写入文件。变化摘要：');
    const before = current?.providers?.reduce((s, p) => s + (p.models?.length || 0), 0) || 0;
    const after = providers.reduce((s, p) => s + p.models.length, 0);
    console.log(`  版本: ${current?.version} → ${next.version}`);
    console.log(`  generatedAt: ${current?.generatedAt} → ${next.generatedAt}`);
    console.log(`  模型总数: ${before} → ${after}`);
    return 0;
  }

  writeFileSync(CATALOG_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  console.log(`✅ 已写入 ${CATALOG_FILE}`);
  return 0;
}

const code = await main();
console.log(`__VERIFY_STATUS__=${code === 0 ? 'PASS' : 'FAIL'}`);
process.exitCode = code;
