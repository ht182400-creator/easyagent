#!/usr/bin/env node
/**
 * push-forgejo.mjs — 一键把当前分支与标签推送到自建 Forgejo
 *
 * ── 为什么需要它 ──
 * 项目有双通道发布需求：GitHub（origin，SSH）与自建 Forgejo（forgejo，HTTP）。
 * Forgejo 走 HTTP Basic 认证，若把用户名/密码写进 remote URL，会残留在：
 *   · `.git/config`（明文，可能被误提交）
 *   · `git reflog` / 命令历史（间接泄漏）
 * 本脚本改用**一次性的 `http.extraHeader`** 注入 Authorization 头：
 *   · 不写入任何配置文件
 *   · 不出现在 reflog（reflog 只记录 remote 名，不记录 header）
 *   · 凭据只存在于本进程内存
 *
 * ── 前置条件 ──
 *   1. 已添加 remote：git remote add forgejo <url>
 *   2. 已设置环境变量（**不要写进任何文件**）：
 *        FORGEJO_USER    Forgejo 用户名
 *        FORGEJO_TOKEN   个人访问令牌（推荐）或密码
 *      可选：FORGEJO_REMOTE（默认 forgejo）、FORGEJO_URL（默认 http://localhost:3000）
 *
 * ── 用法 ──
 *   # PowerShell（推荐：令牌只存在于当前会话）
 *   $env:FORGEJO_USER='ht182400'; $env:FORGEJO_TOKEN='<token>'
 *   node scripts/push-forgejo.mjs                 # 推送当前分支 + 全部本地标签
 *   node scripts/push-forgejo.mjs --tag v0.6.26   # 只推送指定标签
 *   node scripts/push-forgejo.mjs --no-tags       # 只推分支
 *
 * 退出码：0 = 成功；1 = 失败（缺少凭据 / push 失败）
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('push-forgejo');

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 默认远端名 */
const DEFAULT_REMOTE = 'forgejo';

/** 默认 Forgejo 地址（仅用于提示，不参与认证） */
const DEFAULT_URL = 'http://localhost:3000';

// ===================== 参数解析 =====================

/** 解析命令行参数 */
function parseArgs(argv) {
  const opts = { tags: [], pushAllTags: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') {
      opts.tags.push(argv[++i]);
      opts.pushAllTags = false;
    } else if (a === '--no-tags') {
      opts.pushAllTags = false;
    }
  }
  return opts;
}

// ===================== 工具 =====================

/**
 * 执行 git 命令
 *
 * @param {string[]} args - git 子命令参数
 * @param {string[]} [extraConfig] - 追加的 -c 配置项（如 http.extraHeader=...）
 * @returns {{ok: boolean, output: string}}
 */
function git(args, extraConfig = []) {
  const configArgs = extraConfig.flatMap((c) => ['-c', c]);
  try {
    // 【2026-09-18 修复】必须用 spawnSync 同时取 stdout + stderr：
    // git 的「推送结果」(`old..new  main -> main`) 与失败原因都写在 **stderr**，
    // 而 execFileSync 只返回 stdout —— 会导致成功时 output 为空，
    // 进而误报成 "(up-to-date)"，让人以为没推上去（实测踩到）。
    const r = spawnSync('git', [...configArgs, ...args], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const combined = `${r.stdout || ''}${r.stderr || ''}`.trim();
    return { ok: r.status === 0, output: combined };
  } catch (err) {
    return { ok: false, output: err.message };
  }
}

/** 当前分支名 */
function currentBranch() {
  const r = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.ok ? r.output : 'main';
}

// ===================== 主流程 =====================

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const remote = process.env.FORGEJO_REMOTE || DEFAULT_REMOTE;
  const url = process.env.FORGEJO_URL || DEFAULT_URL;
  const user = process.env.FORGEJO_USER;
  const token = process.env.FORGEJO_TOKEN;

  log.title('推送到 Forgejo');

  // ── 前置检查 1：凭据 ──
  if (!user || !token) {
    log.error('缺少凭据：请设置环境变量 FORGEJO_USER 与 FORGEJO_TOKEN');
    log.info('PowerShell 示例：');
    log.info("  $env:FORGEJO_USER='<用户名>'; $env:FORGEJO_TOKEN='<令牌>'");
    log.info('注意：不要把凭据写入任何文件或 remote URL —— 本脚本通过一次性 HTTP 头注入。');
    return 1;
  }

  // ── 前置检查 2：remote 是否配置 ──
  const remotes = git(['remote']);
  if (!remotes.ok || !remotes.output.split('\n').includes(remote)) {
    log.error(`未找到 remote「${remote}」。请先执行：`);
    log.info(`  git remote add ${remote} ${url}/<用户名>/<仓库名>.git`);
    return 1;
  }

  // ── 构造一次性认证头（只在内存中，不落盘、不进 reflog）──
  const basic = Buffer.from(`${user}:${token}`, 'utf8').toString('base64');
  const authConfig = `http.extraHeader=Authorization: Basic ${basic}`;

  const branch = currentBranch();
  let failed = false;

  // ── 推送分支 ──
  log.info(`推送分支 ${branch} → ${remote} ...`);
  const pushBranch = git(['push', remote, branch], [authConfig]);
  if (!pushBranch.ok) {
    log.error(`分支推送失败: ${pushBranch.output}`);
    failed = true;
  } else if (/up-to-date|up to date/i.test(pushBranch.output)) {
    log.info(`分支已是最新，无需推送: ${branch}`);
  } else {
    log.ok(`分支已推送: ${pushBranch.output}`);
  }

  // ── 推送标签 ──
  const tagsToPush = opts.tags.length ? opts.tags : [];
  if (opts.pushAllTags) {
    const list = git(['tag', '--sort=-creatordate']);
    if (list.ok && list.output) tagsToPush.push(...list.output.split('\n').slice(0, 20));
  }

  for (const tag of tagsToPush) {
    const r = git(['push', remote, tag], [authConfig]);
    if (!r.ok) {
      log.error(`标签推送失败 ${tag}: ${r.output}`);
      failed = true;
    } else if (/up-to-date|up to date/i.test(r.output)) {
      log.info(`标签已存在于远端，跳过: ${tag}`);
    } else {
      log.ok(`标签已推送: ${tag}`);
    }
  }

  if (tagsToPush.length === 0 && !opts.pushAllTags) {
    log.info('按要求跳过标签推送');
  }

  log.info(`远端地址: ${url}/<用户>/<仓库>（remote=${remote}）`);
  return failed ? 1 : 0;
}

process.exitCode = main();
