/**
 * 日志工具模块
 * 基于 pino 的结构化日志，支持不同级别的输出，**同时输出到控制台与文件**
 *
 * ── 【2026-09-18 重要修复】为什么必须补文件输出 ──
 * 此前本模块只把日志写到 stdout（pino 默认 destination），**没有任何文件 transport**。
 * 后果：所有 `logger.debug()` 只存在于当时运行的终端窗口里，进程一退、窗口一关就永久丢失。
 * 排查线上/打包后问题时"无据可查"，只能反复加临时打印 —— 这正是历史上 bat 文件被
 * 反复修改 200+ 次的主因之一。现已补上「每日轮转 + 30 天保留」的文件日志。
 *
 * ── 输出目标（两条通道，互不影响）──
 *   ① 控制台：级别由 `LOG_LEVEL` / `EASYAGENT_DEBUG` 决定（默认 INFO）
 *   ② 文件  ：级别由 `EASYAGENT_LOG_FILE_LEVEL` 决定（**默认 DEBUG**）
 *      → 文件故意比控制台更详细：事后排查时"当时到底发生了什么"必须可回溯，
 *        而控制台保持简洁不打扰日常使用。
 *
 * 注意: pino v9 的 transport (worker线程) 在以下场景不可用:
 *   1. Electron asar 打包环境
 *   2. Windows 下 worker 线程输出的 UTF-8 中文会被控制台以 GBK 错误解码导致乱码
 * 因此这些场景使用同步 pino-pretty Transform stream (主线程) 代替 worker transport。
 *
 * ── 环境变量 ──
 *   LOG_LEVEL                  trace|debug|info|warn|error|fatal  控制台级别（最高优先级）
 *   EASYAGENT_DEBUG=1          快捷方式，等同于控制台 LOG_LEVEL=debug
 *   EASYAGENT_LOG_FILE_LEVEL   文件级别，默认 debug；设 silent 可关闭文件日志
 *   EASYAGENT_LOG_DIR          日志根目录覆盖（默认见 resolveLogDir）
 *   EASYAGENT_LOG_RETENTION_DAYS  文件保留天数（默认 30）
 *
 * ── 日志文件位置 ──
 *   · 服务端/CLI（非 Electron）: `<当前工作目录>/logs/runtime/easyagent-YYYY-MM-DD.log`
 *   · Electron 桌面端          : `~/.easyagent/logs/runtime/easyagent-YYYY-MM-DD.log`
 *     （桌面端工作目录不可控，写 cwd 会落到 System32 之类的位置）
 *   跨日自动切换新文件；超过保留期的旧文件自动删除；**文件日志初始化失败仅降级为
 *   控制台输出，绝不影响主流程**。
 *
 * 示例:
 *   LOG_LEVEL=debug pnpm run start:server     # 精确控制
 *   set EASYAGENT_DEBUG=1 && build.bat        # Windows 快捷方式
 *   set EASYAGENT_LOG_FILE_LEVEL=trace        # 文件里记录到 trace 级别
 */
import pino from 'pino';
import { join, resolve } from 'node:path';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  type WriteStream,
} from 'node:fs';
import { homedir } from 'node:os';

/** 日志级别 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
  SILENT = 'silent',
}

// ===================== 文件日志常量（禁止在逻辑中裸写） =====================

/** 运行日志子目录名（位于日志根目录下） */
const RUNTIME_SUBDIR = 'runtime';

/** 日志文件基础名（整天共用一个文件，避免每个模块各写一份） */
const LOG_FILE_BASE = 'easyagent';

/** 文件日志默认级别：比控制台更详细，保证事后可回溯 */
const FILE_LEVEL_DEFAULT = LogLevel.DEBUG;

/** 文件默认保留天数 */
const DEFAULT_RETENTION_DAYS = 30;

/** 项目根标记文件：命中任一即认为该目录是项目根 */
const PROJECT_ROOT_MARKERS = ['pnpm-workspace.yaml', '.git'];

/** 文件名中日期片段格式（用于识别可清理的旧文件） */
const DATE_SEGMENT_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 文件写入失败后的告警冷却时间（毫秒），避免刷屏 */
const WRITE_FAIL_COOLDOWN_MS = 60_000;

