import type { ITool } from '../tools/ToolRegistry.js';
import type { MCPServerConfig, ToolResult } from '../types/index.js';
/**
 * MCP 管理器 - 统一管理所有 MCP 服务器
 */
export declare class MCPManager {
    private clients;
    private mcpToIToolMap;
    /** 连接 MCP 服务器 */
    connect(config: MCPServerConfig): Promise<ITool[]>;
    /** 断开 MCP 服务器 */
    disconnect(serverName: string): Promise<void>;
    /** 断开所有 MCP 连接 */
    disconnectAll(): Promise<void>;
    /** 获取所有 MCP 工具的 ITool 格式 */
    getAllITools(): ITool[];
    /** 调用 MCP 工具 */
    callTool(fullName: string, params: Record<string, unknown>): Promise<ToolResult>;
    /** 获取已连接的服务器列表 */
    getConnectedServers(): string[];
    /** 将 MCP 工具转换为 ITool 格式 */
    private convertToITool;
    /** 从 MCP 结果中提取文本内容 */
    private extractContent;
}
//# sourceMappingURL=MCPManager.d.ts.map