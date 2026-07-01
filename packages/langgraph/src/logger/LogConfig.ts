/**
 * LogConfig — 日志配置加载器
 *
 * 支持从 JSON 配置文件加载日志参数，优先级：
 * 1. 显式路径传入的配置文件
 * 2. 自动发现（当前工作目录下的 langgraph.config.json）
 * 3. 环境变量（作为兜底）
 * 4. 内置默认值
 *
 * 配置文件格式 (langgraph.config.json):
 * {
 *   "logger": {
 *     "level": "debug",           // debug | info | warn | error | silent
 *     "file": "./logs/langgraph.log",  // 可选，文件输出路径
 *     "modules": ["Agent", "thinkNode"], // 可选，模块白名单
 *     "console": true              // 是否输出到控制台，默认 true
 *   }
 * }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LogLevel, setGlobalLevelByName, setModuleFilter, setOutputFile } from './Logger';
import type { LoggerConfig } from './Logger';

// ============================================================
// 类型定义
// ============================================================

/** 配置文件中 logger 段的 JSON 结构 */
export interface LogConfigFile {
  /** 日志等级字符串 */
  level?: string;
  /** 文件输出路径（相对于配置文件所在目录） */
  file?: string;
  /** 模块白名单，空数组或省略表示全部输出 */
  modules?: string[];
  /** 是否输出到控制台，默认 true */
  console?: boolean;
}

/** 完整配置文件的顶层结构 */
export interface LangGraphConfig {
  logger?: LogConfigFile;
}

// ============================================================
// 默认配置
// ============================================================

/** 内置默认配置 */
const DEFAULT_LOG_CONFIG: Required<LogConfigFile> = {
  level: 'debug',
  file: '',
  modules: [],
  console: true,
};

/** 自动发现时尝试的文件名列表 */
const DISCOVER_FILENAMES = [
  'langgraph.config.json',
  'langgraph.log.config.json',
];

// ============================================================
// 核心函数
// ============================================================

/**
 * 从配置文件加载日志参数
 *
 * @param configPath - 配置文件路径（可选，不传则自动发现）
 * @returns 是否成功加载
 *
 * @example
 * // 自动发现
 * loadLogConfig();
 *
 * // 指定路径
 * loadLogConfig('./config/langgraph.config.json');
 */
export function loadLogConfig(configPath?: string): boolean {
  // 1. 定位配置文件
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : discoverConfigFile();

  if (!resolvedPath) {
    // 没有找到配置文件，尝试环境变量兜底
    setupFromEnvFallback();
    return false;
  }

  // 2. 读取并解析
  let raw: LangGraphConfig;
  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    raw = JSON.parse(content) as LangGraphConfig;
  } catch (err: any) {
    console.error(`[LogConfig] 读取配置文件失败: ${resolvedPath}`, err.message);
    setupFromEnvFallback();
    return false;
  }

  // 3. 校验 logger 段
  if (!raw.logger || typeof raw.logger !== 'object') {
    console.error(`[LogConfig] 配置文件缺少 "logger" 段: ${resolvedPath}`);
    setupFromEnvFallback();
    return false;
  }

  // 4. 合并默认值并应用
  const cfg = raw.logger;
  const merged: Required<LogConfigFile> = {
    level: cfg.level ?? DEFAULT_LOG_CONFIG.level,
    file: cfg.file ?? DEFAULT_LOG_CONFIG.file,
    modules: Array.isArray(cfg.modules) ? cfg.modules : DEFAULT_LOG_CONFIG.modules,
    console: cfg.console ?? DEFAULT_LOG_CONFIG.console,
  };

  applyConfig(merged, path.dirname(resolvedPath));

  console.log(
    `[LogConfig] 配置已加载: ${resolvedPath} ` +
    `(level=${merged.level}, file=${merged.file || '无'}, modules=${merged.modules.join(',') || '全部'}, console=${merged.console})`
  );
  return true;
}

/**
 * 用代码直接设置配置（无需文件）
 *
 * @param config - 日志配置对象
 *
 * @example
 * setupLogConfig({ level: 'info', modules: ['Agent'] });
 */
export function setupLogConfig(config: LogConfigFile): void {
  const merged: Required<LogConfigFile> = {
    level: config.level ?? DEFAULT_LOG_CONFIG.level,
    file: config.file ?? DEFAULT_LOG_CONFIG.file,
    modules: Array.isArray(config.modules) ? config.modules : DEFAULT_LOG_CONFIG.modules,
    console: config.console ?? DEFAULT_LOG_CONFIG.console,
  };
  applyConfig(merged, process.cwd());
}

/**
 * 生成默认配置文件到指定路径
 *
 * @param outputPath - 输出路径，默认为 cwd/langgraph.config.json
 *
 * @example
 * saveDefaultConfig();                    // → ./langgraph.config.json
 * saveDefaultConfig('./my-config.json');  // → ./my-config.json
 */
export function saveDefaultConfig(outputPath?: string): string {
  const target = path.resolve(outputPath ?? path.join(process.cwd(), 'langgraph.config.json'));

  const template: LangGraphConfig = {
    logger: {
      level: 'debug',
      file: '',
      modules: [],
      console: true,
    },
  };

  // 如果文件已存在，不覆盖
  if (fs.existsSync(target)) {
    console.warn(`[LogConfig] 配置文件已存在，跳过生成: ${target}`);
    return target;
  }

  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(target, JSON.stringify(template, null, 2) + '\n', 'utf-8');
  console.log(`[LogConfig] 默认配置文件已生成: ${target}`);
  return target;
}

// ============================================================
// 内部辅助
// ============================================================

/**
 * 自动发现配置文件
 * 从当前工作目录向上查找，找到第一个匹配的配置文件
 */
function discoverConfigFile(): string | null {
  let dir = process.cwd();

  // 最多向上查找 5 级
  for (let i = 0; i < 5; i++) {
    for (const name of DISCOVER_FILENAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // 到达根目录
    dir = parent;
  }

  return null;
}

/**
 * 将解析后的配置应用到 Logger 系统
 */
function applyConfig(config: Required<LogConfigFile>, baseDir: string): void {
  // 日志等级
  const levelName = config.level.toUpperCase();
  const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'];
  if (validLevels.includes(levelName)) {
    setGlobalLevelByName(levelName);
  } else {
    console.warn(`[LogConfig] 无效的日志等级 "${config.level}"，使用默认值 DEBUG`);
    setGlobalLevelByName('DEBUG');
  }

  // 模块白名单
  if (config.modules.length > 0) {
    setModuleFilter(config.modules);
  }

  // 文件输出（相对路径转为绝对路径）
  if (config.file) {
    const absFile = path.isAbsolute(config.file) ? config.file : path.resolve(baseDir, config.file);
    setOutputFile(absFile);
  }
}

/**
 * 环境变量兜底（兼容旧用法）
 */
function setupFromEnvFallback(): void {
  let applied = false;

  const level = process.env['LANGGRAPH_LOG_LEVEL'];
  if (level) {
    setGlobalLevelByName(level);
    applied = true;
  }

  const file = process.env['LANGGRAPH_LOG_FILE'];
  if (file) {
    setOutputFile(file);
    applied = true;
  }

  const modules = process.env['LANGGRAPH_LOG_MODULES'];
  if (modules) {
    setModuleFilter(modules.split(',').map((s: string) => s.trim()).filter(Boolean));
    applied = true;
  }

  if (applied) {
    console.log('[LogConfig] 从环境变量加载了日志配置（兜底模式）');
  }
}
