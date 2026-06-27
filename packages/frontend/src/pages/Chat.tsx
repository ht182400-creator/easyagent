/**
 * 升级版聊天页面 - 使用 Zustand Store + WebSocket 流式通信
 * 支持: 工具调用展示、模型切换、附件上传、历史会话查看
 */
import { useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trash2, Wifi, WifiOff, Loader2, ArrowLeft } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useProviderStore } from '../stores/providerStore';
import { useAppStore } from '../stores/appStore';
import { getApiBase } from '../request';
import { MessageList } from '../components/Chat/MessageList';
import { ChatInput } from '../components/Chat/ChatInput';
import { StatusBadge } from '../components/Common/StatusBadge';

/** 后端返回的消息格式 */
interface SessionMessage {
  id?: string;
  role: string;
  content: string;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    output?: string;
    status?: string;
  }>;
}

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const urlSessionId = searchParams.get('sessionId') || '';
  /** 实际的会话ID: URL参数优先，否则使用默认 */
  const sessionId = urlSessionId || 'web_default';
  /** 是否在查看历史会话 */
  const isHistory = !!urlSessionId;

  const session = useChatStore((s) => s.sessions[sessionId]);
  const connectionState = session?.connectionState || 'disconnected';
  const messages = session?.messages || [];
  const addNotification = useAppStore((s) => s.addNotification);

  const connectWebSocket = useChatStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useChatStore((s) => s.disconnectWebSocket);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const fetchProviders = useProviderStore((s) => s.fetchProviders);

  // 加载历史会话消息
  useEffect(() => {
    if (!urlSessionId) return;
    let cancelled = false;

    (async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/sessions/${urlSessionId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const msgs: SessionMessage[] = data?.messages || [];
        // 先清空旧消息，再导入
        clearMessages(sessionId);
        for (const m of msgs) {
          addMessage(sessionId, {
            id: m.id || `history_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content || '',
            toolCalls:
              m.toolCalls?.map((tc) => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
                output: tc.output,
                status: (tc.status as any) || 'done',
              })) || [],
            timestamp: Date.now(),
            isStreaming: false,
          });
        }
      } catch (err) {
        // 静默失败，至少可以开始新对话
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [urlSessionId, sessionId, clearMessages, addMessage]);

  // 初始化：连接WebSocket + 加载提供商（历史会话不连WebSocket）
  useEffect(() => {
    fetchProviders();
    if (!isHistory) {
      connectWebSocket(sessionId);
    }

    return () => {
      disconnectWebSocket();
    };
  }, [sessionId, connectWebSocket, disconnectWebSocket, fetchProviders, isHistory]);

  // 重新连接
  const handleReconnect = useCallback(() => {
    if (isHistory) return;
    connectWebSocket(sessionId);
    addNotification({ type: 'info', message: '正在重新连接...', duration: 2000 });
  }, [sessionId, connectWebSocket, addNotification, isHistory]);

  // 清空对话
  const handleClear = useCallback(() => {
    clearMessages(sessionId);
  }, [sessionId, clearMessages]);

  // 连接状态显示
  const connectionBadge = () => {
    if (isHistory) {
      return <StatusBadge variant="info" label="只读查看" />;
    }
    switch (connectionState) {
      case 'connected':
        return <StatusBadge variant="success" label="已连接" pulse />;
      case 'connecting':
        return (
          <span className="flex items-center gap-1 text-xs text-yellow-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            连接中...
          </span>
        );
      case 'error':
        return (
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
          >
            <WifiOff className="w-3 h-3" />
            连接失败 (点击重试)
          </button>
        );
      default:
        return (
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400"
          >
            <WifiOff className="w-3 h-3" />
            未连接
          </button>
        );
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div className="flex items-center gap-2">
            {isHistory && (
              <a
                href="/sessions"
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title="返回会话列表"
              >
                <ArrowLeft className="w-4 h-4" />
              </a>
            )}
            <h1 className="text-xl font-bold">
              {isHistory ? `历史会话: ${urlSessionId.slice(0, 8)}...` : 'AI 对话'}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {connectionBadge()}
            {messages.length > 0 && (
              <span className="text-xs text-gray-600">{messages.length} 条消息</span>
            )}
          </div>
        </div>
        <button
          onClick={handleClear}
          className="btn btn-ghost btn-sm gap-1.5"
          disabled={messages.length === 0}
        >
          <Trash2 className="w-3.5 h-3.5" /> 清空
        </button>
      </div>

      {/* 消息列表 */}
      <MessageList sessionId={sessionId} />

      {/* 输入框（历史会话不显示） */}
      {!isHistory && <ChatInput sessionId={sessionId} />}
      {isHistory && (
        <div className="py-3 px-4 text-center text-sm text-gray-600 border-t border-gray-800">
          这是历史会话的只读视图，如需继续对话请
          <a href="/chat" className="text-primary-400 hover:text-primary-300 ml-1">
            新建会话
          </a>
        </div>
      )}
    </div>
  );
}
