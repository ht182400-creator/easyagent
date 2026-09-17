#!/usr/bin/env node
/**
 * run-logged.mjs — 把任意命令的输出同时打印到控制台并存档到项目内日志
 *
 * ── 为什么需要它 ──
 * 2026-09-18 复盘发现两类问题：
 *   1. 构建/部署/启动的输出经常被随手重定向到 `temp/`（gitignore 的临时目录），
 *      等同丢弃——事后完全找不到"当时构建到底报了什么"；
 *   2. `packages/core` 的 logger 此前**没有文件输出**，运行期日志关掉终端即消失。
 * 本脚本解决第 1 类：所有命令输出落到 `logs/build-logs/`，成为项目内的可追溯资产。
 *
 * ── 产物 ──
 *   logs/build-logs/<YYYY-MM-DD_HHmmss>_<标签>.log
 *   头部：命令 / 工作目录 / 时间 / Node 版本 / Git 提交
 *   尾部：退出码 / 耗时
 *
 * ── 用法 ──
 *   node scripts/run-logged.mjs --label 构建web --cwd packages/web -- npm run build
 *   node scripts/run-logged.mjs --label 部署 --cwd . -- pwsh scripts/deploy-server.ps1
 *   node scripts/run-logged.mjs --label 冒烟 -- node scripts/verify-data-consistency.mjs
 *
 * 退出码：与被执行的命令一致（可直接用于 CI 串联）。
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 命令输出日志目录（项目内，gitignore） */
const LOG_DIR = join(PROJECT_ROOT, 'logs', 'build-logs');

/** 标签中不允许出现在文件名里的字符 */
const UNSAFE_FILENAME_RE = /[\\/:*?"<>|\s]+/g;

// ===================== 参数解析 =====================

/** 解析 `--label X --cwd Y -- cmd args...` */
function parseArgs(argv) {
  const opts = { label: 'command', cwd: PROJECT_ROOT, command: [] };
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      opts.command = argv.slice(i + 1);
      break;
    }
    if (a === '--label') opts.label = argv[++i] || 'command';
    else if (a === '--cwd') opts.cwd = resolve(PROJECT_ROOT, argv[++i] || '.');
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

const USAGE = `
run-logged — 执行命令并将输出存档到项目日志

  node scripts/run-logged.mjs --label <标签> [--cwd <目录>] -- <命令...>

示例:
  node scripts/run-logged.mjs --label 构建web --cwd packages/web -- npm run build
  node scripts/run-logged.mjs --label 全量校验 -- node scripts/verify-data-consistency.mjs

日志目录: logs/build-logs/
`.trim();

// ===================== 工具 =====================

/** 毫秒级时间戳：YYYY-MM-DD HH:mm:ss.SSS */
function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

/** 文件名用紧凑时间戳：YYYY-MM-DD_HHmmss */
function stampCompact() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** 读取当前 git 短提交（失败返回 unknown） */
function readGitCommit() {
  try {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: PROJECT_ROOT,
      shell: true,
      encoding: 'utf8',
    });
    return (r.stdout || '').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ===================== 主流程 =====================

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || opts.command.length === 0) {
    console.log(USAGE);
    return opts.command.length === 0 && !opts.help ? 1 : 0; // 立即退出码
  }

  const safeLabel = opts.label.replace(UNSAFE_FILENAME_RE, '-');
  const logFile = join(LOG_DIR, `${stampCompact()}_${safeLabel}.log`);
  const startedAt = Date.now();
  const chunks = [];

  /** 同时写控制台与缓冲（缓冲最后统一落盘，避免半截文件） */
  function emit(text, stream) {
    chunks.push(text);
    stream.write(text);
  }

  const header =
    `${'='.repeat(78)}\n` +
    `[${stamp()}] [INFO ] [run-logged] 开始执行命令\n` +
    `  标签:     ${opts.label}\n` +
    `  工作目录: ${opts.cwd}\n` +
    `  命令:     ${opts.command.join(' ')}\n` +
    `  Git:      ${readGitCommit()}\n` +
    `  Node:     ${process.version} (${process.platform}/${process.arch})\n` +
    `  日志文件: ${logFile}\n` +
    `${'='.repeat(78)}\n`;

  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    // 日志目录不可写时仍要继续执行命令，只提示不阻断
    console.error(`[run-logged] 无法创建日志目录 ${LOG_DIR}: ${err.message}（将仅输出到控制台）`);
  }

  emit(header, process.stdout);

  let child;
  try {
    child = spawn(opts.command[0], opts.command.slice(1), {
      cwd: opts.cwd,
      shell: true,
      env: process.env,
    });
  } catch (err) {
    const msg = `[run-logged] 命令启动失败: ${err.message}\n`;
    emit(msg, process.stderr);
    writeLog(logFile, chunks);
    return 1;
  }

  child.stdout?.on('data', (d) => emit(d.toString(), process.stdout));
  child.stderr?.on('data', (d) => emit(d.toString(), process.stderr));

  child.on('error', (err) => {
    emit(`[run-logged] 子进程错误: ${err.message}\n`, process.stderr);
  });

  child.on('close', (code, signal) => {
    const elapsed = Date.now() - startedAt;
    const ok = code === 0;
    const footer =
      `${'='.repeat(78)}\n` +
      `[${stamp()}] [${ok ? 'INFO ' : 'ERROR'}] [run-logged] 命令结束\n` +
      `  退出码: ${code}${signal ? ` (signal=${signal})` : ''}\n` +
      `  耗时:   ${(elapsed / 1000).toFixed(1)}s\n` +
      `  结论:   ${ok ? '✅ 成功' : '❌ 失败'}\n` +
      `  日志:   ${logFile}\n` +
      `${'='.repeat(78)}\n`;
    emit(footer, ok ? process.stdout : process.stderr);

    const writeFailed = writeLog(logFile, chunks);
    if (writeFailed) {
      console.error('[run-logged] ⚠️ 日志落盘失败，请检查 logs/build-logs 目录权限');
    }
    process.exit(code ?? 1);
  });

  // 异步路径：退出码由子进程 close 处理器决定，此处不做任何同步退出
  return undefined;
}

/**
 * 把完整输出落盘
 *
 * 说明：头部、命令输出、尾部都会经过 `emit()` 进入 chunks，
 * 因此这里直接顺序拼接即可，无需重复附加 header/footer。
 *
 * @returns 是否写入失败
 */
function writeLog(logFile, chunks) {
  try {
    writeFileSync(logFile, chunks.join(''), 'utf-8');
    return false;
  } catch (err) {
    console.error(`[run-logged] 写入日志失败: ${err.message}`);
    return true;
  }
}

// ⚠️ 不能用 `process.exit(main())`：main() 在异步路径下会立刻返回，
// 同步 exit 会在子进程 close 回调触发之前就杀掉本进程，
// 结果是「命令根本没跑、日志只有头部」（2026-09-18 实测踩到并修正）。
const immediateExitCode = main();
if (typeof immediateExitCode === 'number') {
  process.exitCode = immediateExitCode;
}
