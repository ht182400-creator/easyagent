/**
 * DatabaseMigrator 专项测试（P1-5）
 *
 * ⚠️ 本文件必须使用**真实的 better-sqlite3**（PRAGMA user_version / 事务回滚 / ALTER TABLE
 * 在内存 mock 中不存在语义）。vitest.config 把 'better-sqlite3' 别名到了 mock，
 * 因此这里用 `createRequire` 直连 Node 的 require —— 不经过 Vite 别名解析。
 *
 * 覆盖维度（按测试规范）：
 *   - 正常值：新库全量迁移 / 幂等重跑
 *   - 边界值：空迁移清单 / 已是最新版本 / 版本号非法（0、重复、降序）
 *   - 异常场景：迁移体抛错（事务回滚 + 版本不推进 + 断点续跑）/ mock 环境跳过
 *   - 数据保留：存量旧库（user_version=0）升级后数据不丢
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type DatabaseType from 'better-sqlite3';

// ⚠️ 绕过 vitest 的 better-sqlite3 → mock 别名，加载真实原生模块
const requireReal = createRequire(import.meta.url);
const Database = requireReal('better-sqlite3') as typeof DatabaseType;

import {
  DatabaseMigrator,
  getUserVersion,
  tableExists,
  columnExists,
  addColumnIfMissing,
} from '../db/DatabaseMigrator.js';
import { SESSION_MIGRATIONS } from '../db/sessionMigrations.js';
import type { Migration } from '../db/DatabaseMigrator.js';

/** 测试用临时目录（每文件共享，测试结束后整体删除） */
const testDir = mkdtempSync(join(tmpdir(), 'ea-migrator-test-'));

afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // 清理失败不影响测试结论（系统临时目录，由 OS 回收）
  }
});

/** 在临时目录下新建一个独立的真实 SQLite 库 */
function openTestDb(
  fileName = `db_${Math.random().toString(36).slice(2)}.db`,
): DatabaseType.Database {
  return new Database(join(testDir, fileName));
}

// ==================== getUserVersion / 探测辅助 ====================

describe('getUserVersion', () => {
  it('新库 user_version 应为 0', () => {
    const db = openTestDb();
    expect(getUserVersion(db)).toBe(0);
    db.close();
  });

  it('mock 环境（pragma 无返回）应返回 null（触发跳过分支）', () => {
    // 模拟测试 mock：pragma() 是空操作、返回 undefined
    const fakeDb = { pragma: () => undefined } as unknown as DatabaseType.Database;
    expect(getUserVersion(fakeDb)).toBeNull();
  });

  it('pragma 抛错时应返回 null 而非向上抛', () => {
    const fakeDb = {
      pragma: () => {
        throw new Error('not supported');
      },
    } as unknown as DatabaseType.Database;
    expect(getUserVersion(fakeDb)).toBeNull();
  });
});

describe('tableExists / columnExists / addColumnIfMissing', () => {
  it('不存在的表/列应返回 false', () => {
    const db = openTestDb();
    expect(tableExists(db, 'nope')).toBe(false);
    db.exec('CREATE TABLE t (a TEXT)');
    expect(columnExists(db, 't', 'b')).toBe(false);
    db.close();
  });

  it('存在的表/列应返回 true', () => {
    const db = openTestDb();
    db.exec('CREATE TABLE t (a TEXT, b INTEGER)');
    expect(tableExists(db, 't')).toBe(true);
    expect(columnExists(db, 't', 'a')).toBe(true);
    expect(columnExists(db, 't', 'b')).toBe(true);
    db.close();
  });

  it('addColumnIfMissing：缺列补上，已有列不重复加（二次 ALTER 会抛 → 以不抛为通过）', () => {
    const db = openTestDb();
    db.exec('CREATE TABLE t (a TEXT)');
    addColumnIfMissing(db, 't', 'b', "TEXT DEFAULT ''");
    expect(columnExists(db, 't', 'b')).toBe(true);
    // 幂等：列已存在时应静默跳过
    expect(() => addColumnIfMissing(db, 't', 'b', "TEXT DEFAULT ''")).not.toThrow();
    db.close();
  });
});

// ==================== DatabaseMigrator.migrate ====================

