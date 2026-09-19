/**
 * 消息列表组件 - 虚拟滚动优化版
 * 使用 react-window v2 List + useDynamicRowHeight + 自动高度测量处理大量消息
 */
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  List,
  useDynamicRowHeight,
  type ListImperativeAPI,
  type RowComponentProps,
} from 'react-window';
import { Bot, User, AlertCircle, Loader2 } from 'lucide-react';
import { useChatStore, type ChatMessage } from '../../stores/chatStore';
import { ToolCallCard } from './ToolCallCard';
import { useSettingsStore } from '../../stores/settingsStore';
// Markdown 渲染改用统一模块（表格/有序列表/代码高亮 + XSS 防护），详见模块头注释
import { renderMarkdown } from '../../utils/markdown.js';

// ===================== 常量 =====================

/** 默认消息预估高度 */
const DEFAULT_MSG_HEIGHT = 140;
/** 流式内容最小高度 */
const STREAMING_MIN_HEIGHT = 100;
/** 占位符高度 */
const PLACEHOLDER_HEIGHT = 72;
/** 自动滚动底部阈值 */
const SCROLL_THRESHOLD = 120;

// ===================== 列表项类型 =====================

type MsgItem = { kind: 'message'; msg: ChatMessage };
/**
 * 流式输出项
 *
 * @property text - 正式回答正文
 * @property reasoning - 思考过程（推理模型的思维链）。推理模型会先输出很长的思维链
 *   再给正文，因此可能 `text` 为空而 `reasoning` 已有内容 —— 此时仍需渲染气泡，
 *   否则界面在思考期间完全空白，看起来像卡死。
 */
type StreamingItem = { kind: 'streaming'; text: string; reasoning: string };
type PlaceholderItem = { kind: 'placeholder' };
type ListItem = MsgItem | StreamingItem | PlaceholderItem;

/** 传递给 Row 组件的额外 props */
interface RowExtraProps {
  items: ListItem[];
}

// ===================== 高度预估 =====================

/**
 * 预估消息渲染高度
 * 综合考虑文本长度、代码块、工具调用等因素
 */
function estimateMessageHeight(msg: ChatMessage): number {
  let h = 70; // 基础：头像 + padding + 时间戳
  const content = msg.content || '';

  // 按 70 字符/行估算文本高度
  const lines = Math.max(1, Math.ceil(content.length / 70));
  h += lines * 21;

  // 代码块额外高度
  const codeBlocks = content.match(/```[\s\S]*?```/g);
  if (codeBlocks) {
    codeBlocks.forEach((cb) => {
      const codeLines = Math.max(1, cb.split('\n').length);
      h += codeLines * 19 + 32;
    });
  }

  // 工具调用卡片 (每个约 95px)
  if (msg.toolCalls?.length) {
    h += msg.toolCalls.length * 95;
  }

  // Token 用量行 + 耗时行
  if (msg.tokenUsage || msg.duration !== undefined) h += 35;

  // 错误提示
  if (msg.error) h += 52;

  return Math.max(DEFAULT_MSG_HEIGHT, Math.min(h, 1500));
}

/**
 * 预估流式文本渲染高度
 */
function estimateStreamingHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / 70));
  return Math.max(STREAMING_MIN_HEIGHT, 80 + lines * 21);
}

/**
 * 预估列表项高度
 */
function estimateItemHeight(item: ListItem): number {
  switch (item.kind) {
    case 'message':
      return estimateMessageHeight(item.msg);
    case 'streaming':
      return estimateStreamingHeight(item.text);
    case 'placeholder':
      return PLACEHOLDER_HEIGHT;
  }
}

// ===================== 子组件 =====================

