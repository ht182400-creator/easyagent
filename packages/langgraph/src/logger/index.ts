/**
 * Logger 模块入口
 * 重新导出所有 Logger 相关的类型和函数
 */
export {
  Logger,
  LogLevel,
  setGlobalLevel,
  setGlobalLevelByName,
  setModuleFilter,
  setOutputFile,
  /** @deprecated 请使用 loadLogConfig() 从配置文件加载 */
  setupFromEnv,
} from './Logger';
export type { LogEntry, LoggerConfig } from './Logger';

// 配置加载器（推荐方式）
export {
  loadLogConfig,
  setupLogConfig,
  saveDefaultConfig,
} from './LogConfig';
export type { LogConfigFile, LangGraphConfig } from './LogConfig';
