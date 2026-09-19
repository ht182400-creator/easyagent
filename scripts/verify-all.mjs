#!/usr/bin/env node
/**
 * verify-all.mjs — 统一校验入口：一次跑完所有 verify 脚本并给出明确结论
 *
 * ── 为什么需要它 ──
 * 之前各校验脚本是分散运行的，常见用法是：
 *     node scripts/verify-server-routes.mjs 2>&1 | Select-String '✅ 路由|❌'
 *
 * 这种写法有个**危险的盲区**：过滤只保留含特定标记的行 ——
 * 一旦脚本崩溃、或走了"跳过"分支、或输出格式变化，结果就是**一片空白**，
 * 而空白很容易被误读成"没有 ❌ = 通过"，实际上**一次都没校验**。
 *
 * 本脚本解决两件事：
 *   ① 用**退出码 + 机器可读标记**判定状态，不再依赖人眼过滤；
 *   ② 把 PASS / FAIL / **SKIP** 三类结果都显式列出来 —— SKIP 意味着"没校验"，
 *      必须可见，不能算作通过。
 *
 * ── 各脚本须遵守的契约 ──
 * 结尾打印一行：`__VERIFY_STATUS__=PASS` / `=FAIL` / `=SKIP`
 * （已在全部 verify-*.mjs 中实现；缺失该标记时本脚本会按退出码兜底判定，
 *   并把「无标记」记为异常提示，避免静默通过）
 *
 * ── 用法 ──
 *   node scripts/verify-all.mjs              # 全部校验
 *   node scripts/verify-all.mjs --list       # 只列出有哪些校验项
 *   node scripts/verify-all.mjs --only routes,tokens
 *   node scripts/verify-all.mjs --skip readme        # 跳过需要联网的项
 *
 * 退出码：0 = 无 FAIL（SKIP 不算失败）；1 = 存在 FAIL
 */

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 校验项清单
 *
 * @property key   用于 --only / --skip 的短名
 * @property name  展示名
 * @property file  scripts/ 下的脚本文件名
 * @property args  可选：传给该脚本的命令行参数（如 `['--check']`）
 * @property note  补充说明（会打印在结果旁）
 */
const VERIFIERS = [
  {
    key: 'data',
    name: '测试数据一致性',
    file: 'verify-data-consistency.mjs',
    note: '文档数字必须与真源一致（防"文档说 100% 实际在失败"）',
  },
  {
    key: 'traps',
    name: '陷阱计数一致性',
    file: 'verify-trap-count.mjs',
    note: '"陷阱清单 XX 条"散落 5+ 处且无单一真源（一天内失同步 3 次）；以清单 A 节实际行数为真源逐一比对',
  },
  {
    key: 'tokens',
    name: '设计令牌',
    file: 'verify-css-tokens.mjs',
    note: 'Tailwind 类名引用的 CSS 变量必须真实存在（防静默失效）',
  },
  {
    key: 'types',
    name: '前端类型检查',
    file: 'verify-frontend-types.mjs',
    note: '缺 import / 类型不一致只有 tsc 能发现（防运行时白屏，2026-09-19 实报）',
  },
  {
    key: 'routes',
    name: '服务端路由与静态托管',
    file: 'verify-server-routes.mjs',
    note: '需先构建 server + web；验证注册顺序（/api/* 404 不能被 SPA 吞）',
  },
  {
    key: 'perf',
    name: '性能基线回归（P1-7）',
    file: 'perf-baseline.mjs',
    note: '冷启动/健康延迟/工具 schema token 与 benchmarks/baseline.json 比对；>20% 告警、>50% 失败；需先构建 server',
  },
  {
    key: 'readme',
    name: 'README 格式',
    file: 'verify-readme-format.mjs',
    note: '需联网；验证 GitHub README 仍是原始 Markdown（防回退成 HTML）',
  },
  {
    key: 'log',
    name: '运行日志链路',
    file: 'verify-runtime-log.mjs',
    note: '需先构建 server；验证日志落盘 + DEBUG 明细 + 毫秒时间戳',
  },
  {
    key: 'catalog',
    name: '模型目录新鲜度',
    file: 'refresh-models-catalog.mjs',
    args: ['--check'],
    note: 'models-catalog.json 超过 30 天未更新则失败（客户端会自动拉它，旧目录=新模型不出现）',
  },
  {
    key: 'catalog-sources',
    name: '目录多源降级',
    file: 'verify-catalog-sources.mjs',
    note: '需先构建 server；端到端验证自定义目录源生效（连不上 GitHub 时的兜底通道）',
  },
  {
    key: 'classes',
    name: '组件类名一致性',
    file: 'verify-component-classes.mjs',
    note: '源码里写的自定义组件类必须真有定义（badge-green 这类错名不会报错、只会静默失效）',
  },
];

