#!/usr/bin/env node
/**
 * verify-catalog-sources.mjs — 端到端验证「模型目录自定义源」真的生效
 *
 * ── 为什么需要它 ──
 * 内置的两个目录分发源（GitHub raw / jsDelivr）在部分网络环境下**都不可达**。
 * 为此 ModelRegistry 支持按优先级尝试：自定义 URL → 本地文件 → 额外镜像 →
 * GitHub raw → jsDelivr → 本地缓存 → 应用内置。
 *
 * 这条链路光靠单元测试证明不了 —— 必须**真实启动服务**、真的把目录换掉，
 * 再确认 `/api/providers/catalog/status` 如实报告了来源。
 *
 * 本脚本做的就是这件事：用一个特征鲜明的自定义目录启动服务，验证
 * `version` 与 `source` 都来自该文件。
 *
 * ── 安全性 ──
 * 会临时覆盖 `~/.easyagent/models-catalog.json`（否则可能命中原缓存而绕过验证），
 * 因此脚本内做了**备份与还原**，异常退出也会尽量还原。
 *
 * ── 用法 ──
 *   node scripts/verify-catalog-sources.mjs
 *   （需先构建：pnpm --filter @easyagent/server build）
 *
 * 退出码：0 = 通过；1 = 失败
 */

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = 'packages/server/dist/index.js';
const PORT = Number(process.env.PROBE_PORT || 3458);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_WAIT_MS = 7_000;

const CACHE_FILE = join(homedir(), '.easyagent', 'models-catalog.json');
const CACHE_BAK = `${CACHE_FILE}.verify-bak`;
const TEMP_CATALOG = join(PROJECT_ROOT, 'temp', '_custom-catalog.json');

/** 特征值：出现它即证明数据来自我们注入的文件 */
const MARKER_VERSION = '9.9.9-custom-source-probe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===================== 主流程 =====================

async function main() {
  if (!existsSync(join(PROJECT_ROOT, SERVER_ENTRY))) {
    console.error(`❌ 未找到 ${SERVER_ENTRY}，请先构建 server`);
    return 1;
  }

  const hadCache = existsSync(CACHE_FILE);
  if (hadCache) copyFileSync(CACHE_FILE, CACHE_BAK);

  writeFileSync(
    TEMP_CATALOG,
    `${JSON.stringify(
      {
        version: MARKER_VERSION,
        generatedAt: new Date().toISOString(),
        description: '自定义源验证用目录',
        providers: [
          {
            provider: 'deepseek',
            providerName: 'DeepSeek',
            baseURL: 'https://api.deepseek.com/v1',
            apiKeyEnv: 'DEEPSEEK_API_KEY',
            apiFormat: 'openai',
            defaultModel: 'probe-model',
            models: [
              {
                id: 'probe-model',
                name: 'Probe',
                maxContextTokens: 1000,
                maxOutputTokens: 100,
                supportsTools: true,
                supportsVision: false,
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );

  console.log('[verify-catalog-sources] 以自定义目录源启动服务...');
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), EASYAGENT_MODELS_CATALOG_FILE: TEMP_CATALOG },
  });

  let out = '';
  child.stdout.on('data', (d) => (out += d.toString()));
  child.stderr.on('data', (d) => (out += d.toString()));

  const results = [];
  const check = (ok, name, detail) => {
    results.push(ok);
    console.log(`${ok ? '✅' : '❌'} ${name.padEnd(34)} ${detail}`);
  };

  await sleep(BOOT_WAIT_MS);

  try {
    // 强制刷新，确保走"重新加载目录"分支（否则可能命中已有缓存而绕过自定义源）
    const refreshRes = await fetch(`${BASE}/api/providers/catalog/refresh`, { method: 'POST' });
    check(refreshRes.status === 200, '强制刷新接口可用', `HTTP ${refreshRes.status}`);

    const status = await (await fetch(`${BASE}/api/providers/catalog/status`)).json();

    check(status.version === MARKER_VERSION, '目录版本来自自定义文件', `version=${status.version}`);
    check(
      typeof status.source === 'string' && status.source.includes('本地文件'),
      'source 如实报告来源',
      `source=${status.source}`,
    );
    check(typeof status.stale === 'boolean', 'stale 字段已暴露', `stale=${status.stale}`);
    check(typeof status.ageDays === 'number', 'ageDays 字段已暴露', `ageDays=${status.ageDays}`);
    check(
      out.includes('本地文件'),
      '日志包含来源信息',
      out.includes('本地文件') ? '已记录' : '未找到',
    );
  } catch (err) {
    check(false, '请求失败', err.message);
  } finally {
    child.kill();
    await sleep(500);

    // ── 还原缓存（必须执行，否则会污染用户的本地数据）──
    if (hadCache && existsSync(CACHE_BAK)) {
      copyFileSync(CACHE_BAK, CACHE_FILE);
      rmSync(CACHE_BAK, { force: true });
      console.log('[verify-catalog-sources] 已还原原有模型目录缓存');
    } else if (!hadCache && existsSync(CACHE_FILE)) {
      rmSync(CACHE_FILE, { force: true });
      console.log('[verify-catalog-sources] 已清理验证期间生成的缓存');
    }
    rmSync(TEMP_CATALOG, { force: true });
  }

  const failed = results.filter((r) => !r).length;
  console.log('\n' + '='.repeat(64));
  if (failed === 0) {
    console.log('✅ 自定义目录源端到端验证通过');
    console.log(`__VERIFY_STATUS__=PASS`);
    return 0;
  }
  console.error(`❌ 验证失败 ${failed} 项`);
  console.log('__VERIFY_STATUS__=FAIL');
  return 1;
}

process.exitCode = await main();
