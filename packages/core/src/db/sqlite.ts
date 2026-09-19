/**
 * SQLite 驱动适配层 —— 默认 `better-sqlite3`，可选 Node 内置 `node:sqlite`
 *
 * ── 为什么需要这一层 ──
 * 1. **桌面端（Electron）只能走 `better-sqlite3`**：Electron 30 内置 Node 20.11，
 *    而 `node:sqlite` 需要 Node ≥ 22.5（分界为 Electron 35 = Node 22.14）。原生模块在
 *    Electron 下本来就是主流做法（按 Electron ABI 重建一次）。
 * 2. **服务端 / CLI / 开发 / 测试不必依赖原生模块**：这些场景的 Node 若是 ≥ 22.5，
 *    可以直接用内置的 `node:sqlite` —— 不需要编译工具链、不需要预编译二进制。
 *    用环境变量切换：`EASYAGENT_SQLITE_DRIVER=node`（默认仍是 better-sqlite3，
 *    因此**默认行为零变化**）。
 * 3. `node:sqlite` 官方仍是 Stability 1.2（Release candidate，见 Node 文档），
 *    故**刻意不做默认值**：想固定用回原生模块，删掉该环境变量即可。
 *
 * ── 语义对齐（2026-09-19 实测 13 项，其中 12 项一致）──
 * 对照脚本逐项跑了本仓真实用法（WAL / `user_version` / `run` 返回结构 / `all`·`get` /
 * `sqlite_master` / `PRAGMA table_info` / `ALTER` 补列 / 事务提交 / **事务回滚后版本不推进** /
 * 只读打开），只有两处需要 shim，且都已在本文件实现：
 *
 * - ① **`pragma()`**：`node:sqlite` 没有此方法 → 写入型（含 `=`）走 `exec`、查询型走
 *   `prepare().get()`（含 `{ simple: true }` 的标量语义）。
 * - ② **`transaction()`**：`node:sqlite` 没有此方法 → 用 `BEGIN/COMMIT/ROLLBACK` 包，
 *   并用 **SAVEPOINT** 支持嵌套（与 better-sqlite3 的行为对齐）。
 *
 * 唯一"差异"其实是**本仓自己的缺陷**：旧代码在 `DatabaseTools` 里写 `db.readonly = true`，
 * 而 better-sqlite3 的 `readonly` 是**只读 getter**，赋值会抛错（`node:sqlite` 则会静默无效）。
 * 现在统一改为**打开时传 `readOnly`**，两个驱动行为一致。
 *
 * ⚠️ 用 `node` 驱动时，Node 会打印一条 `ExperimentalWarning`（官方对 `node:sqlite` 的定性），
 * 这是预期行为，不是本模块的错误。
 *
 * @module db/sqlite
 */

import { createRequire } from 'node:module';
import type BetterSqlite3 from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/** 可用驱动名 */
export type SqliteDriverName = 'better-sqlite3' | 'node';

/** `run()` 的返回结构（与 better-sqlite3 对齐） */
export interface SqliteRunResult {
  changes: number;
  /** 自增主键；better-sqlite3 可能返回 bigint */
  lastInsertRowid: number | bigint;
}

/** 预编译语句（`run` / `get` / `all` 与 better-sqlite3 同名同义） */
export interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/** 数据库连接（本仓只用到的能力子集） */
export interface SqliteDatabase {
  /** 实际生效的驱动（排障用） */
  readonly driver: SqliteDriverName;
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  close(): void;
}

/** 打开选项 */
export interface OpenSqliteOptions {
  /** 只读打开（库不存在则打开失败） */
  readOnly?: boolean;
  /** 显式指定驱动；不传则读环境变量，再退回默认 */
  driver?: SqliteDriverName;
}

/** 驱动选择用的环境变量 */
export const SQLITE_DRIVER_ENV = 'EASYAGENT_SQLITE_DRIVER';

/** 默认驱动：**刻意不选 node**（node:sqlite 仍为 RC；桌面端也不支持） */
const DEFAULT_DRIVER: SqliteDriverName = 'better-sqlite3';

/**
 * 解析要使用的驱动
 *
 * 优先级：显式参数（由调用方处理）> 环境变量 > 默认。
 *
 * @returns 驱动名
 */
export function resolveSqliteDriver(): SqliteDriverName {
  const raw = process.env[SQLITE_DRIVER_ENV]?.trim().toLowerCase();
  if (!raw) return DEFAULT_DRIVER;
  if (raw === 'node' || raw === 'node:sqlite' || raw === 'builtin') return 'node';
  if (raw === 'better-sqlite3' || raw === 'better') return 'better-sqlite3';
  logger.warn(
    { value: raw, env: SQLITE_DRIVER_ENV, fallback: DEFAULT_DRIVER },
    '未知的 SQLite 驱动取值，已回退到默认驱动',
  );
  return DEFAULT_DRIVER;
}

/** 以 core 包为基准做 CJS 解析（pnpm 隔离布局下原生模块只装在包内） */
const requireFromHere = createRequire(import.meta.url);

