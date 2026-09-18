/**
 * WebSocket 增强协议（P1-1 第四批拆分产物）
 *
 * ── 本模块的约定 ──
 *   1. 纯搬迁：server/wss 创建、认证、消息协议处理与拆分前完全一致；
 *   2. 订阅集合（wsSubscriptions / automationSubscriptions / langgraphSubscriptions /
 *      wsAbortControllers）与 safeSend / broadcastLangGraphNode 由 index.ts 注入 ——
 *      它们被 system 路由、langgraph 路由、automationManager 等多处共享，
 *      必须与 WS 模块使用**同一实例**，切勿在本模块重建；
 *   3. WS 认证与 REST 共用同一策略：回环免鉴权，非回环必须命中
 *      EASYAGENT_API_TOKEN 或 EASYAGENT_WS_TOKEN（见 connection 处理器内注释）；
 *   4. 消息协议：subscribe / chat / stop / switch_model / (un)subscribe_automation /
 *      (un)subscribe_langgraph —— 新增消息类型时同步更新前端 wsClient。
 *
 * @module routes/websocket
 */

import type { Express } from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '@easyagent/core';
import type { ConfigManager, createAgent } from '@easyagent/core';
import { isLoopbackAddress, safeTokenEqual } from '../middleware/apiSecurity.js';
import type { PluginMarketService } from '../services/PluginMarketService.js';

/** WebSocket 装配依赖 */
export interface WebSocketSetupDeps {
  app: Express;
  configManager: ConfigManager;
  config: ReturnType<ConfigManager['getConfig']>;
  newAgent: (
    providerConfig: Parameters<typeof createAgent>[0],
    opts?: Parameters<typeof createAgent>[3],
  ) => ReturnType<typeof createAgent>;
  marketService: PluginMarketService;
  port: number;
  securityToken: string | undefined;
  wsSubscriptions: Map<WebSocket, string>;
  automationSubscriptions: Set<WebSocket>;
  langgraphSubscriptions: Set<WebSocket>;
  wsAbortControllers: WeakMap<WebSocket, AbortController>;
  safeSend: (ws: WebSocket, data: Record<string, unknown>) => boolean;
  broadcastLangGraphNode: (nodeId: string, status?: string) => void;
}

/**
 * 创建 HTTP server 与 WebSocket 服务，注册连接协议处理
 * 返回 server / wss 供 createApp 的返回值与入口监听使用
 */
