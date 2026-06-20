/**
 * better-sqlite3 内存 Mock
 * 用于在无原生模块编译环境下运行单元测试
 * 使用内存 Map 模拟 SQLite 行为
 */
declare class MockStatement {
    private db;
    private sql;
    private params;
    constructor(db: MockDatabase, sql: string);
    /** 绑定参数 */
    run(...params: unknown[]): {
        changes: number;
        lastInsertRowid: number;
    };
    /** 查询全部 */
    all(...params: unknown[]): Array<Record<string, unknown>>;
    /** 查询单个 */
    get(...params: unknown[]): Record<string, unknown> | undefined;
}
declare class MockDatabase {
    /** 模拟的表数据: 表名 → 行数组 */
    private tables;
    private closed;
    constructor(dbPath: string);
    /** 创建 sqlite_master 等元数据 */
    private initMeta;
    /** 执行 pragma 语句（无操作） */
    pragma(_sql: string): void;
    /** 执行 SQL（DDL/DML） */
    exec(sql: string): void;
    /** 准备语句 */
    prepare(sql: string): MockStatement;
    /** 执行 SQL 并解析 */
    execute(sql: string, params: unknown[]): {
        changes: number;
        lastInsertRowid: number;
    };
    /** 执行查询 SQL */
    query(sql: string, params: unknown[]): Array<Record<string, unknown>>;
    /** 处理 INSERT 或 REPLACE */
    private handleInsertOrReplace;
    /** 处理普通 INSERT */
    private handleInsert;
    /** 处理带 WHERE 的 DELETE */
    private handleDeleteWithWhere;
    /** 处理 DELETE all */
    private handleDeleteAll;
    /** 关闭数据库 */
    close(): void;
}
declare const BetterSqlite3: typeof MockDatabase;
export default BetterSqlite3;
export { MockDatabase as Database };
//# sourceMappingURL=better-sqlite3.d.ts.map