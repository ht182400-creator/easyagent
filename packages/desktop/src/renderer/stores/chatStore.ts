/**
 * 聊天状态管理
 * 管理: 消息列表、WebSocket流式连接、输入状态、工具调用展示
 */
import { create } from 'zustand';

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** 工具调用块 */
export interface ToolCallBlock {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  startTime?: number;
  endTime?: number;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** 工具调用 (仅assistant消息) */
  toolCalls?: ToolCallBlock[];
  /** 是否为流式输出中 */
  isStreaming?: boolean;
  /** Token用量 */
  tokenUsage?: { input: number; output: number };
  /** 错误信息 */
  error?: string;
}

/** 聊天连接状态 */
export type ChatConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/** 每个会话的状态 */
interface PerSessionState {
  messages: ChatMessage[];
  streamingText: string;
  streamingToolInput: string;
  connectionState: ChatConnectionState;
  isGenerating: boolean;
  tokenUsage: { input: number; output: number; total: number };
}

interface ChatState {
  /** 会话ID → 会话状态 */
  sessions: Record<string, PerSessionState>;
  /** 当前活跃会话ID */
  activeSessionId: string | null;
  /** WebSocket 实例 */
  ws: WebSocket | null;
  /** 输入框预填文本 */
  composerPrefill: string;

  // Actions
  setActiveSession: (sessionId: string) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  addToolCall: (sessionId: string, messageId: string, toolCall: ToolCallBlock) => void;
  updateToolCall: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    updates: Partial<ToolCallBlock>
  ) => void;
  setStreamingText: (sessionId: string, text: string) => void;
  appendStreamingText: (sessionId: string, delta: string) => void;
  setGenerating: (sessionId: string, generating: boolean) => void;
  setConnectionState: (sessionId: string, state: ChatConnectionState) => void;
  setComposerPrefill: (text: string) => void;
  clearComposerPrefill: () => void;
  clearMessages: (sessionId: string) => void;

  // WebSocket
  connectWebSocket: (sessionId: string, wsUrl?: string) => void;
  disconnectWebSocket: () => void;
  sendViaWebSocket: (data: unknown) => void;
}

/**
 * 生成唯一消息ID
 */
function genId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 确保会话状态存在
 */
function ensureSession(state: ChatState, sessionId: string): PerSessionState {
  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = {
      messages: [],
      streamingText: '',
      streamingToolInput: '',
      connectionState: 'disconnected',
      isGenerating: false,
      tokenUsage: { input: 0, output: 0, total: 0 },
    };
  }
  return state.sessions[sessionId];
}

/**
 * 聊天状态 Store
 * 支持 WebSocket 流式通信和工具调用可视化
 */
