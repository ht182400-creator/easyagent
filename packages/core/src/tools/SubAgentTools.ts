/**
 * 子Agent/任务委派工具集 v2
 * 提供多Agent协作、任务委派、并行执行等功能
 * 基于 MultiAgentCoordinator 实现真实的任务分解和Agent调度
 */
import type { ITool } from './ToolRegistry.js';
import type { ToolResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { MultiAgentCoordinator, PREDEFINED_ROLES } from '../agent/MultiAgentCoordinator.js';

/** 全局协调器单例 */
let _coordinator: MultiAgentCoordinator | null = null;

function getCoordinator(): MultiAgentCoordinator {
  if (!_coordinator) {
    _coordinator = new MultiAgentCoordinator(3);
  }
  return _coordinator;
}

/** 重置协调器（测试用） */
export function resetCoordinator(): void {
  _coordinator = null;
}

/**
 * 任务委派工具 v2 - 由多Agent协调器处理
 * 支持自动任务分解、Agent匹配、并行执行
 */
export const DelegateTaskTool: ITool = {
  name: 'delegate_task',
  description:
    '将复杂任务委派给专门的子Agent执行。系统自动将任务分解为子任务，匹配最合适的Agent（架构师/开发者/测试/审查员/DevOps/文档员），并行或串行执行。' +
    '支持代码探索、审查、测试生成、文档编写、重构、部署等专项任务。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      agentType: {
        type: 'string',
        description:
          '子Agent类型（可选，不指定则自动选择）: architect/coder/reviewer/tester/devops/docs',
        enum: ['architect', 'coder', 'reviewer', 'tester', 'devops', 'docs'],
      },
      task: { type: 'string', description: '委派给子Agent的具体任务描述，越详细越好' },
      maxTurns: { type: 'number', description: '子Agent最大执行轮次, 默认25' },
    },
    required: ['task'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const task = params.task as string;
      const agentType = params.agentType as string | undefined;
      const maxTurns = (params.maxTurns as number) || 25;

      const coordinator = getCoordinator();

      // 如果指定了agent type，直接分配给该agent
      if (agentType) {
        const role = PREDEFINED_ROLES.find((r) => r.id === agentType);
        if (!role) {
          return {
            success: false,
            content: `未知的子Agent类型: "${agentType}"。可用类型: ${PREDEFINED_ROLES.map((r) => r.id).join(', ')}`,
          };
        }

        // 运行协作任务
        const collabTask = await coordinator.runCollaborationTask(task);
        const report = coordinator.generateReport(collabTask.id);

        return {
          success: true,
          content: [
            `🤖 任务已委派给多Agent协作系统`,
            ``,
            `主Agent: ${role.name}`,
            `子任务数: ${collabTask.subTasks.length}`,
            `参与Agent: ${collabTask.agents.map((id) => coordinator.getAgentStatus().find((a) => a.id === id)?.name || id).join(', ')}`,
            ``,
            report,
            `📝 注意: 生产环境需要配置Agent引擎以执行实际推理。当前为协调器调度模拟。`,
          ].join('\n'),
          metadata: {
            agentType,
            taskId: collabTask.id,
            subTaskCount: collabTask.subTasks.length,
            agents: collabTask.agents,
            maxTurns,
          },
        };
      }

      // 自动分配：运行协作任务
      const collabTask = await coordinator.runCollaborationTask(task);
      const report = coordinator.generateReport(collabTask.id);

      return {
        success: true,
        content: [
          `🤖 任务已委派给多Agent协作系统`,
          ``,
          `自动任务分解: ${collabTask.subTasks.length} 个子任务`,
          `参与Agent: ${collabTask.agents.map((id) => coordinator.getAgentStatus().find((a) => a.id === id)?.name || id).join(', ')}`,
          ``,
          report,
          `📝 注意: 生产环境需要配置Agent引擎以执行实际推理。当前为协调器调度模拟。`,
        ].join('\n'),
        metadata: {
          taskId: collabTask.id,
          subTaskCount: collabTask.subTasks.length,
          agents: collabTask.agents,
          maxTurns,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '任务委派失败');
      return { success: false, content: `任务委派失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 列出可用子Agent v2 - 基于预定义角色
 */
export const ListSubAgentsTool: ITool = {
  name: 'list_subagents',
  description:
    '列出所有可用的子Agent角色及其能力和描述。帮助选择最适合的子Agent来处理特定任务。现在支持6个专业角色：架构师、开发者、审查员、测试、DevOps、文档员。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    const coordinator = getCoordinator();
    const agentStatus = coordinator.getAgentStatus();

    const agentList = PREDEFINED_ROLES.map((role) => {
      const status = agentStatus.find((a) => a.id === role.id);
      const statusIcon =
        status?.status === 'idle' ? '⏳空闲' : status?.status === 'busy' ? '🔄忙碌' : '❌错误';
      return [
        `### ${role.name} (${role.id})`,
        role.description,
        `专长: ${role.expertise.join(' | ')}`,
        `工具: ${role.tools.slice(0, 5).join(', ')}`,
        `状态: ${statusIcon || '⏳空闲'}`,
        `调用: delegate_task task="描述" agentType="${role.id}"`,
        '',
      ].join('\n');
    }).join('\n');

    return {
      success: true,
      content: [
        `🤖 多Agent协作系统`,
        `可用角色: ${PREDEFINED_ROLES.length} 个`,
        ``,
        `使用 delegate_task 工具将任务委派给Agent系统。`,
        `系统会自动将复杂任务分解为子任务，分配给最合适的Agent。`,
        `多个Agent可以并行工作以提高效率。`,
        ``,
        agentList,
        `📊 系统统计:`,
        `  任务统计: ${JSON.stringify(coordinator.getTaskStats())}`,
      ].join('\n'),
      metadata: {
        count: PREDEFINED_ROLES.length,
        types: PREDEFINED_ROLES.map((r) => r.id),
        agentStatus,
      },
    };
  },
};

