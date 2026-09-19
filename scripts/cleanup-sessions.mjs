#!/usr/bin/env node
/**
 * cleanup-sessions.mjs — 清理 sessions.db 里的垃圾会话记录
 *
 * ── 背景（2026-09-19）──
 * 桌面端 agent-chat IPC 曾不传 sessionId → AgentEngine 兜底 `session_${Date.now()}`
 * → 每次调用新建一个会话（实测 114 条垃圾，Token 全 0）。缺陷已修，本脚本清理存量。
 *
 * ── 删除规则 ──
 * 只删同时满足以下全部条件的记录：
 *   1. id 以 `session_` 开头（AgentEngine 兜底命名）
 *   2. 标题仍是默认的 `会话 <时间>` 格式（用户/引擎从未改过名）
 * 其余（web_default / auto_* / lg_* / 改过名的会话）一律保留。
 * 实删前自动备份整个 DB 文件，可随时还原。
 *
 * ── 用法 ──
 *   node scripts/cleanup-sessions.mjs             # 预演：只报告将删/将留的数量与样例
 *   node scripts/cleanup-sessions.mjs --execute   # 实删：先备份整个 DB 文件再删
 */

import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EXECUTE = process.argv.includes('--execute');
const require = createRequire(join(process.cwd(), 'packages', 'core', 'noop.js'));
const Database = require('better-sqlite3');

const dbPath = join(homedir(), '.easyagent', 'data', 'sessions.db');
const db = new Database(dbPath);

// ── 分类 ──
const rows = db
  .prepare("SELECT id, title, created_at FROM sessions WHERE id LIKE 'session\\_%' ESCAPE '\\'")

  .all();
const junk = [];
const keep = [];
for (const r of rows) {
  // 默认标题形如 "会话 2026/9/19 19:12:57"（SessionManager.getOrCreate 的兜底值）
  if (/^会话 \d{4}\//.test(r.title || '')) junk.push(r);
  else keep.push(r);
}

console.log(`DB: ${dbPath}`);
console.log(
  `session_* 共 ${rows.length} 条 → 将删 ${junk.length}（默认标题）· 保留 ${keep.length}（改过名）`,
);
console.log('--- 将删样例（最多 5 条）---');
for (const r of junk.slice(0, 5))
  console.log(`  ${r.id}  "${String(r.title).slice(0, 30)}"  ${r.created_at}`);
console.log('--- 将留样例（最多 5 条）---');
for (const r of keep.slice(0, 5)) console.log(`  ${r.id}  "${String(r.title).slice(0, 30)}"`);

if (!EXECUTE) {
  console.log(
    '\n（预演模式，未改动任何数据。确认无误后加 --execute 实删：会先自动备份整个 DB 文件）',
  );
  db.close();
  process.exit(0);
}

// ── 备份整个 DB 文件（含 WAL 不考虑：删除前先 checkpoint 由 better-sqlite3 隐式处理；
// 为稳妥直接复制主文件，备份时间点即此刻已落盘内容）──
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = `${dbPath}.backup-${stamp}`;
copyFileSync(dbPath, backupPath);
console.log(`\n已备份 → ${backupPath}`);

const del = db.prepare("DELETE FROM sessions WHERE id LIKE 'session\\_%' ESCAPE '\\' AND id = ?");
const txn = db.transaction((ids) => {
  for (const id of ids) del.run(id);
});
txn(junk.map((r) => r.id));
console.log(`已删除 ${junk.length} 条垃圾会话记录`);
db.close();
