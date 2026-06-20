import { AdapterFactory } from '../adapters/index.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { SessionManager } from '../session/SessionManager.js';
import { logger } from '../utils/logger.js';
/**
 * Agent引擎
 * 核心的智能体循环，管理思考-行动-观察循环
 */
export class AgentEngine {
    adapter;
    tools;
    sessions;
    config;
    state = 'idle';
    listeners = [];
    abortController = null;
    totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    turnCount = 0;
    /** 默认系统提示词 */
    static DEFAULT_SYSTEM_PROMPT = `你是一个AI编程助手，专注于帮助开发者编写高质量的代码。

## 能力
- 读写文件、搜索代码库
- 执行命令（git, npm, node等）
- 调试和修复bug
- 代码重构和优化
- 编写测试
- 解释代码逻辑、提供最佳实践建议

## 行为准则
- 对于不确定的信息，明确告知用户
- 复杂任务先制定计划再执行
- 先读取再编辑，避免盲目修改
- 代码修改后运行相关测试验证
- 给出清晰的解释和建议`;
    constructor(adapterOrConfig, tools, sessions, config) {
        // 支持传入适配器实例或提供商配置
        // 使用鸭子类型判断: 有chat和chatStream方法的视为适配器
        if (typeof adapterOrConfig?.chat === 'function' &&
            typeof adapterOrConfig?.chatStream === 'function') {
            this.adapter = adapterOrConfig;
        }
        else {
            this.adapter = AdapterFactory.create(adapterOrConfig, config?.model);
        }
        this.tools = tools || new ToolRegistry();
        this.sessions = sessions || new SessionManager();
        this.config = {
            provider: config?.provider || 'deepseek',
            model: config?.model || 'deepseek-v4',
            systemPrompt: config?.systemPrompt || AgentEngine.DEFAULT_SYSTEM_PROMPT,
            maxTurns: config?.maxTurns || 25,
            tools: config?.tools || [],
            allowTools: config?.allowTools ?? true,
            temperature: config?.temperature ?? 0.7,
        };
    }
    /**
     * 获取当前Agent状态
     */
    getState() {
        return this.state;
    }
    /**
     * 获取Token用量
     */
    getTokenUsage() {
        return { ...this.totalUsage };
    }
    /**
     * 添加事件监听器
     */
    onEvent(listener) {
        this.listeners.push(listener);
    }
    /**
     * 移除事件监听器
     */
    offEvent(listener) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }
    /**
     * 发出事件
     */
    emit(type, data) {
        const event = { type, data, timestamp: new Date() };
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch (error) {
                logger.error({ error }, '事件监听器错误');
            }
        }
    }
    /**
     * 运行Agent对话循环
     * @param userMessage - 用户输入
     * @param options - 对话选项
     * @returns 最终响应文本
     */
    async run(userMessage, options) {
        const sessionId = options?.sessionId || `session_${Date.now()}`;
        const workspace = options?.workspace || process.cwd();
        // 初始化或恢复会话
        const session = this.sessions.getOrCreate(sessionId, {
            workspace,
            provider: this.config.provider,
            model: this.config.model,
        });
        // 初始化中止控制器
        this.abortController = new AbortController();
        this.state = 'thinking';
        this.turnCount = 0;
        try {
            // 构建消息列表
            const messages = [
                { role: 'system', content: this.buildSystemPrompt(workspace) },
                ...session.messages,
                { role: 'user', content: userMessage },
            ];
            // 构建工具定义
            const toolDefinitions = this.buildToolDefinitions();
            // Agent循环
            let fullResponse = '';
            let shouldContinue = true;
            while (shouldContinue && this.turnCount < this.config.maxTurns) {
                this.turnCount++;
                logger.info({ turn: this.turnCount }, 'Agent循环迭代');
                this.state = 'thinking';
                this.emit('thinking', { turn: this.turnCount });
                // 调用模型
                const chatOptions = {
                    maxTokens: 4096,
                    temperature: this.config.temperature,
                    tools: this.config.allowTools ? toolDefinitions : undefined,
                    toolChoice: this.config.allowTools ? 'auto' : 'none',
                    signal: this.abortController.signal,
                };
                let response;
                if (options?.onPartialResponse) {
                    // 流式输出
                    response = await this.streamChat(messages, chatOptions, options.onPartialResponse);
                }
                else {
                    response = await this.adapter.chat(messages, chatOptions);
                }
                // 累积Token用量
                if (response.usage) {
                    this.totalUsage.inputTokens += response.usage.inputTokens;
                    this.totalUsage.outputTokens += response.usage.outputTokens;
                    this.totalUsage.totalTokens += response.usage.totalTokens;
                }
                // 添加助手消息到对话历史
                messages.push({
                    role: 'assistant',
                    content: response.content || '',
                    tool_calls: response.toolCalls,
                });
                fullResponse += response.content || '';
                // 检查是否需要调用工具
                if (response.toolCalls && response.toolCalls.length > 0 && response.finishReason === 'tool_calls') {
                    this.state = 'acting';
                    this.emit('tool_call', { toolCalls: response.toolCalls });
                    // 执行工具调用
                    for (const toolCall of response.toolCalls) {
                        if (this.abortController.signal.aborted)
                            break;
                        const toolName = toolCall.function.name;
                        let toolInput;
                        try {
                            toolInput = JSON.parse(toolCall.function.arguments);
                        }
                        catch {
                            toolInput = {};
                        }
                        logger.info({ tool: toolName, input: toolInput }, '执行工具');
                        const result = await this.tools.execute(toolName, toolInput, {
                            workspace,
                            sessionId,
                            signal: this.abortController.signal,
                        });
                        this.emit('tool_result', { toolName, result });
                        // 添加工具结果到对话历史
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: result.content,
                        });
                    }
                }
                else {
                    // 模型给出最终回答
                    shouldContinue = false;
                }
            }
            // 保存会话
            session.messages = messages.filter(m => m.role !== 'system');
            session.metadata.updatedAt = new Date();
            session.metadata.tokenUsage = { ...this.totalUsage };
            this.sessions.save(session);
            this.state = 'done';
            this.emit('done', { response: fullResponse, usage: this.totalUsage });
            return fullResponse || 'Agent已完成，但没有生成回复。';
        }
        catch (error) {
            this.state = 'error';
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emit('error', { error: errorMsg });
            if (error.name === 'AbortError') {
                return '操作已取消。';
            }
            logger.error({ error }, 'Agent运行错误');
            return `错误: ${errorMsg}`;
        }
        finally {
            this.abortController = null;
        }
    }
    /**
     * 流式聊天(带回调)
     */
    async streamChat(messages, options, onChunk) {
        let fullContent = '';
        let finalUsage;
        let finalFinishReason = 'stop';
        let toolCalls;
        const toolCallMap = new Map();
        for await (const chunk of this.adapter.chatStream(messages, options)) {
            if (this.abortController?.signal.aborted)
                break;
            if (chunk.delta) {
                fullContent += chunk.delta;
                onChunk(chunk.delta);
            }
            if (chunk.toolCallDelta) {
                // 累积工具调用
                const existing = Array.from(toolCallMap.values());
                if (existing.length === 0) {
                    toolCallMap.set(0, {
                        id: chunk.toolCallDelta.id || `call_${Date.now()}`,
                        name: chunk.toolCallDelta.function?.name || '',
                        args: chunk.toolCallDelta.function?.arguments || '',
                    });
                }
                else {
                    const tc = existing[0];
                    if (chunk.toolCallDelta.function?.arguments) {
                        tc.args += chunk.toolCallDelta.function.arguments;
                    }
                }
            }
            if (chunk.finishReason) {
                finalFinishReason = chunk.finishReason;
            }
            if (chunk.usage) {
                finalUsage = chunk.usage;
            }
        }
        // 处理累积的工具调用
        if (toolCallMap.size > 0) {
            toolCalls = Array.from(toolCallMap.values()).map(tc => ({
                id: tc.id || `call_${Date.now()}`,
                type: 'function',
                function: {
                    name: tc.name,
                    arguments: tc.args,
                },
            }));
        }
        return {
            id: `chat_${Date.now()}`,
            model: this.adapter.currentModel,
            content: fullContent,
            toolCalls,
            finishReason: finalFinishReason,
            usage: finalUsage,
        };
    }
    /**
     * 构建系统提示词
     */
    buildSystemPrompt(workspace) {
        const os = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
        const date = new Date().toLocaleString('zh-CN');
        return `${this.config.systemPrompt}

## 环境信息
- 当前日期时间: ${date}
- 操作系统: ${os}
- 工作目录: ${workspace}
- Shell: ${process.env.SHELL || (process.platform === 'win32' ? 'PowerShell' : 'bash')}

## 可用工具
${this.config.allowTools ? this.tools.getDescriptions() : '工具调用已禁用'}`;
    }
    /**
     * 构建工具定义列表
     */
    buildToolDefinitions() {
        if (!this.config.allowTools)
            return [];
        return this.tools.getDefinitions();
    }
    /**
     * 停止Agent执行
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.state = 'idle';
            logger.info('Agent执行已中止');
        }
    }
    /**
     * 切换到不同的模型
     */
    switchModel(providerConfig, modelName) {
        this.adapter = AdapterFactory.create(providerConfig, modelName);
        this.config.provider = providerConfig.id;
        this.config.model = modelName;
        logger.info({ provider: providerConfig.id, model: modelName }, 'Agent模型已切换');
    }
    /**
     * 清除对话历史
     */
    clearHistory(sessionId) {
        this.sessions.delete(sessionId);
        this.totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        this.turnCount = 0;
        logger.info({ sessionId }, '会话已清除');
    }
}
//# sourceMappingURL=AgentEngine.js.map