/**
 * CLI状态栏组件
 * 显示当前模型、工具数量、Agent运行状态
 */
import React from 'react';
import { Box, Text } from 'ink';
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
  tokenUsage?: { input: number; output: number; total: number };
}

/** 状态到显示信息的映射 */
const STATE_MAP: Record<AgentState, { color: string; text: string; icon: string }> = {
  idle: { color: 'gray', text: '就绪', icon: '○' },
  thinking: { color: 'yellow', text: '思考中...', icon: '◉' },
  running: { color: 'cyan', text: '执行中...', icon: '▶' },
  error: { color: 'red', text: '错误', icon: '✖' },
};

/**
 * 状态栏 - 底部信息栏
 * 显示模型/工具/状态/Token信息
 */
export const StatusBar: FC<StatusBarProps> = ({
  state,
  model,
  toolCount,
  tokenUsage,
}) => {
  const st = STATE_MAP[state];

  return (
    <Box
      justifyContent="space-between"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexShrink={0}
    >
      <Box gap={2}>
        <Text dimColor>
          模型: <Text color="blue">{model}</Text>
        </Text>
        <Text dimColor>
          工具: <Text color="magenta">{toolCount}</Text>
        </Text>
        {tokenUsage && tokenUsage.total > 0 && (
          <Text dimColor>
            Tokens: <Text color="green">{tokenUsage.total.toLocaleString()}</Text>
          </Text>
        )}
      </Box>
      <Box gap={2}>
        <Text color={st.color}>{st.icon} {st.text}</Text>
        <Text dimColor>/help 帮助 · /exit 退出</Text>
      </Box>
    </Box>
  );
};
