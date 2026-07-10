/**
 * 聊天状态管理
 * 管理: 消息列表、WebSocket流式连接、输入状态、工具调用展示
 */
import { create } from 'zustand';
import { emit } from '../events';
import { getWsBase } from '../request';
import { useUIStore } from './uiStore';

/** 从核心类型库导入共享类型，替代本地重复定义 */
import type { MessageRole } from '@easyagent/core/types';
export type { MessageRole };

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
  tokenUsage?: { input: number; output: number; total: number };
  /** 生成耗时 (ms) */
  duration?: number;
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
  /** 重连计数器 */
  _reconnectAttempts: number;
  /** 重连最大间隔(ms) */
  _reconnectTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  setActiveSession: (sessionId: string) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  addToolCall: (sessionId: string, messageId: string, toolCall: ToolCallBlock) => void;
  updateToolCall: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    updates: Partial<ToolCallBlock>,
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
  _reconnectAttempts: 0,
  _reconnectTimer: null,

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
        m.id === messageId ? { ...m, ...updates } : m,
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
              tc.toolCallId === toolCallId ? { ...tc, ...updates } : tc,
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
    // 清除之前的重连计时器
    if (state._reconnectTimer) {
      clearTimeout(state._reconnectTimer);
    }
    // 关闭已有连接
    if (state.ws) {
      state.ws.close();
    }

    // WebSocket URL 由 ConfigProvider 统一注入（Web: '/ws', Desktop: 'ws://127.0.0.1:3456/ws'）
    // 替代旧的运行时检测逻辑（window.easyAgent / file:// 协议 / hostname 判断）
    const defaultUrl = getWsBase();
    const url = wsUrl || defaultUrl;

    set((s) => {
      const session = { ...ensureSession(s, sessionId) };
      session.connectionState = 'connecting';
      return {
        sessions: { ...s.sessions, [sessionId]: session },
        activeSessionId: sessionId,
        _reconnectAttempts: 0, // 重置重连计数
      };
    });

    /** 执行 WebSocket 连接创建 */
    function createConnection() {
      const s = get();
      // 清理旧的重连计时器
      if (s._reconnectTimer) {
        clearTimeout(s._reconnectTimer);
        set({ _reconnectTimer: null });
      }

      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          set((s) => {
            const session = { ...ensureSession(s, sessionId) };
            session.connectionState = 'connected';
            return {
              sessions: { ...s.sessions, [sessionId]: session },
              _reconnectAttempts: 0,
            };
          });
          // 注册到会话
          ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWSMessage(sessionId, data);
          } catch (err) {
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

        ws.onclose = (event) => {
          set((s) => {
            const session = { ...ensureSession(s, sessionId) };
            session.connectionState = 'disconnected';
            return { sessions: { ...s.sessions, [sessionId]: session } };
          });

          // 非正常关闭时自动重连（指数退避）
          if (event.code !== 1000 && event.code !== 1001) {
            const state = get();
            const attempts = state._reconnectAttempts;
            const maxReconnect = 10;
            if (attempts < maxReconnect) {
              // 指数退避：1s, 2s, 4s, 8s, ... , 最大 30s
              const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
              console.warn(`WebSocket 断开，${delay}ms 后重连 (${attempts + 1}/${maxReconnect})`);

              const timer = setTimeout(() => {
                set((s) => {
                  const session = { ...ensureSession(s, sessionId) };
                  session.connectionState = 'connecting';
                  return {
                    sessions: { ...s.sessions, [sessionId]: session },
                    _reconnectAttempts: attempts + 1,
                  };
                });
                createConnection();
              }, delay);
              set({ _reconnectTimer: timer });
            } else {
              console.error('WebSocket 重连次数已达上限');
            }
          }
        };

        set({ ws });
      } catch (err) {
        set((s) => {
          const session = { ...ensureSession(s, sessionId) };
          session.connectionState = 'error';
          return { sessions: { ...s.sessions, [sessionId]: session } };
        });
      }
    }

    createConnection();
  },

  disconnectWebSocket: () => {
    const { ws, _reconnectTimer } = get();
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
    }
    if (ws) {
      ws.close(1000, '用户主动断开');
      set({ ws: null, _reconnectTimer: null });
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
      const duration = data.duration as number | undefined;
      if (finalContent) {
        // 如果最后一条消息在流式输出，更新它; 否则创建新消息
        const messages = session?.messages || [];
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          store.updateMessage(sessionId, lastMsg.id, {
            content: finalContent,
            isStreaming: false,
            duration,
          });
        } else {
          store.addMessage(sessionId, {
            id: genId(),
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now(),
            isStreaming: false,
            duration,
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
      let msgId: string;
      // 如果最后一条消息是 assistant，复用其 ID；否则先创建一个占位 assistant 消息
      if (lastMsg?.role === 'assistant') {
        msgId = lastMsg.id;
      } else {
        msgId = genId();
        store.addMessage(sessionId, {
          id: msgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        });
      }

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

    case 'open_panel': {
      // 服务器通知前端打开右侧面板（如文档浏览器）
      const url = data.url as string;
      const title = (data.title as string) || '';
      if (url) {
        useUIStore.getState().openRightPanel(url, title);
      }
      break;
    }

    case 'error': {
      store.addMessage(sessionId, {
        id: genId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        error: (data.message as string) || '未知错误',
      });
      store.setGenerating(sessionId, false);
      break;
    }

    case 'done': {
      store.setGenerating(sessionId, false);
      break;
    }

    case 'automation_started':
    case 'automation_progress':
    case 'automation_completed':
    case 'automation_failed':
    case 'automation_stopped': {
      // 转发自动化事件到共享事件总线，供 automationStore 消费
      emit(data.type as string, data);
      break;
    }

    case 'plugin:install:progress': {
      // 转发插件安装进度到共享事件总线，供 pluginsStore 消费
      emit('plugin:install:progress', data);
      break;
    }

    case 'token_usage': {
      const usage = data.usage as { input: number; output: number; total: number };
      // 找到最后一条 assistant 消息，更新其 token 用量统计
      const session = store.sessions[sessionId];
      const lastMsg = session?.messages?.filter((m) => m.role === 'assistant').pop();
      if (lastMsg) {
        store.updateMessage(sessionId, lastMsg.id, { tokenUsage: usage });
      }
      break;
    }
  }
}
