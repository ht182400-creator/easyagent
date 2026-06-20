/**
 * EasyAgent CLI 入口
 * 使用 Ink (React终端UI) 渲染交互界面
 * 支持 51 个内置工具、多模型切换、流式对话
 *
 * v0.5.0 - 组件化架构，7个独立组件
 */
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import { ConfigManager, ToolRegistry, getAllBuiltinTools, getModelRegistry, } from '@easyagent/core';
import { App } from './App.js';
/** 初始化错误 */
let initError = null;
/**
 * 初始化Agent引擎和所有依赖
 * 返回初始化信息供App组件使用
 */
async function initialize() {
    try {
        // 启动时后台更新模型目录
        getModelRegistry().initialize().catch(() => {
            // 静默处理，不阻塞 CLI
        });
        // 加载配置
        const configManager = new ConfigManager();
        const config = await configManager.load();
        // 检查提供商配置
        const provider = configManager.getCurrentProvider();
        if (!provider) {
            initError = '未配置模型提供商。\n\n请设置API密钥:\n  > 编辑 ~/.easyagent/config.json\n  > 或使用 /token-key <provider> <key> 命令';
            return null;
        }
        // 初始化工具系统 (51个内置工具)
        const toolRegistry = new ToolRegistry();
        toolRegistry.registerAll(getAllBuiltinTools());
        return {
            model: `${config.currentModel.provider}/${config.currentModel.model}`,
            tools: toolRegistry.list().length,
        };
    }
    catch (error) {
        initError = error.message;
        return null;
    }
}
/**
 * 主函数 - CLI入口
 */
async function main() {
    const info = await initialize();
    if (initError || !info) {
        console.error(chalk.red('\n  初始化失败:'), chalk.yellow(initError || '未知错误'));
        console.error(chalk.dim('\n  请检查配置文件或设置API密钥后重试。\n'));
        process.exit(1);
    }
    const { waitUntilExit } = render(React.createElement(App, { initInfo: info }));
    await waitUntilExit;
    // 程序退出
    process.exit(0);
}
main().catch((error) => {
    console.error(chalk.red('\n  CLI崩溃:'), chalk.yellow(error?.message || error));
    process.exit(1);
});
//# sourceMappingURL=main.js.map