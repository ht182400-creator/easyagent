/**
 * sessions.db 迁移清单（P1-5）
 *
 * ── 版本历史 ──
 *   v1  基线：迁移机制引入前的原始 schema（sessions 表）。
 *       ⚠️ 必须对「旧代码创建的、user_version=0 的存量库」幂等 ——
 *       旧库已存在同结构表时 CREATE TABLE IF NOT EXISTS 是无操作，
 *       更老的库缺 summary/tags 列由 addColumnIfMissing 补齐。
 *   v2  性能索引：会话列表按 workspace 过滤 + 按 updated_at 排序是最高频查询
 *       （loadSessions 每次 SELECT ... ORDER BY updated_at DESC），
 *       存量数据增长后无索引会退化为全表扫描。
 *
 * 新增迁移的规则：
 *   1. 追加到数组末尾，version = 上一条 + 1，**永不修改历史条目**；
 *   2. 已发布的迁移一旦随版本发布就视为不可变（改历史 = 存量库与代码版本错位）；
 *   3. up() 内可使用 tableExists / columnExists / addColumnIfMissing 做防御。
 *
 * @module db/sessionMigrations
 */

import type { Migration } from './DatabaseMigrator.js';
import { addColumnIfMissing } from './DatabaseMigrator.js';

/** sessions.db 的全部迁移（按版本严格递增） */
export const SESSION_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: '基线 schema：sessions 表（兼容存量库幂等执行）',
    up: (db) => {
      // 与迁移机制引入前的原始建表语句完全一致（纯搬迁）
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          workspace TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          messages TEXT NOT NULL DEFAULT '[]',
          title TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          token_usage TEXT NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"totalTokens":0}',
          summary TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          tags TEXT DEFAULT '[]'
        )
      `);
      // 兼容比基线更早的库：个别列可能缺失（列存在时是无操作）
      addColumnIfMissing(db, 'sessions', 'summary', "TEXT DEFAULT ''");
      addColumnIfMissing(db, 'sessions', 'tags', "TEXT DEFAULT '[]'");
    },
  },
  {
    version: 2,
    description: '性能索引：workspace / updated_at / status（会话列表高频查询路径）',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace);
        CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      `);
    },
  },
];
