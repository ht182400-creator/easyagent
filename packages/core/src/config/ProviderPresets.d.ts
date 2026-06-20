/**
 * 模型提供商预设配置
 *
 * ⚠️ 数据源优先级:
 * 1. ModelRegistry 远程目录 (启动时自动从 GitHub/CDN 下载最新模型数据)
 * 2. 提供商 `/models` API 动态获取 (需要 API 密钥)
 * 3. 本文件硬编码数据 (最终兜底，仅在网络完全不可用时使用)
 *
 * 本文件中的 models 数组仅在以下情况使用：
 * - 未配置该提供商的 API 密钥
 * - 远程模型目录下载失败
 * - 动态获取模型失败（网络错误、API 变更等）
 */
import type { ProviderConfig } from '../types/index.js';
/**
 * 所有预置的模型提供商配置
 * API密钥从环境变量读取，运行时由ConfigManager注入
 *
 * 模型列表: 包含最新版本(2026) + 旧版本(标记为Legacy)，确保用户可以看到全版本
 */
export declare const PROVIDER_PRESETS: ProviderConfig[];
//# sourceMappingURL=ProviderPresets.d.ts.map