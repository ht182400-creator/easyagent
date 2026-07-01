/**
 * toolBridge — 将 EasyAgent ToolRegistry 包装为 LangGraph ActNodeConfig.toolExecutor
 *
 * 核心差异：
 * - core ToolRegistry.execute(name, params, context) 需要 ToolContext 作为第三个参数
 * - langgraph ToolExecutor.execute(name, params) 只需两个参数
 *
 * Bridge 通过闭包注入 ToolContext（每次调用时动态获取），填平签名差异。
 *
 * @module bridge/toolBridge
 */
import type { ToolRegistry, ToolContext } from '@easyagent/core';
import type { ToolExecutor } from '../nodes/actNode';

/**
 * 将 ToolRegistry 包装为 actNode 所需的 toolExecutor。
 *
 * 每次工具调用时通过 getContext() 动态获取 ToolContext，
 * 确保 workspace/sessionId 为最新值。
 *
 * @param registry - EasyAgent 的 ToolRegistry 实例
 * @param getContext - 获取 ToolContext 的工厂函数
 * @returns 符合 ToolExecutor 接口的对象
 *
 * @example
 * const executor = createToolBridge(registry, () => ({
 *   workspace: process.cwd(),
 *   sessionId: 'session-123',
 * }));
 * const agent = new LangGraphAgent({ act: { toolExecutor: executor }, ... });
 */
export function createToolBridge(
  registry: ToolRegistry,
  getContext: () => ToolContext
): ToolExecutor {
  return {
    execute: async (name, params) => {
      const context = getContext();
      return registry.execute(name, params, context);
    },
  };
}
