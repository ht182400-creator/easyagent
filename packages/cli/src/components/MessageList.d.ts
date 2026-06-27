import type { FC } from 'react';
/** 消息类型 */
export interface CLIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  /** 工具调用信息 */
  toolCall?: {
    name: string;
    status: 'pending' | 'running' | 'done' | 'error';
  };
}
interface MessageListProps {
  messages: CLIMessage[];
  /** 最大显示行数(超出后折叠) */
  maxVisible?: number;
}
/**
 * 消息列表 - 区分显示用户/助手/系统消息
 * - 用户消息: 青色 ▶ 前缀
 * - 助手消息: 绿色 ● 前缀，流式输出时闪烁光标
 * - 系统消息: 灰色文字
 */
export declare const MessageList: FC<MessageListProps>;
export {};
//# sourceMappingURL=MessageList.d.ts.map
