/**
 * 自动化任务页面 - 任务列表卡片（P2-1 拆分产物，自 Automation.tsx 纯搬迁）
 * 含实时执行进度日志渲染；交互只上报，业务逻辑留在主组件。
 *
 * @module pages/automation/TaskList
 */

import { useEffect, useState } from 'react';
import {
  Clock,
  RefreshCw,
  Calendar,
  Play,
  Square,
  Power,
  PowerOff,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type { AutomationTask, AutomationProgressLog } from '../../stores/automationStore';
import { StatusBadge } from './data';

/** 任务列表属性 */
export interface TaskListProps {
  tasks: AutomationTask[];
  loading: boolean;
  /** 正在执行中的任务 id 集合 */
  running: Set<string>;
  /** 实时执行进度日志（taskId → 事件序列） */
  progressLogs: Map<string, AutomationProgressLog[]>;
  onRunNow: (task: AutomationTask) => void;
  onStop: (task: AutomationTask) => void;
  onToggle: (task: AutomationTask) => void;
  onDelete: (id: string, name: string) => void;
}

export function TaskList({
  tasks,
  loading,
  running,
  progressLogs,
  onRunNow,
  onStop,
  onToggle,
  onDelete,
}: TaskListProps) {
  /**
   * 运行中任务需要每秒重渲染，才能显示「已运行 Ns」
   * （没有运行中的任务时不启动定时器，避免无意义重渲染）
   */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (running.size === 0) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running.size]);

  return (
    <div className="card">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-yellow-400" />
        任务列表 ({tasks.length})
      </h3>

      {loading ? (
        <div className="text-center py-8">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-600" />
          <p className="text-gray-500">加载中...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">暂无自动化任务</p>
          <p className="text-sm text-gray-600 mt-1">点击"创建任务"或使用下方模板快速开始</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const logs = progressLogs.get(task.id) || [];
            const last = logs[logs.length - 1];
            const isRunning = running.has(task.id);
            /** 已运行时长：以首条进度事件为起点（无事件时不知道起点，显示 null） */
            const elapsedSec = logs[0]
              ? Math.max(0, Math.round((Date.now() - logs[0].timestamp) / 1000))
              : null;
            /** 已触发但尚无任何事件 → 明确告知"正在等模型响应"，避免用户以为卡死 */
            const waiting = isRunning && logs.length === 0;
            /** 需要用户介入：调用了交互类工具（自动化任务里无人应答） */
            const needsInput = logs.some((l) => /ask_user|请输入|需要你的/.test(l.message));
            const hasError = last?.type === 'agent_error';

            return (
              <div key={task.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{task.name}</h4>
                      <StatusBadge status={task.status} />
                      {running.has(task.id) && (
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <RefreshCw className="w-3 h-3 animate-spin" /> 执行中
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{task.prompt}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                      {task.provider && (
                        <span className="text-primary-400/70">
                          模型: {task.provider}/{task.model || '默认'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {task.scheduleType === 'recurring' ? '定时循环' : '一次性'}
                      </span>
                      {task.nextRunAt && (
                        <span>下次: {new Date(task.nextRunAt).toLocaleString('zh-CN')}</span>
                      )}
                      {task.lastRunAt && (
                        <span>上次: {new Date(task.lastRunAt).toLocaleString('zh-CN')}</span>
                      )}
                      <span>已执行 {task.runCount} 次</span>
                    </div>

                    {/* 实时执行状态：随时告诉用户「在干什么 / 需要什么」 */}
                    {isRunning && (
                      <div className="mt-3 border-t border-gray-700/50 pt-2">
                        {/* 当前步骤 */}
                        <div className="flex items-center gap-2 text-xs">
                          {hasError ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          ) : waiting ? (
                            <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-yellow-400 shrink-0" />
                          )}
                          <span
                            className={
                              hasError
                                ? 'text-red-400'
                                : last?.type === 'tool_call'
                                  ? 'text-blue-400'
                                  : last?.type === 'tool_result'
                                    ? 'text-purple-400'
                                    : 'text-yellow-400'
                            }
                          >
                            {hasError
                              ? '执行失败'
                              : waiting
                                ? '已触发，等待模型响应…'
                                : (last?.message ?? '执行中')}
                          </span>
                          {elapsedSec !== null && (
                            <span className="text-gray-600 ml-auto shrink-0">
                              已运行 {elapsedSec}s
                            </span>
                          )}
                        </div>

                        {/* 当前步骤的细节（工具参数 / 工具结果摘要） */}
                        {last?.detail && (
                          <p className="text-xs text-gray-500 mt-1 break-all">
                            {last.detail.length > 160
                              ? `${last.detail.slice(0, 160)}…`
                              : last.detail}
                          </p>
                        )}

                        {hasError && (
                          <p className="text-xs text-amber-400 mt-1">
                            建议检查该任务的模型提供商 / API Key 配置是否可用，再重试。
                          </p>
                        )}
                        {needsInput && (
                          <p className="text-xs text-amber-400 mt-1">
                            该任务调用了需要用户输入的步骤（如 ask_user），但自动化任务无人应答 ——
                            建议去掉交互步骤，让 Agent 自行决策。
                          </p>
                        )}

                        {/* 完整步骤流水（最近 20 条） */}
                        {logs.length > 0 && (
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            <p className="text-xs text-gray-500 mb-1 font-medium">执行步骤</p>
                            {logs.slice(-20).map((log, i) => (
                              <div key={i} className="text-xs py-0.5 flex items-start gap-2">
                                <span className="text-gray-600 flex-shrink-0 w-14 text-right">
                                  {new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </span>
                                <span
                                  className={`flex-shrink-0 ${
                                    log.type === 'tool_call'
                                      ? 'text-blue-400'
                                      : log.type === 'tool_result'
                                        ? 'text-purple-400'
                                        : log.type === 'agent_error'
                                          ? 'text-red-400'
                                          : log.type === 'agent_done'
                                            ? 'text-emerald-400'
                                            : 'text-yellow-400'
                                  }`}
                                >
                                  {log.message}
                                </span>
                                {log.detail && (
                                  <span
                                    className="text-gray-500 truncate max-w-[200px]"
                                    title={log.detail}
                                  >
                                    {log.detail.length > 60
                                      ? log.detail.substring(0, 60) + '...'
                                      : log.detail}
                                  </span>
                                )}
                              </div>
                            ))}
                            {logs.length > 20 && (
                              <p className="text-xs text-gray-600 mt-1">
                                仅显示最近 20 条，共 {logs.length} 条
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/*
                  操作按钮：图标 + 文字，明确区分三件事（2026-09-19 重做）
                  旧版两个按钮都是**三角形**（▶ 立即执行 / ▶ 启用），语义无法区分，用户实报易误解。
                  现在：执行一次（Play）/ 停用·启用调度（PowerOff·Power，电源语义）/ 删除。
                */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isRunning ? (
                      <button
                        className="flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs
                        bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        title="停止本次执行"
                        onClick={() => onStop(task)}
                      >
                        <Square className="w-3.5 h-3.5" /> 停止
                      </button>
                    ) : (
                      <button
                        className="flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs
                        bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        title="立即执行一次（不影响定时调度）"
                        onClick={() => onRunNow(task)}
                      >
                        <Play className="w-3.5 h-3.5" /> 执行
                      </button>
                    )}

                    <button
                      className={`flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        task.status === 'ACTIVE'
                          ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/70'
                      }`}
                      title={
                        task.status === 'ACTIVE'
                          ? '停用调度：不再按计划自动执行（仍可手动「执行」一次）'
                          : '启用调度：恢复按计划自动执行'
                      }
                      onClick={() => onToggle(task)}
                    >
                      {task.status === 'ACTIVE' ? (
                        <>
                          <PowerOff className="w-3.5 h-3.5" /> 停用
                        </>
                      ) : (
                        <>
                          <Power className="w-3.5 h-3.5" /> 启用
                        </>
                      )}
                    </button>

                    <button
                      className="flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs
                      text-red-400 hover:bg-red-500/10 transition-colors"
                      title="删除任务"
                      onClick={() => onDelete(task.id, task.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
