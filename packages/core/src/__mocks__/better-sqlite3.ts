/**
 * better-sqlite3 内存 Mock
 * 用于在无原生模块编译环境下运行单元测试
 * 使用内存 Map 模拟 SQLite 行为
 */

/** 内存数据库存储 */
const databases: Map<string, MockDatabase> = new Map();

/** 检查路径是否匹配测试目录 */
function isTestPath(dbPath: string): boolean {
  return dbPath.includes('easyagent-test') || dbPath.includes('easyagent');
}

class MockStatement {
  private params: unknown[] = [];

  constructor(
    private db: MockDatabase,
    private sql: string,
  ) {}

  /** 绑定参数 */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
    this.params = params;
    return this.db.execute(this.sql, params);
  }

  /** 查询全部 */
  all(...params: unknown[]): Array<Record<string, unknown>> {
    this.params = params;
    return this.db.query(this.sql, params);
  }

  /** 查询单个 */
  get(...params: unknown[]): Record<string, unknown> | undefined {
    const results = this.all(...params);
    return results[0];
  }
}

class MockDatabase {
  /** 模拟的表数据: 表名 → 行数组 */
  private tables: Map<string, Array<Map<string, unknown>>> = new Map();
  private closed = false;

  constructor(dbPath: string) {
    if (!isTestPath(dbPath)) {
      // 非测试路径：在实际运行中这会是真实 DB，测试中只允许测试路径
      console.warn(`[Mock SQLite] 非测试路径: ${dbPath}, 继续使用内存模拟`);
    }
    databases.set(dbPath, this);
    this.initMeta();
  }

  /** 创建 sqlite_master 等元数据 */
  private initMeta(): void {
    this.tables.set('sessions', []);
  }

  /** 执行 pragma 语句（无操作） */
  pragma(_sql: string): void {
    // pragma 在 mock 中无操作
  }

  /** 执行 SQL（DDL/DML） */
  exec(sql: string): void {
    const normalized = sql.trim();
    // CREATE TABLE
    const createMatch = normalized.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
    if (createMatch) {
      const tableName = createMatch[1];
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
      }
    }
  }

  /** 准备语句 */
  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  /** 执行 SQL 并解析 */
  execute(sql: string, params: unknown[]): { changes: number; lastInsertRowid: number } {
    const normalized = sql.trim();

    // INSERT OR REPLACE INTO
    if (/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)/i.test(normalized)) {
      const tableMatch = normalized.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)/i);
      return this.handleInsertOrReplace(tableMatch![1], params);
    }

    // INSERT INTO
    if (/INSERT\s+INTO\s+(\w+)/i.test(normalized)) {
      const tableMatch = normalized.match(/INSERT\s+INTO\s+(\w+)/i);
      return this.handleInsert(tableMatch![1], params);
    }

    // DELETE FROM
    if (/DELETE\s+FROM\s+(\w+)/i.test(normalized)) {
      const tableMatch = normalized.match(/DELETE\s+FROM\s+(\w+)/i);
      if (normalized.includes('WHERE')) {
        const whereMatch = normalized.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        if (whereMatch) {
          const colIdx = whereMatch[0].includes('status') ? 0 : 0;
          return this.handleDeleteWithWhere(tableMatch![1], whereMatch[1], params);
        }
      }
      // DELETE all
      return this.handleDeleteAll(tableMatch![1]);
    }

    // CREATE TABLE
    if (/CREATE\s+TABLE/i.test(normalized)) {
      return { changes: 0, lastInsertRowid: 0 };
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  /** 执行查询 SQL */
  query(sql: string, params: unknown[]): Array<Record<string, unknown>> {
    const normalized = sql.trim();

    // SELECT * FROM table WHERE ... ORDER BY ...
    const selectMatch = normalized.match(/SELECT\s+\*\s+FROM\s+(\w+)/i);
    if (!selectMatch) return [];

    const tableName = selectMatch[1];
    let rows = this.tables.get(tableName) || [];

    // 转为 Record 数组
    let result: Array<Record<string, unknown>> = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      row.forEach((value, key) => {
        obj[key] = value;
      });
      return obj;
    });

    // WHERE 过滤
    const whereMatch = normalized.match(/WHERE\s+(\w+)\s*(!?=)\s*\?/i);
    if (whereMatch && params.length > 0) {
      const colName = whereMatch[1];
      const operator = whereMatch[2];
      const paramVal = params[0];
      result = result.filter((row) => {
        if (operator === '!=') return row[colName] !== paramVal;
        return row[colName] === paramVal;
      });
    }

    // ORDER BY updated_at DESC
    if (normalized.includes('ORDER BY') && normalized.includes('DESC')) {
      result.sort((a, b) => {
        const aVal = String(a.updated_at || '');
        const bVal = String(b.updated_at || '');
        return bVal.localeCompare(aVal);
      });
    }

    return result;
  }

  /** 处理 INSERT 或 REPLACE */
  private handleInsertOrReplace(
    tableName: string,
    params: unknown[],
  ): { changes: number; lastInsertRowid: number } {
    const rows = this.tables.get(tableName) || [];
    // 列顺序: id, workspace, provider, model, messages, title, status, token_usage, summary, created_at, updated_at, tags
    const columns = [
      'id',
      'workspace',
      'provider',
      'model',
      'messages',
      'title',
      'status',
      'token_usage',
      'summary',
      'created_at',
      'updated_at',
      'tags',
    ];

    // 查找是否已存在
    const id = params[0] as string;
    const existingIdx = rows.findIndex((r) => r.get('id') === id);

    const row = new Map<string, unknown>();
    columns.forEach((col, i) => {
      row.set(col, i < params.length ? params[i] : null);
    });

    if (existingIdx >= 0) {
      rows[existingIdx] = row;
    } else {
      rows.push(row);
    }

    this.tables.set(tableName, rows);
    return { changes: 1, lastInsertRowid: rows.length };
  }

  /** 处理普通 INSERT */
  private handleInsert(
    tableName: string,
    params: unknown[],
  ): { changes: number; lastInsertRowid: number } {
    return this.handleInsertOrReplace(tableName, params);
  }

  /** 处理带 WHERE 的 DELETE */
  private handleDeleteWithWhere(
    tableName: string,
    _colName: string,
    params: unknown[],
  ): { changes: number; lastInsertRowid: number } {
    const rows = this.tables.get(tableName) || [];
    const idOrVal = params[0] as string;
    const newRows = rows.filter((r) => r.get('id') !== idOrVal);
    const deleted = rows.length - newRows.length;
    this.tables.set(tableName, newRows);
    return { changes: deleted, lastInsertRowid: 0 };
  }

  /** 处理 DELETE all */
  private handleDeleteAll(tableName: string): { changes: number; lastInsertRowid: number } {
    const rows = this.tables.get(tableName) || [];
    const count = rows.length;
    this.tables.set(tableName, []);
    return { changes: count, lastInsertRowid: 0 };
  }

  /** 关闭数据库 */
  close(): void {
    this.closed = true;
  }
}

// 导出为默认导出（匹配 better-sqlite3 的导出方式）
const BetterSqlite3 = MockDatabase;
export default BetterSqlite3;
export { MockDatabase as Database };