/** 一天毫秒数 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ===================== 级别解析 =====================

/** 从环境变量解析日志级别 */
function resolveLogLevel(): LogLevel {
  // 优先级1: LOG_LEVEL 环境变量精确设置
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && Object.values(LogLevel).includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }
  // 优先级2: EASYAGENT_DEBUG 快捷开关
  if (process.env.EASYAGENT_DEBUG === '1' || process.env.EASYAGENT_DEBUG === 'true') {
    return LogLevel.DEBUG;
  }
  // 优先级3: 默认 INFO
  return LogLevel.INFO;
}

/** 判断是否为 Electron 生产环境（asar 打包） */
function isElectronProduction(): boolean {
  // Electron 打包后 __dirname 包含 .asar 或 app.asar
  // process.defaultApp 在打包后为 undefined
  try {
    // resourcesPath / defaultApp 是 Electron 注入的，标准 Node 类型不包含
    const proc = process as typeof process & {
      resourcesPath?: string;
      defaultApp?: boolean;
    };
    const isPackaged = proc.resourcesPath !== undefined && !proc.defaultApp;
    return !!isPackaged;
  } catch (err) {
    return false;
  }
}

// ===================== 文件日志（每日轮转 + 保留期清理） =====================

/** pino 可接受的写入目标（只需实现 write） */
interface DestinationLike {
  write(chunk: string): void;
}

/** 当前日期字符串（本地时区，YYYY-MM-DD） */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 从起始目录向上查找项目根
 *
 * 用途：从 `packages/<pkg>/` 目录启动（vitest、`pnpm --filter` 等）时，
 * 若直接以 cwd 作为日志根，会在每个包下各生成一份 `logs/`，日志被撕成多份。
 * 通过上溯匹配项目根标记文件，保证所有日志统一落到 `<项目根>/logs/`。
 *
 * @param startDir - 起始目录（通常是 process.cwd()）
 * @returns 项目根绝对路径；未找到则返回 null
 */
function findProjectRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      if (existsSync(join(dir, marker))) return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break; // 已达文件系统根
    dir = parent;
  }
  return null;
}

/**
 * 解析日志根目录
 *
 * 优先级：`EASYAGENT_LOG_DIR` > Electron 用户目录 > 项目根 > 当前工作目录。
 * 之所以对 Electron 特判：桌面端工作目录不可控（从快捷方式启动可能是
 * `C:\Windows\System32`），写 cwd 会落到错误位置。
 */
function resolveLogDir(): string {
  const override = process.env.EASYAGENT_LOG_DIR;
  if (override) return override;
  if (process.versions.electron) {
    return join(homedir(), '.easyagent', 'logs');
  }
  const projectRoot = findProjectRoot(process.cwd());
  return join(projectRoot ?? process.cwd(), 'logs');
}

