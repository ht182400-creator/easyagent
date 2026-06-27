/**
 * 工具注册表
 * 管理所有可用工具的注册、发现和执行
 */
import type { ToolDefinition, ToolResult, ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** 工具接口 */
export interface ITool {
  /** 工具名称 */
  readonly name: string;
  /** 工具描述 */
  readonly description: string;
  /** 参数定义 (JSON Schema) */
  readonly parameters: ToolDefinition['parameters'];
  /** 是否需要用户确认 */
  readonly requiresConfirm: boolean;
  /** 工具分组(如 file/search/exec/code 等) */
  readonly group?: string;

  /** 执行工具 */
  execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;

  /** 验证参数 */
  validate?(params: Record<string, unknown>): { valid: boolean; error?: string };
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools: Map<string, ITool> = new Map();
  /** 被禁用的工具名称集合 */
  private disabledSet: Set<string> = new Set();

  /**
   * 注册工具
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      logger.warn({ tool: tool.name }, '工具已存在，将覆盖');
    }
    this.tools.set(tool.name, tool);
    logger.info({ tool: tool.name }, '工具已注册');
  }

  /**
   * 设置工具的启用/禁用状态
   */
  setEnabled(name: string, enabled: boolean): boolean {
    if (!this.tools.has(name)) return false;
    if (enabled) {
      this.disabledSet.delete(name);
    } else {
      this.disabledSet.add(name);
    }
    logger.info({ tool: name, enabled }, '工具状态已更新');
    return true;
  }

  /**
   * 检查工具是否已启用
   */
  isEnabled(name: string): boolean {
    return this.tools.has(name) && !this.disabledSet.has(name);
  }

  /**
   * 获取所有被禁用的工具名称列表
   */
  getDisabledNames(): string[] {
    return Array.from(this.disabledSet);
  }

  /**
   * 批量设置禁用工具列表（从持久化配置加载）
   */
  setDisabledNames(names: string[]): void {
    this.disabledSet = new Set(names.filter((n) => this.tools.has(n)));
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: ITool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具
   */
  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * 移除工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 是否存在工具
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 执行工具
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        content: `错误: 未知工具 "${name}"`,
        error: `Tool "${name}" not found`,
      };
    }

    // 参数验证
    if (tool.validate) {
      const validation = tool.validate(params);
      if (!validation.valid) {
        return {
          success: false,
          content: `参数验证失败: ${validation.error}`,
          error: validation.error,
        };
      }
    }

    try {
      const result = await tool.execute(params, context);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ tool: name, error: errMsg }, '工具执行失败');
      return {
        success: false,
        content: `工具执行失败: ${errMsg}`,
        error: errMsg,
      };
    }
  }

  /**
   * 获取所有工具定义(JSON Schema格式，用于LLM)
   * 自动过滤被禁用的工具
   */
  getDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (this.disabledSet.has(tool.name)) continue;
      defs.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      });
    }
    return defs;
  }

  /**
   * 获取工具描述文本(用于系统提示词)
   */
  getDescriptions(): string {
    const lines: string[] = [];
    for (const tool of this.tools.values()) {
      const params = Object.entries(tool.parameters.properties || {})
        .map(([key, prop]) => {
          const required = tool.parameters.required?.includes(key) ? ' (必需)' : '';
          return `  - ${key}: ${prop.description}${required}`;
        })
        .join('\n');

      lines.push(`### ${tool.name}
${tool.description}
参数:
${params}
`);
    }
    return lines.join('\n');
  }

  /**
   * 获取工具列表（含参数、分组、启用状态，供前端展示）
   */
  list(): Array<{
    name: string;
    description: string;
    parameters: ToolDefinition['parameters'];
    group?: string;
    enabled: boolean;
  }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      group: t.group,
      enabled: !this.disabledSet.has(t.name),
    }));
  }
}
