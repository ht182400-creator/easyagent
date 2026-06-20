/**
 * 日志工具模块
 * 基于pino的结构化日志，支持不同级别的输出
 *
 * 注意: pino v9 的 transport (worker线程) 在以下场景不可用:
 *   1. Electron asar 打包环境
 *   2. Windows 下 worker 线程输出的 UTF-8 中文会被控制台以 GBK 错误解码导致乱码
 * 因此这些场景使用同步 pino-pretty Transform stream (主线程) 代替 worker transport。
 */
import pino from 'pino';
import { resolve } from 'node:path';
/** 日志级别 */
export var LogLevel;
(function (LogLevel) {
    LogLevel["TRACE"] = "trace";
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
    LogLevel["FATAL"] = "fatal";
})(LogLevel || (LogLevel = {}));
/** 判断是否为 Electron 生产环境（asar 打包） */
function isElectronProduction() {
    // Electron 打包后 __dirname 包含 .asar 或 app.asar
    // process.defaultApp 在打包后为 undefined
    try {
        // resourcesPath / defaultApp 是 Electron 注入的，标准 Node 类型不包含
        const proc = process;
        const isPackaged = proc.resourcesPath !== undefined && !proc.defaultApp;
        return !!isPackaged;
    }
    catch {
        return false;
    }
}
/**
 * 解析 node_modules 中 pino-pretty 的路径
 * 支持 pnpm monorepo 结构 (向上查找)
 */
function resolvePinoPrettyPath() {
    const searchRoots = [process.cwd()];
    for (let i = 0; i < 6; i++) {
        searchRoots.push(resolve(process.cwd(), ...Array(i + 1).fill('..')));
    }
    for (const root of searchRoots) {
        try {
            return require.resolve('pino-pretty', { paths: [root] });
        }
        catch {
            continue;
        }
    }
    return null;
}
/**
 * 创建同步 pino-pretty stream (主线程 Transform)
 * 用于 Windows 和 Electron 生产环境，避免 worker 线程编码问题
 */
function createPrettyTarget(opts) {
    const prettyPath = resolvePinoPrettyPath();
    if (!prettyPath) {
        return process.stdout;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pretty = require(prettyPath);
        // pino-pretty({...}) returns a Transform stream (both Readable + Writable)
        const fn = pretty.default ?? pretty;
        return fn(opts);
    }
    catch {
        return process.stdout;
    }
}
/** 创建日志实例 */
export function createLogger(name, level = LogLevel.INFO) {
    // Electron 生产环境或显式禁用 transport 时使用纯 JSON 输出
    const disableTransport = isElectronProduction()
        || process.env.LOG_NO_TRANSPORT === '1'
        || process.env.NODE_ENV === 'production';
    const prettyOptions = {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
    };
    if (disableTransport) {
        return pino({
            name,
            level,
            // 纯 JSON 输出
            formatters: {
                level(label) {
                    return { level: label };
                },
            },
        });
    }
    // Windows 平台: 使用同步 pino-pretty stream (主线程)，避免 worker 线程 UTF-8 乱码
    if (process.platform === 'win32') {
        const stream = createPrettyTarget(prettyOptions);
        return pino({ name, level }, stream);
    }
    // 其他平台: 使用 pino-pretty transport (worker 线程，无编码问题)
    try {
        return pino({
            name,
            level,
            transport: {
                target: 'pino-pretty',
                options: prettyOptions,
            },
        });
    }
    catch {
        return pino({ name, level });
    }
}
/** 默认日志器 */
export const logger = createLogger('easyagent');
//# sourceMappingURL=logger.js.map