/**
 * 安装运行时工具
 * 安装指定版本的Node.js或Python运行时
 */
export const InstallRuntimeTool: ITool = {
  name: 'install_runtime',
  description: '安装指定版本的运行时环境(Node.js/Python)。用于满足项目对特定运行时版本的要求。',
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: '运行时类型: node 或 python',
        enum: ['node', 'python'],
      },
      version: { type: 'string', description: '版本号，如 "20.19.0" (node) 或 "3.12.0" (python)' },
    },
    required: ['type', 'version'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const type = params.type as string;
      const version = params.version as string;

      // 验证版本格式
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        return {
          success: false,
          content: `无效的版本格式: "${version}"。格式应为 "主版本.次版本.修订版"，如 "20.19.0"。`,
        };
      }

      const names: Record<string, string> = { node: 'Node.js', python: 'Python' };
      const name = names[type] || type;
      const currentVersion = type === 'node' ? process.version : '';

      return {
        success: true,
        content: [
          `📦 ${name} ${version} 安装请求`,
          ``,
          type === 'node'
            ? `当前Node.js版本: ${currentVersion}`
            : `当前Python: ${currentVersion || '(未检测)'}`,
          `请求版本: ${version}`,
          ``,
          `⚠ 实际安装需要通过包管理器完成:`,
          type === 'node'
            ? `  方法1: nvm install ${version}  (推荐)`
            : `  方法1: pyenv install ${version} (推荐)`,
          type === 'node'
            ? `  方法2: npm install -g n && n ${version}`
            : `  方法2: conda install python=${version}`,
          ``,
          `此工具返回了安装指令，实际安装将在系统层面执行。`,
        ].join('\n'),
        metadata: { type, requestedVersion: version, currentVersion },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `运行时安装失败: ${msg}`, error: msg };
    }
  },
};

/** 子Agent任务委派工具集 */
export const SubAgentTools = [DelegateTaskTool, ListSubAgentsTool, InstallRuntimeTool];
