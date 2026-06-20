/**
 * 会话管理器
 * 管理对话会话的创建、存储、恢复和持久化
 * 使用SQLite进行本地持久化存储
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../utils/logger.js';
/** 默认数据目录 */
const DATA_DIR = join(homedir(), '.easyagent', 'data');
export class SessionManager {
    db;
    sessions = new Map();
    constructor(dataDir) {
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
    loadSessions() {
        const rows = this.db
            .prepare('SELECT * FROM sessions WHERE status != ? ORDER BY updated_at DESC')
            .all('archived');
        for (const row of rows) {
            const session = this.rowToSession(row);
            this.sessions.set(session.id, session);
        }
        logger.info({ count: rows.length }, '已加载会话');
    }
    /**
     * 数据库行转Session对象
     */
    rowToSession(row) {
        return {
            id: row.id,
            workspace: row.workspace,
            modelConfig: {
                provider: (row.provider || 'deepseek'),
                model: (row.model || 'deepseek-v4'),
            },
            messages: JSON.parse(row.messages || '[]'),
            metadata: {
                title: row.title || '',
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
                status: row.status || 'active',
                tokenUsage: JSON.parse(row.token_usage || '{}'),
                tags: JSON.parse(row.tags || '[]'),
            },
            summary: row.summary || undefined,
        };
    }
    /**
     * 获取或创建会话
     */
    getOrCreate(id, config) {
        const existing = this.sessions.get(id);
        if (existing)
            return existing;
        const session = {
            id,
            workspace: config?.workspace || process.cwd(),
            modelConfig: {
                provider: (config?.provider || 'deepseek'),
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
    get(id) {
        return this.sessions.get(id);
    }
    /**
     * 列出所有会话
     */
    list(status) {
        const all = Array.from(this.sessions.values());
        if (status) {
            return all.filter(s => s.metadata.status === status);
        }
        return all;
    }
    /**
     * 保存会话
     */
    save(session) {
        this.sessions.set(session.id, session);
        this.saveToDb(session);
    }
    /**
     * 持久化到数据库
     */
    saveToDb(session) {
        try {
            this.db
                .prepare(`INSERT OR REPLACE INTO sessions 
           (id, workspace, provider, model, messages, title, status, token_usage, summary, created_at, updated_at, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(session.id, session.workspace, session.modelConfig.provider, session.modelConfig.model, JSON.stringify(session.messages), session.metadata.title, session.metadata.status, JSON.stringify(session.metadata.tokenUsage), session.summary || '', session.metadata.createdAt.toISOString(), session.metadata.updatedAt.toISOString(), JSON.stringify(session.metadata.tags || []));
        }
        catch (error) {
            logger.error({ error, sessionId: session.id }, '会话保存失败');
        }
    }
    /**
     * 删除会话
     */
    delete(id) {
        this.sessions.delete(id);
        this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
        logger.info({ sessionId: id }, '会话已删除');
    }
    /**
     * 归档会话
     */
    archive(id) {
        const session = this.sessions.get(id);
        if (session) {
            session.metadata.status = 'archived';
            this.save(session);
        }
    }
    /**
     * 搜索会话
     */
    search(query) {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.sessions.values()).filter(s => s.metadata.title.toLowerCase().includes(lowerQuery) ||
            s.messages.some(m => {
                const content = typeof m.content === 'string' ? m.content : '';
                return content.toLowerCase().includes(lowerQuery);
            }));
    }
    /**
     * 清除所有会话
     */
    clearAll() {
        this.sessions.clear();
        this.db.exec('DELETE FROM sessions');
        logger.info('所有会话已清除');
    }
    /**
     * 获取Token用量统计
     */
    getTotalTokenUsage() {
        const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
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
    close() {
        this.db.close();
        logger.info('会话管理器已关闭');
    }
}
//# sourceMappingURL=SessionManager.js.map