describe('DatabaseMigrator.migrate — 新库', () => {
  it('新库应按序应用全部迁移并推进 user_version', () => {
    const db = openTestDb();
    const migrations: Migration[] = [
      { version: 1, description: 'v1', up: (d) => d.exec('CREATE TABLE t1 (a TEXT)') },
      { version: 2, description: 'v2', up: (d) => d.exec('CREATE TABLE t2 (a TEXT)') },
    ];
    const result = new DatabaseMigrator(db, { name: 'test', migrations }).migrate();

    expect(result.from).toBe(0);
    expect(result.to).toBe(2);
    expect(result.applied).toHaveLength(2);
    expect(getUserVersion(db)).toBe(2);
    expect(tableExists(db, 't1')).toBe(true);
    expect(tableExists(db, 't2')).toBe(true);
    db.close();
  });

  it('重复 migrate 应幂等（applied=0，版本不变）', () => {
    const db = openTestDb();
    const opts = { name: 'test', migrations: SESSION_MIGRATIONS };
    new DatabaseMigrator(db, opts).migrate();
    const second = new DatabaseMigrator(db, opts).migrate();

    expect(second.applied).toHaveLength(0);
    expect(second.from).toBe(second.to);
    expect(getUserVersion(db)).toBe(SESSION_MIGRATIONS[SESSION_MIGRATIONS.length - 1].version);
    db.close();
  });

  it('空迁移清单：from=to=0，applied=0', () => {
    const db = openTestDb();
    const result = new DatabaseMigrator(db, { name: 'empty', migrations: [] }).migrate();
    expect(result).toEqual({ from: 0, to: 0, applied: [] });
    db.close();
  });
});

