/**
 * CLI欢迎Banner组件
 * 显示ASCII艺术字标题和欢迎信息
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import figlet from 'figlet';
import gradient from 'gradient-string';
/**
 * 欢迎Banner - ASCII艺术字 + 渐变色彩
 * 使用figlet生成ASCII字体，gradient-string添加渐变效果
 */
export const Banner = ({ version = 'v0.5.0', subtitle = 'AI编程助手 · 集成国产大模型 · 输入 /help 查看命令', }) => {
    const [titleLines, setTitleLines] = useState([]);
    useEffect(() => {
        try {
            const ascii = figlet.textSync('EasyAgent', {
                font: 'Standard',
                horizontalLayout: 'full',
            });
            setTitleLines(gradient.pastel.multiline(ascii).split('\n'));
        }
        catch {
            setTitleLines([`EasyAgent CLI ${version}`]);
        }
    }, [version]);
    if (titleLines.length === 0)
        return null;
    return (<Box flexDirection="column" marginBottom={1}>
      {titleLines.map((line, i) => (<Text key={i}>{line}</Text>))}
      <Text dimColor>   {subtitle}</Text>
    </Box>);
};
//# sourceMappingURL=Banner.js.map