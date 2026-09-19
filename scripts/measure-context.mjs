#!/usr/bin/env node
/**
 * measure-context.mjs — 量化「上下文占用」并对比上下文工程（P0-4）的收益
 *
 * ── 为什么需要它 ──
 * "工具太多导致模型变笨"是一个容易说、难以证的判断。本脚本把它变成数字：
 *   · 改造前：70 个工具的定义 + 描述（后者还重复拼进系统提示词）合计多少 token
 *   · 改造后：ContextManager 在三档模型下的实际占用
 * 定阈值、判断回归、写发布说明都需要这组数字。
 *
 * ── 用法 ──
 *   node scripts/measure-context.mjs              # 需要先构建 core（pnpm --filter @easyagent/core build）
 *   node scripts/measure-context.mjs --json       # 额外输出机器可读结果
 *
 * 退出码：0 = 成功；1 = 构建产物缺失
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** core 构建产物入口 */
const CORE_ENTRY = join(PROJECT_ROOT, 'packages', 'core', 'dist', 'index.js');

/**
 * 用于对比的模型窗口（对应三档）
 *
 * 小档取 32k（Ollama qwen2.5:7b 量级），中档取 131k（DeepSeek/通义），
 * 大档取 200k+（GLM-5 / MiniMax M3）。
 */
const SCALE_SAMPLES = [
  { scale: 'small', windowTokens: 32_768, label: 'qwen2.5:7b (32k)' },
  { scale: 'medium', windowTokens: 131_072, label: 'DeepSeek V4 (131k)' },
  { scale: 'large', windowTokens: 200_001, label: 'GLM-5 级 (200k+)' },
];

// ===================== 工具 =====================

/** 打印表格分隔线 */
function hr(char = '─', width = 78) {
  return char.repeat(width);
}

/** 千分位格式化 */
function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

/** 百分比 */
function pct(part, whole) {
  if (!whole) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

// ===================== 主流程 =====================

async function main() {
  if (!existsSync(CORE_ENTRY)) {
    console.error(`❌ 未找到 ${CORE_ENTRY}`);
    console.error('   请先构建：pnpm --filter @easyagent/core build');
    return 1;
  }

  const core = await import(pathToFileURL(CORE_ENTRY).href);
  const {
    getAllBuiltinTools,
    ToolRegistry,
    getContextManager,
    estimateTokens,
    estimateToolDefinitionsTokens,
    estimateMessagesTokens,
  } = core;

  // 用 silent 级别的日志器避免污染输出（工具注册会打大量 info 日志）
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

  const registry = new ToolRegistry();
  registry.registerAll(getAllBuiltinTools());

  const allDefs = registry.getDefinitions();
  const allDescriptions = registry.getDescriptions();

  // ── 改造前基线 ──
  const baseline = {
    toolCount: allDefs.length,
    defsTokens: estimateToolDefinitionsTokens(allDefs),
    descTokens: estimateTokens(allDescriptions),
  };
  baseline.totalTokens = baseline.defsTokens + baseline.descTokens;

  console.log(hr('═'));
  console.log('EasyAgent 上下文占用度量（P0-4 上下文工程）');
  console.log(hr('═'));

  console.log('\n【改造前基线】');
  console.log(`  工具总数                : ${baseline.toolCount}`);
  console.log(`  工具定义（tools 参数）  : ${fmt(baseline.defsTokens)} token`);
  console.log(`  工具描述（系统提示词内）: ${fmt(baseline.descTokens)} token   ← 与上者重复计费`);
  console.log(`  合计固定开销            : ${fmt(baseline.totalTokens)} token`);

  // ── 改造后：逐档测量 ──
  const results = [];
  const sampleMessages = [{ role: 'user', content: '帮我看看这个项目的结构。' }];

  for (const sample of SCALE_SAMPLES) {
    const cm = getContextManager({ enabled: true });
    const built = cm.build({
      systemPrompt: '你是一个AI编程助手，专注于帮助开发者编写高质量的代码。',
      messages: sampleMessages,
      toolDefinitions: allDefs,
      workspace: PROJECT_ROOT,
      sessionId: 'measure',
      model: sample.label,
      maxContextTokens: sample.windowTokens,
    });

    // 「改造后的固定开销」= 系统提示词 + 工具定义（不含用户消息）
    const afterFixed = built.stats.systemTokens + built.stats.toolTokens;
    const saved = baseline.totalTokens - afterFixed;

    results.push({
      ...sample,
      scale: built.stats.scale,
      toolCountAfter: built.stats.toolCount.after,
      systemTokens: built.stats.systemTokens,
      toolTokens: built.stats.toolTokens,
      afterFixed,
      saved,
      savedPct: baseline.totalTokens ? (saved / baseline.totalTokens) * 100 : 0,
      baselineRatio: baseline.totalTokens / sample.windowTokens,
      afterRatio: afterFixed / sample.windowTokens,
      adjustments: built.stats.adjustments,
    });
  }

  console.log('\n【改造后：各档实际占用（固定开销 = 系统提示词 + 工具定义）】');
  console.log(
    '档位'.padEnd(10) +
      '窗口'.padEnd(12) +
      '工具数'.padEnd(10) +
      '系统'.padEnd(10) +
      '工具'.padEnd(10) +
      '合计'.padEnd(10) +
      '节省',
  );
  console.log(hr());
  for (const r of results) {
    console.log(
      r.scale.padEnd(10) +
        fmt(r.windowTokens).padEnd(12) +
        `${r.toolCountAfter}`.padEnd(10) +
        fmt(r.systemTokens).padEnd(10) +
        fmt(r.toolTokens).padEnd(10) +
        fmt(r.afterFixed).padEnd(10) +
        `${fmt(r.saved)} (${r.savedPct.toFixed(1)}%)`,
    );
  }

  console.log('\n【占模型窗口比例对比】');
  console.log('档位'.padEnd(10) + '改造前'.padEnd(14) + '改造后'.padEnd(14) + '说明');
  console.log(hr());
  for (const r of results) {
    console.log(
      r.scale.padEnd(10) +
        `${(r.baselineRatio * 100).toFixed(1)}%`.padEnd(14) +
        `${(r.afterRatio * 100).toFixed(1)}%`.padEnd(14) +
        (r.scale === 'small' ? '小模型收益最大：从「近半上下文」降到「约四分之一」' : ''),
    );
  }

  console.log('\n【触发的裁剪动作】');
  for (const r of results) {
    console.log(`  ${r.scale}:`);
    if (r.adjustments.length === 0) {
      console.log('    （无）');
      continue;
    }
    for (const a of r.adjustments) {
      const sign = a.tokensDelta >= 0 ? '+' : '';
      console.log(`    · [${a.kind}] ${a.detail}  (${sign}${fmt(a.tokensDelta)} token)`);
    }
  }

  // 空历史下的消息估算（仅作参考）
  console.log('\n【参考】单条用户消息的估算 token：', estimateMessagesTokens(sampleMessages));

  console.log('\n' + hr('═'));

  if (process.argv.includes('--json')) {
    console.log('\n' + JSON.stringify({ baseline, results }, null, 2));
  }
  return 0;
}

process.exitCode = await main();
