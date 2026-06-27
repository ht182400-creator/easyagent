/**
 * ChatView - 对话主视图
 * 消息列表 + 输入框 + Agent IPC 通信
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, AlertCircle } from 'lucide-react';
import { useChatStore, type ChatMessage, type ToolCallBlock } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import type { FC } from 'react';

interface ChatViewProps {
  sessionId?: string;
}

/**
 * 单个消息气泡
 */
const MessageBubble: FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

  return (
    <div
      className={`flex gap-3 px-4 py-3 message-enter ${isUser ? 'bg-surface-main' : 'bg-surface-shell/50'}`}
    >
      {/* 头像 */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium
          ${isUser ? 'bg-brand text-white' : 'bg-surface-overlay text-text-secondary'}`}
      >
        {isUser ? 'YOU' : 'AI'}
      </div>

      {/* 消息内容 */}
      <div className="flex-1 min-w-0">
        {/* 用户文本 */}
        {isUser && (
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </p>
        )}

        {/* AI 响应 */}
        {isAssistant && (
          <div className="text-sm text-text-primary leading-relaxed">
            {/* 错误提示 */}
            {msg.error && <p className="text-red-400 mb-1">{msg.error}</p>}
            <div className={`whitespace-pre-wrap ${msg.isStreaming ? 'cursor-blink' : ''}`}>
              {msg.content || '思考中...'}
            </div>

            {/* 工具调用卡片 */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {msg.toolCalls.map((tc) => (
                  <div
                    key={tc.toolCallId}
                    className={`text-xs rounded-lg border px-3 py-2 transition-colors
                      ${
                        tc.status === 'done'
                          ? 'bg-green-500/5 border-green-500/20 text-green-400'
                          : tc.status === 'error'
                            ? 'bg-red-500/5 border-red-500/20 text-red-400'
                            : 'bg-surface-overlay border-border-subtle text-text-secondary'
                      }`}
                  >
                    <div className="flex items-center gap-2 font-medium mb-0.5">
                      {tc.status === 'pending' && (
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                      )}
                      {tc.status === 'running' && (
                        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                      )}
                      {tc.status === 'done' && (
                        <span className="w-2 h-2 rounded-full bg-green-400" />
                      )}
                      {tc.status === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                      <span>{tc.toolName}</span>
                    </div>
                    {tc.output && (
                      <pre className="mt-1 text-xs text-text-muted overflow-x-auto max-h-24 overflow-y-auto">
                        {typeof tc.output === 'string'
                          ? tc.output.slice(0, 500)
                          : JSON.stringify(tc.output, null, 2).slice(0, 500)}
                      </pre>
                    )}
                    {tc.status === 'error' && <p className="mt-1 text-red-400">工具执行出错</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 空状态欢迎页
 */
const WelcomeView: FC<{ onQuickStart: (msg: string) => void }> = ({ onQuickStart }) => {
  const suggestions = [
    { emoji: '🔍', text: '解释这个项目的代码结构' },
    { emoji: '🐛', text: '帮我调试一个错误' },
    { emoji: '📝', text: '写一份 README 文档' },
    { emoji: '⚡', text: '优化性能，给我建议' },
  ];

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-6 animate-scale-in max-w-lg px-6">
        <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto">
          <svg
            className="w-8 h-8 text-brand"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">EasyAgent</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          集成 DeepSeek、通义千问、文心一言等国产大模型的 AI 编程助手。 支持文件读写、代码搜索、Git
          操作等 13 种内置工具。
        </p>
        <div className="grid grid-cols-2 gap-2 pt-2">
          {suggestions.map((s) => (
            <button
              key={s.text}
              onClick={() => onQuickStart(s.text)}
              className="flex items-center gap-2 px-3 py-2.5 text-left text-xs rounded-xl 
                bg-surface-raised border border-border-subtle text-text-secondary 
                hover:text-text-primary hover:border-border hover:bg-surface-overlay transition-all"
            >
              <span>{s.emoji}</span>
              <span className="truncate">{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 生成唯一消息ID
 */
function genMsgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const ChatView: FC<ChatViewProps> = ({ sessionId }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [appVersion, setAppVersion] = useState('0.3.0');

  // 从 chatStore 获取当前会话状态 (scoped by sessionId)
  const sessionState = useChatStore((s) => (sessionId ? s.sessions[sessionId] : null));
  const messages = sessionState?.messages || [];
  const isRunning = sessionState?.isGenerating || false;
  const addToast = useUIStore((s) => s.addToast);
  const updateTabTitle = useUIStore((s) => s.updateTabTitle);
  const tabs = useUIStore((s) => s.tabs);

  // 获取应用版本号
  useEffect(() => {
    const api = (window as any).easyAgent;
    if (api?.getAppVersion) {
      api
        .getAppVersion()
        .then((v: string) => setAppVersion(v))
        .catch(() => {});
    }
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  /** 发送消息 (通过 window.easyAgent IPC) */
  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || !sessionId || isRunning) return;

      setInput('');
      const store = useChatStore.getState();
      store.setGenerating(sessionId, true);

      // 添加用户消息
      store.addMessage(sessionId, {
        id: genMsgId(),
        role: 'user',
        content: msg,
        timestamp: Date.now(),
      });

      // 更新标签标题(用第一条消息)
      const activeTab = tabs.find((t) => t.id === useUIStore.getState().activeTabId);
      if (activeTab && activeTab.title === '新对话') {
        updateTabTitle(activeTab.id, msg.slice(0, 30) + (msg.length > 30 ? '...' : ''));
      }

      try {
        // 通过 electron IPC 发送
        const api = (window as any).easyAgent;
        if (api) {
          const result = await api.chat(msg);
          if (result.error) {
            addToast({ type: 'error', message: result.error });
          }
        } else {
          // 开发模式：模拟响应
          const devStore = useChatStore.getState();
          devStore.addMessage(sessionId, {
            id: genMsgId(),
            role: 'assistant',
            content:
              '你好！我是 EasyAgent。\n\n当前处于开发模式，AI 回复将通过 Electron IPC 获取。\n\n请确保：\n1. 已配置模型提供商 API Key\n2. 运行在生产环境 (`npm run start`)',
            timestamp: Date.now(),
            isStreaming: false,
          });
        }
      } catch (error) {
        addToast({ type: 'error', message: (error as Error).message });
      } finally {
        useChatStore.getState().setGenerating(sessionId, false);
      }
    },
    [input, isRunning, addToast, updateTabTitle, tabs, sessionId],
  );

  /** 快捷键处理 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  /** 停止生成 */
  const handleStop = useCallback(() => {
    const api = (window as any).easyAgent;
    api?.abort();
    if (!sessionId) return;
    const store = useChatStore.getState();
    store.setGenerating(sessionId, false);
    // 标记最后一条消息停止流式输出
    const msgs = store.sessions[sessionId]?.messages || [];
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
      store.updateMessage(sessionId, lastMsg.id, { isStreaming: false });
    }
  }, [sessionId]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto">
        {hasMessages ? (
          <div className="max-w-[var(--chat-max-width)] mx-auto py-4">
            <div className="space-y-0">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <WelcomeView
            onQuickStart={(text) => {
              setInput(text);
              setTimeout(() => handleSend(text), 100);
            }}
          />
        )}
      </div>

      {/* 输入区域 */}
      <div className="flex-shrink-0 border-t border-border-subtle bg-surface-main px-4 py-3">
        <div className="max-w-[var(--chat-max-width)] mx-auto">
          <div
            className="flex items-end gap-2 bg-surface-raised border border-border-subtle rounded-xl px-3 py-2 
            focus-within:border-border-focus transition-colors"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted 
                resize-none outline-none max-h-36"
              style={{ scrollbarWidth: 'thin' }}
            />
            <button
              onClick={isRunning ? handleStop : () => handleSend()}
              disabled={!isRunning && !input.trim()}
              className={`p-2 rounded-lg transition-all flex-shrink-0
                ${
                  isRunning
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'bg-brand text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
            >
              {isRunning ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2 text-center">
            EasyAgent v{appVersion} · 基于 DeepSeek 等国产大模型 · 按 Enter 发送 · Shift+Enter 换行
          </p>
        </div>
      </div>
    </div>
  );
};
