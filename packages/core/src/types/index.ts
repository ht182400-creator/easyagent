/**
 * EasyAgent 核心类型定义
 * 统一整个系统的类型接口
 */

// ==================== 模型相关类型 ====================

/** 模型提供商标识 */
export type ProviderId =
  | 'deepseek'
  | 'zhipu'
  | 'qwen'
  | 'kimi'
  | 'ernie'
  | 'doubao'
  | 'hunyuan'
  | 'minimax'
  | 'ollama'
  | 'openai'
  | 'custom';

/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 聊天消息 */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
  /** 工具调用(仅assistant角色) */
  tool_calls?: ToolCall[];
  /** 工具调用ID(仅tool角色) */
  tool_call_id?: string;
  /** 消息名称(可选) */
  name?: string;
}

/** 内容块类型 */
export type ContentBlock = TextContent | ImageContent | ToolUseContent | ToolResultContent;

/** 文本内容块 */
export interface TextContent {
  type: 'text';
  text: string;
}

/** 图片内容块 */
export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
}

/** 工具使用内容块 */
export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** 工具结果内容块 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** 聊天选项 */
export interface ChatOptions {
  /** 最大输出token数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** Top-P采样 */
  topP?: number;
  /** 停止序列 */
  stop?: string[];
  /** 工具定义(用于function calling) */
  tools?: ToolDefinition[];
  /** 工具选择模式 */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /** 流式输出回调 */
  onChunk?: (chunk: ChatChunk) => void;
  /** 中止信号 */
  signal?: AbortSignal;
}

/** 聊天响应 */
export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  /** 工具调用 */
  toolCalls?: ToolCall[];
  /** 停止原因 */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Token用量 */
  usage?: TokenUsage;
}

/** 流式聊天块 */
export interface ChatChunk {
  /** 增量内容 */
  delta?: string;
  /** 增量工具调用 */
  toolCallDelta?: Partial<ToolCall>;
  /** 完成原因(仅最后一个chunk) */
  finishReason?: string;
  /** Token用量(仅最后一个chunk) */
  usage?: TokenUsage;
}

/** Token用量 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** 模型信息 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderId;
  /** 最大上下文长度 */
  maxContextTokens: number;
  /** 最大输出长度 */
  maxOutputTokens: number;
  /** 是否支持工具调用 */
  supportsTools: boolean;
  /** 是否支持视觉 */
  supportsVision: boolean;
  /** 价格(每百万token) */
  pricing?: {
    input: number; // 每百万输入token价格(元)
    output: number; // 每百万输出token价格(元)
  };
}

// ==================== 工具相关类型 ====================

/** 工具定义(JSON Schema) */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

/** 工具参数定义 */
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
  items?: ToolParameter;
}

/** 工具执行结果 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 结果内容 */
  content: string;
  /** 错误信息 */
  error?: string;
  /** 附加上下文 */
  metadata?: Record<string, unknown>;
}

/** 工具上下文 */
export interface ToolContext {
  /** 工作区路径 */
  workspace: string;
  /** 会话ID */
  sessionId: string;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 环境变量 */
  env?: Record<string, string>;
}

// ==================== Agent相关类型 ====================

/** Agent配置 */
export interface AgentConfig {
  /** 模型提供商标识 */
  provider: ProviderId;
  /** 模型名称 */
  model: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 最大对话轮次 */
  maxTurns?: number;
  /** 可用工具列表 */
  tools?: ToolDefinition[];
  /** 是否允许工具调用 */
  allowTools?: boolean;
  /** 温度参数 */
  temperature?: number;
}

/** Agent状态 */
export type AgentState = 'idle' | 'thinking' | 'acting' | 'observing' | 'done' | 'error';

/** Agent事件 */
export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'done';
  data: unknown;
  timestamp: Date;
}

// ==================== 会话相关类型 ====================

/** 会话 */
export interface Session {
  id: string;
  /** 工作区路径 */
  workspace: string;
  /** 模型配置 */
  modelConfig: {
    provider: ProviderId;
    model: string;
  };
  /** 消息历史 */
  messages: Message[];
  /** 会话元数据 */
  metadata: SessionMetadata;
  /** 摘要(长对话自动生成) */
  summary?: string;
}

/** 会话元数据 */
export interface SessionMetadata {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'paused' | 'completed' | 'archived';
  tokenUsage: TokenUsage;
  tags?: string[];
}

// ==================== 配置相关类型 ====================

/** 提供商配置 */
export interface ProviderConfig {
  /** 提供商ID */
  id: ProviderId;
  /** 显示名称 */
  name: string;
  /** API基础URL */
  baseURL: string;
  /** API密钥 */
  apiKey: string;
  /** API密钥环境变量名 */
  apiKeyEnv?: string;
  /** API格式类型 */
  apiFormat: 'openai' | 'anthropic' | 'custom';
  /** 支持的模型列表 */
  models: ModelConfig[];
  /** 默认模型 */
  defaultModel?: string;
  /** 请求头 */
  headers?: Record<string, string>;
}

/** 模型配置 */
export interface ModelConfig {
  /** 模型ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 最大上下文token数 */
  maxContextTokens: number;
  /** 最大输出token数 */
  maxOutputTokens: number;
  /** 是否支持工具调用 */
  supportsTools: boolean;
  /** 是否支持视觉 */
  supportsVision: boolean;
  /** 价格(元/百万token) */
  pricing?: {
    input: number;
    output: number;
  };
}

/** 应用全局配置 */
export interface AppConfig {
  /** 当前使用的模型 */
  currentModel: {
    provider: ProviderId;
    model: string;
  };
  /** 提供商配置列表 */
  providers: ProviderConfig[];
  /** Agent配置 */
  agent: {
    maxTurns: number;
    allowTools: boolean;
    temperature: number;
  };
  /** 安全配置 */
  security: {
    /** 危险命令白名单 */
    allowedCommands: string[];
    /** 是否启用命令确认 */
    requireConfirmation: boolean;
    /** 日Token上限 */
    dailyTokenLimit: number;
  };
  /** 知识库配置 */
  knowledgeBase: {
    enabled: boolean;
    maxDocuments: number;
    chunkSize: number;
    embeddingModel: string;
  };
  /** 仪表盘模板列表（可选，运行时从配置加载） */
  templates?: Array<{
    id: string;
    label: string;
    desc: string;
    icon: string;
    prompt: string;
  }>;
}

// ==================== 知识库相关类型 ====================

/** 文档 */
export interface Document {
  id: string;
  title: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  chunks?: DocumentChunk[];
}

/** 文档块 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  index: number;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

/** 检索结果 */
export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
  document: Document;
}

// ==================== MCP相关类型 ====================

/** MCP服务器配置 */
export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  /** 自动批准的工具列表 */
  autoApprove?: string[];
}

/** MCP工具 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

// ==================== 自动化任务相关类型 ====================

/** 自动化任务 */
export interface AutomationTask {
  id: string;
  name: string;
  description: string;
  /** Cron表达式 */
  schedule: string;
  /** 任务提示词 */
  prompt: string;
  /** 工作区路径 */
  workspace: string;
  /** 使用的模型 */
  model: { provider: ProviderId; model: string };
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: Date;
  /** 上次运行时间 */
  lastRunAt?: Date;
  /** 下次运行时间 */
  nextRunAt?: Date;
  /** 执行历史 */
  history?: AutomationRun[];
}

/** 自动化任务执行记录 */
export interface AutomationRun {
  id: string;
  taskId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
}
