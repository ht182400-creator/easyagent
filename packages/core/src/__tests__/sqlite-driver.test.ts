/**
 * SQLite 驱动适配层测试（**同一套断言跑两个驱动**）
 *
 * ── 为什么要有这个文件 ──
 * 本仓引入 `db/sqlite.ts` 适配层后，`better-sqlite3`（原生）与 `node:sqlite`（Node 内置）
 * 必须语义一致，否则"换个驱动"会变成换个 bug。这里用**参数化**方式把同一组动作
 * 分别打到两个驱动上（`describe.each`），覆盖：
 *   - `pragma` 的写入/读取与 `{ simple: true }` 标量语义（node 侧是靠 shim 实现的）
 *   - `transaction` 的提交 / **回滚（user_version 不推进 + 数据不落库）** / 嵌套（SAVEPOINT）
 *   - `run` 的返回结构、`all`/`get`、`ALTER` 补列、`sqlite_master` 查询
 *   - 只读打开：读得到、写被拒
 *   - `DatabaseMigrator` 端到端：真实迁移推进版本、失败迁移整体回滚
 *
 * ⚠️ `node` 驱动需要 **Node ≥ 22.5**；更低版本该组用例会**显式跳过**（skip 是可见的，
 *    不是静默通过 —— 本仓明确区分"跳过"与"通过"）。
 *
 * ⚠️ 本文件用**真实数据库文件**（`temp` 之外的系统临时目录），不再依赖任何内存 mock：
 *    旧 mock 的 `pragma()` 是空操作，导致迁移在测试里从未真正执行过。
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DatabaseMigrator,
  addColumnIfMissing,
  getUserVersion,
  tableExists,
  type Migration,
} from '../db/DatabaseMigrator.js';
import {
  SQLITE_DRIVER_ENV,
  openDatabase,
  resolveSqliteDriver,
  type SqliteDatabase,
  type SqliteDriverName,
} from '../db/sqlite.js';

/** 测试临时目录（系统 temp 下，afterAll 清理） */
const SCRATCH_ROOT = mkdtempSync(join(tmpdir(), 'ea-sqlite-driver-'));

afterAll(() => {
  rmSync(SCRATCH_ROOT, { recursive: true, force: true });
});

/** `node:sqlite` 从 Node 22.5.0 起提供 */
const [NODE_MAJOR, NODE_MINOR] = process.versions.node.split('.').map(Number);
const NODE_DRIVER_SUPPORTED = NODE_MAJOR > 22 || (NODE_MAJOR === 22 && NODE_MINOR >= 5);

/** 被测驱动清单 */
const DRIVERS: SqliteDriverName[] = ['better-sqlite3', 'node'];

/** 打开一个本用例专属的库文件 */
function openFor(driver: SqliteDriverName, name: string, readOnly = false): SqliteDatabase {
  const file = join(SCRATCH_ROOT, `${driver.replace(/[^\w]/g, '_')}-${name}-${Date.now()}.db`);
  return openDatabase(file, { driver, readOnly });
}

