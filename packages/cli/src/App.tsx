/**
 * CLI主应用组件
 * 组合Banner + MessageList + HelpPanel + InputBox + StatusBar
 * 管理消息状态、Agent交互、命令路由
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { FC } from 'react';
import type { CLIMessage } from './components/MessageList.js';
import type { AgentState } from './components/StatusBar.js';
import { Banner } from './components/Banner.js';
import { MessageList } from './components/MessageList.js';
import { HelpPanel } from './components/HelpPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { InputBox } from './components/InputBox.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 从 package.json 读取版本号 */
function getCLIVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, '..', 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return `v${pkg.version || '0.3.0'}`;
    }
  } catch (err) {
    /* fallback */
  }
  return 'v0.3.0';
}
const CLI_VERSION = getCLIVersion();

import {
  ConfigManager,
  SessionManager,
  ToolRegistry,
  AgentEngine,
  AdapterFactory,
  getAllBuiltinTools,
  logger,
} from '@easyagent/core';

/** 全局计数器 */
let msgCounter = 0;
const nextId = (): string => `msg_${++msgCounter}_${Date.now()}`;

interface AppProps {
  /** 初始化信息 */
  initInfo: {
    model: string;
    tools: number;
  };
}

/**
 * 主应用 - CLI交互界面
 * 管理消息流、Agent交互、命令路由
 */
