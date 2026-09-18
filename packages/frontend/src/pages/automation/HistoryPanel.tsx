/**
 * 自动化任务页面 - 执行历史面板（P2-1 拆分产物，自 Automation.tsx 纯搬迁）
 * 错误展开状态内聚于本组件。
 *
 * @module pages/automation/HistoryPanel
 */

import { useState } from 'react';
import { History, CheckCircle2, XCircle, Hourglass, ChevronDown, ChevronUp } from 'lucide-react';
import type { AutomationRun } from '../../stores/automationStore';

/** 执行历史面板属性 */
export interface HistoryPanelProps {
  history: AutomationRun[];
}

export function HistoryPanel({ history }: HistoryPanelProps) {
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set()); // 展开的错误详情

  return (
    <div className="card">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <History className="w-5 h-5 text-purple-400" />
        执行历史
      </h3>
      {history.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <History className="w-10 h-10 mx-auto mb-2 text-gray-700" />
          <p>暂无执行记录</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {history.slice(0, 30).map((run) => (
            <div key={run.id}>
              <div
                className={`bg-gray-800 rounded-lg p-3 flex items-center justify-between ${
                  run.status === 'failed' && run.error ? 'cursor-pointer hover:bg-gray-750' : ''
                }`}
                onClick={() => {
                  if (run.status === 'failed' && run.error) {
                    setExpandedErrors((prev) => {
                      const next = new Set(prev);
                      next.has(run.id) ? next.delete(run.id) : next.add(run.id);
                      return next;
                    });
                  }
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {run.status === 'running' ? (
                    <Hourglass className="w-4 h-4 text-yellow-400 animate-pulse" />
                  ) : run.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{run.taskName}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(run.startTime).toLocaleString('zh-CN')}
                      {run.tokenUsage && ` · ${run.tokenUsage.total} tokens`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      run.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : run.status === 'running'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {run.status === 'completed'
                      ? '成功'
                      : run.status === 'running'
                        ? '执行中'
                        : '失败'}
                  </span>
                  {run.status === 'failed' &&
                    run.error &&
                    (expandedErrors.has(run.id) ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    ))}
                </div>
              </div>
              {/* 展开的错误详情 */}
              {run.status === 'failed' && run.error && expandedErrors.has(run.id) && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 mt-1 ml-9">
                  <p className="text-xs text-red-400 font-medium mb-1">错误原因</p>
                  <pre className="text-xs text-red-300 whitespace-pre-wrap break-words">
                    {run.error}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
