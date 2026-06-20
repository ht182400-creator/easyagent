import { logger } from '../utils/logger.js';
/**
 * 工具注册表
 */
export class ToolRegistry {
    tools = new Map();
    /**
     * 注册工具
     */
    register(tool) {
        if (this.tools.has(tool.name)) {
            logger.warn({ tool: tool.name }, '工具已存在，将覆盖');
        }
        this.tools.set(tool.name, tool);
        logger.info({ tool: tool.name }, '工具已注册');
    }
    /**
     * 批量注册工具
     */
    registerAll(tools) {
        for (const tool of tools) {
            this.register(tool);
        }
    }
    /**
     * 获取工具
     */
    get(name) {
        return this.tools.get(name);
    }
    /**
     * 移除工具
     */
    unregister(name) {
        return this.tools.delete(name);
    }
    /**
     * 是否存在工具
     */
    has(name) {
        return this.tools.has(name);
    }
    /**
     * 执行工具
     */
    async execute(name, params, context) {
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
        }
        catch (error) {
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
     */
    getDefinitions() {
        const defs = [];
        for (const tool of this.tools.values()) {
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
    getDescriptions() {
        const lines = [];
        for (const tool of this.tools.values()) {
            const params = Object.entries(tool.parameters.properties || {})
                .map(([key, prop]) => {
                const required = tool.parameters.required?.includes(key)
                    ? ' (必需)'
                    : '';
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
     * 获取工具列表
     */
    list() {
        return Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        }));
    }
}
//# sourceMappingURL=ToolRegistry.js.map