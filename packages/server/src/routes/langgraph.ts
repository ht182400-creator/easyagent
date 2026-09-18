/**
 * LangGraph 路由（P1-1 第四批拆分产物）
 *
 * ── 本模块的约定 ──
 *   1. 纯搬迁：路由路径、方法、处理逻辑与拆分前完全一致；
 *   2. currentEngine 是启动时确定的 const（不可运行时切换），注入的是值；
 *   3. Legacy 引擎下 /api/langgraph/sessions 返回空列表、/api/run/:id 仍返回预设数据
 *      （前端演示模式依赖此行为），勿改为报错；
 *   4. SCENARIO_RESULTS 与前端 LangGraphPage.tsx 的 SCENARIOS 手工同步，
 *      改一边时必须同步另一边；
 *   5. Demo 管理：demoProcess/demoReady 是模块级状态（单例语义）；
 *      broadcastDemoOutput / broadcastLangGraphNode 由调用方注入
 *      （广播实现留在 index.ts —— 与 WS 订阅集合同源）。
 *
 * @module routes/langgraph
 */

import type { Express } from 'express';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
import { logger } from '@easyagent/core';
import type { ConfigManager, createAgent } from '@easyagent/core';
import { isLangGraphAdapter } from '../langgraph/index.js';

/** LangGraph 路由依赖 */
export interface LangGraphRoutesDeps {
  currentEngine: string;
  configManager: ConfigManager;
  newAgent: (
    providerConfig: Parameters<typeof createAgent>[0],
    opts?: Parameters<typeof createAgent>[3],
  ) => ReturnType<typeof createAgent>;
  /** 编译产物目录（index.ts 的 __dirname）—— Demo 启动目录由此推导 */
  serverDir: string;
  /** 广播 LangGraph 节点状态（index.ts 实现，与 WS 订阅集合同源） */
  broadcastLangGraphNode: (nodeId: string, status?: string) => void;
  /** 广播 Demo 终端输出（index.ts 实现，依赖 wss） */
  broadcastDemoOutput: (text: string, level?: string) => void;
}