describe('DatabaseMigrator.migrate — 存量旧库升级（数据保留）', () => {
  /**
   * 模拟迁移机制引入前的旧库：旧代码直接 CREATE TABLE（user_version 停留在 0）
   */
  function createLegacyDb(): DatabaseType.Database {
    const db = openTestDb('legacy.db');
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
    // 写入一条存量会话数据 —— 升级后必须原样保留
    db.prepare(
      `INSERT INTO sessions (id, workspace, provider, model, messages, title, status, token_usage, summary, created_at, updated_at, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'legacy_session_1',
      'd:/workspace',
      'deepseek',
      'deepseek-v4',
      '[]',
      '旧会话',
      'active',
      '{"inputTokens":10,"outputTokens":5,"totalTokens":15}',
      '',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '[]',
    );
    return db;
  }

  it('旧库（user_version=0）升级：v1 幂等、v2 建索引、数据保留', () => {
    const db = createLegacyDb();
    expect(getUserVersion(db)).toBe(0);

    const result = new DatabaseMigrator(db, {
      name: 'sessions',
      migrations: SESSION_MIGRATIONS,
    }).migrate();
    expect(result.from).toBe(0);
    expect(result.to).toBe(2);

    // v1 基线幂等：表没有被重建（数据还在）
    const row = db
      .prepare('SELECT id, title FROM sessions WHERE id = ?')
      .get('legacy_session_1') as {
      id: string;
      title: string;
    };
    expect(row.id).toBe('legacy_session_1');
    expect(row.title).toBe('旧会话');

    // v2 索引真实存在
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_sessions_%'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_sessions_workspace');
    expect(names).toContain('idx_sessions_updated_at');
    expect(names).toContain('idx_sessions_status');

    db.close();
  });

  it('缺 summary/tags 列的更老存量库应由基线补齐', () => {
    const db = openTestDb('older_legacy.db');
    // 比 v1 基线更老的表：没有 summary / tags
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        workspace TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        messages TEXT NOT NULL DEFAULT '[]',
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        token_usage TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    new DatabaseMigrator(db, { name: 'sessions', migrations: SESSION_MIGRATIONS }).migrate();

    expect(columnExists(db, 'sessions', 'summary')).toBe(true);
    expect(columnExists(db, 'sessions', 'tags')).toBe(true);
    db.close();
  });
});

describe('DatabaseMigrator.migrate — 异常场景', () => {
  it('迁移体抛错：向上抛、版本不推进、事务内 DDL 回滚', () => {
    const db = openTestDb();
    const migrations: Migration[] = [
      { version: 1, description: 'v1', up: (d) => d.exec('CREATE TABLE ok1 (a TEXT)') },
      {
        version: 2,
        description: 'v2 会失败',
        up: (d) => {
          d.exec('CREATE TABLE rollback_me (a TEXT)');
          throw new Error('boom');
        },
      },
    ];

    expect(() => new DatabaseMigrator(db, { name: 'fail', migrations }).migrate()).toThrow('boom');

    // 版本停在 1（v2 未推进）
    expect(getUserVersion(db)).toBe(1);
    // v1 已提交
    expect(tableExists(db, 'ok1')).toBe(true);
    // v2 事务内建的表已被回滚
    expect(tableExists(db, 'rollback_me')).toBe(false);
    db.close();
  });

  it('断点续跑：失败修复后从当前版本继续，不重复执行已应用迁移', () => {
    const db = openTestDb();
    const bad: Migration[] = [
      { version: 1, description: 'v1', up: (d) => d.exec('CREATE TABLE t (a TEXT)') },
      {
        version: 2,
        description: 'v2 炸',
        up: () => {
          throw new Error('x');
        },
      },
    ];
    try {
      new DatabaseMigrator(db, { name: 'resume', migrations: bad }).migrate();
    } catch {
      // 预期失败
    }

    // 修复后的清单：v1 保持不变（不能重跑），v2 正常
    const fixed: Migration[] = [
      { version: 1, description: 'v1', up: (d) => d.exec('CREATE TABLE IF NOT EXISTS t (a TEXT)') },
      { version: 2, description: 'v2', up: (d) => d.exec('ALTER TABLE t ADD COLUMN b TEXT') },
    ];
    const result = new DatabaseMigrator(db, { name: 'resume', migrations: fixed }).migrate();

    expect(result.applied.map((m) => m.version)).toEqual([2]);
    expect(getUserVersion(db)).toBe(2);
    expect(columnExists(db, 't', 'b')).toBe(true);
    db.close();
  });

  it('mock 环境（版本查询不可用）应整体跳过迁移', () => {
    // pragma 既不返回值也不报错的假库 —— 模拟测试 mock
    const fakeDb = {
      pragma: () => undefined,
      prepare: () => {
        throw new Error('mock 不支持 prepare PRAGMA');
      },
      exec: () => {
        throw new Error('mock 不应被执行到');
      },
      transaction: () => {
        throw new Error('mock 不应被执行到');
      },
    } as unknown as DatabaseType.Database;

    const result = new DatabaseMigrator(fakeDb, {
      name: 'mock',
      migrations: SESSION_MIGRATIONS,
    }).migrate();

    expect(result.skippedReason).toBeTruthy();
    expect(result.applied).toHaveLength(0);
    expect(result.from).toBe(-1);
  });
});

describe('DatabaseMigrator 构造校验（非法清单）', () => {
  const make = (versions: number[]) =>
    versions.map((v) => ({ version: v, description: `v${v}`, up: () => {} }));

  it('版本号含 0 / 负数 / 非整数应拒绝', () => {
    const db = openTestDb();
    expect(() => new DatabaseMigrator(db, { name: 'x', migrations: make([0, 1]) })).toThrow('≥1');
    expect(() => new DatabaseMigrator(db, { name: 'x', migrations: make([1.5]) })).toThrow('≥1');
    db.close();
  });

  it('版本号重复应拒绝', () => {
    const db = openTestDb();
    expect(() => new DatabaseMigrator(db, { name: 'x', migrations: make([1, 1]) })).toThrow(
      '严格递增',
    );
    db.close();
  });

  it('版本号降序应拒绝', () => {
    const db = openTestDb();
    expect(() => new DatabaseMigrator(db, { name: 'x', migrations: make([2, 1]) })).toThrow(
      '严格递增',
    );
    db.close();
  });

  it('latestVersion：空清单为 0，正常为最后一项', () => {
    const db = openTestDb();
    expect(new DatabaseMigrator(db, { name: 'x', migrations: [] }).latestVersion).toBe(0);
    expect(new DatabaseMigrator(db, { name: 'x', migrations: make([1, 3, 5]) }).latestVersion).toBe(
      5,
    );
    db.close();
  });
});
