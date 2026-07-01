/**
 * Checkpointer — LangGraph SQLite 状态持久化
 * 
 * 实现 LangGraph 的 BaseCheckpointSaver 接口，使用 better-sqlite3 作为后端。
 * 支持：
 * - 每个 SuperStep 自动保存 State 快照
 * - 跨进程恢复（进程重启后可 resume）
 * - 多会话隔离（通过 thread_id）
 * 
 * 表结构:
 *   checkpoints: thread_id, checkpoint_id, parent_id, checkpoint(JSON), metadata(JSON), created_at
 *   writes:      thread_id, checkpoint_id, task_id, idx, channel, value(JSON)
 */
import Database from 'better-sqlite3';
import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { Checkpoint, CheckpointTuple, CheckpointMetadata } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import path from 'path';
import fs from 'fs';
import { Logger } from '../logger/Logger';

/** Checkpointer 模块 Logger */
const log = new Logger('Checkpointer');

// ---- 类型定义 ----

/**
 * 已保存的 Checkpoint 摘要信息
 */
export interface CheckpointSummary {
  /** 会话 ID */
  threadId: string;
  /** 检查点 ID */
  checkpointId: string;
  /** 父检查点 ID */
  parentId: string | null;
  /** 轮次 */
  turnCount: number;
  /** 时间戳 */
  createdAt: string;
}

/**
 * Checkpointer 配置
 */
export interface CheckpointerConfig {
  /** 数据库文件路径，默认 ~/.easyagent/data/langgraph-checkpoints.db */
  dbPath?: string;
  /** 是否在初始化时清理旧数据 */
  cleanOnInit?: boolean;
}

/**
 * SQLite Checkpoint 持久化器
 * 
 * 实现 BaseCheckpointSaver 接口供 LangGraph 自动调用。
 * 同时提供业务层查询接口 (listThreads, getLatestState)。
 */
export class SqliteCheckpointer extends BaseCheckpointSaver {
  private db: Database.Database;
  private dbPath: string;

  constructor(config: CheckpointerConfig = {}) {
    super();
    // 默认路径：与现有 SessionManager 共用 data 目录
    const homeDir = process.env.USERPROFILE || process.env.HOME || '/tmp';
    this.dbPath = config.dbPath || path.join(homeDir, '.easyagent', 'data', 'langgraph-checkpoints.db');

    log.debug('Checkpointer 初始化', { dbPath: this.dbPath, cleanOnInit: !!config.cleanOnInit });

    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log.debug('数据目录已创建', { dir });
    }

    // 初始化数据库连接
    const dbTimer = log.startTimer('数据库连接');
    this.db = new Database(this.dbPath);
    dbTimer();

    // 启用 WAL 模式以提升并发性能
    this.db.pragma('journal_mode = WAL');
    log.debug('WAL 模式已启用');

    // 先建表，再清理（避免操作不存在的表）
    this.initTables();

    if (config.cleanOnInit) {
      log.info('清理旧数据 (cleanOnInit=true)');
      this.clear();
    }

