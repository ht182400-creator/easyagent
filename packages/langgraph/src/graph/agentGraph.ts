/**
 * agentGraph — LangGraph StateGraph 编译
 * 
 * 构建 "思考 → 路由 → (行动 → 观察 →) 思考" 环形工作流。
 * 这是整个 LangGraph 引擎的核心编排层。
 * 
 * 节点:
 *   think   — LLM 调用，生成 AIMessage（可能含 tool_calls）
 *   act     — 工具执行，生成 ToolMessage
 *   observe — 结果处理，决定是否继续
 * 
 * 边:
 *   START → think
 *   think → routeAfterThink → act (有 tool_calls) 或 END (无)
 *   act → observe → think (循环)
 */
import { StateGraph, START, END } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { AgentState } from '../state/AgentState';
import type { ThinkNodeConfig } from '../nodes/thinkNode';
import { createThinkNode } from '../nodes/thinkNode';
import type { ActNodeConfig } from '../nodes/actNode';
import { createActNode } from '../nodes/actNode';
import type { ObserveNodeConfig } from '../nodes/observeNode';
import { createObserveNode } from '../nodes/observeNode';
import { routeAfterThink } from '../edges/routeAfterThink';
import { Logger } from '../logger/Logger';

/** agentGraph 模块 Logger */
const log = new Logger('agentGraph');

/**
 * AgentGraph 构建配置
 */
export interface AgentGraphConfig {
  /** think 节点配置（LLM 调用） */
  think: ThinkNodeConfig;
  /** act 节点配置（工具执行） */
  act: ActNodeConfig;
  /** observe 节点配置（结果观察），可选 */
  observe?: ObserveNodeConfig;
  /** Checkpoint 持久化器，可选 */
  checkpointer?: BaseCheckpointSaver;
  /** 图名称 */
  name?: string;
  /** 最大思考轮次，用于计算 LangGraph 递归限制 */
  maxTurns?: number;
}

/**
 * 构建并编译 LangGraph Agent 工作流
 * 
 * 流程:
 *   START → think → routeAfterThink ─(tool_calls)─→ act → observe → think
 *                                    ─(no_tools)──→ END
 * 
 * @param config - 节点配置
 * @returns 编译后的 CompiledStateGraph，可直接 invoke/stream
 */
export function createAgentGraph(config: AgentGraphConfig) {
  const { think, act, observe, checkpointer, name = 'EasyAgent', maxTurns = 25 } = config;
  log.enter({ name, hasCheckpointer: !!checkpointer });

  // 创建节点函数
  const createNodesTimer = log.startTimer('创建节点函数');
  const thinkNode = createThinkNode(think);
  const actNode = createActNode(act);
  const observeNode = createObserveNode(observe);
  createNodesTimer();

  // 构建 StateGraph
  const graph = new StateGraph(AgentState)
    // 注册节点
    .addNode('think', thinkNode)
    .addNode('act', actNode)
    .addNode('observe', observeNode)
    // 注册边
    .addEdge(START, 'think')                           // 入口
    .addConditionalEdges('think', routeAfterThink, {   // 条件路由
      act: 'act',
      __end__: END,
    })
    .addEdge('act', 'observe')                         // act → observe
    .addEdge('observe', 'think');                       // observe → think (循环)

  // 编译并应用 checkpoint
  // 注意：LangGraph 的 recursionLimit 需在运行时（invoke/streamEvents）传入，
  // compile 阶段不支持该选项。这里仅记录 maxTurns，由 Agent 在调用时计算限制。
  const compileTimer = log.startTimer('编译');
  const compiled = graph.compile({ checkpointer });
  compileTimer();
  log.exit({ name, nodes: ['think', 'act', 'observe'], maxTurns });

  return compiled;
}
