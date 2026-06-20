/**
 * CLI输入框组件
 * 处理用户输入和键盘事件
 */
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { FC } from 'react';

interface InputBoxProps {
  /** 提交回调 - 用户按回车触发 */
  onSubmit: (text: string) => void;
  /** 是否禁用输入(Agent运行时) */
  disabled?: boolean;
  /** 输入提示符 */
  prompt?: string;
}

/**
 * 输入框 - 处理键盘输入
 * - 回车: 提交内容
 * - 退格: 删除字符
 * - Ctrl+C: 不做特殊处理(由上层处理)
 * - 其他: 追加到输入
 */
export const InputBox: FC<InputBoxProps> = ({
  onSubmit,
  disabled = false,
  prompt = 'EA> ',
}) => {
  const [input, setInput] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setInput('');
  }, [input, disabled, onSubmit]);

  useInput((inputChar, key) => {
    if (disabled && key.return) return; // 运行时阻止输入

    if (key.return) {
      handleSubmit();
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (inputChar && !key.ctrl && !key.meta && !key.tab) {
      setInput((prev) => prev + inputChar);
    }
  });

  return (
    <Box marginTop={1}>
      <Text color={disabled ? 'gray' : 'cyan'} bold>
        {prompt}
      </Text>
      <Text dimColor={disabled}>
        {input}
      </Text>
      {!disabled && <Text color="gray">|</Text>}
    </Box>
  );
};