/** 子脚本超时保护（毫秒）—— 卡死时不至于挂住整个校验 */
const TIMEOUT_MS = 90_000;

/** 失败时打印的尾部行数 */
const FAIL_TAIL_LINES = 20;

// ===================== 工具 =====================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 解析 --only / --skip / --list */
function parseArgs(argv) {
  const out = { only: null, skip: [], list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--only')
      out.only = (argv[++i] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--skip')
      out.skip = (argv[++i] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  }
  return out;
}

/** 运行单个校验脚本 */
function runOne(verifier) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    // 注意：必须带上 `scripts/` 前缀。
    // Node 按 cwd 解析脚本参数，只传文件名会到项目根去找（MODULE_NOT_FOUND）。
    const child = spawn(
      process.execPath,
      [join('scripts', verifier.file), ...(verifier.args || [])],
      {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let output = '';
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));

    const timer = setTimeout(() => {
      child.kill();
      output += `\n[verify-all] 超时 ${TIMEOUT_MS}ms，已终止`;
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({
        verifier,
        exitCode: code ?? -1,
        status: parseStatus(output, code ?? -1),
        output,
        durationMs: Date.now() - started,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({
        verifier,
        exitCode: -1,
        status: 'FAIL',
        output: output + `\n[verify-all] 启动失败: ${err.message}`,
        durationMs: Date.now() - started,
      });
    });
  });
}

/**
 * 从输出中判定状态
 *
 * 优先采用脚本自报的 `__VERIFY_STATUS__=`；缺失时按退出码兜底。
 * 自报 SKIP 但退出码非 0 时以 FAIL 为准（退出码更可信）。
 */
function parseStatus(output, exitCode) {
  const m = /__VERIFY_STATUS__=(PASS|FAIL|SKIP)/.exec(output);
  const declared = m ? m[1] : null;
  if (!declared) return exitCode === 0 ? 'PASS' : 'FAIL';
  if (declared === 'SKIP' && exitCode !== 0) return 'FAIL';
  return declared;
}

// ===================== 主流程 =====================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log('可用校验项：');
    for (const v of VERIFIERS) console.log(`  ${v.key.padEnd(8)} ${v.name} — ${v.note}`);
    return 0;
  }

  const targets = VERIFIERS.filter((v) => {
    if (args.only) return args.only.includes(v.key);
    return !args.skip.includes(v.key);
  });

  if (targets.length === 0) {
    console.error('❌ 没有可运行的校验项，请检查 --only / --skip 参数');
    return 1;
  }

  console.log(`[verify-all] 共 ${targets.length} 项校验\n`);

  const results = [];
  for (const v of targets) {
    process.stdout.write(`▶ ${v.name} ... `);
    const r = await runOne(v);
    results.push(r);
    console.log(`${icon(r.status)} ${r.status}  (${(r.durationMs / 1000).toFixed(1)}s)`);
    // 子脚本输出在汇总区统一展示，避免打断进度行
  }

  // ── 明细 ──
  console.log('\n' + '='.repeat(72));
  for (const r of results) {
    if (r.status === 'PASS') continue; // 通过的不刷屏
    console.log(`\n${icon(r.status)} ${r.verifier.name} — ${r.status}`);
    console.log(`  脚本: scripts/${r.verifier.file}   退出码: ${r.exitCode}`);
    console.log(`  说明: ${r.verifier.note}`);
    if (!/__VERIFY_STATUS__=/.test(r.output)) {
      console.log('  ⚠️  该脚本未输出 __VERIFY_STATUS__ 标记，状态由退出码兜底判定');
    }
    const tail = r.output.trim().split('\n').slice(-FAIL_TAIL_LINES);
    console.log(tail.map((l) => `  | ${l}`).join('\n'));
  }

  // ── 汇总 ──
  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIP');
  const passed = results.filter((r) => r.status === 'PASS');

  console.log('\n' + '='.repeat(72));
  console.log(
    `汇总: ${results.length} 项 — ✅ ${passed.length} 通过 · ❌ ${failed.length} 失败 · ⚠️ ${skipped.length} 跳过`,
  );

  if (skipped.length > 0) {
    console.log('⚠️  以下项**未做校验**（非失败，但也不可当作通过）:');
    for (const r of skipped) console.log(`     - ${r.verifier.name}`);
  }

  if (failed.length > 0) {
    console.log('\n❌ 结论: 存在失败项，详见上方明细');
    return 1;
  }

  console.log(
    skipped.length > 0 ? '\n⚠️  结论: 无失败，但有跳过项（未校验）' : '\n✅ 结论: 全部通过',
  );
  return 0;
}

/** 状态 → 图标 */
function icon(status) {
  return status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
}

process.exitCode = await main();
