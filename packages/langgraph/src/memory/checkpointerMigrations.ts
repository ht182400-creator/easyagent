/**
 * langgraph-checkpoints.db 迁移清单（P1-5）
 *
 * ── 版本历史 ──
 *   v1  基线：checkpoints / writes 两表与查询索引。
 *       与迁移机制引入前的 initTables() 语句完全一致（纯搬迁），
 *       对「旧代码创建的、user_version=0 的存量库」幂等（CREATE ... IF NOT EXISTS）。
 *
 * 新增迁移规则见 `@easyagent/core` 的 sessionMigrations.ts 头注释：
 * 只追加、不改历史、基线必须幂等。
 *
 * @module memory/checkpointerMigrations
 */

import type { Migration } from '@easyagent/core';

/** langgraph-checkpoints.db 的全部迁移（按版本严格递增） */
export const CHECKPOINTER_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: '基线 schema：checkpoints / writes 表与查询索引',
    up: (db) => {
      db.exec(`
        -- 检查点主表：存储每次 SuperStep 后的完整 State
        CREATE TABLE IF NOT EXISTS checkpoints (
          thread_id TEXT NOT NULL,
          checkpoint_id TEXT NOT NULL,
          parent_id TEXT,
          checkpoint TEXT NOT NULL,        -- 完整 State JSON
          metadata TEXT DEFAULT '{}',       -- { source, step, ... }
          created_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (thread_id, checkpoint_id)
        );

        -- 中间写入表：存储未完成的 task 写入
        CREATE TABLE IF NOT EXISTS writes (
          thread_id TEXT NOT NULL,
          checkpoint_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          idx INTEGER NOT NULL DEFAULT 0,
          channel TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (thread_id, checkpoint_id, task_id, idx)
        );

        -- 索引优化查询
        CREATE INDEX IF NOT EXISTS idx_checkpoints_thread
          ON checkpoints(thread_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_writes_thread_checkpoint
          ON writes(thread_id, checkpoint_id);
      `);
    },
  },
];