export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  ws: null,
  composerPrefill: '',

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  addMessage: (sessionId, message) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.messages = [...session.messages, message];
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  updateMessage: (sessionId, messageId, updates) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.messages = session.messages.map((m) =>
        m.id === messageId ? { ...m, ...updates } : m
      );
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  addToolCall: (sessionId, messageId, toolCall) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.messages = session.messages.map((m) => {
        if (m.id === messageId) {
          return { ...m, toolCalls: [...(m.toolCalls || []), toolCall] };
        }
        return m;
      });
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  updateToolCall: (sessionId, messageId, toolCallId, updates) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.messages = session.messages.map((m) => {
        if (m.id === messageId && m.toolCalls) {
          return {
            ...m,
            toolCalls: m.toolCalls.map((tc) =>
              tc.toolCallId === toolCallId ? { ...tc, ...updates } : tc
            ),
          };
        }
        return m;
      });
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  setStreamingText: (sessionId, text) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.streamingText = text;
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  appendStreamingText: (sessionId, delta) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.streamingText += delta;
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  setGenerating: (sessionId, generating) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.isGenerating = generating;
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  setConnectionState: (sessionId, state) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.connectionState = state;
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  setComposerPrefill: (text) => set({ composerPrefill: text }),
  clearComposerPrefill: () => set({ composerPrefill: '' }),

  clearMessages: (sessionId) =>
    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.messages = [];
      session.streamingText = '';
      return { sessions: { ...s.sessions, [sessionId]: session } };
    }),

  // WebSocket 连接管理
  connectWebSocket: (sessionId, wsUrl?: string) => {
    const state = get();
    // 关闭已有连接
    if (state.ws) {
      state.ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    /** 桌面版和开发模式下直连后端 WebSocket (127.0.0.1:3456)
     *  生产 Web 模式下使用当前 host */
    const isDesktop = !!(window as any).easyAgent || window.location.protocol === 'file:';
    const defaultUrl = (import.meta.env.DEV || isDesktop)
      ? 'ws://127.0.0.1:3456/ws'
      : `${protocol}//${window.location.host}/ws`;
    const url = wsUrl || defaultUrl;

    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.connectionState = 'connecting';
      return { sessions: { ...s.sessions, [sessionId]: session }, activeSessionId: sessionId };
    });

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        set((s) => {
          const session = { ...ensureSession(s, sessionId) };
          session.connectionState = 'connected';
          return { sessions: { ...s.sessions, [sessionId]: session } };
        });
        // 注册到会话
        ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWSMessage(sessionId, data);
        } catch {
          console.warn('无法解析WebSocket消息:', event.data);
        }
      };

      ws.onerror = () => {
        set((s) => {
          const session = { ...ensureSession(s, sessionId) };
          session.connectionState = 'error';
          return { sessions: { ...s.sessions, [sessionId]: session } };
        });
      };

      ws.onclose = () => {
        set((s) => {
          const session = { ...ensureSession(s, sessionId) };
          session.connectionState = 'disconnected';
          return { sessions: { ...s.sessions, [sessionId]: session } };
        });
      };

      set({ ws });
    } catch {
      set((s) => {
        const session = { ...ensureSession(s, sessionId) };
        session.connectionState = 'error';
        return { sessions: { ...s.sessions, [sessionId]: session } };
      });
    }
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
  },

  sendViaWebSocket: (data) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket未连接，无法发送消息');
    }
  },
}));

/**
 * 处理 WebSocket 消息
 */
function handleWSMessage(sessionId: string, data: Record<string, unknown>) {
  const store = useChatStore.getState();

  switch (data.type) {
    case 'text_delta': {
      store.appendStreamingText(sessionId, data.delta as string);
      break;
    }

    case 'text_done': {
      const session = store.sessions[sessionId];
      const finalContent = session?.streamingText || '';
      if (finalContent) {
        // 如果最后一条消息在流式输出，更新它; 否则创建新消息
        const messages = session?.messages || [];
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          store.updateMessage(sessionId, lastMsg.id, {
            content: finalContent,
            isStreaming: false,
          });
        } else {
          store.addMessage(sessionId, {
            id: genId(),
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now(),
            isStreaming: false,
          });
        }
      }
      store.setStreamingText(sessionId, '');
      break;
    }

    case 'tool_use': {
      // AI 开始调用工具
      const lastMessages = store.sessions[sessionId]?.messages || [];
      const lastMsg = lastMessages[lastMessages.length - 1];
      const msgId = lastMsg?.role === 'assistant' ? lastMsg.id : genId();

      store.addToolCall(sessionId, msgId, {
        toolCallId: data.toolCallId as string,
        toolName: data.toolName as string,
        input: (data.input as Record<string, unknown>) || {},
        status: 'running',
        startTime: Date.now(),
      });
      break;
    }

    case 'tool_result': {
      const session = store.sessions[sessionId];
      if (!session) break;
      // 找到对应的工具调用更新
      for (const msg of session.messages) {
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.toolCallId === data.toolCallId) {
              store.updateToolCall(sessionId, msg.id, tc.toolCallId, {
                output: data.output as string,
                status: data.error ? 'error' : 'done',
                endTime: Date.now(),
              });
              return;
            }
          }
        }
      }
      break;
    }

    case 'error': {
      store.addMessage(sessionId, {
        id: genId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        error: data.message as string || '未知错误',
      });
      store.setGenerating(sessionId, false);
      break;
    }

    case 'done': {
      store.setGenerating(sessionId, false);
      break;
    }

    case 'token_usage': {
      const usage = data.usage as { input: number; output: number; total: number };
      store.updateMessage(sessionId, '', { tokenUsage: usage }); // placeholder
      break;
    }
  }
}
