/**
 * 轻量级脚本日志工具（.mjs / .cjs / CommonJS 通用）
 *
 * ── 调试开关控制 ──
 *   1. EASYAGENT_DEBUG=1   → 启用 DEBUG 级别日志
 *   2. LOG_LEVEL=trace|debug|info|warn|error → 精确设置级别
 *   3. 均未设置             → 默认 INFO 级别
 *
 * 使用方式:
 *   import { createLogger } from '../lib/logger.mjs';
 *   const log = createLogger('my-script');
 *   log.debug('详细调试信息');
 *   log.info('常规进度');
 *   log.warn('警告');
 *   log.error('错误', err);
 *   log.ok('操作成功');  // 快捷方式，带 ✅
 *   log.fail('操作失败'); // 快捷方式，带 ❌
 *
 * 或直接用默认实例:
 *   import { log } from '../lib/logger.mjs';
 */

// 日志级别定义
const LEVELS = { TRACE: 0, DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, SILENT: 99 };

/**
 * 从环境变量解析目标日志级别
 * 优先级: LOG_LEVEL > EASYAGENT_DEBUG > 默认INFO
 */
function resolveLevelNum() {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase();
  if (envLevel && envLevel in LEVELS) {
    return LEVELS[envLevel];
  }
  if (process.env.EASYAGENT_DEBUG === '1' || process.env.EASYAGENT_DEBUG === 'true') {
    return LEVELS.DEBUG;
  }
  return LEVELS.INFO;
}

/** 获取时戳字符串 [HH:MM:SS] */
function timestamp() {
  const d = new Date();
  return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}]`;
}

/**
 * 创建带命名空间的日志器
 * @param {string} name - 模块/脚本名称
 * @param {number} [level] - 覆盖日志级别（可选，默认从环境变量读取）
 */
export function createLogger(name, level) {
  const minLevel = level ?? resolveLevelNum();

  /** 写入一条日志 */
  function write(levelLabel, levelVal, message, extra) {
    if (levelVal < minLevel) return;
    const prefix = `${timestamp()} ${levelLabel}`;
    const tag = name ? ` [${name}]` : '';
    const msg = extra !== undefined ? `${message} ${extra}` : message;
    const output = `${prefix}${tag} ${msg}`;

    if (levelVal >= LEVELS.ERROR) {
      console.error(output);
    } else if (levelVal >= LEVELS.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  return {
    /** 追踪级别（最详细） */
    trace(msg, extra) { write('TRACE', LEVELS.TRACE, msg, extra); },
    /** 调试信息（需要 EASYAGENT_DEBUG=1 才可见） */
    debug(msg, extra) { write('DEBUG', LEVELS.DEBUG, msg, extra); },
    /** 常规信息 */
    info(msg, extra) { write('INFO ', LEVELS.INFO, msg, extra); },
    /** 警告 */
    warn(msg, extra) { write('WARN ', LEVELS.WARN, msg, extra); },
    /** 错误 */
    error(msg, extra) { write('ERROR', LEVELS.ERROR, msg, extra); },
    /** 快捷：操作成功 */
    ok(msg) { write('INFO ', LEVELS.INFO, `✅ ${msg}`); },
    /** 快捷：操作失败 */
    fail(msg) { write('ERROR', LEVELS.ERROR, `❌ ${msg}`); },
    /** 分隔线 */
    hr() { if (minLevel <= LEVELS.INFO) console.log('─'.repeat(50)); },
    /** 标题 */
    title(msg) { if (minLevel <= LEVELS.INFO) console.log(`\n═══ ${msg} ═══`); },
    /** 获取当前最小日志级别 */
    getLevel() { return minLevel; },
  };
}

/** 默认日志器实例 */
export const log = createLogger('easyagent');

export default log;
