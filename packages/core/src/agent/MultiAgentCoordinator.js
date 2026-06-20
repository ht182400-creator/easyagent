/**
 * 多Agent协作协调器
 * 管理多个专业Agent并行/串行执行复杂任务
 * 支持任务分解、Agent间通信、结果聚合和冲突解决
 */
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
/**
 * 预定义的Agent角色
 */
export const PREDEFINED_ROLES = [
    {
        id: 'architect',
        name: '系统架构师',
        description: '负责系统设计、架构决策、技术选型',
        systemPrompt: '你是一位资深系统架构师，擅长设计可扩展、高性能的系统架构。分析需求，提出架构方案，评估技术选型的优劣。',
        expertise: ['architecture', 'system-design', 'tech-stack', 'scalability'],
        tools: ['code_semantic_map', 'code_overview', 'git_repo_map', 'web_search'],
        priority: 10,
    },
    {
        id: 'coder',
        name: '代码实现者',
        description: '负责具体的代码实现、功能开发',
        systemPrompt: '你是一位高级全栈工程师，精通多种编程语言和框架。根据架构设计实现具体功能，编写高质量、可维护的代码。',
        expertise: ['coding', 'implementation', 'api-design', 'frontend', 'backend'],
        tools: ['read_file', 'write_file', 'edit_file', 'exec', 'grep'],
        priority: 8,
    },
    {
        id: 'reviewer',
        name: '代码审查员',
        description: '负责代码审查、质量保证、安全审计',
        systemPrompt: '你是一位严格的代码审查员，关注代码质量、安全性、性能最佳实践。发现潜在问题，提出改进建议。',
        expertise: ['code-review', 'quality', 'security', 'best-practices'],
        tools: ['lint_code', 'format_code', 'read_lints', 'type_check', 'read_file'],
        priority: 6,
    },
    {
        id: 'tester',
        name: '测试工程师',
        description: '负责编写和执行测试用例，保证测试覆盖率',
        systemPrompt: '你是一位专业测试工程师，擅长编写全面的测试用例。覆盖单元测试、集成测试、边界条件和异常场景。',
        expertise: ['testing', 'unit-test', 'integration-test', 'coverage'],
        tools: ['write_file', 'exec', 'run_tests', 'grep'],
        priority: 5,
    },
    {
        id: 'devops',
        name: 'DevOps工程师',
        description: '负责CI/CD、部署、容器化、环境管理',
        systemPrompt: '你是一位DevOps专家，擅长CI/CD流水线配置、Docker容器化、环境管理和自动化部署。',
        expertise: ['devops', 'docker', 'ci-cd', 'deployment', 'environment'],
        tools: ['exec', 'sandbox_exec', 'docker', 'read_file', 'write_file'],
        priority: 7,
    },
    {
        id: 'docs',
        name: '文档编写员',
        description: '负责技术文档、API文档、使用指南的编写',
        systemPrompt: '你是一位技术文档专家，擅长将复杂的技术概念转化为清晰易懂的文档。编写API文档、README、使用指南。',
        expertise: ['documentation', 'api-docs', 'tutorial', 'readme'],
        tools: ['write_file', 'read_file', 'edit_file', 'code_semantic_map'],
        priority: 3,
    },
];
/**
 * 多Agent协作协调器
 */
