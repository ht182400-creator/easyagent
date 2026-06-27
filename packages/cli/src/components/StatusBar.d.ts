import type { FC } from 'react';
/** Agent状态类型 */
export type AgentState = 'idle' | 'thinking' | 'running' | 'error';
interface StatusBarProps {
  /** Agent当前状态 */
  state: AgentState;
  /** 当前使用的模型名 */
  model: string;
  /** 可用工具数量 */
  toolCount: number;
  /** 当前会话ID */
  sessionId?: string;
  /** Token用量统计 */
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}
/**
 * 状态栏 - 底部信息栏
 * 显示模型/工具/状态/Token信息
 */
export declare const StatusBar: FC<StatusBarProps>;
export {};
//# sourceMappingURL=StatusBar.d.ts.map