export const App: FC<AppProps> = ({ initInfo }) => {
  const { exit } = useApp();

  // ============ 状态管理 ============
  const [messages, setMessages] = useState<CLIMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [showHelp, setShowHelp] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0, total: 0 });
  const [isGenerating, setIsGenerating] = useState(false);

  // ============ 消息操作 ============

  /** 添加消息 */
  const addMsg = useCallback(
    (role: CLIMessage['role'], content: string, streaming = false): string => {
      const id = nextId();
      setMessages((prev) => [...prev, { id, role, content, isStreaming: streaming }]);
      return id;
    },
    [],
  );

  /** 追加到末条消息(流式输出) */
  const appendLast = useCallback((content: string) => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      } else {
        msgs.push({ id: nextId(), role: 'assistant', content });
      }
      return msgs;
    });
  }, []);

  /** 标记最后一条消息流式完成 */
  const finishStream = useCallback(() => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (last) msgs[msgs.length - 1] = { ...last, isStreaming: false };
      return msgs;
    });
  }, []);

  // ============ Agent初始化 ============
  useEffect(() => {
    const initMsg = `📊 系统: ${initInfo.tools} 个工具已加载 · 模型: ${initInfo.model}`;
    addMsg('system', initMsg);
  }, [initInfo, addMsg]);

  // ============ 发送消息 ============

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setShowBanner(false);
      setShowHelp(false);
      addMsg('user', text);
      setAgentState('thinking');
      setIsGenerating(true);

      try {
        // 重建Agent实例(确保配置最新)
        const configManager = new ConfigManager();
        const config = await configManager.load();
        const provider = configManager.getCurrentProvider();

        if (!provider) {
          addMsg('system', '⚠ Agent未初始化，请配置API密钥后重启');
          setAgentState('error');
          setIsGenerating(false);
          return;
        }

        const toolRegistry = new ToolRegistry();
        toolRegistry.registerAll(getAllBuiltinTools());

        const sessionManager = new SessionManager();
        const agent = new AgentEngine(provider, toolRegistry, sessionManager, {
          provider: config.currentModel.provider,
          model: config.currentModel.model,
          maxTurns: config.agent.maxTurns,
          temperature: config.agent.temperature,
        });

        const msgId = addMsg('assistant', '', true);

        await agent.run(text, {
          sessionId: `cli_${Date.now()}`,
          onPartialResponse: (chunk: string) => {
            setMessages((prev) => {
              const msgs = [...prev];
              const idx = msgs.findIndex((m) => m.id === msgId);
              if (idx !== -1) {
                msgs[idx] = { ...msgs[idx], content: msgs[idx].content + chunk };
              }
              return msgs;
            });
          },
        });

        finishStream();
        setAgentState('idle');
      } catch (err) {
        addMsg('system', `✖ 错误: ${(err as Error).message}`);
        setAgentState('error');
      } finally {
        setIsGenerating(false);
      }
    },
    [addMsg, finishStream],
  );

  // ============ 命令处理 ============

  const handleCommand = useCallback(
    async (rawCmd: string) => {
      const parts = rawCmd.slice(1).trim().split(/\s+/);
      const action = parts[0]?.toLowerCase();
      const args = parts.slice(1);

      switch (action) {
        case 'help':
          setShowHelp((v) => !v);
          break;

        case 'model': {
          const configManager = new ConfigManager();
          await configManager.load();
          addMsg(
            'system',
            `当前模型: ${configManager.getConfig().currentModel.provider}/${configManager.getConfig().currentModel.model}`,
          );
          break;
        }

        case 'models': {
          try {
            const configManager = new ConfigManager();
            const config = await configManager.load();
            const modelList = config.providers
              .flatMap((p: any) => (p.models || []).map((m: any) => `  ${p.name}: ${m.id}`))
              .join('\n');
            addMsg('system', `可用模型:\n${modelList || '  无'}`);
          } catch (err) {
            addMsg('system', '无法获取模型列表');
          }
          break;
        }

        case 'providers': {
          try {
            const configManager = new ConfigManager();
            const config = await configManager.load();
            const pList = config.providers
              .map(
                (p: any) =>
                  `  [${p.hasKey ? '✓' : '✗'}] ${p.name} (${p.id}) - ${p.models?.length || 0} 模型`,
              )
              .join('\n');
            addMsg('system', `提供商:\n${pList}`);
          } catch (err) {
            addMsg('system', '无法获取提供商列表');
          }
          break;
        }

        case 'switch': {
          if (args.length >= 2) {
            try {
              const configManager = new ConfigManager();
              await configManager.load();
              configManager.switchModel(args[0], args[1]);
              await configManager.save();
              addMsg('system', `已切换模型: ${args[0]}/${args[1]}`);
            } catch (e) {
              addMsg('system', `切换失败: ${(e as Error).message}`);
            }
          } else {
            addMsg('system', '用法: /switch <provider> <model>');
          }
          break;
        }

        case 'status': {
          addMsg(
            'system',
            [
              `状态: ${agentState}`,
              `模型: ${initInfo.model}`,
              `工具数: ${initInfo.tools}`,
              `Tokens: 输入${tokenUsage.input} | 输出${tokenUsage.output} | 总计${tokenUsage.total}`,
              `消息数: ${messages.length}`,
            ].join('\n'),
          );
          break;
        }

        case 'sessions': {
          try {
            const sessionManager = new SessionManager();
            const sessions = sessionManager.list();
            const sList = sessions
              .map(
                (s: any) =>
                  `  ${s.id?.slice(-12)} - ${s.title || '未命名'} [${s.status || 'active'}]`,
              )
              .join('\n');
            addMsg('system', `会话 (${sessions.length}):\n${sList || '  无会话'}`);
          } catch (err) {
            addMsg('system', '无法获取会话列表');
          }
          break;
        }

        case 'tools': {
          const toolRegistry = new ToolRegistry();
          toolRegistry.registerAll(getAllBuiltinTools());
          const tools = toolRegistry.list();
          addMsg(
            'system',
            `工具 (${tools.length}):\n${tools.map((t: any) => `  ${t.name.padEnd(24)} ${t.description?.slice(0, 50)}`).join('\n')}`,
          );
          break;
        }

        case 'token-key': {
          if (args.length >= 2) {
            try {
              const configManager = new ConfigManager();
              await configManager.load();
              configManager.setApiKey(args[0], args[1]);
              await configManager.save();
              addMsg('system', `API密钥已设置: ${args[0]}`);
            } catch (e) {
              addMsg('system', `设置失败: ${(e as Error).message}`);
            }
          } else {
            addMsg('system', '用法: /token-key <provider> <api-key>');
          }
          break;
        }

        case 'clear':
          setMessages([]);
          setShowBanner(true);
          break;

        case 'exit':
        case 'quit': {
          exit();
          process.exit(0);
          break;
        }

        default:
          addMsg('system', `未知命令: ${rawCmd}。输入 /help 查看帮助`);
      }
    },
    [initInfo, agentState, tokenUsage, messages.length, addMsg, exit],
  );

  // ============ Ctrl+C 退出 ============
  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      exit();
      process.exit(0);
    }
  });

  // ============ 渲染 ============
  return (
    <Box flexDirection="column" padding={1} height="100%">
      {/* 欢迎 Banner */}
      {showBanner && messages.length <= 1 && <Banner version={CLI_VERSION} />}

      {/* 帮助面板 */}
      {showHelp && <HelpPanel />}

      {/* 消息列表 */}
      {messages.length > 0 && <MessageList messages={messages} />}

      {/* 输入框 */}
      <InputBox
        onSubmit={(text: string) => {
          if (text.startsWith('/')) {
            handleCommand(text);
          } else {
            handleSend(text);
          }
        }}
        disabled={isGenerating}
      />

      {/* 状态栏 */}
      <StatusBar
        state={agentState}
        model={initInfo.model}
        toolCount={initInfo.tools}
        tokenUsage={tokenUsage}
      />
    </Box>
  );
};
