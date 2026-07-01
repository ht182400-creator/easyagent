/**
 * 引擎工厂 — 根据配置创建 AgentEngine 或 LangGraphAgent
 *
 * 引擎选择优先级（由高到低）：
 *   1. CLI 参数 --engine <legacy|langgraph>
 *   2. 环境变量 EASYAGENT_ENGINE
 *   3. 配置文件 engine.config.json（项目根目录）
 *   4. 默认值 'legacy'
 *
 * 最终可在设置页暴露给用户，配置持久化到文件后提示重启生效。
 *
 * @module server/langgraph/engineFactory
 */
import { AgentEngine } from '@easyagent/core';
import type { ProviderConfig, ToolRegistry } from '@easyagent/core';
import { createLangGraphAgent } from '@easyagent/langgraph';
import type { SessionManager } from '@easyagent/core';
import { LangGraphAgentAdapter } from './agentAdapter';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 引擎类型
 */
export type EngineType = 'legacy' | 'langgraph';

/**
 * 引擎实例类型（兼容两种引擎的共同接口）
 */
export type AgentInstance = AgentEngine | LangGraphAgentAdapter;

/**
 * Agent 创建选项
 */
export interface CreateAgentOptions {
  /** 引擎类型 */
  engine?: EngineType;
  /** 模型名称 */
  model?: string;
  /** 服务商标识 */
  provider?: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 最大对话轮次 */
  maxTurns?: number;
  /** 工作区路径 */
  workspace?: string;
}

/**
 * 引擎配置文件结构
 */
interface EngineConfig {
  engine: EngineType;
  langgraph?: {
    maxTurns?: number;
    checkpointDb?: string;
  };
}

/**
 * 配置文件查找结果
 */
interface EngineConfigResult {
  /** 配置内容 */
  config: EngineConfig;
  /** 配置文件绝对路径 */
  path: string;
}

/**
 * 引擎来源信息
 */
export interface EngineSource {
  /** 最终生效的引擎类型 */
  engine: EngineType;
  /** 来源标识 */
  source: 'cli' | 'env' | 'config' | 'default';
  /** 来源描述，便于日志展示 */
  sourceLabel: string;
  /** 配置文件路径（仅 source='config' 时有值） */
  configPath?: string;
}

/**
 * 从 engine.config.json 读取配置
 *
 * 查找策略：从当前工作目录开始向上逐级查找，最多查找 6 层。
 * 兼容 start-backend.bat 从 packages/server/ 启动的场景。
 *
 * @returns 配置文件内容与路径，不存在则返回 null
 */
function loadEngineConfig(): EngineConfigResult | null {
  let dir = process.cwd();

  for (let i = 0; i < 6; i++) {
    const configPath = resolve(dir, 'engine.config.json');
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        const cfg = JSON.parse(raw) as EngineConfig;
        if (cfg.engine && (cfg.engine === 'legacy' || cfg.engine === 'langgraph')) {
          return { config: cfg, path: configPath };
        }
      } catch {
        // 文件损坏或格式错误 → 忽略，继续向上查找
      }
    }
    // 到达文件系统根目录时停止
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 解析 CLI 参数中的 --engine 选项
 * 由 index.ts 在启动时调用，传入 process.argv
 *
 * @param args - 通常是 process.argv
 * @returns 'legacy' | 'langgraph' | null
 */
export function parseCliEngineArg(args: string[] = process.argv): EngineType | null {
  const engineIdx = args.findIndex((a) => a === '--engine');
  if (engineIdx >= 0 && engineIdx + 1 < args.length) {
    const val = args[engineIdx + 1].toLowerCase();
    if (val === 'langgraph' || val === 'legacy') {
      return val;
    }
  }
  return null;
}

/**
 * 读取引擎配置
 *
 * 优先级（由高到低）：
 *   1. CLI 参数 cliEngine（由 index.ts 解析后传入）
 *   2. 环境变量 EASYAGENT_ENGINE
 *   3. 配置文件 engine.config.json
 *   4. 默认值 'legacy'
 *
 * @param cliEngine - CLI 传入的引擎类型，优先级最高
 * @returns 确定的引擎类型
 */
export function getEngineType(cliEngine?: EngineType | null): EngineType {
  return resolveEngineSource(cliEngine).engine;
}

/**
 * 解析引擎来源信息
 *
 * 同时返回最终引擎类型和它的来源，用于启动日志清晰展示。
 *
 * @param cliEngine - CLI 传入的引擎类型
 * @returns 引擎类型 + 来源信息
 */
export function resolveEngineSource(cliEngine?: EngineType | null): EngineSource {
  // 1. CLI 参数 > 一切
  if (cliEngine === 'langgraph' || cliEngine === 'legacy') {
    return {
      engine: cliEngine,
      source: 'cli',
      sourceLabel: `CLI 参数 --engine ${cliEngine}`,
    };
  }

  // 2. 环境变量
  const envEngine = process.env.EASYAGENT_ENGINE?.toLowerCase();
  if (envEngine === 'langgraph' || envEngine === 'legacy') {
    return {
      engine: envEngine,
      source: 'env',
      sourceLabel: `环境变量 EASYAGENT_ENGINE=${envEngine}`,
    };
  }

  // 3. 配置文件 engine.config.json
  const fileConfig = loadEngineConfig();
  if (fileConfig?.config.engine) {
    return {
      engine: fileConfig.config.engine,
      source: 'config',
      sourceLabel: `配置文件 engine.config.json`,
      configPath: fileConfig.path,
    };
  }

  // 4. 默认值
  return {
    engine: 'legacy',
    source: 'default',
    sourceLabel: '默认值 legacy',
  };
}

/**
 * 创建 Agent 实例
 *
 * 根据配置决定使用 AgentEngine (legacy) 或 LangGraphAgent (langgraph)
 *
 * @param providerConfig - 模型提供商配置
 * @param toolRegistry - 工具注册表
 * @param sessionManager - 会话管理器（仅 legacy 需要）
 * @param options - 创建选项
 * @returns AgentEngine | LangGraphAgentAdapter
 *
 * @example
 * // Legacy 引擎
 * const agent = await createAgent(providerConfig, toolRegistry, sessionManager);
 *
 * @example
 * // LangGraph 引擎（需设置 EASYAGENT_ENGINE=langgraph）
 * const agent = await createAgent(providerConfig, toolRegistry, sessionManager);
 */
export async function createAgent(
  providerConfig: ProviderConfig,
  toolRegistry: ToolRegistry,
  sessionManager: SessionManager,
  options: CreateAgentOptions = {},
): Promise<AgentInstance> {
  const engineType = options.engine || getEngineType();

  if (engineType === 'langgraph') {
    // 使用 LangGraph 引擎
    const lgAgent = await createLangGraphAgent(
      providerConfig,
      toolRegistry,
      {
        model: options.model,
        systemPrompt: options.systemPrompt,
        maxTurns: options.maxTurns ?? 25,
        workspace: options.workspace,
        checkpointerConfig: {
          dbPath: process.env.EASYAGENT_LG_CHECKPOINT_DB || ':memory:',
        },
      },
    );

    return new LangGraphAgentAdapter(lgAgent);
  }

  // 默认: 使用现有 AgentEngine
  return new AgentEngine(providerConfig, toolRegistry, sessionManager, {
    model: options.model,
    provider: options.provider,
  });
}

/**
 * 判断是否为 LangGraph 适配器实例
 */
export function isLangGraphAdapter(agent: AgentInstance): agent is LangGraphAgentAdapter {
  return agent instanceof LangGraphAgentAdapter;
}
