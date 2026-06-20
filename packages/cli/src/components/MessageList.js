/**
 * CLI消息列表组件
 * 以不同的颜色和前缀区分的消息展示
 */
import React from 'react';
import { Box, Text } from 'ink';
/**
 * 消息列表 - 区分显示用户/助手/系统消息
 * - 用户消息: 青色 ▶ 前缀
 * - 助手消息: 绿色 ● 前缀，流式输出时闪烁光标
 * - 系统消息: 灰色文字
 */
export const MessageList = ({ messages }) => {
    return (<Box flexDirection="column">
      {messages.map((msg) => (<Box key={msg.id} flexDirection="column" marginY={0}>
          {msg.role === 'user' && (<Box>
              <Text color="cyan" bold>▶ </Text>
              <Text>{msg.content}</Text>
            </Box>)}

          {msg.role === 'system' && (<Box>
              <Text dimColor>{msg.content}</Text>
            </Box>)}

          {msg.role === 'assistant' && (<Box flexDirection="column">
              <Box>
                <Text color="green">● </Text>
                <Text>{msg.content || (<Text color="yellow" dimColor>思考中...</Text>)}</Text>
                {msg.isStreaming && <Text color="yellow">▌</Text>}
              </Box>
              {msg.toolCall && (<Box marginLeft={2}>
                  <Text dimColor>
                    🔧 {msg.toolCall.name} [{msg.toolCall.status}]
                  </Text>
                </Box>)}
            </Box>)}
        </Box>))}
    </Box>);
};
//# sourceMappingURL=MessageList.js.map