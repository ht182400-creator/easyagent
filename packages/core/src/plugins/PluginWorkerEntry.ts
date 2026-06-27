/**
 * 插件沙箱 Worker 入口文件
 *
 * 在 worker_threads 中运行，负责：
 * 1. 接收主线程的 RPC 消息
 * 2. 加载插件代码
 * 3. 代理工具执行、钩子触发等操作
 * 4. 将结果返回主线程
 *
 * 注意：此文件在 Worker 上下文中运行，不能 import 项目其他模块
 * （除了 @easyagent/core 的纯类型定义）
 */

import { workerData, parentPort } from 'worker_threads';
import { pathToFileURL } from 'url';

// ===================== RPC 协议类型 =====================

/** 主线程 → Worker 的消息类型 */
type MainMessage =
  | { type: 'init'; requestId: string; pluginPath: string }
  | { type: 'getTools'; requestId: string }
  | { type: 'getSkills'; requestId: string }
  | { type: 'getHooks'; requestId: string }
  | {
      type: 'executeTool';
      requestId: string;
      toolName: string;
      params: Record<string, unknown>;
      context: unknown;
    }
  | { type: 'triggerHook'; requestId: string; event: string; context: unknown }
  | { type: 'shutdown'; requestId: string };

/** Worker → 主线程的响应 */
interface WorkerResponse {
  requestId: string;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ===================== 运行时状态 =====================

/** 已加载的插件实例 */
let pluginInstance: Record<string, unknown> | null = null;
/** 插件加载路径 */
let pluginDir: string = '';
/** 已注册的工具定义列表 */
let registeredTools: Array<Record<string, unknown>> = [];
/** 已注册的技能定义列表 */
let registeredSkills: Array<Record<string, unknown>> = [];
/** 已注册的钩子定义列表 */
let registeredHooks: Array<Record<string, unknown>> = [];

// ===================== 工具函数 =====================

/**
 * 发送响应到主线程
 */
function sendResponse(response: WorkerResponse): void {
  parentPort?.postMessage(response);
}

/**
 * 发送错误响应
 */
function sendError(requestId: string, type: string, error: unknown): void {
  sendResponse({
    requestId,
    type,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

// ===================== 消息处理器 =====================

/**
 * 初始化：加载插件代码
 */
async function handleInit(requestId: string, pluginPath: string): Promise<void> {
  try {
    pluginDir = pluginPath;
    // 在 Worker 中动态导入插件模块
    // Windows 需要 file:// URL 格式
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const module: Record<string, unknown> = await import(pathToFileURL(pluginPath).href);
    const plugin = module.default || module.plugin || module;

    if (!plugin || typeof plugin !== 'object') {
      throw new Error('插件模块必须导出插件对象');
    }

    const p = plugin as Record<string, unknown>;
    if (!p.name) {
      throw new Error('插件必须包含 name 属性');
    }

    pluginInstance = p;

    // 调用 register 钩子
    if (typeof p.register === 'function') {
      // 创建受限的 context（Worker 中无法直接访问 ToolRegistry）
      const sandboxContext = {
        registerTool: (tool: Record<string, unknown>) => {
          registeredTools.push(tool);
        },
        registerTools: (tools: Array<Record<string, unknown>>) => {
          registeredTools.push(...tools);
        },
        getConfig: () => ({}),
      };
      await p.register(sandboxContext);
    }

    // 收集工具
    if (typeof p.getTools === 'function') {
      const tools = p.getTools() as Array<Record<string, unknown>>;
      registeredTools = [...registeredTools, ...tools];
    }

    // 收集技能
    if (typeof p.getSkills === 'function') {
      registeredSkills = p.getSkills() as Array<Record<string, unknown>>;
    }

    // 收集钩子
    if (typeof p.getHooks === 'function') {
      registeredHooks = p.getHooks() as Array<Record<string, unknown>>;
    }

    sendResponse({
      requestId,
      type: 'init',
      success: true,
      data: {
        name: p.name,
        version: p.version || '0.0.0',
        description: p.description || '',
        author: p.author,
        dependencies: p.dependencies,
        tools: registeredTools.map((t) => ({
          name: t.name,
          description: t.description,
          group: t.group,
        })),
        skills: registeredSkills.map((s) => ({
          name: s.name,
          description: s.description,
          tags: s.tags,
        })),
        hooks: registeredHooks.map((h) => ({ event: h.event, priority: h.priority })),
      },
    });
  } catch (error) {
    sendError(requestId, 'init', error);
  }
}

/**
 * 获取工具列表
 */
function handleGetTools(requestId: string): void {
  try {
    const tools =
      pluginInstance && typeof (pluginInstance as Record<string, unknown>).getTools === 'function'
        ? ((pluginInstance as Record<string, unknown>).getTools!() as Array<
            Record<string, unknown>
          >)
        : registeredTools;

    // 序列化工具定义（移除 execute 函数引用）
    const serialized = tools.map((t: Record<string, unknown>) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      requiresConfirm: t.requiresConfirm,
      group: t.group,
    }));

    sendResponse({ requestId, type: 'getTools', success: true, data: serialized });
  } catch (error) {
    sendError(requestId, 'getTools', error);
  }
}

/**
 * 获取技能列表
 */
function handleGetSkills(requestId: string): void {
  try {
    const skills =
      pluginInstance && typeof (pluginInstance as Record<string, unknown>).getSkills === 'function'
        ? ((pluginInstance as Record<string, unknown>).getSkills!() as Array<
            Record<string, unknown>
          >)
        : registeredSkills;

    sendResponse({ requestId, type: 'getSkills', success: true, data: skills });
  } catch (error) {
    sendError(requestId, 'getSkills', error);
  }
}

/**
 * 获取钩子列表
 */
function handleGetHooks(requestId: string): void {
  try {
    const hooks =
      pluginInstance && typeof (pluginInstance as Record<string, unknown>).getHooks === 'function'
        ? ((pluginInstance as Record<string, unknown>).getHooks!() as Array<
            Record<string, unknown>
          >)
        : registeredHooks;

    // 序列化钩子（移除 handler 函数引用）
    const serialized = hooks.map((h: Record<string, unknown>) => ({
      event: h.event,
      priority: h.priority,
    }));

    sendResponse({ requestId, type: 'getHooks', success: true, data: serialized });
  } catch (error) {
    sendError(requestId, 'getHooks', error);
  }
}

/**
 * 执行工具（代理模式）
 */
async function handleExecuteTool(
  requestId: string,
  toolName: string,
  params: Record<string, unknown>,
  context: unknown,
): Promise<void> {
  try {
    if (!pluginInstance) {
      throw new Error('插件未初始化');
    }

    // 查找工具
    const tools =
      pluginInstance && typeof (pluginInstance as Record<string, unknown>).getTools === 'function'
        ? ((pluginInstance as Record<string, unknown>).getTools!() as Array<
            Record<string, unknown>
          >)
        : registeredTools;

    const tool = tools.find((t: Record<string, unknown>) => t.name === toolName);
    if (!tool) {
      throw new Error(`未找到工具: ${toolName}`);
    }

    if (typeof (tool as Record<string, unknown>).execute !== 'function') {
      throw new Error(`工具 ${toolName} 没有实现 execute 方法`);
    }

    // 执行工具
    const result = await (tool as Record<string, unknown>).execute!(params, context);

    sendResponse({ requestId, type: 'executeTool', success: true, data: result });
  } catch (error) {
    sendError(requestId, 'executeTool', error);
  }
}

/**
 * 触发钩子
 */
async function handleTriggerHook(
  requestId: string,
  event: string,
  context: unknown,
): Promise<void> {
  try {
    if (!pluginInstance) {
      throw new Error('插件未初始化');
    }

    const hooks =
      pluginInstance && typeof (pluginInstance as Record<string, unknown>).getHooks === 'function'
        ? ((pluginInstance as Record<string, unknown>).getHooks!() as Array<
            Record<string, unknown>
          >)
        : registeredHooks;

    const matchingHooks = hooks.filter((h: Record<string, unknown>) => h.event === event);

    let currentContext = context;

    // 按优先级排序
    const sorted = [...matchingHooks].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((a.priority as number) ?? 100) - ((b.priority as number) ?? 100),
    );

    for (const hook of sorted) {
      if (typeof (hook as Record<string, unknown>).handler === 'function') {
        currentContext = await (hook as Record<string, unknown>).handler(currentContext);
        if ((currentContext as Record<string, unknown>)?.preventDefault) break;
      }
    }

    sendResponse({ requestId, type: 'triggerHook', success: true, data: currentContext });
  } catch (error) {
    sendError(requestId, 'triggerHook', error);
  }
}

/**
 * 关闭 Worker
 */
function handleShutdown(requestId: string): void {
  try {
    if (
      pluginInstance &&
      typeof (pluginInstance as Record<string, unknown>).unregister === 'function'
    ) {
      (pluginInstance as Record<string, unknown>).unregister!();
    }
    pluginInstance = null;
    sendResponse({ requestId, type: 'shutdown', success: true });
  } catch (error) {
    sendError(requestId, 'shutdown', error);
  }
}

// ===================== 消息循环 =====================

parentPort?.on('message', async (message: MainMessage) => {
  const { type, requestId } = message;

  switch (type) {
    case 'init':
      await handleInit(requestId, (message as { pluginPath: string }).pluginPath);
      break;
    case 'getTools':
      handleGetTools(requestId);
      break;
    case 'getSkills':
      handleGetSkills(requestId);
      break;
    case 'getHooks':
      handleGetHooks(requestId);
      break;
    case 'executeTool': {
      const msg = message as {
        toolName: string;
        params: Record<string, unknown>;
        context: unknown;
      };
      await handleExecuteTool(requestId, msg.toolName, msg.params, msg.context);
      break;
    }
    case 'triggerHook': {
      const msg = message as { event: string; context: unknown };
      await handleTriggerHook(requestId, msg.event, msg.context);
      break;
    }
    case 'shutdown':
      handleShutdown(requestId);
      break;
    default:
      sendError(requestId, type, `未知消息类型: ${type}`);
  }
});
