/**
 * Logger — LangGraph 统一调试日志系统
 *
 * 特性:
 * - 五级日志：DEBUG / INFO / WARN / ERROR / SILENT
 * - 模块化子 Logger（createChild），自动带模块名
 * - 全局日志等级 + 模块白名单过滤
 * - 结构化输出：时间戳 + 等级 + 模块 + 消息 + JSON 数据
 * - 性能计时器 (startTimer / endTimer)
 * - 可选文件输出 (setOutputFile)
 * - 支持静默模式（生产环境 setLevel(SILENT)）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================
// 类型定义
// ============================================================

/** 日志等级 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/** 日志等级名称映射 */
const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO ',
  [LogLevel.WARN]: 'WARN ',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.SILENT]: 'SILENT',
};

/** 日志条目 */
export interface LogEntry {
  /** ISO 时间戳 */
  timestamp: string;
  /** 日志等级 */
  level: LogLevel;
  /** 模块名称 */
  module: string;
  /** 日志消息 */
  message: string;
  /** 附加数据 */
  data?: unknown;
}

/** Logger 配置 */
export interface LoggerConfig {
  /** 全局最低输出等级，默认 DEBUG */
  level: LogLevel;
  /** 模块白名单：非空时仅输出名单内模块，默认全部 */
  moduleFilter?: string[];
  /** 是否输出到控制台，默认 true */
  console: boolean;
  /** 文件输出路径，未设置时不写文件 */
  outputFile?: string;
}

// ============================================================
// 全局 Logger 实例
// ============================================================

let globalConfig: LoggerConfig = {
  level: LogLevel.DEBUG,
  console: true,
};

/** 所有已创建的 Logger 实例引用，用于全局等级变更时同步 */
const loggerInstances: Logger[] = [];

// ============================================================
// Logger 类
// ============================================================

export class Logger {
  /** 模块名 */
  readonly module: string;
  /** 该实例的各项配置 */
  private config: LoggerConfig;
  /** 文件写入流（若配置了输出文件） */
  private fileStream: fs.WriteStream | null = null;
  /** 此文件流所属的输出路径 */
  private filePath: string | null = null;

  constructor(module: string, config?: Partial<LoggerConfig>) {
    this.module = module;
    this.config = { ...globalConfig, ...config };
    if (this.config.outputFile) {
      this.ensureFileStream(this.config.outputFile);
    }
    loggerInstances.push(this);
  }

  // ---- 主输出方法 ----

  /**
   * 输出 DEBUG 级别日志
   * @param message - 日志消息
   * @param data - 附加结构化数据
   */
  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * 输出 INFO 级别日志
   * @param message - 日志消息
   * @param data - 附加结构化数据
   */
  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * 输出 WARN 级别日志
   * @param message - 日志消息
   * @param data - 附加结构化数据
   */
  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * 输出 ERROR 级别日志
   * @param message - 日志消息
   * @param data - 附加结构化数据
   */
  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data);
  }

  // ---- 性能计时 ----

  /**
   * 启动一个命名计时器，返回 endTimer 函数
   * 调用 endTimer() 时会自动输出耗时
   *
   * @param label - 计时标签，如 "LLM调用"、"工具执行"
   * @returns 结束计时并输出日志的函数
   *
   * @example
   * const done = logger.startTimer('LLM调用');
   * const result = await chat(...);
   * done({ tokens: result.usage });  // 自动输出耗时日志
   */
  startTimer(label: string): (extra?: unknown) => void {
    const start = performance.now();
    return (extra?: unknown) => {
      const elapsed = (performance.now() - start).toFixed(2);
      this.debug(`${label} 耗时: ${elapsed}ms`, extra);
    };
  }

  // ---- 生命周期 ----

  /**
   * 标记模块生命周期开始
   * 常用于 Agent.run / thinkNode / actNode 等入口
   */
  enter(context?: unknown): void {
    this.debug(`▶ 进入 ${this.module}`, context);
  }

  /**
   * 标记模块生命周期结束
   */
  exit(context?: unknown): void {
    this.debug(`◀ 退出 ${this.module}`, context);
  }

  /**
   * 记录关键决策点
   * 例如路由判断：是走 act 还是 END
   */
  decision(reason: string, context?: unknown): void {
    this.info(`🔀 决策: ${reason}`, context);
  }

  // ---- 配置控制 ----

  /** 动态修改该实例的日志等级 */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /** 关闭文件流 */
  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
      this.filePath = null;
    }
  }

  // ---- 内部方法 ----

  /**
   * 统一日志输出入口
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    // 1. 等级过滤
    if (level < this.config.level) return;

    // 2. 模块过滤
    const filter = this.config.moduleFilter;
    if (filter && filter.length > 0 && !filter.includes(this.module)) return;

    // 3. 构建输出行
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      data,
    };
    const line = this.formatEntry(entry);

    // 4. 控制台输出
    if (this.config.console) {
      this.writeConsole(level, line);
    }

    // 5. 文件输出
    if (this.fileStream) {
      this.fileStream.write(line + '\n');
    }
  }

  /**
   * 格式化日志条目为单行字符串
   */
  private formatEntry(entry: LogEntry): string {
    const ts = entry.timestamp.replace('T', ' ').replace('Z', '');
    const level = LEVEL_LABELS[entry.level];
    const module = `[${entry.module.padEnd(16).substring(0, 16)}]`;
    let line = `${ts} ${level} ${module} ${entry.message}`;
    if (entry.data !== undefined) {
      try {
        const json = JSON.stringify(entry.data);
        // 限制附加数据长度，避免日志膨胀
        const maxDataLen = 2000;
        const truncated = json.length > maxDataLen ? json.substring(0, maxDataLen) + '...(截断)' : json;
        line += ' | ' + truncated;
      } catch {
        line += ' | [无法序列化]';
      }
    }
    return line;
  }

  /**
   * 写入控制台，按等级着色
   */
  private writeConsole(level: LogLevel, line: string): void {
    switch (level) {
      case LogLevel.ERROR:
        console.error(line);
        break;
      case LogLevel.WARN:
        console.warn(line);
        break;
      default:
        console.log(line);
        break;
    }
  }

  /**
   * 确保文件写入流就绪（懒创建 / 路径变更时重建）
   */
  private ensureFileStream(filePath: string): void {
    if (this.fileStream && this.filePath === filePath) return;
    if (this.fileStream) {
      this.fileStream.end();
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
    this.filePath = filePath;
  }

}