/**
 * 加载 better-sqlite3（**惰性**：选 node 驱动时完全不加载原生模块）
 */
function loadBetterSqlite3(): typeof BetterSqlite3 {
  return requireFromHere('better-sqlite3') as typeof BetterSqlite3;
}

/** node:sqlite 的最小类型（Node ≥22.5；此处不引入 @types/node 的版本约束） */
interface NodeSqliteStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface NodeSqliteDatabase {
  prepare(sql: string): NodeSqliteStatement;
  exec(sql: string): void;
  close(): void;
}
interface NodeSqliteModule {
  DatabaseSync: new (file: string, options?: { readOnly?: boolean }) => NodeSqliteDatabase;
}

/**
 * 加载 node:sqlite（Node <22.5 会抛错）
 */
function loadNodeSqlite(): NodeSqliteModule {
  try {
    return requireFromHere('node:sqlite') as NodeSqliteModule;
  } catch (error) {
    throw new Error(
      `当前 Node（${process.version}）不支持内置 node:sqlite（需 ≥22.5）。` +
        `请改用默认驱动（删除 ${SQLITE_DRIVER_ENV}）或升级 Node。原始错误：${(error as Error).message}`,
    );
  }
}

/** 包住 better-sqlite3 的实现（语义基准） */
function openWithBetterSqlite3(file: string, readOnly: boolean): SqliteDatabase {
  const Ctor = loadBetterSqlite3();
  const db = new Ctor(file, readOnly ? { readonly: true } : undefined);

  return {
    driver: 'better-sqlite3',
    prepare: (sql) => db.prepare(sql) as unknown as SqliteStatement,
    exec: (sql) => {
      db.exec(sql);
    },
    pragma: (sql, options) => db.pragma(sql, options) as unknown,
    transaction: (fn) => db.transaction(fn) as unknown as (...args: unknown[]) => unknown,
    close: () => db.close(),
  } as SqliteDatabase;
}

/** 包住 node:sqlite 的实现（两处 shim：pragma / transaction） */
function openWithNodeSqlite(file: string, readOnly: boolean): SqliteDatabase {
  const { DatabaseSync } = loadNodeSqlite();
  const db = new DatabaseSync(file, readOnly ? { readOnly: true } : {});

  /** 事务嵌套深度（0 = 外层，用 BEGIN/COMMIT；>0 用 SAVEPOINT，与 better-sqlite3 对齐） */
  let depth = 0;

  return {
    driver: 'node',

    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        run: (...params: unknown[]) => {
          const r = stmt.run(...params);
          return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
        },
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
      };
    },

    exec: (sql) => {
      db.exec(sql);
    },

    /**
     * shim ①：node:sqlite 无 `pragma()`
     *
     * - 写入型（含 `=`，如 `journal_mode = WAL`、`user_version = 3`）→ `exec`，随后读回结果
     *   （better-sqlite3 的写入型调用同样会返回结果行，保持一致）
     * - 查询型（如 `user_version`、`table_info('x')`）→ `prepare().get()`，`{ simple: true }`
     *   时返回标量
     */
    pragma: (sql, options) => {
      const isWrite = sql.includes('=');
      if (isWrite) {
        db.exec(`PRAGMA ${sql}`);
      }
      const name = sql.split('=')[0].trim();
      const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown> | undefined;
      if (!row) return options?.simple ? undefined : [];
      return options?.simple ? Object.values(row)[0] : [row];
    },

    /** shim ②：node:sqlite 无 `transaction()`（用 BEGIN/COMMIT/ROLLBACK + SAVEPOINT 支持嵌套） */
    transaction: <A extends unknown[], R>(fn: (...args: A) => R) => {
      return (...args: A): R => {
        const isOuter = depth === 0;
        const savepoint = `ea_sp_${depth}`;
        db.exec(isOuter ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
        depth += 1;
        try {
          const result = fn(...args);
          depth -= 1;
          db.exec(isOuter ? 'COMMIT' : `RELEASE ${savepoint}`);
          return result;
        } catch (error) {
          depth -= 1;
          if (isOuter) {
            db.exec('ROLLBACK');
          } else {
            db.exec(`ROLLBACK TO ${savepoint}`);
            db.exec(`RELEASE ${savepoint}`);
          }
          throw error;
        }
      };
    },

    close: () => db.close(),
  } as SqliteDatabase;
}

/**
 * 打开数据库（本仓所有 SQLite 连接都应经由此函数）
 *
 * @param file 数据库文件路径（或 `:memory:`）
 * @param options.readOnly 只读打开
 * @param options.driver 显式指定驱动；不传则按环境变量解析
 * @returns 统一接口的连接
 */
export function openDatabase(file: string, options: OpenSqliteOptions = {}): SqliteDatabase {
  const driver = options.driver ?? resolveSqliteDriver();
  const readOnly = options.readOnly === true;

  const db =
    driver === 'node' ? openWithNodeSqlite(file, readOnly) : openWithBetterSqlite3(file, readOnly);

  logger.debug({ file, driver: db.driver, readOnly }, '已打开 SQLite 连接');
  return db;
}