/** 保留天数（环境变量可覆盖，非法值回退默认） */
function resolveRetentionDays(): number {
  const raw = Number(process.env.EASYAGENT_LOG_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_RETENTION_DAYS;
}

/**
 * 创建「每日轮转 + 保留期清理」的写入目标
 *
 * 设计要点：
 *   1. 单文件整天复用（所有模块 logger 共用同一个 stream），避免日志碎片化；
 *   2. 跨日时关闭旧流并新建当天文件；
 *   3. 每次轮转顺带清理超过保留期的旧文件，防止磁盘被占满；
 *   4. 任何失败都只降级为「仅控制台」，不抛出、不影响主流程。
 *
 * @param logDir - 日志根目录
 * @returns pino 可用的写入目标；初始化失败时返回 null
 */
function createDailyRotatingTarget(logDir: string): DestinationLike | null {
  let currentDate = '';
  let stream: WriteStream | null = null;
  let disabled = false;
  let lastAlertAt = 0;

  /** 广播一次降级告警（带冷却，避免每个日志调用都刷屏） */
  function alertOnce(err: unknown): void {
    const now = Date.now();
    if (now - lastAlertAt > WRITE_FAIL_COOLDOWN_MS) {
      lastAlertAt = now;
      // 此处只能用 console：logger 自身不可用时不能递归调用自己
      // eslint-disable-next-line no-console
      console.error(
        `[logger] 文件日志不可用，已降级为仅控制台输出: ${(err as Error)?.message ?? String(err)}`,
      );
    }
    disabled = true;
  }

  /** 打开某一天的文件 */
  function open(date: string): void {
    try {
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
      stream = createWriteStream(join(logDir, `${LOG_FILE_BASE}-${date}.log`), { flags: 'a' });
      stream.on('error', (err) => alertOnce(err));
      currentDate = date;
    } catch (err) {
      alertOnce(err);
    }
  }

  /** 清理超过保留期的旧日志文件 */
  function prune(): void {
    try {
      const cutoff = Date.now() - resolveRetentionDays() * MS_PER_DAY;
      for (const file of readdirSync(logDir)) {
        if (!file.startsWith(`${LOG_FILE_BASE}-`) || !file.endsWith('.log')) continue;
        const dateSegment = file.slice(LOG_FILE_BASE.length + 1, -4);
        if (!DATE_SEGMENT_RE.test(dateSegment)) continue;
        const full = join(logDir, file);
        if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
      }
    } catch {
      /* 清理失败不影响写入，静默忽略 */
    }
  }

  // 立即尝试初始化：失败则返回 null，调用方退化为仅控制台
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    open(today());
  } catch (err) {
    alertOnce(err);
  }

  return {
    write(chunk: string): void {
      if (disabled) return;
      try {
        const d = today();
        if (d !== currentDate) {
          stream?.end();
          open(d);
          prune();
        }
        stream?.write(chunk);
      } catch (err) {
        alertOnce(err);
      }
    },
  };
}

/** 进程内共享的文件写入目标（惰性创建：即使用户从不打日志也不产生空文件） */
let sharedFileTarget: DestinationLike | null | undefined;

/**
 * 获取进程级共享的文件写入目标
 *
 * 之所以共享：`createLogger('X')` 会被各模块多次调用，若每次各自建流，
 * 同一天会出现 N 个 `X-YYYY-MM-DD.log`，排查时要在多个文件间来回翻。
 */