// ============================================================
// 全局控制函数
// ============================================================

/**
 * 设置全局日志等级（影响所有已创建和新创建的 Logger）
 *
 * @example
 * setGlobalLevel(LogLevel.WARN);  // 仅输出 WARN 和 ERROR
 * setGlobalLevel(LogLevel.SILENT); // 完全静默
 */
export function setGlobalLevel(level: LogLevel): void {
  globalConfig.level = level;
  for (const logger of loggerInstances) {
    logger.setLevel(level);
  }
}

/**
 * 设置全局模块过滤器
 *
 * @example
 * setModuleFilter(['Agent', 'thinkNode']); // 仅输出这两个模块
 * setModuleFilter([]);                      // 输出全部
 */
export function setModuleFilter(modules: string[]): void {
  globalConfig.moduleFilter = modules.length > 0 ? modules : undefined;
  // 需要重建配置引用...简化处理：全局配置在实例创建时已拷贝，这里只影响后续创建的实例
  // 对已创建的实例，直接修改其 config 引用
  for (const logger of loggerInstances) {
    // 通过重新设置 moduleFilter 来更新
    (logger as any).config.moduleFilter = modules.length > 0 ? modules : undefined;
  }
}

/**
 * 设置全局文件输出路径
 */
export function setOutputFile(filePath: string): void {
  globalConfig.outputFile = filePath;
  // 通知已创建的 Logger 实例
  for (const logger of loggerInstances) {
    (logger as any).ensureFileStream(filePath);
  }
}

/**
 * 按日志等级名称字符串设置全局等级
 *
 * @example
 * setGlobalLevelByName('DEBUG');
 * setGlobalLevelByName('WARN');
 */
export function setGlobalLevelByName(name: string): void {
  const upper = name.toUpperCase();
  const mapping: Record<string, LogLevel> = {
    DEBUG: LogLevel.DEBUG,
    INFO: LogLevel.INFO,
    WARN: LogLevel.WARN,
    ERROR: LogLevel.ERROR,
    SILENT: LogLevel.SILENT,
  };
  if (upper in mapping) {
    setGlobalLevel(mapping[upper]);
  }
}

/**
 * 从环境变量 LANGGRAPH_LOG_LEVEL 读取并设置日志等级（兜底方案）
 *
 * @deprecated 推荐使用 loadLogConfig() 从配置文件加载，更稳定、可校验。
 *   setupFromEnv 仅作为环境变量兜底（loadLogConfig 找不到配置文件时自动调用）。
 *
 * 环境变量：
 * - LANGGRAPH_LOG_LEVEL = DEBUG | INFO | WARN | ERROR | SILENT
 * - LANGGRAPH_LOG_FILE = /path/to/logfile.log
 * - LANGGRAPH_LOG_MODULES = Agent,thinkNode (逗号分隔)
 */
export function setupFromEnv(): void {
  // 日志等级
  const level = process.env['LANGGRAPH_LOG_LEVEL'];
  if (level) {
    setGlobalLevelByName(level);
  }

  // 文件输出
  const file = process.env['LANGGRAPH_LOG_FILE'];
  if (file) {
    setOutputFile(file);
  }

  // 模块过滤
  const modules = process.env['LANGGRAPH_LOG_MODULES'];
  if (modules) {
    setModuleFilter(modules.split(',').map((s: string) => s.trim()).filter(Boolean));
  }
}
