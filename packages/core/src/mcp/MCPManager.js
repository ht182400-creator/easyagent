/**
 * MCP (Model Context Protocol) 管理器
 * 管理多个 MCP 服务器连接，将 MCP 工具转换为 ITool 格式供 Agent 使用
 */
import { MCPClient } from './MCPClient.js';
import { logger } from '../utils/logger.js';
/**
 * MCP 管理器 - 统一管理所有 MCP 服务器
 */
export class MCPManager {
    clients = new Map();
    mcpToIToolMap = new Map(); // MCP工具名 → 带前缀的ITool名
    /** 连接 MCP 服务器 */
    async connect(config) {
        if (this.clients.has(config.name)) {
            logger.warn({ server: config.name }, 'MCP 服务器已存在，先断开');
            await this.disconnect(config.name);
        }
        const client = new MCPClient(config);
        this.clients.set(config.name, client);
        try {
            const mcpTools = await client.connect();
            // 将 MCP 工具转换为 ITool
            return mcpTools.map((mt) => this.convertToITool(mt, config));
        }
        catch (error) {
            this.clients.delete(config.name);
            throw error;
        }
    }
    /** 断开 MCP 服务器 */
    async disconnect(serverName) {
        const client = this.clients.get(serverName);
        if (client) {
            await client.disconnect();
            // 清理映射
            for (const [mcpName, toolName] of this.mcpToIToolMap) {
                if (toolName.startsWith(`mcp_${serverName}_`)) {
                    this.mcpToIToolMap.delete(mcpName);
                }
            }
            this.clients.delete(serverName);
        }
    }
    /** 断开所有 MCP 连接 */
    async disconnectAll() {
        const names = [...this.clients.keys()];
        await Promise.all(names.map((n) => this.disconnect(n)));
    }
    /** 获取所有 MCP 工具的 ITool 格式 */
    getAllITools() {
        const tools = [];
        for (const [serverName, client] of this.clients) {
            const mcpTools = client.getTools();
            for (const mt of mcpTools) {
                const serverConfig = {
                    name: serverName,
                    command: '',
                    args: [],
                    enabled: true,
                };
                tools.push(this.convertToITool(mt, serverConfig));
            }
        }
        return tools;
    }
    /** 调用 MCP 工具 */
    async callTool(fullName, params) {
        // fullName 格式: mcp_serverName_toolName
        const parts = fullName.split('_');
        if (parts.length < 3 || parts[0] !== 'mcp') {
            return { success: false, content: `无效的MCP工具名: ${fullName}`, error: 'INVALID_MCP_TOOL' };
        }
        const serverName = parts[1];
        const toolName = parts.slice(2).join('_');
        const client = this.clients.get(serverName);
        if (!client) {
            return { success: false, content: `MCP服务器未连接: ${serverName}`, error: 'MCP_NOT_CONNECTED' };
        }
        try {
            const result = await client.callTool(toolName, params);
            const content = this.extractContent(result);
            return { success: true, content, metadata: { raw: result } };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `MCP工具调用失败: ${msg}`, error: msg };
        }
    }
    /** 获取已连接的服务器列表 */
    getConnectedServers() {
        return [...this.clients.keys()];
    }
    /** 将 MCP 工具转换为 ITool 格式 */
    convertToITool(mcpTool, config) {
        const fullName = `mcp_${config.name}_${mcpTool.name}`;
        this.mcpToIToolMap.set(mcpTool.name, fullName);
        const manager = this;
        const serverName = config.name;
        return {
            name: fullName,
            description: `[MCP:${serverName}] ${mcpTool.description || mcpTool.name}`,
            requiresConfirm: !(config.autoApprove?.includes(mcpTool.name)),
            parameters: {
                type: 'object',
                properties: mcpTool.inputSchema?.properties || {},
                required: mcpTool.inputSchema?.required || [],
            },
            async execute(params, _context) {
                return manager.callTool(fullName, params);
            },
        };
    }
    /** 从 MCP 结果中提取文本内容 */
    extractContent(result) {
        if (typeof result === 'string')
            return result;
        if (!result || typeof result !== 'object')
            return JSON.stringify(result);
        const obj = result;
        // MCP content 格式: { content: [{ type: "text", text: "..." }] }
        if (Array.isArray(obj.content)) {
            return obj.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n');
        }
        // 直接返回字符串结果
        if (obj.result && typeof obj.result === 'string')
            return obj.result;
        return JSON.stringify(result, null, 2);
    }
}
//# sourceMappingURL=MCPManager.js.map