/**
 * 格式化生成耗时
 * - 不足 1 秒显示毫秒
 * - 超过 1 秒显示秒（保留 1 位小数）
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 单条消息气泡
 */
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  return (
    <div
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} slide-up`}
      data-message-id={msg.id}
    >
      {/* AI 头像 */}
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 ring-2 ring-blue-500/20">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      {/* 消息内容区 */}
      <div className={`min-w-0 ${isUser ? 'max-w-[80%]' : 'max-w-[85%]'}`}>
        <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}>
          {/* 错误提示 */}
          {msg.error && (
            <div className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{msg.error}</span>
            </div>
          )}

          {/* Markdown 内容 */}
          {(msg.content || msg.isStreaming) && (
            <div
              className={`markdown-body text-sm ${msg.isStreaming ? 'streaming-cursor' : ''}`}
              dangerouslySetInnerHTML={
                msg.content ? { __html: renderMarkdown(msg.content) } : undefined
              }
            />
          )}

          {/* 工具调用 */}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="mt-3 space-y-2">
              {msg.toolCalls.map((tc) => (
                <ToolCallCard key={tc.toolCallId} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Token 用量 + 耗时 */}
          {(msg.tokenUsage || msg.duration !== undefined) && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-800 text-xs text-gray-600">
              {msg.tokenUsage && (
                <span>
                  Tokens:{' '}
                  {(
                    msg.tokenUsage.total ?? msg.tokenUsage.input + msg.tokenUsage.output
                  ).toLocaleString()}
                </span>
              )}
              {msg.duration !== undefined && <span>耗时: {formatDuration(msg.duration)}</span>}
            </div>
          )}
        </div>

        {/* 时间戳 */}
        <div className={`text-xs text-gray-600 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* 用户头像 */}
      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 mt-1 ring-2 ring-gray-700/50">
          <User className="w-4 h-4 text-gray-400" />
        </div>
      )}
    </div>
  );
}

/**
 * AI 思考占位动画
 */