export class MultiAgentCoordinator extends EventEmitter {
    agents = new Map();
    tasks = new Map();
    taskQueue = [];
    isRunning = false;
    maxParallelAgents;
    constructor(maxParallel = 3) {
        super();
        this.maxParallelAgents = maxParallel;
        // 初始化预定义Agent
        for (const role of PREDEFINED_ROLES) {
            this.agents.set(role.id, {
                role,
                status: 'idle',
                assignedTasks: [],
                completedTasks: [],
                failedTasks: [],
                lastActivity: new Date(),
            });
        }
    }
    /**
     * 注册自定义Agent角色
     */
    registerAgent(role) {
        if (this.agents.has(role.id)) {
            logger.warn({ agentId: role.id }, 'Agent已存在，覆盖注册');
        }
        this.agents.set(role.id, {
            role,
            status: 'idle',
            assignedTasks: [],
            completedTasks: [],
            failedTasks: [],
            lastActivity: new Date(),
        });
        logger.info({ agentId: role.id, name: role.name }, 'Agent已注册');
    }
    /**
     * 通过能力标签匹配Agent
     */
    findMatchingAgents(expertise) {
        const available = [...this.agents.values()]
            .filter(a => a.status === 'idle');
        if (available.length === 0)
            return [];
        // 按匹配度和优先级排序
        return available
            .map(agent => {
            const matchScore = expertise.filter(e => agent.role.expertise.includes(e)).length;
            return { agent, matchScore };
        })
            .filter(({ matchScore }) => matchScore > 0)
            .sort((a, b) => {
            // 先按匹配度，再按优先级
            if (b.matchScore !== a.matchScore)
                return b.matchScore - a.matchScore;
            return b.agent.role.priority - a.agent.role.priority;
        })
            .map(({ agent }) => agent);
    }
    /**
     * 分解任务为子任务
     */
    decomposeTask(taskDescription, parentId) {
        // 基于关键词分析任务所需的能力
        const keywords = taskDescription.toLowerCase();
        const subTasks = [];
        let subIndex = 0;
        // 设计阶段
        if (keywords.match(/架构|设计|方案|重构|技术选型/)) {
            subTasks.push({
                id: `${parentId}_design`,
                parentTaskId: parentId,
                description: `架构设计: ${taskDescription}`,
                requiredExpertise: ['architecture', 'system-design'],
                priority: 10,
                dependencies: [],
                maxRetries: 2,
            });
        }
        // 实现阶段
        if (keywords.match(/实现|开发|编写|创建|构建|修复/)) {
            subTasks.push({
                id: `${parentId}_impl_${subIndex++}`,
                parentTaskId: parentId,
                description: `代码实现: ${taskDescription}`,
                requiredExpertise: ['coding', 'implementation'],
                priority: 8,
                dependencies: subTasks.length > 0
                    ? [subTasks[subTasks.length - 1].id]
                    : [],
                maxRetries: 3,
            });
        }
        // 测试阶段
        if (keywords.match(/测试|test|验证|检查/)) {
            subTasks.push({
                id: `${parentId}_test_${subIndex++}`,
                parentTaskId: parentId,
                description: `测试验证: ${taskDescription}`,
                requiredExpertise: ['testing', 'unit-test'],
                priority: 5,
                dependencies: subTasks
                    .filter(t => t.id.includes('_impl_'))
                    .map(t => t.id),
                maxRetries: 2,
            });
        }
        // 审查阶段
        if (keywords.match(/审查|review|检查代码|质量|安全/)) {
            subTasks.push({
                id: `${parentId}_review_${subIndex++}`,
                parentTaskId: parentId,
                description: `代码审查: ${taskDescription}`,
                requiredExpertise: ['code-review', 'quality'],
                priority: 4,
                dependencies: subTasks
                    .filter(t => t.id.includes('_impl_'))
                    .map(t => t.id),
                maxRetries: 1,
            });
        }
        // 文档阶段
        if (keywords.match(/文档|doc|readme|api文档|注释/)) {
            subTasks.push({
                id: `${parentId}_docs_${subIndex++}`,
                parentTaskId: parentId,
                description: `文档编写: ${taskDescription}`,
                requiredExpertise: ['documentation'],
                priority: 3,
                dependencies: subTasks
                    .filter(t => t.id.includes('_impl_'))
                    .map(t => t.id),
                maxRetries: 2,
            });
        }
        // 部署阶段
        if (keywords.match(/部署|deploy|发布|上线|docker|容器/)) {
            subTasks.push({
                id: `${parentId}_deploy_${subIndex++}`,
                parentTaskId: parentId,
                description: `部署运维: ${taskDescription}`,
                requiredExpertise: ['devops', 'deployment', 'docker'],
                priority: 6,
                dependencies: subTasks
                    .filter(t => t.id.includes('_test_'))
                    .map(t => t.id),
                maxRetries: 2,
            });
        }
        // 如果没有匹配特定阶段，创建通用子任务
        if (subTasks.length === 0) {
            subTasks.push({
                id: `${parentId}_main`,
                parentTaskId: parentId,
                description: taskDescription,
                requiredExpertise: ['coding', 'implementation'],
                priority: 5,
                dependencies: [],
                maxRetries: 3,
            });
        }
        return subTasks;
    }
    /**
     * 创建协作任务
     */
    createTask(description) {
        const taskId = `collab_${Date.now()}`;
        const subTasks = this.decomposeTask(description, taskId);
        const task = {
            id: taskId,
            description,
            subTasks,
            status: 'pending',
            agents: [],
            results: new Map(),
            startTime: new Date().toISOString(),
        };
        this.tasks.set(taskId, task);
        return task;
    }
    /**
     * 将子任务分配给最合适的Agent
     */
    assignSubTask(subTask) {
        const candidates = this.findMatchingAgents(subTask.requiredExpertise);
        if (candidates.length === 0) {
            // 放宽约束：找任何空闲Agent
            const anyIdle = [...this.agents.values()].find(a => a.status === 'idle');
            if (anyIdle) {
                this.assignAgentToTask(anyIdle, subTask);
                return anyIdle;
            }
            return null;
        }
        const bestAgent = candidates[0];
        this.assignAgentToTask(bestAgent, subTask);
        return bestAgent;
    }
    /**
     * 将Agent分配给任务
     */
    assignAgentToTask(agent, subTask) {
        agent.status = 'busy';
        agent.currentTask = subTask.id;
        agent.assignedTasks.push(subTask.id);
        agent.lastActivity = new Date();
        this.emitEvent('subtask_assigned', {
            agentId: agent.role.id,
            subTaskId: subTask.id,
        }, `子任务 "${subTask.description.substring(0, 50)}" 已分配给 ${agent.role.name}`);
    }
    /**
     * 处理完成状态
     */
    completeSubTask(taskId, subTaskId, agentId, success, output, error) {
        const task = this.tasks.get(taskId);
        const agent = this.agents.get(agentId);
        if (!task || !agent)
            return;
        // 找子任务
        const subTask = task.subTasks.find(s => s.id === subTaskId);
        const retries = task.results.get(subTaskId)?.retries || 0;
        const result = {
            subTaskId,
            agentId,
            success,
            output,
            error,
            elapsed: 0,
            retries,
        };
        task.results.set(subTaskId, result);
        agent.lastActivity = new Date();
        if (success) {
            agent.completedTasks.push(subTaskId);
            agent.assignedTasks = agent.assignedTasks.filter(id => id !== subTaskId);
            this.emitEvent('subtask_completed', { agentId, subTaskId, taskId }, `${agent.role.name} 完成了子任务: ${subTask?.description.substring(0, 50)}`);
        }
        else {
            // 检查是否应重试
            if (subTask && retries < subTask.maxRetries) {
                result.retries = retries + 1;
                task.results.set(subTaskId, result);
                agent.status = 'idle';
                agent.currentTask = undefined;
                agent.lastActivity = new Date();
                this.emitEvent('subtask_failed', { agentId, subTaskId, error }, `${agent.role.name} 子任务失败，重试 ${retries + 1}/${subTask.maxRetries}`);
                // 重新加入队列
                this.taskQueue.push(subTask);
            }
            else {
                agent.failedTasks.push(subTaskId);
                this.emitEvent('subtask_failed', { agentId, subTaskId, error }, `${agent.role.name} 子任务最终失败`);
            }
        }
        // 释放Agent
        agent.status = 'idle';
        agent.currentTask = undefined;
        this.emitEvent('agent_idle', { agentId }, `${agent.role.name} 变为空闲`);
        // 检查任务是否完成
        this.checkTaskCompletion(taskId);
    }
    /**
     * 检查任务是否全部完成
     */
    checkTaskCompletion(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return;
        const allDone = task.subTasks.every(st => {
            const result = task.results.get(st.id);
            return result && (result.success || result.retries > (st.maxRetries || 3));
        });
        if (allDone) {
            const allSuccess = [...task.results.values()].every(r => r.success);
            task.status = allSuccess ? 'completed' : 'failed';
            task.endTime = new Date().toISOString();
            this.emitEvent('task_completed', { taskId }, `协作任务 ${allSuccess ? '完成' : '部分失败'}: ${task.description.substring(0, 60)}`);
        }
    }
    /**
     * 运行协作任务（模拟版 - 实际需要 Agent Engine）
     */
    async runCollaborationTask(description) {
        if (this.isRunning) {
            throw new Error('已有协作任务在运行中');
        }
        this.isRunning = true;
        const task = this.createTask(description);
        task.status = 'in_progress';
        this.emitEvent('task_started', { taskId: task.id }, `协作任务开始: ${description.substring(0, 60)}`);
        // 初始化任务队列
        this.taskQueue = [...task.subTasks];
        // 模拟处理每个子任务
        for (const subTask of [...this.taskQueue]) {
            this.taskQueue = this.taskQueue.filter(t => t.id !== subTask.id);
            const agent = this.assignSubTask(subTask);
            if (!agent) {
                // 无可用Agent，任务放入等待
                this.taskQueue.push(subTask);
                continue;
            }
            // 模拟Agent执行
            const success = Math.random() > 0.15; // 85%成功率
            this.completeSubTask(task.id, subTask.id, agent.role.id, success, success ? `[${agent.role.name}] 完成任务: ${subTask.description}` : undefined, success ? undefined : '模拟执行失败');
            // 标记agent已分配
            if (!task.agents.includes(agent.role.id)) {
                task.agents.push(agent.role.id);
            }
        }
        this.isRunning = false;
        return task;
    }
    /**
     * 获取Agent状态列表
     */
    getAgentStatus() {
        return [...this.agents.values()].map(a => ({
            id: a.role.id,
            name: a.role.name,
            status: a.status,
            currentTask: a.currentTask,
            totalCompleted: a.completedTasks.length,
            totalFailed: a.failedTasks.length,
        }));
    }
    /**
     * 获取任务统计
     */
    getTaskStats() {
        const tasks = [...this.tasks.values()];
        return {
            total: tasks.length,
            active: tasks.filter(t => t.status === 'in_progress').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            averageSubtasks: tasks.length > 0
                ? tasks.reduce((s, t) => s + t.subTasks.length, 0) / tasks.length
                : 0,
        };
    }
    /**
     * 生成协作报告
     */
    generateReport(taskId) {
        const tasks = taskId
            ? [this.tasks.get(taskId)].filter(Boolean)
            : [...this.tasks.values()];
        const lines = [
            '═══════════════════════════════════════════',
            '       多Agent协作报告',
            '═══════════════════════════════════════════',
            '',
        ];
        const stats = this.getTaskStats();
        lines.push('📊 全局统计:');
        lines.push(`  总任务数: ${stats.total}`);
        lines.push(`  进行中:   ${stats.active}`);
        lines.push(`  已完成:   ${stats.completed}`);
        lines.push(`  失败:     ${stats.failed}`);
        lines.push('');
        lines.push('🤖 Agent状态:');
        for (const agent of this.getAgentStatus()) {
            const statusIcon = agent.status === 'idle' ? '⏳' : agent.status === 'busy' ? '🔄' : '❌';
            lines.push(`  ${statusIcon} ${agent.name} (${agent.id})`);
            lines.push(`     状态: ${agent.status} | 完成: ${agent.totalCompleted} | 失败: ${agent.totalFailed}`);
        }
        lines.push('');
        for (const task of tasks) {
            const statusIcon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '🔄';
            lines.push(`${statusIcon} 任务: ${task.description.substring(0, 80)}`);
            lines.push(`  ID: ${task.id} | 状态: ${task.status}`);
            lines.push(`  子任务: ${task.subTasks.length} 个 | Agent: ${task.agents.join(', ') || '未分配'}`);
            lines.push(`  开始: ${task.startTime}${task.endTime ? ` | 结束: ${task.endTime}` : ''}`);
            lines.push('');
            // 显示子任务结果
            for (const st of task.subTasks) {
                const result = task.results.get(st.id);
                const icon = result?.success ? '✅' : result ? '❌' : '⏳';
                lines.push(`    ${icon} [${st.id}] ${st.description.substring(0, 60)}`);
                if (result?.agentId) {
                    const agent = this.agents.get(result.agentId);
                    lines.push(`       Agent: ${agent?.role.name || result.agentId}`);
                }
                if (result?.error) {
                    lines.push(`       错误: ${result.error.substring(0, 80)}`);
                }
            }
            lines.push('');
        }
        lines.push('═══════════════════════════════════════════');
        return lines.join('\n');
    }
    /**
     * 触发事件
     */
    emitEvent(type, data, message) {
        const event = {
            type,
            taskId: data.taskId,
            subTaskId: data.subTaskId,
            agentId: data.agentId,
            message,
            data,
            timestamp: new Date().toISOString(),
        };
        this.emit(type, event);
        logger.info({ type, ...data }, message);
    }
    /**
     * 重置协调器
     */
    reset() {
        this.tasks.clear();
        this.taskQueue = [];
        this.isRunning = false;
        for (const agent of this.agents.values()) {
            agent.status = 'idle';
            agent.currentTask = undefined;
            agent.assignedTasks = [];
            agent.completedTasks = [];
            agent.failedTasks = [];
            agent.lastActivity = new Date();
        }
    }
}
//# sourceMappingURL=MultiAgentCoordinator.js.map