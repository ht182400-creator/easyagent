/**
 * 工具注册表
 * 管理所有可用工具的注册、发现和执行
 */
import type { ToolDefinition, ToolResult, ToolContext } from '../types/index.js';
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
    /** 执行工具 */
    execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
    /** 验证参数 */
    validate?(params: Record<string, unknown>): {
        valid: boolean;
        error?: string;
    };
}
/**
 * 工具注册表
 */
export declare class ToolRegistry {
    private tools;
    /**
     * 注册工具
     */
    register(tool: ITool): void;
    /**
     * 批量注册工具
     */
    registerAll(tools: ITool[]): void;
    /**
     * 获取工具
     */
    get(name: string): ITool | undefined;
    /**
     * 移除工具
     */
    unregister(name: string): boolean;
    /**
     * 是否存在工具
     */
    has(name: string): boolean;
    /**
     * 执行工具
     */
    execute(name: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
    /**
     * 获取所有工具定义(JSON Schema格式，用于LLM)
     */
    getDefinitions(): ToolDefinition[];
    /**
     * 获取工具描述文本(用于系统提示词)
     */
    getDescriptions(): string;
    /**
     * 获取工具列表
     */
    list(): Array<{
        name: string;
        description: string;
    }>;
}
//# sourceMappingURL=ToolRegistry.d.ts.map