for (const driver of DRIVERS) {
  // Node < 22.5 时**整组显式跳过**（skip 可见，不是静默通过）；
  // 用例体用字面量 `it(...)` 书写，便于静态扫描器（docs/pipeline）统计用例数。
  const group = driver === 'node' && !NODE_DRIVER_SUPPORTED ? describe.skip : describe;

  group(`SQLite 适配层 · ${driver}`, () => {
    it('pragma：写入后可读回，且 { simple: true } 返回标量', () => {
      const db = openFor(driver, 'pragma');
      db.pragma('journal_mode = WAL');
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');

      // 非 simple 时返回行数组（与 better-sqlite3 一致）
      const rows = db.pragma('journal_mode') as Array<Record<string, unknown>>;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows[0]?.journal_mode).toBe('wal');
      db.close();
    });

    it('pragma：user_version 可读可写', () => {
      const db = openFor(driver, 'userversion');
      expect(db.pragma('user_version', { simple: true })).toBe(0);
      db.pragma('user_version = 7');
      expect(db.pragma('user_version', { simple: true })).toBe(7);
      db.close();
    });

    it('run/get/all：返回结构与行数据一致', () => {
      const db = openFor(driver, 'crud');
      db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
      const r1 = db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').run('a', 1);
      expect(Number(r1.changes)).toBe(1);
      expect(Number(r1.lastInsertRowid)).toBe(1);

      db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').run('b', 2);
      expect(db.prepare('SELECT count(*) c FROM t').get()).toEqual({ c: 2 });
      expect(db.prepare('SELECT id FROM t ORDER BY id').all()).toEqual([{ id: 'a' }, { id: 'b' }]);
      db.close();
    });

    it('事务提交：数据与 user_version 一起落库', () => {
      const db = openFor(driver, 'tx-commit');
      db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
      const tx = db.transaction(() => {
        db.prepare('INSERT INTO t (id) VALUES (?)').run('x');
        db.pragma('user_version = 1');
      });
      tx();
      expect(getUserVersion(db)).toBe(1);
      expect(db.prepare('SELECT count(*) c FROM t').get()).toEqual({ c: 1 });
      db.close();
    });

    it('事务回滚：抛错后 user_version 不推进、数据不落库（迁移的关键保证）', () => {
      const db = openFor(driver, 'tx-rollback');
      db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
      const tx = db.transaction(() => {
        db.prepare('INSERT INTO t (id) VALUES (?)').run('should-not-persist');
        db.pragma('user_version = 2');
        throw new Error('迁移体失败');
      });
      expect(() => tx()).toThrow('迁移体失败');
      expect(getUserVersion(db)).toBe(0);
      expect(db.prepare('SELECT count(*) c FROM t').get()).toEqual({ c: 0 });
      db.close();
    });

    it('嵌套事务（SAVEPOINT）：内层失败只回滚内层，外层提交仍生效', () => {
      const db = openFor(driver, 'tx-nested');
      db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
      const inner = db.transaction(() => {
        db.prepare('INSERT INTO t (id) VALUES (?)').run('inner');
        throw new Error('内层失败');
      });
      const outer = db.transaction(() => {
        db.prepare('INSERT INTO t (id) VALUES (?)').run('outer');
        expect(() => inner()).toThrow('内层失败');
      });
      outer();
      expect(db.prepare('SELECT id FROM t').all()).toEqual([{ id: 'outer' }]);
      db.close();
    });

    it('只读打开：读得到、写被拒', () => {
      const file = join(SCRATCH_ROOT, `${driver.replace(/[^\w]/g, '_')}-readonly.db`);
      const rw = openDatabase(file, { driver });
      rw.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
      rw.close();

      const ro = openDatabase(file, { driver, readOnly: true });
      expect(ro.prepare('SELECT count(*) c FROM t').get()).toEqual({ c: 0 });
      expect(() => ro.exec("INSERT INTO t (id) VALUES ('x')")).toThrow();
      ro.close();
    });

    it('DatabaseMigrator 端到端：真实迁移推进版本 + 存量库幂等', () => {
      const db = openFor(driver, 'migrator');
      const migrations: Migration[] = [
        {
          version: 1,
          description: '基线表',
          up: (d) => d.exec('CREATE TABLE IF NOT EXISTS t (id TEXT PRIMARY KEY)'),
        },
        {
          version: 2,
          description: '补列',
          up: (d) => addColumnIfMissing(d, 't', 'note', "TEXT DEFAULT ''"),
        },
      ];

      const first = new DatabaseMigrator(db, { name: 'test', migrations }).migrate();
      expect(first.from).toBe(0);
      expect(first.to).toBe(2);
      expect(first.applied.map((a) => a.version)).toEqual([1, 2]);
      expect(getUserVersion(db)).toBe(2);
      expect(tableExists(db, 't')).toBe(true);

      // 再跑一次：已是最新，不应重复应用
      const second = new DatabaseMigrator(db, { name: 'test', migrations }).migrate();
      expect(second.applied).toEqual([]);
      expect(second.to).toBe(2);
      db.close();
    });

    it('DatabaseMigrator：迁移体抛错 → 整体回滚且版本不推进', () => {
      const db = openFor(driver, 'migrator-fail');
      const migrations: Migration[] = [
        {
          version: 1,
          description: '会失败的迁移',
          up: (d) => {
            d.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
            throw new Error('迁移失败（预期）');
          },
        },
      ];

      expect(() => new DatabaseMigrator(db, { name: 'test', migrations }).migrate()).toThrow(
        '迁移失败（预期）',
      );
      expect(getUserVersion(db)).toBe(0);
      // 表创建也在同一事务里被回滚
      expect(tableExists(db, 't')).toBe(false);
      db.close();
    });

    it('driver 元信息与实现一致', () => {
      const db = openFor(driver, 'meta');
      expect(db.driver).toBe(driver);
      db.close();
    });
  });
}

describe('resolveSqliteDriver：环境变量解析', () => {
  const original = process.env[SQLITE_DRIVER_ENV];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[SQLITE_DRIVER_ENV];
    } else {
      process.env[SQLITE_DRIVER_ENV] = original;
    }
  });

  it('未设置时默认 better-sqlite3（刻意不默认 node：node:sqlite 仍为 RC）', () => {
    delete process.env[SQLITE_DRIVER_ENV];
    expect(resolveSqliteDriver()).toBe('better-sqlite3');
  });

  it('node / node:sqlite / builtin 均解析为 node', () => {
    for (const value of ['node', 'node:sqlite', 'builtin', 'NODE']) {
      process.env[SQLITE_DRIVER_ENV] = value;
      expect(resolveSqliteDriver()).toBe('node');
    }
  });

  it('未知取值回退默认且不抛错', () => {
    process.env[SQLITE_DRIVER_ENV] = 'no-such-driver';
    expect(resolveSqliteDriver()).toBe('better-sqlite3');
  });

  it('显式 driver 参数优先于环境变量', () => {
    process.env[SQLITE_DRIVER_ENV] = 'node';
    const db = openDatabase(join(SCRATCH_ROOT, 'explicit-priority.db'), {
      driver: 'better-sqlite3',
    });
    expect(db.driver).toBe('better-sqlite3');
    db.close();
  });
});
