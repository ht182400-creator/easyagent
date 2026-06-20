import type { MCPServerConfig, MCPTool } from '../types/index.js';
export type MCPEventCallback = (toolName: string, data: unknown) => void;
/**
 * MCP 客户端 - 管理单个 MCP 服务器连接
 */
export declare class MCPClient {
    private config;
    readonly serverName: string;
    private process;
    private requestId;
    private pendingRequests;
    private tools;
    private buffer;
    private eventCallback;
    constructor(config: MCPServerConfig);
    /** 启动 MCP 服务器进程并初始化 */
    connect(): Promise<MCPTool[]>;
    /** 断开连接 */
    disconnect(): Promise<void>;
    /** 获取工具列表 */
    getTools(): MCPTool[];
    /** 调用 MCP 工具 */
    callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
    /** 设置事件回调 */
    onEvent(callback: MCPEventCallback): void;
    /** 发送 JSON-RPC 请求 */
    private sendRequest;
    /** 处理服务器消息 */
    private handleMessage;
    /** 是否已连接 */
    get isConnected(): boolean;
}
//# sourceMappingURL=MCPClient.d.ts.map