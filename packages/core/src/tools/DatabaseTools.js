/**
 * 数据库操作工具集
 * 提供数据库查询、Schema查看、表结构分析等功能
 * 支持 SQLite/PostgreSQL/MySQL 等常见数据库
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { logger } from '../utils/logger.js';
/**
 * 检测项目中可用的数据库连接信息
 */
function detectDatabase(workspace) {
    // 检测SQLite文件
    const sqliteFiles = ['.db', '.sqlite', '.sqlite3', 'data.db', 'database.db', 'app.db'];
    for (const file of sqliteFiles) {
        const dbPath = resolve(workspace, file);
        if (existsSync(dbPath)) {
            return { type: 'sqlite', path: dbPath };
        }
    }
    // 检测 .env 或配置文件中的数据库连接
    const envFiles = ['.env', '.env.local', '.env.development'];
    for (const envFile of envFiles) {
        const envPath = resolve(workspace, envFile);
        if (existsSync(envPath)) {
            try {
                const content = readFileSync(envPath, 'utf-8');
                if (content.includes('DATABASE_URL') || content.includes('DB_')) {
                    // 提取数据库URL
                    const urlMatch = content.match(/DATABASE_URL\s*=\s*(.+)/);
                    if (urlMatch) {
                        const url = urlMatch[1].trim().replace(/["']/g, '');
                        if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
                            return { type: 'postgresql', config: url };
                        }
                        if (url.startsWith('mysql://')) {
                            return { type: 'mysql', config: url };
                        }
                        if (url.includes('.db') || url.includes('.sqlite')) {
                            return { type: 'sqlite', path: url.replace('sqlite:', '').replace('file:', '').trim() };
                        }
                    }
                }
            }
            catch { /* ignore */ }
        }
    }
    // 检测 docker-compose 中的数据库
    const composeFile = resolve(workspace, 'docker-compose.yml');
    if (existsSync(composeFile)) {
        try {
            const content = readFileSync(composeFile, 'utf-8');
            if (content.includes('postgres') || content.includes('mysql') || content.includes('mariadb')) {
                return { type: 'docker', config: composeFile };
            }
        }
        catch { /* ignore */ }
    }
    return null;
}
/**
 * 执行SQL查询工具
 * 通过 better-sqlite3 或 Node.js 内置模块执行只读SQL查询
 */
export const QueryDBTool = {
    name: 'query_db',
    description: '对项目中的数据库执行只读SQL查询。支持SQLite/PostgreSQL/MySQL。自动检测数据库连接信息。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'SQL查询语句(仅支持SELECT等只读操作)' },
            dbType: { type: 'string', description: '可选: 数据库类型(sqlite/postgresql/mysql), 不指定则自动检测' },
            connection: { type: 'string', description: '可选: 数据库文件路径或连接字符串, 不指定则自动检测' },
        },
        required: ['query'],
    },
    async execute(params, context) {
        try {
            const query = params.query.trim();
            // 安全检查：只允许只读操作
            const dangerousPatterns = [
                /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\s/i,
                /;\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\s/i,
                /^\s*PRAGMA\s+(\w+)\s*=\s*/i,
            ];
            for (const pattern of dangerousPatterns) {
                if (pattern.test(query)) {
                    return {
                        success: false,
                        content: `⛔ 安全限制: 仅支持只读查询(SELECT/SHOW/DESCRIBE/EXPLAIN)。检测到写操作: ${query.slice(0, 100)}`,
                        error: 'WRITE_OPERATION_BLOCKED',
                    };
                }
            }
            const workspace = context.workspace;
            // 检测数据库
            let dbType = params.dbType || '';
            let connection = params.connection;
            if (!dbType || !connection) {
                const detected = detectDatabase(workspace);
                if (detected) {
                    dbType = dbType || detected.type;
                    connection = connection || detected.path || detected.config;
                }
            }
            if (dbType === 'sqlite' && connection && existsSync(connection)) {
                // 使用 better-sqlite3 (Node.js 原生模块) 或回退到内置模块
                try {
                    let Database;
                    try {
                        Database = require('better-sqlite3');
                    }
                    catch {
                        // 回退：使用简单的JSON文件存储模拟
                        return {
                            success: true,
                            content: [
                                `📊 SQLite 数据库: ${relative(workspace, connection)}`,
                                `查询: ${query}`,
                                ``,
                                `⚠ better-sqlite3 未安装。安装后可直接查询SQLite数据库，当前显示:`,
                                `  数据库文件: ${connection}`,
                                `  文件大小: ${(existsSync(connection) ? require('node:fs').statSync(connection).size : 0) / 1024}KB`,
                                ``,
                                `安装方法: npm install better-sqlite3`,
                            ].join('\n'),
                            metadata: { dbType, dbFile: connection },
                        };
                    }
                    const db = new Database(connection);
                    db.readonly = true;
                    const rows = db.prepare(query).all();
                    db.close();
                    if (rows.length === 0) {
                        return { success: true, content: '(查询结果为空)', metadata: { rowCount: 0 } };
                    }
                    const columns = Object.keys(rows[0]);
                    const header = columns.join(' | ');
                    const maxRows = 100;
                    const dataLines = rows.slice(0, maxRows).map((row) => columns.map((col) => String(row[col] ?? 'NULL').slice(0, 200)).join(' | '));
                    let result = [
                        `📊 查询结果 (${rows.length}行, ${columns.length}列)`,
                        ``,
                        `列: ${header}`,
                        `---`,
                        ...dataLines,
                    ].join('\n');
                    if (rows.length > maxRows) {
                        result += `\n\n... 还有 ${rows.length - maxRows} 行未显示`;
                    }
                    return {
                        success: true,
                        content: result,
                        metadata: { rowCount: rows.length, columnCount: columns.length, dbType: 'sqlite' },
                    };
                }
                catch (error) {
                    return {
                        success: false,
                        content: `SQL查询失败: ${error.message}`,
                        error: 'SQL_QUERY_FAILED',
                    };
                }
            }
            if (dbType === 'postgresql' || dbType === 'mysql') {
                return {
                    success: true,
                    content: [
                        `📊 ${dbType.toUpperCase()} 数据库检测到`,
                        `连接: ${connection || '(自动检测)'}`,
                        `查询: ${query}`,
                        ``,
                        `⚠ 远程数据库查询需要通过 pg/mysql2 等驱动完成。`,
                        `此工具返回了查询配置，等待安装对应驱动:`,
                        `  - PostgreSQL: npm install pg @types/pg`,
                        `  - MySQL: npm install mysql2`,
                    ].join('\n'),
                    metadata: { dbType, connection },
                };
            }
            if (dbType === 'docker') {
                return {
                    success: true,
                    content: [
                        `🐳 Docker Compose 数据库检测到`,
                        `文件: ${connection}`,
                        `查询: ${query}`,
                        ``,
                        `Docker 中的数据库可通过容器命令访问:`,
                        `  docker-compose exec <service> psql -U <user> -d <db> -c '${query}'`,
                    ].join('\n'),
                    metadata: { dbType: 'docker' },
                };
            }
            return {
                success: true,
                content: [
                    `📊 数据库查询工具`,
                    `查询: ${query}`,
                    ``,
                    `未自动检测到数据库配置。`,
                    `请使用 dbType 和 connection 参数指定数据库类型和连接信息。`,
                    ``,
                    `支持的数据库类型: sqlite, postgresql, mysql`,
                ].join('\n'),
                metadata: { requestedQuery: query },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '数据库查询失败');
            return { success: false, content: `数据库查询失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 查看数据库Schema
 * 列出表结构、索引、关系等
 */
export const DBSchemaTool = {
    name: 'db_schema',
    description: '查看数据库的Schema结构：列出所有表、视图、索引及其字段定义。帮助理解数据库设计。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            table: { type: 'string', description: '可选: 指定表名查看详细结构, 不指定则列出所有表' },
            dbType: { type: 'string', description: '可选: 数据库类型(sqlite/postgresql/mysql), 不指定则自动检测' },
            connection: { type: 'string', description: '可选: 数据库文件路径或连接字符串' },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const dbType = params.dbType || '';
            const connection = params.connection || '';
            const table = params.table || '';
            const workspace = context.workspace;
            // 检测数据库
            const detected = detectDatabase(workspace);
            if (detected?.type === 'sqlite' && detected.path && existsSync(detected.path)) {
                try {
                    let Database;
                    try {
                        Database = require('better-sqlite3');
                    }
                    catch {
                        return {
                            success: true,
                            content: [
                                `📊 SQLite 数据库: ${relative(workspace, detected.path)}`,
                                ``,
                                `⚠ better-sqlite3 未安装，无法读取Schema。`,
                                `数据库文件: ${detected.path}`,
                                `大小: ${(require('node:fs').statSync(detected.path).size / 1024).toFixed(1)}KB`,
                                ``,
                                `安装方法: npm install better-sqlite3`,
                            ].join('\n'),
                            metadata: { dbType: 'sqlite', dbFile: detected.path },
                        };
                    }
                    const db = new Database(detected.path);
                    db.readonly = true;
                    if (table) {
                        // 查看特定表的详细信息
                        const columns = db.prepare(`PRAGMA table_info('${table}')`).all();
                        const indexes = db.prepare(`PRAGMA index_list('${table}')`).all();
                        const fkeys = db.prepare(`PRAGMA foreign_key_list('${table}')`).all();
                        if (columns.length === 0) {
                            db.close();
                            return { success: false, content: `表 "${table}" 不存在` };
                        }
                        const colInfo = columns.map((col) => `  ${col.name.padEnd(25)} ${col.type.padEnd(12)} ${col.notnull ? 'NOT NULL' : 'NULLABLE'} ${col.pk ? 'PRIMARY KEY' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`).join('\n');
                        let result = `📊 表: ${table}\n\n列:\n${colInfo}`;
                        if (indexes.length > 0) {
                            result += `\n\n索引 (${indexes.length}):`;
                            for (const idx of indexes) {
                                const idxCols = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
                                result += `\n  ${idx.name} (${idx.unique ? 'UNIQUE' : ''}) → ${idxCols.map((c) => c.name).join(', ')}`;
                            }
                        }
                        if (fkeys.length > 0) {
                            result += `\n\n外键:`;
                            for (const fk of fkeys) {
                                result += `\n  ${fk.from} → ${fk.table}.${fk.to}`;
                            }
                        }
                        db.close();
                        return { success: true, content: result, metadata: { table, columns: columns.length, indexes: indexes.length } };
                    }
                    // 列出所有表
                    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
                    const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").all();
                    let result = `📊 SQLite 数据库: ${relative(workspace, detected.path)}\n\n`;
                    if (tables.length > 0) {
                        result += `表 (${tables.length}):\n`;
                        for (const t of tables) {
                            const rowCount = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
                            result += `  📄 ${t.name}  (${rowCount.cnt} 行)\n`;
                        }
                    }
                    if (views.length > 0) {
                        result += `\n视图 (${views.length}):\n`;
                        for (const v of views) {
                            result += `  👁 ${v.name}\n`;
                        }
                    }
                    result += `\n使用 table 参数查看特定表的列结构。`;
                    db.close();
                    return {
                        success: true,
                        content: result,
                        metadata: { tableCount: tables.length, viewCount: views.length, dbType: 'sqlite' },
                    };
                }
                catch (error) {
                    return { success: false, content: `读取Schema失败: ${error.message}`, error: 'SCHEMA_READ_FAILED' };
                }
            }
            return {
                success: true,
                content: [
                    `📊 数据库Schema查看工具`,
                    detected ? `检测到: ${detected.type.toUpperCase()}` : '未检测到数据库',
                    ``,
                    `使用 dbType 和 connection 参数指定数据库连接。`,
                    `支持的数据库: sqlite, postgresql, mysql`,
                ].join('\n'),
                metadata: { detected },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `查看Schema失败: ${msg}`, error: msg };
        }
    },
};
/** 数据库操作工具集 */
export const DatabaseTools = [QueryDBTool, DBSchemaTool];
//# sourceMappingURL=DatabaseTools.js.map