/** 注册 LangGraph 路由 */
export function registerLangGraphRoutes(app: Express, deps: LangGraphRoutesDeps): void {
  const { currentEngine, configManager, newAgent, serverDir, broadcastLangGraphNode, broadcastDemoOutput } = deps;

  // ========== LangGraph Checkpoint 管理 API (Phase B) ==========

  /**
   * 获取当前 Agent 引擎类型
   * GET /api/engine-type
   */
  app.get('/api/engine-type', (_req, res) => {
    try {
      res.json({ engineType: currentEngine });
    } catch (error) {
      logger.error({ err: error }, '获取引擎类型失败');
      res.status(500).json({ error: (error as Error).message || '获取引擎类型失败' });
    }
  });

  /**
   * 获取 LangGraph 引擎的所有会话列表
   * GET /api/langgraph/sessions
   * 说明: Legacy 引擎下返回空列表，避免前端在模式切换时直接报错
   */
  app.get('/api/langgraph/sessions', async (_req, res) => {
    try {
      if (currentEngine !== 'langgraph') {
        return res.json({
          sessions: [],
          engine: currentEngine,
          total: 0,
        });
      }
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        return res.status(500).json({ error: '未配置模型提供商' });
      }
      const tempAgent = await newAgent(providerConfig);
      if (isLangGraphAdapter(tempAgent)) {
        const sessions = tempAgent.listSessions();
        res.json({ sessions, engine: 'langgraph', total: sessions.length });
      } else {
        res.json({ sessions: [], engine: 'legacy', total: 0 });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * 获取特定会话的状态
   * GET /api/langgraph/sessions/:id
   */
  app.get('/api/langgraph/sessions/:id', async (req, res) => {
    try {
      if (currentEngine !== 'langgraph') {
        return res.status(400).json({
          error: '当前未启用 LangGraph 引擎',
          engine: currentEngine,
        });
      }
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        return res.status(500).json({ error: '未配置模型提供商' });
      }
      const tempAgent = await newAgent(providerConfig);
      if (isLangGraphAdapter(tempAgent)) {
        const state = await tempAgent.getSessionState(req.params.id);
        if (!state) {
          return res.status(404).json({ error: '会话不存在' });
        }
        res.json({ sessionId: req.params.id, state });
      } else {
        res.status(400).json({ error: '仅 LangGraph 引擎支持此功能' });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * 从 Checkpoint 恢复会话
   * POST /api/langgraph/sessions/:id/resume
   */
  app.post('/api/langgraph/sessions/:id/resume', async (req, res) => {
    try {
      if (currentEngine !== 'langgraph') {
        return res.status(400).json({
          error: '当前未启用 LangGraph 引擎',
          engine: currentEngine,
        });
      }
      const { message } = req.body;
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        return res.status(500).json({ error: '未配置模型提供商' });
      }
      const agent = await newAgent(providerConfig);
      if (isLangGraphAdapter(agent)) {
        const response = await agent.resume(req.params.id, message);
        const usage = await agent.getTokenUsage();
        res.json({ sessionId: req.params.id, response, usage });
      } else {
        res.status(400).json({ error: '仅 LangGraph 引擎支持此功能' });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========== LangGraph 场景执行 API (Phase C/D) ==========

  /**
   * LangGraph 场景预设数据（与前端 LangGraphPage.tsx SCENARIOS 同步）
   * 每个场景的静态执行结果，供前端可视化调用
   */
  const SCENARIO_RESULTS: Record<number, {
    turnCount: number;
    messageCount: number;
    duration: string;
    output: string;
    logs: Array<{ node: string; type: string; message: string }>;
    actualPath: string[];
  }> = {
    1: {
      turnCount: 1, messageCount: 2, duration: '120ms',
      output: '你好！我是 EasyAgent AI 助手，有什么可以帮助你的吗？',
      actualPath: ['START', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: 'LLM 分析输入: "你好" → 判定为纯文本对话，无需工具调用' },
        { node: 'route', type: 'decision', message: '路由决策: → END（无工具调用）' },
        { node: 'END', type: 'exit', message: '执行完成，输出自然语言回复' },
      ],
    },
    2: {
      turnCount: 1, messageCount: 4, duration: '340ms',
      output: '北京今天晴，气温 18°C-28°C，北风 3-4 级，空气质量良好。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: 'LLM 分析: 识别到天气查询需求 → 准备调用 weather_query 工具 (location="北京")' },
        { node: 'route', type: 'decision', message: '路由决策: → act（有工具调用）' },
        { node: 'act', type: 'info', message: '执行工具: weather_query({ location: "北京" }) → 成功 (18°C, 晴)' },
        { node: 'observe', type: 'info', message: '观察结果: 温度18-28°C, 北风3-4级, AQI 56 良' },
        { node: 'think', type: 'info', message: 'LLM 二次分析: 工具结果已获取，生成自然语言回复' },
        { node: 'route', type: 'decision', message: '路由决策: → END（满足退出条件）' },
        { node: 'END', type: 'exit', message: '执行完成，输出天气回复' },
      ],
    },
    3: {
      turnCount: 1, messageCount: 6, duration: '280ms',
      output: '深圳当前气温 32°C，多云，东南风 2 级。当前时间：2026-06-29 21:25 CST。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: 'LLM 分析: 识别到 2 个需求 → weather_query + time_query → 并行执行' },
        { node: 'route', type: 'decision', message: '路由决策: → act（并行 2 工具）' },
        { node: 'act', type: 'info', message: '执行工具(并行): weather_query({ location: "深圳" }) + time_query() → 均成功' },
        { node: 'observe', type: 'info', message: '观察结果: 深圳 32°C 多云 | 时间 2026-06-29 21:25' },
        { node: 'think', type: 'info', message: 'LLM 二次分析: 合并两个工具输出，生成回复' },
        { node: 'route', type: 'decision', message: '路由决策: → END' },
        { node: 'END', type: 'exit', message: '执行完成，输出合并回复' },
      ],
    },
    4: {
      turnCount: 3, messageCount: 8, duration: '520ms',
      output: '已达到最大轮次限制 (maxTurns=3)，系统自动终止以防止死循环。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化，maxTurns=3' },
        { node: 'think', type: 'info', message: '第1轮: LLM 请求 file_search 工具' },
        { node: 'route', type: 'decision', message: '第1轮: → act' },
        { node: 'act', type: 'info', message: '第1轮: file_search → 未找到文件' },
        { node: 'observe', type: 'warn', message: '第1轮: 工具返回空结果' },
        { node: 'think', type: 'info', message: '第2轮: LLM 调整查询 → 请求 file_search' },
        { node: 'route', type: 'decision', message: '第2轮: → act' },
        { node: 'act', type: 'info', message: '第2轮: file_search → 仍未找到' },
        { node: 'observe', type: 'warn', message: '第2轮: 工具返回空结果' },
        { node: 'think', type: 'info', message: '第3轮: LLM 再次调整 → 请求 file_search' },
        { node: 'route', type: 'decision', message: '第3轮: → END（maxTurns 截断）' },
        { node: 'END', type: 'exit', message: 'maxTurns=3 强制终止，输出终止信息' },
      ],
    },
    5: {
      turnCount: 2, messageCount: 6, duration: '280ms',
      output: '已记住你的偏好：喜欢蓝色。下次对话我将记住这个信息。',
      actualPath: ['START', 'think', 'route', 'END', 'START', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '段1: 会话初始化 (thread_id=abc123)' },
        { node: 'think', type: 'info', message: '段1: LLM 分析 "记住我喜欢蓝色" → 存储偏好' },
        { node: 'route', type: 'decision', message: '段1: → END，checkpoint 已保存' },
        { node: 'END', type: 'exit', message: '段1 完成，checkpoint 保存至 .langgraph/checkpoints/' },
        { node: 'START', type: 'enter', message: '段2: 从 checkpoint abc123 恢复' },
        { node: 'think', type: 'info', message: '段2: LLM 从上下文中读取到偏好 "喜欢蓝色"' },
        { node: 'route', type: 'decision', message: '段2: → END' },
        { node: 'END', type: 'exit', message: '段2 完成，偏好成功恢复' },
      ],
    },
    7: {
      turnCount: 1, messageCount: 5, duration: '310ms',
      output: '根据历史讨论 (200+ 条消息已压缩为摘要)，当前进度：已完成模块 A、B 的代码编写，待完成模块 C 的测试。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话含 200+ 条历史消息' },
        { node: 'think', type: 'info', message: 'MemoryManager 触发压缩: 200 条 → 摘要 (约 1KB)' },
        { node: 'route', type: 'decision', message: '→ act（调用摘要工具）' },
        { node: 'act', type: 'info', message: '执行摘要压缩: context_compress → 成功' },
        { node: 'observe', type: 'info', message: '摘要: "用户正在开发 EasyAgent，已完成模块 A/B，下一步模块 C 测试"' },
        { node: 'think', type: 'info', message: 'LLM 基于摘要生成回复' },
        { node: 'route', type: 'decision', message: '→ END' },
        { node: 'END', type: 'exit', message: '执行完成，摘要压缩节省 95% token' },
      ],
    },
    8: {
      turnCount: 2, messageCount: 8, duration: '450ms',
      output: '北京今天晴转多云，气温 18°C-28°C。第一次调用失败（参数格式错误），自动修正后成功。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: '第1轮: LLM 调用 weather_query (参数格式不标准)' },
        { node: 'route', type: 'decision', message: '第1轮: → act' },
        { node: 'act', type: 'error', message: '第1轮: weather_query 执行失败 → 参数格式错误' },
        { node: 'observe', type: 'warn', message: '第1轮: 检测到工具执行失败，返回错误信息给 LLM' },
        { node: 'think', type: 'info', message: '第2轮: LLM 分析错误 → 自动修正参数格式 → 重试' },
        { node: 'route', type: 'decision', message: '第2轮: → act（重试）' },
        { node: 'act', type: 'info', message: '第2轮: weather_query({ location: "北京" }) → 成功' },
        { node: 'observe', type: 'info', message: '第2轮: 观察结果 — 北京 18-28°C, 晴转多云' },
        { node: 'think', type: 'info', message: '第2轮: LLM 基于正确结果生成回复' },
        { node: 'route', type: 'decision', message: '第2轮: → END' },
        { node: 'END', type: 'exit', message: '执行完成，1 次重试后成功' },
      ],
    },
    9: {
      turnCount: 2, messageCount: 8, duration: '390ms',
      output: '用户数据分析完成：共 12 个字段，3 个异常值（已标记），建议执行数据清洗后再使用。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: '第1轮: LLM 识别 → 需先读取文件 → read_file' },
        { node: 'route', type: 'decision', message: '第1轮: → act' },
        { node: 'act', type: 'info', message: '第1轮: read_file("user_data.csv") → 12列 × 1000行, 200KB' },
        { node: 'observe', type: 'info', message: '第1轮: 文件读取完成，含 12 字段描述' },
        { node: 'think', type: 'info', message: '第2轮: LLM 分析 → 需分析数据 → analyze_data' },
        { node: 'route', type: 'decision', message: '第2轮: → act' },
        { node: 'act', type: 'info', message: '第2轮: analyze_data → 发现 3 个异常值 (索引: 42, 128, 567)' },
        { node: 'observe', type: 'info', message: '第2轮: 分析结果 — 3个异常值, 均值/方差正常' },
        { node: 'think', type: 'info', message: '第2轮: LLM 综合 A 输出 + B 结果 → 生成最终回复' },
        { node: 'route', type: 'decision', message: '第2轮: → END' },
        { node: 'END', type: 'exit', message: '链式调用完成: read_file → analyze_data' },
      ],
    },
  };

  /**
   * 执行 LangGraph 场景
   * POST /api/run/:id
   * 返回场景的预设执行结果（含详细日志）
   * Phase D: 执行期间通过 WebSocket 广播节点高亮动画
   */
  app.post('/api/run/:id', async (req, res) => {
    try {
      const scenarioId = parseInt(req.params.id, 10);
      const result = SCENARIO_RESULTS[scenarioId];

      if (!result) {
        return res.status(404).json({ error: `场景 ${scenarioId} 不存在` });
      }

      if (currentEngine !== 'langgraph') {
        // non-langgraph 模式下仍然返回预设数据，方便前端演示
        logger.info({ scenarioId }, 'Legacy引擎下返回预设场景结果');
      }

      // Phase D: 模拟节点遍历广播（通过 WebSocket 发送 langgraph_node 消息）
      if (result.actualPath && result.actualPath.length > 0) {
        for (let i = 0; i < result.actualPath.length; i++) {
          const nodeId = result.actualPath[i];
          const logEntry = result.logs?.[i];
          broadcastLangGraphNode(nodeId, logEntry?.type || 'executing');
          // 模拟动画间隔（200ms，与前端一致）
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, '场景执行失败');
      res.status(500).json({ error: (error as Error).message || '场景执行失败' });
    }
  });

  // ========== LangGraph Demo 服务管理 API ==========

  /** Demo 进程引用 */
  let demoProcess: ChildProcess | null = null;
  /** Demo 服务是否就绪 */
  let demoReady = false;

  /**
   * 获取 Demo 服务状态
   * GET /api/demo/status
   * 返回 demo 是否在运行 + 输出日志
   */
  app.get('/api/demo/status', (_req, res) => {
    res.json({
      running: demoProcess !== null && !demoProcess.killed,
      ready: demoReady,
      port: demoReady ? 3455 : null,
    });
  });

  /**
   * 一键启动 LangGraph Demo 服务
   * POST /api/demo/start
   * 在后台启动 start-demo.bat --web，实时广播终端输出到 WebSocket
   */
  app.post('/api/demo/start', async (_req, res) => {
    try {
      // 检查是否已运行
      if (demoProcess && !demoProcess.killed) {
        // 检查端口是否已就绪
        if (demoReady) {
          return res.json({ success: true, message: 'Demo 服务已在运行 (端口 3455)', port: 3455 });
        }
        return res.json({ success: true, message: 'Demo 服务正在启动中...', port: null });
      }

      // 构建启动命令
      const projectRoot = resolve(serverDir, '..', '..', '..');
      const demoDir = join(projectRoot, 'packages', 'langgraph');
      const batchFile = join(demoDir, 'start-demo.bat');

      // 广播启动开始
      broadcastDemoOutput('▶ 正在启动 LangGraph Demo 服务...\n');
      broadcastDemoOutput(`  工作目录: ${demoDir}\n`);
      broadcastDemoOutput(`  启动脚本: start-demo.bat --web\n\n`);

      // 使用 cmd.exe 启动 bat 文件
      demoReady = false;
      demoProcess = spawn('cmd.exe', ['/c', 'start-demo.bat', '--web'], {
        cwd: demoDir,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let startTime = Date.now();
      const STARTUP_TIMEOUT = 30000; // 30 秒超时

      // 捕获 stdout
      if (demoProcess.stdout) {
        demoProcess.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          broadcastDemoOutput(text, 'stdout');

          // 检测就绪信号 — 匹配 "listening on" / "started" / "ready" 等关键词
          if (!demoReady && /listening|started|ready|running|http.*3455|服务器已启动/i.test(text)) {
            demoReady = true;
            broadcastDemoOutput('\n✅ Demo 服务就绪 → http://localhost:3455\n', 'ready');
          }
        });
      }

      // 捕获 stderr
      if (demoProcess.stderr) {
        demoProcess.stderr.on('data', (data: Buffer) => {
          broadcastDemoOutput(data.toString(), 'stderr');
        });
      }

      // 进程退出处理
      demoProcess.on('close', (code) => {
        broadcastDemoOutput(`\n⚠️ Demo 进程退出 (退出码: ${code})\n`, 'exit');
        demoProcess = null;
        demoReady = false;
      });

      demoProcess.on('error', (err) => {
        broadcastDemoOutput(`\n❌ Demo 进程错误: ${err.message}\n`, 'error');
        demoProcess = null;
        demoReady = false;
      });

      // 超时检查
      const timeoutCheck = setInterval(() => {
        if (demoReady) {
          clearInterval(timeoutCheck);
          return;
        }
        if (Date.now() - startTime > STARTUP_TIMEOUT) {
          clearInterval(timeoutCheck);
          broadcastDemoOutput('\n⚠️ 启动超时 (30s) — 请检查终端是否有错误输出\n', 'warn');
        }
      }, 1000);

      res.json({ success: true, message: '正在启动 Demo 服务...', port: null });
    } catch (error) {
      logger.error({ err: error }, '启动 Demo 服务失败');
      res.status(500).json({ error: (error as Error).message || '启动 Demo 失败' });
    }
  });

  /**
   * 停止 Demo 服务
   * POST /api/demo/stop
   */
  app.post('/api/demo/stop', (_req, res) => {
    if (demoProcess && !demoProcess.killed) {
      broadcastDemoOutput('\n⏹️ 正在停止 Demo 服务...\n', 'info');
      demoProcess.kill('SIGTERM');
      // 强制杀进程树
      setTimeout(() => {
        if (demoProcess && !demoProcess.killed) {
          demoProcess.kill('SIGKILL');
        }
      }, 3000);
      demoProcess = null;
      demoReady = false;
      res.json({ success: true, message: 'Demo 服务已停止' });
    } else {
      res.json({ success: true, message: 'Demo 服务未运行' });
    }
  });
}
