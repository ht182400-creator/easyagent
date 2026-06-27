/**
 * CLI帮助面板组件
 * 显示所有可用命令及其说明
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { FC } from 'react';

/** 命令定义 */
interface CommandItem {
  /** 命令名(含参数占位) */
  command: string;
  /** 命令说明 */
  description: string;
  /** 命令颜色 */
  color?: string;
}

/** 内置命令列表 */
const COMMANDS: CommandItem[] = [
  { command: '/help', description: '显示帮助' },
  { command: '/model', description: '查看当前模型' },
  { command: '/models', description: '列出所有可用模型' },
  { command: '/providers', description: '列出提供商及其状态' },
  { command: '/switch <provider> <model>', description: '切换模型', color: 'yellow' },
  { command: '/status', description: '系统状态与Token用量' },
  { command: '/sessions', description: '会话列表' },
  { command: '/tools', description: '列出所有可用工具(51个)' },
  { command: '/clear', description: '清屏', color: 'red' },
  { command: '/token-key <provider> <key>', description: '设置API密钥', color: 'yellow' },
  { command: '/exit, /quit', description: '退出CLI', color: 'red' },
  { command: 'Ctrl+C', description: '强制退出', color: 'red' },
];

/**
 * 帮助面板 - 显示所有可用命令
 * 带蓝色边框的圆角面板
 */
export const HelpPanel: FC = () => (
  <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginY={1}>
    <Text bold color="blue">
      命令列表
    </Text>
    <Text dimColor>━━━━━━━━━━━━━━━━━━━━━━━━</Text>
    <Box flexDirection="column">
      {COMMANDS.map((cmd) => (
        <Text key={cmd.command}>
          {'  '}
          <Text color={cmd.color || 'cyan'}>{cmd.command.padEnd(28)}</Text>
          {cmd.description}
        </Text>
      ))}
    </Box>
    <Box marginTop={1}>
      <Text dimColor>直接输入文本即可与AI对话。工具系统支持51个内置工具。</Text>
    </Box>
  </Box>
);
