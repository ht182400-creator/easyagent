/**
 * 插件系统类型定义
 * 支持插件注册工具、技能、生命周期钩子
 */
import type { ITool } from '../tools/ToolRegistry.js';
import type { ToolResult } from '../types/index.js';

// ===================== 插件接口 =====================

/**
 * 插件上下文 - 在 register() 时注入，提供与系统交互的能力
 */
export interface IPluginContext {
  /** 注册工具到全局工具注册表 */
  registerTool(tool: ITool): void;
  /** 批量注册工具 */
  registerTools(tools: ITool[]): void;
  /** 获取当前 Agent 配置 */
  getConfig(): Record<string, unknown>;
}

/**
 * 插件基础接口
 * 每个插件目录的 index.ts 需要导出实现此接口的对象
 */
export interface IPlugin {
  /** 唯一名称 (kebab-case) */
  readonly name: string;
  /** 语义化版本 */
  readonly version: string;
  /** 用户可读描述 */
  readonly description: string;
  /** 作者信息 */
  readonly author?: string;
  /** 依赖的其他插件名 */
  readonly dependencies?: string[];

  /**
   * 插件注册 - 系统加载插件时调用
   * 在此方法中可以通过 context 注册工具、钩子等
   */
  register?(context: IPluginContext): Promise<void> | void;

  /**
   * 获取插件提供的工具列表
   * 如果工具是静态的，可以直接返回；动态创建的则在 register() 中注册
   */
  getTools?(): ITool[];

  /**
   * 获取插件提供的技能列表
   */
  getSkills?(): ISkill[];

  /**
   * 获取插件定义的钩子
   */
  getHooks?(): IPluginHook[];

  /**
   * 插件卸载 - 清理资源
   */
  unregister?(): Promise<void> | void;
}

// ===================== 技能接口 =====================

/**
 * 技能激活上下文
 */
export interface ISkillContext {
  /** 当前消息/会话上下文 */
  messages?: Array<{ role: string; content: string }>;
  /** 可用的工具列表 */
  availableTools: ITool[];
  /** Agent 配置 */
  config: Record<string, unknown>;
}

/**
 * 技能接口
 * 技能是预定义的工作流程，扩展 Agent 的能力
 * 例如: "代码审查" 技能会注入特定的 system prompt 和行为
 */
export interface ISkill {
  /** 技能名称 */
  readonly name: string;
  /** 描述 - 用于 Agent 判断何时激活该技能 */
  readonly description: string;
  /**
   * 技能激活时注入的 system prompt 片段
   * 会被追加到 Agent 的 system message 中
   */
  readonly prompt?: string;
  /** 技能分类标签 */
  readonly tags?: string[];
  /** 需要用户确认才激活 */
  readonly requiresConfirm?: boolean;

  /**
   * 技能激活时调用
   * 返回增强后的上下文
   */
  onActivate?(context: ISkillContext): Promise<ISkillContext> | ISkillContext;

  /**
   * 技能提供的专用工具
   */
  tools?: ITool[];

  /**
   * 技能停用时调用
   */
  onDeactivate?(): Promise<void> | void;
}

// ===================== 钩子接口 =====================

/**
 * 钩子事件类型
 */
export type HookEvent =
  | 'beforeMessage'    // 用户消息发送前
  | 'afterMessage'     // AI 回复完成后
  | 'beforeToolCall'   // 工具调用前
  | 'afterToolCall'    // 工具调用后
  | 'onError'          // 发生错误时
  | 'onStartup'        // 系统启动时
  | 'onShutdown';      // 系统关闭时

/**
 * 钩子上下文
 */
export interface HookContext {
  event: HookEvent;
  /** 会话 ID */
  sessionId?: string;
  /** 消息相关 */
  message?: { role: string; content: string };
  /** 工具调用相关 */
  toolCall?: {
    toolName: string;
    input: Record<string, unknown>;
    output?: string;
    error?: string;
  };
  /** 错误相关 */
  error?: Error;
  /** 自定义数据 */
  data?: Record<string, unknown>;
  /** 阻止默认行为 */
  preventDefault?: boolean;
}

/**
 * 插件钩子
 * 在特定事件发生时触发
 */
export interface IPluginHook {
  /** 监听的事件 */
  event: HookEvent;
  /** 优先级 (数字越小越先执行) */
  priority?: number;
  /** 钩子处理函数 */
  handler(context: HookContext): Promise<HookContext> | HookContext;
}

// ===================== 插件元数据 =====================

/**
 * 已加载插件的运行时状态
 */
export interface LoadedPlugin {
  /** 插件实例 */
  plugin: IPlugin;
  /** 加载来源路径 */
  sourcePath: string;
  /** 是否已启用 */
  enabled: boolean;
  /** 加载时间 */
  loadedAt: number;
  /** 加载错误 (如果有) */
  error?: string;
}

// ===================== 插件配置 =====================

/**
 * 插件管理器配置
 */
export interface PluginManagerConfig {
  /** 内置插件目录 */
  builtinPluginsDir?: string;
  /** 用户插件目录 */
  userPluginsDir?: string;
  /** 额外插件搜索路径 */
  extraPluginPaths?: string[];
  /** 禁用的插件名列表 */
  disabledPlugins?: string[];
  /** 是否启用热重载 */
  hotReload?: boolean;
}
