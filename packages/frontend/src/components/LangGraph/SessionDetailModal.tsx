/**
 * Checkpoint 会话详情弹窗 — Phase D 方向3
 *
 * 展示会话状态、Checkpoint 列表，支持从断点恢复对话。
 */
import React, { useCallback, useState, useEffect } from 'react';
import { X, RotateCcw, GitBranch, Clock, Layers, Send } from 'lucide-react';
import type { CheckpointSessionDetail } from '../../stores/langGraphStore';
import { useLangGraphStore } from '../../stores/langGraphStore';

/** 会话详情弹窗 Props */
interface SessionDetailModalProps {
  sessionId: string;
  onClose: () => void;
}

/**
 * Checkpoint 会话详情弹窗
 *
 * 功能：
 * - 显示会话基本信息和 Checkpoint 列表
 * - 显示每个 Checkpoint 的节点、时间戳、步骤
 * - 提供恢复输入框和执行按钮
 * - ESC 键和遮罩点击关闭
 */
export default function SessionDetailModal({ sessionId, onClose }: SessionDetailModalProps) {
  const { selectedSession, selectedSessionLoading, loadSessionDetail, resumeSession } =
    useLangGraphStore();

  const [resumeInput, setResumeInput] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeResult, setResumeResult] = useState<string | null>(null);

  /** 加载会话详情 */
  useEffect(() => {
    loadSessionDetail(sessionId);
  }, [sessionId, loadSessionDetail]);

  /** ESC 关闭 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  /** 处理恢复会话 */
  const handleResume = useCallback(async () => {
    if (!resumeInput.trim()) return;
    setResumeLoading(true);
    setResumeResult(null);
    try {
      const data = await resumeSession(sessionId, resumeInput.trim());
      const responseText =
        typeof data?.response === 'string'
          ? data.response
          : typeof data === 'string'
            ? data
            : JSON.stringify(data || {});
      setResumeResult(responseText);
      setResumeInput('');
    } catch (err) {
      setResumeResult(`恢复失败: ${(err as Error).message}`);
    } finally {
      setResumeLoading(false);
    }
  }, [sessionId, resumeInput, resumeSession]);

  /** 处理遮罩点击 */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  /** 格式化时间戳 */
  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString('zh-CN');
    } catch {
      return ts;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="bg-[#0d1117] border border-[#1a2530] rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl shadow-black/50">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2530]">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-[#ffb74d]" />
            <div>
              <h3 className="text-sm font-semibold text-[#e0e0e0]">Checkpoint 会话详情</h3>
              <p className="text-[10px] text-[#4a5568] font-mono mt-0.5">
                {sessionId.slice(0, 24)}...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#4a5568] hover:text-[#e0e0e0] hover:bg-[#1a2530] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="overflow-y-auto max-h-[calc(80vh-130px)] p-5 space-y-4">
          {selectedSessionLoading ? (
            <div className="text-center py-8 text-xs text-[#4a5568] font-mono">
              <Layers className="w-5 h-5 mx-auto mb-2 animate-spin text-[#ffb74d]" />
              加载中...
            </div>
          ) : !selectedSession ? (
            <div className="text-center py-8 text-xs text-[#4a5568] font-mono">
              无法加载会话详情 — 请确认当前引擎为 LangGraph
            </div>
          ) : (
            <>
              {/* 会话信息 */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '会话 ID', value: selectedSession.id.slice(0, 16) + '...' },
                  { label: 'Checkpoints', value: selectedSession.checkpoints?.length ?? 0 },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 bg-[#111922] border border-[#1a2530] rounded-lg"
                  >
                    <div className="text-[10px] text-[#4a5568] uppercase tracking-wider mb-1">
                      {item.label}
                    </div>
                    <div className="text-xs text-[#7a8b9e] font-mono">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Checkpoint 列表 */}
              {selectedSession.checkpoints && selectedSession.checkpoints.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[#ffb74d] mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Checkpoint 记录
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selectedSession.checkpoints.map((cp, idx) => (
                      <div
                        key={cp.id}
                        className="flex items-center gap-3 px-3 py-2 bg-[#0d1117] border border-[#1a2530] rounded-md text-[11px]"
                      >
                        <span className="text-[#4a5568] font-mono w-6">{idx + 1}</span>
                        <span className="text-[#00e5ff] font-mono w-20">{cp.nodeId}</span>
                        <span className="text-[#4a5568] font-mono">Step {cp.step}</span>
                        <span className="text-[#4a5568] font-mono ml-auto">
                          {formatTime(cp.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 恢复结果 */}
              {resumeResult && (
                <div className="p-4 bg-[#111922] border border-[#00ff88]/20 rounded-lg">
                  <div className="text-[10px] text-[#00ff88] uppercase tracking-wider mb-1.5">
                    恢复结果
                  </div>
                  <div className="text-xs text-[#7a8b9e] font-mono whitespace-pre-wrap break-all">
                    {resumeResult}
                  </div>
                </div>
              )}

              {/* 恢复输入 */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resumeInput}
                  onChange={(e) => setResumeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleResume();
                    }
                  }}
                  placeholder="输入消息继续对话..."
                  className="flex-1 px-3 py-2 bg-[#0d1117] border border-[#1a2530] rounded-md text-xs text-[#e0e0e0] font-mono placeholder-[#4a5568] focus:outline-none focus:border-[#ffb74d]/50"
                  disabled={resumeLoading}
                />
                <button
                  onClick={handleResume}
                  disabled={resumeLoading || !resumeInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#ffb74d] text-[#ffb74d] bg-[rgba(255,183,77,0.05)] text-xs font-mono hover:bg-[rgba(255,183,77,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {resumeLoading ? (
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  恢复
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
