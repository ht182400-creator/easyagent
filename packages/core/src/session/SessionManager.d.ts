import type { Session, SessionMetadata, TokenUsage } from '../types/index.js';
export declare class SessionManager {
    private db;
    private sessions;
    constructor(dataDir?: string);
    /**
     * 加载所有会话到内存
     */
    private loadSessions;
    /**
     * 数据库行转Session对象
     */
    private rowToSession;
    /**
     * 获取或创建会话
     */
    getOrCreate(id: string, config?: {
        workspace?: string;
        provider?: string;
        model?: string;
    }): Session;
    /**
     * 获取会话
     */
    get(id: string): Session | undefined;
    /**
     * 列出所有会话
     */
    list(status?: SessionMetadata['status']): Session[];
    /**
     * 保存会话
     */
    save(session: Session): void;
    /**
     * 持久化到数据库
     */
    private saveToDb;
    /**
     * 删除会话
     */
    delete(id: string): void;
    /**
     * 归档会话
     */
    archive(id: string): void;
    /**
     * 搜索会话
     */
    search(query: string): Session[];
    /**
     * 清除所有会话
     */
    clearAll(): void;
    /**
     * 获取Token用量统计
     */
    getTotalTokenUsage(): TokenUsage;
    /**
     * 关闭数据库连接
     */
    close(): void;
}
//# sourceMappingURL=SessionManager.d.ts.map