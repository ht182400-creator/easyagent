/**
 * SQLite 数据库迁移器（P1-5）
 *
 * ── 设计要点 ──
 *   1. 版本戳使用 SQLite 内建的 `PRAGMA user_version`（存储在数据库头，
 *      无需额外的迁移记录表，且随事务一起提交）；
 *   2. **每个迁移独立事务**：`up()` 与 `user_version = N` 在同一事务内执行，
 *      迁移抛错时整体回滚 → 版本号不推进 → 下次启动从断点续跑（不会半迁移）；
 *   3. **fail-fast**：迁移失败向上抛出，由调用方决定降级或退出 ——
 *      宁可起不来，也不能带着未知 schema 继续写数据；
 *   4. **环境探测**：better-sqlite3 的内存测试 mock 对 pragma 无感知
 *      （`pragma()` 是空操作），此时读到的版本为 `null` → 跳过迁移并记 debug
 *      （测试 mock 环境无真实 schema 版本可言，硬跑反而破坏既有单测）；
 *   5. **只前进不回滚**：本机制不含 down 迁移（本地应用场景下回滚脚本
 *      是伪安全 —— 旧代码读到新字段同样会出错），回滚 = 恢复备份文件。
 *
 * @module db/DatabaseMigrator
 */

import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/** 单个迁移定义 */
export interface Migration {
  /** 迁移成功后的 user_version 值（从 1 开始，严格递增） */
  version: number;
  /** 人类可读描述（进日志） */
  description: string;
  /**
   * 迁移体（在事务内执行）
   *
   * ⚠️ 基线迁移（v1）必须对「旧代码创建的、user_version=0 的存量库」幂等 ——
   * 用 CREATE TABLE IF NOT EXISTS / addColumnIfMissing，禁止裸 CREATE/ALTER。
   */
  up: (db: Database.Database) => void;
}

/** migrate() 的返回结果 */
export interface MigrationResult {
  /** 迁移前版本（-1 表示环境不支持，已跳过） */
  from: number;
  /** 迁移后版本 */
  to: number;
  /** 本次实际执行的迁移 */
  applied: Array<{ version: number; description: string }>;
  /** 跳过原因（环境不支持时非空） */
  skippedReason?: string;
}

/**
 * 读取数据库 schema 版本
 *
 * @returns 当前 user_version；环境不支持版本查询（如测试 mock）时返回 null
 */
export function getUserVersion(db: Database.Database): number | null {
  try {
    const v = db.pragma('user_version', { simple: true }) as unknown;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

/**
 * 检查表是否存在
 *
 * @param name - 表名
 */
export function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return !!row;
}

/**
 * 检查列是否存在
 *
 * @param table - 表名
 * @param column - 列名
 */
export function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

/**
 * 安全加列：列不存在才 ALTER TABLE（供基线迁移兼容更老的存量库）
 *
 * @param table - 表名
 * @param column - 列名
 * @param columnDdl - 列定义（如 "TEXT DEFAULT ''"，不含列名本身）
 */
export function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  columnDdl: string,
): void {
  if (columnExists(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnDdl}`);
  logger.info({ table, column }, '已补充缺失列（存量库升级）');
}

/**
 * 数据库迁移器
 *
 * 用法：
 * ```ts
 * new DatabaseMigrator(db, { name: 'sessions', migrations: SESSION_MIGRATIONS }).migrate();
 * ```
 */
export class DatabaseMigrator {
  private readonly migrations: Migration[];

  /**
   * @param db - 已打开的 better-sqlite3 连接
   * @param opts.name - 数据库逻辑名（进日志，如 'sessions'）
   * @param opts.migrations - 迁移清单（版本必须从 ≥1 开始严格递增，构造时校验）
   */
  constructor(
    private readonly db: Database.Database,
    private readonly opts: { name: string; migrations: Migration[] },
  ) {
    // 迁移清单静态校验：版本号乱序/重复会导致"断点续跑"语义失效，直接拒绝
    const versions = opts.migrations.map((m) => m.version);
    for (let i = 0; i < versions.length; i++) {
      if (!Number.isInteger(versions[i]) || versions[i] < 1) {
        throw new Error(`[${opts.name}] 迁移版本号必须为 ≥1 的整数，发现非法值: ${versions[i]}`);
      }
      if (i > 0 && versions[i] <= versions[i - 1]) {
        throw new Error(
          `[${opts.name}] 迁移版本号必须严格递增，发现 ${versions[i]} ≤ ${versions[i - 1]}`,
        );
      }
    }
    this.migrations = [...opts.migrations];
  }

  /** 当前清单的最高版本（无迁移时为 0） */
  get latestVersion(): number {
    return this.migrations.length > 0 ? this.migrations[this.migrations.length - 1].version : 0;
  }

  /**
   * 执行迁移：把库从当前版本推进到清单最高版本
   *
   * @throws 迁移体抛错时原样向上抛（版本号不推进，数据已回滚）
   */
  migrate(): MigrationResult {
    const current = getUserVersion(this.db);

    // 环境不支持版本查询（测试 mock）：跳过迁移，保持既有测试行为不变
    if (current === null) {
      const reason = '当前环境不支持 PRAGMA user_version（可能是测试 mock），跳过迁移';
      logger.debug({ db: this.opts.name }, reason);
      return { from: -1, to: -1, applied: [], skippedReason: reason };
    }

    const pending = this.migrations.filter((m) => m.version > current);
    if (pending.length === 0) {
      logger.debug({ db: this.opts.name, version: current }, '数据库 schema 已是最新，无需迁移');
      return { from: current, to: current, applied: [] };
    }

    const applied: Array<{ version: number; description: string }> = [];
    for (const migration of pending) {
      // up() 与 user_version 推进放在同一事务：任一失败整体回滚
      const run = this.db.transaction(() => {
        migration.up(this.db);
        this.db.pragma(`user_version = ${migration.version}`);
      });
      try {
        run();
      } catch (err) {
        logger.error(
          {
            db: this.opts.name,
            migration: migration.version,
            description: migration.description,
            error: (err as Error).message,
          },
          '数据库迁移失败（已回滚，版本号未推进）—— 请检查磁盘空间/文件占用后重试；' +
            '若反复失败，请用备份恢复数据目录',
        );
        throw err;
      }
      applied.push({ version: migration.version, description: migration.description });
      logger.info(
        { db: this.opts.name, version: migration.version, description: migration.description },
        '数据库迁移已应用',
      );
    }

    return { from: current, to: this.latestVersion, applied };
  }
}
