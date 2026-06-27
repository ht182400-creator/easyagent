/**
 * 聊天输入框 - 支持模型选择、权限模式、快捷键、附件拖放
 * 模型列表从 /api/providers/all-models 动态获取
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Loader2, Paperclip, Cpu, Shield, X, ChevronDown, Command } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useProviderStore } from '../../stores/providerStore';
import { getApiBase } from '../../request';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';

interface ChatInputProps {
  sessionId: string;
  placeholder?: string;
}

/** 动态模型选项结构 */
interface DynamicModel {
  provider: string;
  providerName: string;
  modelId: string;
  modelName: string;
  supportsTools: boolean;
  supportsVision: boolean;
}

/**
 * 聊天输入框组件
 * 功能: 文本输入、模型切换、附件上传、快捷键发送、字符计数
 */
export function ChatInput({ sessionId, placeholder }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  /** 从 API 动态获取的模型列表 */
  const [availableModels, setAvailableModels] = useState<DynamicModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const isGenerating = useChatStore((s) => s.sessions[sessionId]?.isGenerating || false);
  const connectionState = useChatStore(
    (s) => s.sessions[sessionId]?.connectionState || 'disconnected',
  );
  const composerPrefill = useChatStore((s) => s.composerPrefill);
  const clearComposerPrefill = useChatStore((s) => s.clearComposerPrefill);
  const currentProvider = useProviderStore((s) => s.currentProvider);
  const currentModel = useProviderStore((s) => s.currentModel);
  const setCurrentModel = useProviderStore((s) => s.setCurrentModel);
  const sendBehavior = useSettingsStore((s) => s.preferences.sendBehavior);
  const addNotification = useAppStore((s) => s.addNotification);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // 处理预填文本
  useEffect(() => {
    if (composerPrefill) {
      setInput(composerPrefill);
      clearComposerPrefill();
      textareaRef.current?.focus();
    }
  }, [composerPrefill, clearComposerPrefill]);

  // 点击外部关闭模型菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  // 发送消息
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating || connectionState !== 'connected') return;

    const store = useChatStore.getState();

    // 添加上下文附件信息
    let finalContent = text;
    if (attachments.length > 0) {
      const fileNames = attachments.map((f) => f.name).join(', ');
      finalContent = `[附件: ${fileNames}]\n${text}`;
    }

    // 添加用户消息
    store.addMessage(sessionId, {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: finalContent,
      timestamp: Date.now(),
    });

    // 通过 WebSocket 发送
    store.sendViaWebSocket({
      type: 'chat',
      sessionId,
      message: finalContent,
      model: currentModel,
      provider: currentProvider,
    });

    // 创建空的助手消息用于流式填充
    store.addMessage(sessionId, {
      id: `msg_${Date.now() + 1}_assistant`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });

    store.setGenerating(sessionId, true);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isGenerating, connectionState, attachments, sessionId, currentModel, currentProvider]);

  // 停止生成
  const handleStop = useCallback(() => {
    useChatStore.getState().sendViaWebSocket({
      type: 'stop',
      sessionId,
    });
    useChatStore.getState().setGenerating(sessionId, false);
  }, [sessionId]);

  // 键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const shouldSend =
        sendBehavior === 'ctrl_enter'
          ? e.key === 'Enter' && (e.ctrlKey || e.metaKey)
          : e.key === 'Enter' && !e.shiftKey;

      if (shouldSend) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, sendBehavior],
  );

  // 附件处理
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        setAttachments((prev) => [...prev, ...files].slice(0, 5));
        addNotification({ type: 'info', message: `已添加 ${files.length} 个文件`, duration: 2000 });
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [addNotification],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // 从 API 动态获取所有可用模型
  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      setModelsLoading(true);
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/providers/all-models`);
        const data = await res.json();
        if (!cancelled && data.success) {
          setAvailableModels(data.models || []);
        }
      } catch (err) {
        // 静默失败，使用空列表
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }
    fetchModels();
    return () => {
      cancelled = true;
    };
  }, []);

  // 当 providers store 更新时也刷新模型列表（避免数组引用变化导致重复请求）
  const providersId = useProviderStore((s) =>
    s.providers
      .map((p) => p.id)
      .sort()
      .join(','),
  );
  useEffect(() => {
    const upstreamProviders = useProviderStore.getState().providers;
    if (upstreamProviders.length > 0) {
      const apiBase = getApiBase();
      fetch(`${apiBase}/api/providers/all-models`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setAvailableModels(data.models || []);
        })
        .catch(() => {});
    }
  }, [providersId]);

  // 模型选择
  const handleModelSelect = useCallback(
    (provider: string, model: string) => {
      setCurrentModel(provider, model);
      setShowModelMenu(false);
    },
    [setCurrentModel],
  );

  const currentModelInfo = availableModels.find(
    (m) => m.modelId === currentModel && m.provider === currentProvider,
  );

  // 按提供商分组模型
  const groupedModels = availableModels.reduce<Record<string, DynamicModel[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  return (
    <div className="border-t border-gray-800 bg-gray-950/80 backdrop-blur-sm p-4">
      {/* 附件预览 */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {attachments.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs"
            >
              <Paperclip className="w-3 h-3 text-gray-500" />
              <span className="text-gray-300 max-w-[120px] truncate">{file.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="text-gray-500 hover:text-gray-300 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || '输入消息...'}
            rows={1}
            data-chat-input=""
            className="input resize-none pr-10 min-h-[2.75rem] max-h-[200px]"
            disabled={isGenerating || connectionState !== 'connected'}
          />

          {/* 字符计数 */}
          {input.length > 0 && (
            <span className="absolute right-3 bottom-2 text-xs text-gray-600">{input.length}</span>
          )}
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-1.5">
          {/* 附件按钮 */}
          <button
            className="btn btn-ghost btn-sm p-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
            title="添加附件"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 模型选择器 */}
          <div className="relative" ref={modelMenuRef}>
            <button
              className="btn btn-ghost btn-sm gap-1.5 py-1.5"
              onClick={() => setShowModelMenu(!showModelMenu)}
            >
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs max-w-[100px] truncate">
                {currentModelInfo?.modelName || currentModel}
              </span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showModelMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showModelMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-800 text-xs text-gray-500 flex items-center justify-between">
                  <span>选择模型</span>
                  {modelsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
                <div className="py-1 max-h-72 overflow-y-auto">
                  {availableModels.length === 0 && !modelsLoading ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-600">
                      暂无模型配置，请先在"模型提供商"页面设置 API 密钥
                    </div>
                  ) : (
                    Object.entries(groupedModels).map(([providerId, models]) => (
                      <div key={providerId}>
                        <div className="px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-wider font-medium border-t border-gray-800 first:border-t-0">
                          {models[0]?.providerName || providerId}
                        </div>
                        {models.map((m) => (
                          <button
                            key={`${m.provider}-${m.modelId}`}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors flex items-center justify-between ${
                              currentModel === m.modelId && currentProvider === m.provider
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'text-gray-300'
                            }`}
                            onClick={() => handleModelSelect(m.provider, m.modelId)}
                          >
                            <span className="truncate">{m.modelName}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {m.supportsTools && (
                                <span className="text-[10px] text-blue-500" title="支持工具调用">
                                  🛠
                                </span>
                              )}
                              {m.supportsVision && (
                                <span className="text-[10px] text-green-500" title="支持图像">
                                  👁
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 发送 / 停止按钮 */}
          {isGenerating ? (
            <button onClick={handleStop} className="btn btn-danger btn-sm" title="停止生成">
              <X className="w-4 h-4" /> 停止
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || connectionState !== 'connected'}
              className="btn btn-primary btn-sm"
              title={sendBehavior === 'ctrl_enter' ? 'Ctrl+Enter 发送' : 'Enter 发送'}
            >
              {connectionState === 'connecting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              发送
            </button>
          )}
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-700">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            {sendBehavior === 'ctrl_enter' ? 'Ctrl+Enter 发送' : 'Enter 发送'}
          </span>
          <span>Shift+Enter 换行</span>
        </div>
        {connectionState !== 'connected' && (
          <span className="text-yellow-600 flex items-center gap-1">
            <span className="connection-dot disconnected" />
            {connectionState === 'connecting' ? '连接中...' : '未连接'}
          </span>
        )}
      </div>
    </div>
  );
}
