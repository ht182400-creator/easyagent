/**
 * Agent引擎
 * 实现ReAct模式的智能体循环
 * 集成工具调用、多模型支持
 */
import type { AgentConfig, AgentState, AgentEvent, TokenUsage } from '../types/index.js';
import { BaseAdapter } from '../adapters/BaseAdapter.js';
import type { ProviderConfig } from '../types/index.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { SessionManager } from '../session/SessionManager.js';
/** Agent事件监听器 */
export type AgentEventListener = (event: AgentEvent) => void;
/**
 * Agent引擎
 * 核心的智能体循环，管理思考-行动-观察循环
 */
export declare class AgentEngine {
    private adapter;
    private tools;
    private sessions;
    private config;
    private state;
    private listeners;
    private abortController;
    private totalUsage;
    private turnCount;
    /** 默认系统提示词 */
    private static readonly DEFAULT_SYSTEM_PROMPT;
    constructor(adapterOrConfig: BaseAdapter | ProviderConfig, tools?: ToolRegistry, sessions?: SessionManager, config?: Partial<AgentConfig>);
    /**
     * 获取当前Agent状态
     */
    getState(): AgentState;
    /**
     * 获取Token用量
     */
    getTokenUsage(): TokenUsage;
    /**
     * 添加事件监听器
     */
    onEvent(listener: AgentEventListener): void;
    /**
     * 移除事件监听器
     */
    offEvent(listener: AgentEventListener): void;
    /**
     * 发出事件
     */
    private emit;
    /**
     * 运行Agent对话循环
     * @param userMessage - 用户输入
     * @param options - 对话选项
     * @returns 最终响应文本
     */
    run(userMessage: string, options?: {
        sessionId?: string;
        workspace?: string;
        onPartialResponse?: (text: string) => void;
    }): Promise<string>;
    /**
     * 流式聊天(带回调)
     */
    private streamChat;
    /**
     * 构建系统提示词
     */
    private buildSystemPrompt;
    /**
     * 构建工具定义列表
     */
    private buildToolDefinitions;
    /**
     * 停止Agent执行
     */
    abort(): void;
    /**
     * 切换到不同的模型
     */
    switchModel(providerConfig: ProviderConfig, modelName: string): void;
    /**
     * 清除对话历史
     */
    clearHistory(sessionId: string): void;
}
//# sourceMappingURL=AgentEngine.d.ts.map