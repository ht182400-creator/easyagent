/**
 * 会话管理器
 * 管理对话会话的创建、存储、恢复和持久化
 * 使用SQLite进行本地持久化存储
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Message, Session, SessionMetadata, TokenUsage } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** 默认数据目录 */
const DATA_DIR = join(homedir(), '.easyagent', 'data');

export class SessionManager {
  private db: Database.Database;
  private sessions: Map<string, Session> = new Map();

  constructor(dataDir?: string) {
    const dir = dataDir || DATA_DIR;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const dbPath = join(dir, 'sessions.db');
    this.db = new Database(dbPath);

    // 启用WAL模式提高性能
    this.db.pragma('journal_mode = WAL');

    // 创建会话表
    this.db.exec(`
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

    this.loadSessions();
    logger.info('会话管理器已初始化');
  }

  /**
   * 加载所有会话到内存
   */
  private loadSessions(): void {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE status != ? ORDER BY updated_at DESC')
      .all('archived') as Array<Record<string, unknown>>;

    for (const row of rows) {
      const session = this.rowToSession(row);
      this.sessions.set(session.id, session);
    }

    logger.info({ count: rows.length }, '已加载会话');
  }

  /**
   * 数据库行转Session对象
   */
  private rowToSession(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      workspace: row.workspace as string,
      modelConfig: {
        provider: (row.provider || 'deepseek') as Session['modelConfig']['provider'],
        model: (row.model || 'deepseek-v4') as string,
      },
      messages: JSON.parse((row.messages as string) || '[]') as Message[],
      metadata: {
        title: (row.title as string) || '',
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
        status: (row.status as SessionMetadata['status']) || 'active',
        tokenUsage: JSON.parse((row.token_usage as string) || '{}') as TokenUsage,
        tags: JSON.parse((row.tags as string) || '[]') as string[],
      },
      summary: (row.summary as string) || undefined,
    };
  }

  /**
   * 获取或创建会话
   */
  getOrCreate(
    id: string,
    config?: { workspace?: string; provider?: string; model?: string },
  ): Session {
    const existing = this.sessions.get(id);
    if (existing) return existing;

    const session: Session = {
      id,
      workspace: config?.workspace || process.cwd(),
      modelConfig: {
        provider: (config?.provider || 'deepseek') as Session['modelConfig']['provider'],
        model: config?.model || 'deepseek-v4',
      },
      messages: [],
      metadata: {
        title: `会话 ${new Date().toLocaleString('zh-CN')}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active',
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
    };

    this.sessions.set(id, session);
    this.saveToDb(session);
    return session;
  }

  /**
   * 获取会话
   */
  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * 列出所有会话
   */
  list(status?: SessionMetadata['status']): Session[] {
    const all = Array.from(this.sessions.values());
    if (status) {
      return all.filter((s) => s.metadata.status === status);
    }
    return all;
  }

  /**
   * 保存会话
   */
  save(session: Session): void {
    this.sessions.set(session.id, session);
    this.saveToDb(session);
  }

  /**
   * 持久化到数据库
   */
  private saveToDb(session: Session): void {
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO sessions 
           (id, workspace, provider, model, messages, title, status, token_usage, summary, created_at, updated_at, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          session.id,
          session.workspace,
          session.modelConfig.provider,
          session.modelConfig.model,
          JSON.stringify(session.messages),
          session.metadata.title,
          session.metadata.status,
          JSON.stringify(session.metadata.tokenUsage),
          session.summary || '',
          session.metadata.createdAt.toISOString(),
          session.metadata.updatedAt.toISOString(),
          JSON.stringify(session.metadata.tags || []),
        );
    } catch (error) {
      logger.error({ error, sessionId: session.id }, '会话保存失败');
    }
  }

  /**
   * 删除会话
   */
  delete(id: string): void {
    this.sessions.delete(id);
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    logger.info({ sessionId: id }, '会话已删除');
  }

  /**
   * 归档会话
   */
  archive(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.metadata.status = 'archived';
      this.save(session);
    }
  }

  /**
   * 搜索会话
   */
  search(query: string): Session[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.sessions.values()).filter(
      (s) =>
        s.metadata.title.toLowerCase().includes(lowerQuery) ||
        s.messages.some((m) => {
          const content = typeof m.content === 'string' ? m.content : '';
          return content.toLowerCase().includes(lowerQuery);
        }),
    );
  }

  /**
   * 清除所有会话
   */
  clearAll(): void {
    this.sessions.clear();
    this.db.exec('DELETE FROM sessions');
    logger.info('所有会话已清除');
  }

  /**
   * 获取Token用量统计
   */
  getTotalTokenUsage(): TokenUsage {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    for (const session of this.sessions.values()) {
      usage.inputTokens += session.metadata.tokenUsage.inputTokens;
      usage.outputTokens += session.metadata.tokenUsage.outputTokens;
      usage.totalTokens += session.metadata.tokenUsage.totalTokens;
    }
    return usage;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    logger.info('会话管理器已关闭');
  }
}