export function setupWebSocket(deps: WebSocketSetupDeps): {
  server: ReturnType<typeof createServer>;
  wss: WebSocketServer;
} {
  const {
    app,
    configManager,
    config,
    newAgent,
    marketService,
    port,
    securityToken,
    wsSubscriptions,
    automationSubscriptions,
    langgraphSubscriptions,
    wsAbortControllers,
    safeSend,
    broadcastLangGraphNode,
  } = deps;

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // 注：订阅集合（automationSubscriptions / langgraphSubscriptions / wsAbortControllers）、
  // safeSend 与 broadcastLangGraphNode 均为**注入依赖**（定义在 index.ts）——
  // 它们被 system 路由、langgraph 路由、automationManager 等多处共享，勿在此重建。

  /**
   * 广播插件安装进度到所有 WebSocket 客户端
   *
   * @param job - 安装任务信息
   */
  function broadcastPluginInstallProgress(job: InstallJob): void {
    const payload = JSON.stringify({
      type: 'plugin:install:progress',
      jobId: job.jobId,
      pluginId: job.pluginId,
      progress: job.progress,
      status: job.status,
      message: job.error || undefined,
      timestamp: Date.now(),
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  // 注册插件安装进度回调
  marketService.onProgress((job) => {
    broadcastPluginInstallProgress(job);
  });

  wss.on('connection', (ws: WebSocket, req) => {
    // WebSocket 认证
    //
    // 【2026-09-18 安全加固】原实现仅在设置了 EASYAGENT_WS_TOKEN 时才校验
    // （`if (serverToken && ...)`）—— 未设置环境变量即等于**完全不校验**，
    // 且与 REST 侧令牌各管一套。现改为与 REST 共用同一策略：
    //   · 回环地址（Desktop / 本地）→ 免鉴权
    //   · 非回环 → 必须命中 EASYAGENT_API_TOKEN 或（兼容旧配置）EASYAGENT_WS_TOKEN
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const reqToken =
      url.searchParams.get('token') || (req.headers['x-auth-token'] as string | undefined) || null;
    const wsPeer = req.socket.remoteAddress || undefined;
    const wsNeedsAuth = !isLoopbackAddress(wsPeer);

    if (wsNeedsAuth) {
      const accepted = [securityToken, process.env.EASYAGENT_WS_TOKEN].filter(
        (t): t is string => !!t,
      );
      const passed = !!reqToken && accepted.some((t) => safeTokenEqual(reqToken, t));
      if (!passed) {
        logger.warn({ ip: wsPeer, hasToken: !!reqToken }, 'WebSocket 认证失败');
        safeSend(ws, { type: 'error', error: '认证失败' });
        ws.close(4001, 'Unauthorized');
        return;
      }
    }
    logger.info({ ip: wsPeer, authRequired: wsNeedsAuth }, 'WebSocket 客户端已连接');

    // 发送连接确认
    safeSend(ws, { type: 'connected', timestamp: Date.now() });

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        const { type } = msg;

        switch (type) {
          /** 订阅会话 */
          case 'subscribe': {
            const sessionId = msg.sessionId || 'web_default';
            wsSubscriptions.set(ws, sessionId);
            logger.info({ sessionId }, '客户端订阅会话');
            break;
          }

          /** 发送聊天消息 */
          case 'chat': {
            const { message, sessionId, model, provider } = msg;
            if (!message) {
              safeSend(ws, { type: 'error', message: '缺少消息内容' });
              return;
            }

            const sid = sessionId || wsSubscriptions.get(ws) || `ws_${Date.now()}`;

            // 获取提供商配置
            let providerConfig;
            if (provider && model) {
              // 使用客户端指定的模型
              providerConfig = configManager.getProvider(
                provider as Parameters<typeof configManager.getProvider>[0],
              );
            }
            if (!providerConfig) {
              providerConfig = configManager.getCurrentProvider();
            }
            if (!providerConfig) {
              safeSend(ws, { type: 'error', message: '未配置模型提供商' });
              return;
            }

            const selectedModel = model || config.currentModel.model;

            // 创建 Agent 实例
            const agent = await newAgent(providerConfig, {
              model: selectedModel,
              provider: provider || config.currentModel.provider,
            });

            // 监听 Agent 事件并转发
            agent.onEvent((event) => {
              // Phase D: 如果是 LangGraph thinking 事件，广播节点状态
              if (event.type === 'turn_start' && event.data) {
                const nodeId = (event.data as { node?: string }).node;
                if (nodeId) {
                  broadcastLangGraphNode(nodeId, 'executing');
                }
              }

              switch (event.type) {
                case 'tool_start': {
                  safeSend(ws, {
                    type: 'tool_use',
                    toolCallId: event.toolCallId || `tool_${Date.now()}`,
                    toolName: event.toolName || 'unknown',
                    input: event.input || {},
                  });
                  break;
                }

                case 'tool_result': {
                  const toolResultData = event.data as { toolCallId?: string; name?: string; output?: string } | undefined;
                  safeSend(ws, {
                    type: 'tool_result',
                    toolCallId: toolResultData?.toolCallId,
                    output: toolResultData?.output || '',
                    error: event.error || null,
                  });

                  // 文档浏览器工具执行成功后，通知前端打开右侧面板
                  if (toolResultData?.name === 'open-doc-viewer' && !event.error) {
                    const panelUrl = `http://localhost:${port}/doc-viewer/`;
                    safeSend(ws, {
                      type: 'open_panel',
                      panelType: 'doc-viewer',
                      url: panelUrl,
                      title: '文档浏览器',
                    });
                    logger.info({ url: panelUrl }, '通知前端打开文档浏览器面板');
                  }
                  break;
                }

                case 'token_usage': {
                  safeSend(ws, {
                    type: 'token_usage',
                    usage: event.usage,
                  });
                  break;
                }

                case 'done': {
                  safeSend(ws, {
                    type: 'done',
                    sessionId: sid,
                  });
                  break;
                }

                case 'error': {
                  safeSend(ws, {
                    type: 'error',
                    message: event.message || '未知错误',
                  });
                  break;
                }
              }
            });

            logger.info({ sid, provider, model: selectedModel }, '开始执行 Agent.run');

            // 运行 Agent
            try {
              let fullResponse = '';
              let chunkCount = 0;

              // 创建 AbortController 用于支持 stop 消息
              const abortController = new AbortController();
              wsAbortControllers.set(ws, abortController);

              const startTime = Date.now();
              let fullReasoning = '';

              await agent.run(message, {
                sessionId: sid,
                signal: abortController.signal,
                onPartialResponse: (text: string) => {
                  fullResponse += text;
                  chunkCount++;
                  safeSend(ws, {
                    type: 'text_delta',
                    delta: text,
                  });
                },
                // 思考过程（推理模型的思维链）单独转发
                //
                // 为什么不并入 text_delta：思维链是模型的自我推导，混进正文会让用户
                // 看到大段"让我想想…不对，应该是…"；但直接丢弃又会导致思考期间界面
                // 完全空白、看起来像卡死。因此用独立消息类型上抛，由前端分栏展示。
                onReasoning: (text: string) => {
                  fullReasoning += text;
                  safeSend(ws, {
                    type: 'reasoning_delta',
                    delta: text,
                  });
                },
              });

              const durationMs = Date.now() - startTime;

              // 发送本轮 Token 用量（兼容 legacy / LangGraph 两种引擎）
              try {
                const usage = await agent.getTokenUsage();
                safeSend(ws, {
                  type: 'token_usage',
                  usage: {
                    input: usage?.inputTokens || 0,
                    output: usage?.outputTokens || 0,
                    total: usage?.totalTokens || 0,
                  },
                });
              } catch (usageErr) {
                logger.warn({ sid, error: (usageErr as Error).message }, '获取 Token 用量失败');
              }

              logger.info(
                {
                  sid,
                  chunkCount,
                  responseLen: fullResponse.length,
                  reasoningLen: fullReasoning.length,
                  durationMs,
                },
                'Agent 执行完成',
              );
              // 发送完成信号，附带本轮耗时
              safeSend(ws, {
                type: 'text_done',
                sessionId: sid,
                duration: durationMs,
              });
            } catch (error) {
              logger.error({ sid, error: (error as Error).message }, 'Agent 执行失败');
              safeSend(ws, {
                type: 'error',
                message: (error as Error).message,
              });
            }
            break;
          }

          /** 停止生成 */
          case 'stop': {
            const sid = msg.sessionId || wsSubscriptions.get(ws);
            logger.info({ sessionId: sid }, '客户端请求停止生成');
            // 通过 AbortController 中断正在运行的 Agent
            const ctrl = wsAbortControllers.get(ws);
            if (ctrl) {
              ctrl.abort();
              wsAbortControllers.delete(ws);
            }
            safeSend(ws, { type: 'done', sessionId: sid });
            break;
          }

          /** 切换模型 */
          case 'switch_model': {
            const { provider: newProvider, model: newModel } = msg;
            configManager.switchModel(newProvider, newModel);
            configManager.save().catch((e) => logger.error({ error: e }, '保存模型配置失败'));
            safeSend(ws, { type: 'model_switched', provider: newProvider, model: newModel });
            break;
          }

          /** 订阅自动化任务进度 */
          case 'subscribe_automation': {
            automationSubscriptions.add(ws);
            safeSend(ws, { type: 'automation_subscribed', message: '已订阅自动化任务进度' });
            logger.info('客户端订阅自动化进度');
            break;
          }

          /** 取消订阅自动化任务进度 */
          case 'unsubscribe_automation': {
            automationSubscriptions.delete(ws);
            logger.info('客户端取消订阅自动化进度');
            break;
          }

          /** 订阅 LangGraph 节点状态推送（Phase D 实时高亮） */
          case 'subscribe_langgraph': {
            langgraphSubscriptions.add(ws);
            safeSend(ws, { type: 'langgraph_subscribed', message: '已订阅 LangGraph 节点状态' });
            logger.info('客户端订阅 LangGraph 节点状态');
            break;
          }

          /** 取消订阅 LangGraph 节点状态推送 */
          case 'unsubscribe_langgraph': {
            langgraphSubscriptions.delete(ws);
            logger.info('客户端取消订阅 LangGraph 节点状态');
            break;
          }

          default:
            safeSend(ws, { type: 'error', message: `未知消息类型: ${type}` });
        }
      } catch (error) {
        logger.error({ error: (error as Error).message }, 'WebSocket 消息处理异常');
        safeSend(ws, { type: 'error', message: `消息解析失败: ${(error as Error).message}` });
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket 客户端已断开');
      wsSubscriptions.delete(ws);
      automationSubscriptions.delete(ws);
      langgraphSubscriptions.delete(ws);
      wsAbortControllers.delete(ws);
    });

    ws.on('error', (err) => {
      logger.error({ error: err.message }, 'WebSocket 错误');
      wsSubscriptions.delete(ws);
      automationSubscriptions.delete(ws);
      langgraphSubscriptions.delete(ws);
      wsAbortControllers.delete(ws);
    });
  });


  return { server, wss };
}