    log.info('Checkpointer 初始化完成');
  }

  /**
   * 初始化数据库表结构
   */
  private initTables(): void {
    this.db.exec(`
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
  }

  // ============ BaseCheckpointSaver 接口实现 ============

  /**
   * 获取最新 Checkpoint
   * LangGraph 自动调用
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id || 'default';
    const timer = log.startTimer('getTuple');

    const row = this.db.prepare(`
      SELECT thread_id, checkpoint_id, parent_id, checkpoint, metadata
      FROM checkpoints
      WHERE thread_id = ?
      ORDER BY rowid DESC
      LIMIT 1
    `).get(threadId) as CheckpointRow | undefined;

    if (!row) {
      timer({ threadId, found: false });
      return undefined;
    }

    timer({ threadId, checkpointId: row.checkpoint_id, found: true });
    return {
      config: {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint: JSON.parse(row.checkpoint),
      metadata: JSON.parse(row.metadata),
      parentConfig: row.parent_id
        ? {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_id: row.parent_id,
            },
          }
        : undefined,
    };
  }

  /**
   * 列出指定 thread 和 checkpoint 之前的所有 checkpoint
   * LangGraph 自动调用
   */
  async *list(config: RunnableConfig, options?: { limit?: number; before?: RunnableConfig; filter?: Record<string, unknown> }): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id || 'default';
    const beforeId = options?.before?.configurable?.checkpoint_id;
    const limit = options?.limit || 100;

    let rows: CheckpointRow[];
    if (beforeId) {
      // 通过 rowid 确定顺序：查询早于指定 checkpoint 的记录
      const beforeRow = this.db.prepare(`
        SELECT rowid FROM checkpoints WHERE thread_id = ? AND checkpoint_id = ?
      `).get(threadId, beforeId) as { rowid: number } | undefined;

      if (beforeRow) {
        rows = this.db.prepare(`
          SELECT thread_id, checkpoint_id, parent_id, checkpoint, metadata, created_at
          FROM checkpoints
          WHERE thread_id = ? AND rowid < ?
          ORDER BY rowid DESC
          LIMIT ?
        `).all(threadId, beforeRow.rowid, limit) as CheckpointRow[];
      } else {
        rows = [];
      }
    } else {
      rows = this.db.prepare(`
        SELECT thread_id, checkpoint_id, parent_id, checkpoint, metadata, created_at
        FROM checkpoints
        WHERE thread_id = ?
        ORDER BY rowid DESC
        LIMIT ?
      `).all(threadId, limit) as CheckpointRow[];
    }

    for (const row of rows) {
      yield {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint: JSON.parse(row.checkpoint),
        metadata: JSON.parse(row.metadata),
        parentConfig: row.parent_id
          ? {
              configurable: {
                thread_id: row.thread_id,
                checkpoint_id: row.parent_id,
              },
            }
          : undefined,
      };
    }
  }

  /**
   * 保存 Checkpoint
   * LangGraph 自动调用
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, string | number>
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id || 'default';
    const checkpointId = config.configurable?.checkpoint_id || generateId();
    const timer = log.startTimer('put (保存 checkpoint)');

    this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (thread_id, checkpoint_id, parent_id, checkpoint, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(threadId, checkpointId, (metadata as unknown as Record<string, unknown>).parent_checkpoint_id || null, JSON.stringify(checkpoint), JSON.stringify(metadata));

    timer({ threadId, checkpointId, step: metadata.step });
    return {
      configurable: { thread_id: threadId, checkpoint_id: checkpointId },
    };
  }

  /**
   * 保存中间写入
   * LangGraph 自动调用
   */
  async putWrites(
    config: RunnableConfig,
    writes: Array<[string, unknown]>,
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id || 'default';
    const checkpointId = config.configurable?.checkpoint_id || '';
    log.debug('putWrites', { threadId, checkpointId, taskId, writeCount: writes.length });

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO writes (thread_id, checkpoint_id, task_id, idx, channel, value)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      writes.forEach(([channel, value], idx) => {
        insert.run(threadId, checkpointId, taskId, idx, channel, JSON.stringify(value));
      });
    });

    transaction();
  }

  // ============ 业务层查询接口 ============

  /**
   * 列出所有会话（thread）摘要
   */
  listThreads(): CheckpointSummary[] {
    const timer = log.startTimer('listThreads');
    // 每个 thread 取最新 checkpoint (按 rowid 排序)
    const rows = this.db.prepare(`
      SELECT c.thread_id, c.checkpoint_id, c.parent_id, 
             c.metadata, c.created_at
      FROM checkpoints c
      INNER JOIN (
        SELECT thread_id, MAX(rowid) AS max_rowid
        FROM checkpoints
        GROUP BY thread_id
      ) latest ON c.thread_id = latest.thread_id AND c.rowid = latest.max_rowid
      ORDER BY c.rowid DESC
    `).all() as CheckpointRow[];

    const result = rows.map((row) => {
      const metadata = JSON.parse(row.metadata);
      return {
        threadId: row.thread_id,
        checkpointId: row.checkpoint_id,
        parentId: row.parent_id,
        turnCount: metadata.step || 0,
        createdAt: row.created_at,
      };
    });

    timer({ threadCount: result.length });
    return result;
  }

  /**
   * 获取指定 thread 的完整状态（用于恢复）
   * @param threadId - 会话 ID
   * @returns 最新的完整 State，不存在则 null
   */
  getLatestState(threadId: string): Record<string, unknown> | null {
    const timer = log.startTimer('getLatestState');
    const row = this.db.prepare(`
      SELECT checkpoint FROM checkpoints
      WHERE thread_id = ?
      ORDER BY rowid DESC
      LIMIT 1
    `).get(threadId) as { checkpoint: string } | undefined;

    if (!row) {
      timer({ threadId, found: false });
      return null;
    }
    const raw = JSON.parse(row.checkpoint);
    // LangGraph Checkpoint 格式: { v, id, ts, channel_values, channel_versions, ... }
    // 抽取 channel_values 作为可用的 State
    timer({ threadId, found: true });
    return (raw.channel_values as Record<string, unknown>) || raw;
  }

  /**
   * 删除指定 thread 的所有 checkpoint
   * @param threadId - 会话 ID
   */
  deleteThread(threadId: string): void {
    log.info('删除会话数据', { threadId });
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM writes WHERE thread_id = ?').run(threadId);
      this.db.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(threadId);
    });
    transaction();
  }

  /**
   * 清理所有数据
   */
  clear(): void {
    log.warn('清空所有 checkpoint 数据');
    this.db.exec('DELETE FROM writes');
    this.db.exec('DELETE FROM checkpoints');
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    log.info('关闭数据库连接');
    this.db.close();
  }
}

// ---- 内部类型 ----

interface CheckpointRow {
  thread_id: string;
  checkpoint_id: string;
  parent_id: string | null;
  checkpoint: string;
  metadata: string;
  created_at: string;
}

// ---- 工具函数 ----

/** 生成唯一 ID */
function generateId(): string {
  return `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