function getSharedFileTarget(): DestinationLike | null {
  if (sharedFileTarget !== undefined) return sharedFileTarget;
  try {
    if (resolveFileLevel() === LogLevel.SILENT) {
      sharedFileTarget = null;
    } else {
      sharedFileTarget = createDailyRotatingTarget(join(resolveLogDir(), RUNTIME_SUBDIR));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[logger] 初始化文件日志失败，已降级为仅控制台输出: ${(err as Error)?.message ?? String(err)}`,
    );
    sharedFileTarget = null;
  }
  return sharedFileTarget;
}

/**
 * 文件日志的目标级别
 *
 * 规则：
 *   1. `EASYAGENT_LOG_FILE_LEVEL` 显式设置时以其为准（`off`/`none` 等价于 silent）；
 *   2. **测试环境（vitest）默认关闭** —— 测试自身已有 `logs/test-logs/` 结构化日志，
 *      再让成千上万个用例往 runtime 文件里写，只会制造噪声并污染工作区；
 *   3. 其余情况默认 `debug`（保证事后能回溯细节）。
 */
function resolveFileLevel(): LogLevel {
  const raw = process.env.EASYAGENT_LOG_FILE_LEVEL?.toLowerCase();
  if (raw === 'off' || raw === 'none') return LogLevel.SILENT;
  if (raw && Object.values(LogLevel).includes(raw as LogLevel)) return raw as LogLevel;
  if (process.env.VITEST) return LogLevel.SILENT;
  return FILE_LEVEL_DEFAULT;
}

// ===================== pino-pretty（控制台格式化） =====================

/**
 * 解析 node_modules 中 pino-pretty 的路径
 * 支持 pnpm monorepo 结构 (向上查找)
 */
function resolvePinoPrettyPath(): string | null {
  const searchRoots: string[] = [process.cwd()];
  for (let i = 0; i < 6; i++) {
    searchRoots.push(resolve(process.cwd(), ...Array(i + 1).fill('..')));
  }
  for (const root of searchRoots) {
    try {
      return require.resolve('pino-pretty', { paths: [root] });
    } catch (err) {
      continue;
    }
  }
  return null;
}

/**
 * 创建同步 pino-pretty stream (主线程 Transform)
 * 用于 Windows 和 Electron 生产环境，避免 worker 线程编码问题
 */
function createPrettyTarget(opts: { colorize: boolean; translateTime: string; ignore: string }) {
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
  } catch (err) {
    return process.stdout;
  }
}

// ===================== 对外 API =====================

/** 创建日志实例，同时输出到控制台与文件 */
export function createLogger(name: string, level?: LogLevel) {
  const consoleLevel = level ?? resolveLogLevel();
  const fileLevel = resolveFileLevel();

  // Electron 生产环境或显式禁用 transport 时使用纯 JSON 输出
  const disableTransport =
    isElectronProduction() ||
    process.env.LOG_NO_TRANSPORT === '1' ||
    process.env.NODE_ENV === 'production';

  /**
   * 级别统一序列化为可读字符串
   *
   * 同时服务于两条通道：控制台的 pino-pretty 能正确渲染，
   * 文件里的 NDJSON 也能直接 `grep '"level":"error"'` 定位。
   */
  const baseOptions: pino.LoggerOptions = {
    name,
    // 根级别取两者中更详细的一个，否则文件永远收不到 debug（被根级别先挡掉）。
    // 需要显式收窄到 pino 的 LevelWithSilent：本项目 LogLevel 枚举额外含 SILENT，
    // 与 pino 的 Level 联合类型不兼容。
    level: minLevel(consoleLevel, fileLevel) as pino.LevelWithSilent,
    timestamp: pino.stdTimeFunctions.isoTime, // ISO 8601 含毫秒
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  /** 控制台通道 */
  let consoleStream: pino.DestinationStream;
  if (disableTransport) {
    consoleStream = process.stdout;
  } else if (process.platform === 'win32') {
    // Windows: 同步 pino-pretty stream（主线程），避免 worker 线程 UTF-8 乱码
    consoleStream = createPrettyTarget({
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    }) as pino.DestinationStream;
  } else {
    consoleStream = process.stdout; // pino-pretty 由下方的 multistream 统一处理
  }

  const fileTarget = getSharedFileTarget();

  // 仅控制台（文件不可用时的降级路径）
  if (!fileTarget || fileLevel === LogLevel.SILENT) {
    return pino(baseOptions, consoleStream);
  }

  // 双通道：文件默认记录到 DEBUG，控制台按环境变量过滤
  //
  // 注意：pino 的 StreamEntry.level 类型是 `Level`（**不含 silent**）——
  // 给单个流设 silent 没有意义。因此 SILENT 的通道需在此被过滤掉，
  // 而不是传进去（否则 TS2322）。
  const streams: pino.StreamEntry[] = [];
  if (consoleLevel !== LogLevel.SILENT) {
    streams.push({ level: consoleLevel as pino.Level, stream: consoleStream });
  }
  // 此处 fileLevel 必不为 SILENT（上方已提前 return），无需再判
  streams.push({ level: fileLevel as pino.Level, stream: fileTarget as pino.DestinationStream });
  if (streams.length === 0) {
    return pino({ ...baseOptions, level: 'silent' });
  }
  return pino(baseOptions, pino.multistream(streams, { dedupe: false }));
}

/** 取两个级别中更详细（更啰嗦）的那个 */
function minLevel(a: LogLevel, b: LogLevel): LogLevel {
  const order = [LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL, LogLevel.SILENT];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

/**
 * 将本模块的 LogLevel 收窄为 pino 接受的级别类型
 *
 * 本模块枚举额外包含 SILENT（用于"关闭文件日志"的表达），
 * 而 pino 的 `Level` 联合类型不含它，直接赋值会报 TS2322。
 * 集中在此处转换，避免调用点散落 `as` 断言。
 */
function toPinoLevel(level: LogLevel): pino.LevelWithSilent {
  return level as pino.LevelWithSilent;
}

/** 当前生效的日志文件路径（供启动日志展示，便于用户"知道去哪里看"） */
export function describeLogTarget(): string {
  if (!getSharedFileTarget()) return '文件日志已关闭（仅控制台）';
  return join(resolveLogDir(), RUNTIME_SUBDIR, `${LOG_FILE_BASE}-${today()}.log`);
}

/** 默认日志器 */
export const logger = createLogger('easyagent');
