/** 日志级别 */
export declare enum LogLevel {
    TRACE = "trace",
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    FATAL = "fatal"
}
/** 创建日志实例 */
export declare function createLogger(name: string, level?: LogLevel): any;
/** 默认日志器 */
export declare const logger: any;