function StreamingPlaceholder() {
  return (
    <div className="flex gap-3 justify-start slide-up p-3">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-1">
        <Loader2 className="w-4 h-4 text-white animate-spin" />
      </div>
      <div className="chat-bubble-assistant max-w-[85%]">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <span>AI 正在思考</span>
          <div className="flex gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 流式输出气泡
 */
function StreamingBubble({ text, reasoning }: { text: string; reasoning: string }) {
  return (
    <div className="flex gap-3 justify-start slide-up p-3">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 ring-2 ring-blue-500/20">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="chat-bubble-assistant max-w-[85%]">
        {/* 思考过程（推理模型的思维链）—— 与正文分开、可折叠 */}
        {reasoning && (
          <details className="mb-3" open>
            <summary className="cursor-pointer select-none text-xs text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]">
              {text ? '思考过程' : '思考中…'}
            </summary>
            {/* 思维链是纯文本，按文本渲染即可（不进 dangerouslySetInnerHTML） */}
            <div className="mt-2 pl-3 border-l-2 border-[color:var(--color-border)] text-xs leading-relaxed text-[color:var(--color-text-tertiary)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
              {reasoning}
            </div>
          </details>
        )}
        {text && (
          <div
            className="markdown-body text-sm streaming-cursor"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
          />
        )}
      </div>
    </div>
  );
}

// ===================== Markdown 渲染 =====================
//
// 原先这里有一个 40 余行的自研正则渲染器，存在两类中止级问题：
//   · 能力：不支持表格 / 有序列表 / 嵌套列表 / 代码高亮
//   · 安全：只转义 `& < >` 而漏了 `"` → 链接 href 可被挣脱；
//           且**完全不过滤 `javascript:` 等协议** → 点击即执行
// 现已统一迁入 utils/markdown.ts（markdown-it + 协议白名单 + highlight.js），
// 本地不再保留实现，避免两处行为漂移。

// ===================== 虚拟行组件 =====================

/**
 * 虚拟列表中的单行渲染
 * 使用 ResizeObserver 自动测量实际高度并更新 dynamicRowHeight 缓存
 */
function VirtualRow({ index, style, items }: RowComponentProps<RowExtraProps>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const item = items[index];

  return (
    <div style={style}>
      <div ref={rowRef}>
        {item.kind === 'message' && <MessageBubble msg={item.msg} />}
        {item.kind === 'streaming' && (
          <StreamingBubble text={item.text} reasoning={item.reasoning} />
        )}
        {item.kind === 'placeholder' && <StreamingPlaceholder />}
      </div>
    </div>
  );
}

// ===================== 主组件 =====================

/**
 * 消息列表组件
 * - 使用 react-window v2 List 虚拟滚动
 * - useDynamicRowHeight 管理变高行
 * - 智能自动滚动 (仅在底部附近时跟随新消息)
 */
export function MessageList({ sessionId }: { sessionId: string }) {
  const session = useChatStore((s) => s.sessions[sessionId]);
  const isGenerating = session?.isGenerating || false;
  const messages = session?.messages || [];
  const streamingText = session?.streamingText || '';
  /** 流式思考过程（推理模型思维链）；非推理模型恒为空串 */
  const streamingReasoning = session?.streamingReasoning || '';
  const autoScrollEnabled = useSettingsStore((s) => s.preferences.autoScroll);

  // 外层容器：用于测量可用高度
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  // react-window v2 hooks
  const listRef = useRef<ListImperativeAPI>(null);
  // 动态行高缓存，key 使用 sessionId 确保切换会话时重置
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_MSG_HEIGHT,
    key: sessionId,
  });

  // 用户是否在底部附近
  const isNearBottomRef = useRef(true);

  // ===== 测量容器高度 =====
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ===== 构建虚拟列表项 =====
  const items: ListItem[] = useMemo(() => {
    const result: ListItem[] = messages.map((msg) => ({
      kind: 'message' as const,
      msg,
    }));

    // 注意：推理模型在正式回答前会先输出思维链，此时 streamingText 仍为空。
    // 若只在 streamingText 非空时渲染，思考期间界面会一片空白（看起来像卡死），
    // 因此 reasoning 非空也要渲染气泡。
    if (streamingText || streamingReasoning) {
      result.push({ kind: 'streaming', text: streamingText, reasoning: streamingReasoning });
    } else if (isGenerating) {
      result.push({ kind: 'placeholder' });
    }
    return result;
  }, [messages, streamingText, streamingReasoning, isGenerating]);

  // ===== 预填充动态行高缓存 =====
  // 在渲染前预估每项高度,避免首次渲染抖动
  useEffect(() => {
    items.forEach((item, index) => {
      if (dynamicRowHeight.getRowHeight(index) === undefined) {
        dynamicRowHeight.setRowHeight(index, estimateItemHeight(item));
      }
    });
  }, [items, dynamicRowHeight]);

  // ===== 滚动到底部 =====
  const scrollToBottom = useCallback(() => {
    if (items.length > 0) {
      listRef.current?.scrollToRow({
        index: items.length - 1,
        align: 'end',
        behavior: 'auto',
      });
    }
  }, [items.length, listRef]);

  // ===== 监听外层容器滚动 =====
  useEffect(() => {
    const outerEl = listRef.current?.element;
    if (!outerEl) return;

    /** 处理用户手动滚动 */
    const handleScroll = () => {
      const distanceFromBottom = outerEl.scrollHeight - outerEl.scrollTop - outerEl.clientHeight;
      isNearBottomRef.current = distanceFromBottom < SCROLL_THRESHOLD;
    };

    outerEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => outerEl.removeEventListener('scroll', handleScroll);
  }, [listRef, items.length]);

  // ===== 新消息自动滚动 =====
  useEffect(() => {
    if (autoScrollEnabled && isNearBottomRef.current && items.length > 0) {
      scrollToBottom();
    }
  }, [items.length, streamingText.length, autoScrollEnabled, scrollToBottom]);

  // ===== 初始滚动到底部 =====
  useEffect(() => {
    if (containerHeight > 0 && items.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [containerHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 空状态 =====
  if (messages.length === 0 && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-600/10 border border-blue-500/10 flex items-center justify-center mb-6">
          <Bot className="w-10 h-10 text-blue-400/60" />
        </div>
        <h2 className="text-xl font-semibold text-gray-300 mb-2">开始对话</h2>
        <p className="text-gray-600 text-sm max-w-md">
          向 EasyAgent 提问编程问题、请求代码审查或获取技术支持
        </p>
        <div className="flex gap-3 mt-6 flex-wrap justify-center">
          {['解释这段代码的作用', '帮我优化这个函数', '写一个单元测试', '代码审查'].map((hint) => (
            <button
              key={hint}
              className="btn btn-secondary text-xs"
              onClick={() => {
                useChatStore.getState().setComposerPrefill(hint);
              }}
            >
              {hint}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <List
        listRef={listRef}
        style={{ height: containerHeight, width: '100%' }}
        rowCount={items.length}
        rowHeight={dynamicRowHeight}
        rowComponent={VirtualRow}
        rowProps={{ items }}
        overscanCount={3}
        defaultHeight={400}
      />
    </div>
  );
}
