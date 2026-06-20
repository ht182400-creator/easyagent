/// <reference types="node" />
/**
 * 多Agent协作协调器
 * 管理多个专业Agent并行/串行执行复杂任务
 * 支持任务分解、Agent间通信、结果聚合和冲突解决
 */
import { EventEmitter } from 'events';
/** Agent角色定义 */
export interface AgentRole {
    id: string;
    name: string;
    description: string;
    /** 系统提示（角色定位+能力描述） */
    systemPrompt: string;
    /** 该角色擅长处理的任务类型 */
    expertise: string[];
    /** 需要的工具列表 */
    tools: string[];
    /** 优先级（数字越大越优先分配） */
    priority: number;
}
/** 子任务定义 */
export interface SubTask {
    id: string;
    parentTaskId: string;
    description: string;
    /** 所需能力标签（用于匹配Agent） */
    requiredExpertise: string[];
    /** 该子任务的优先级 */
    priority: number;
    /** 该子任务依赖的其他子任务ID */
    dependencies: string[];
    /** 尝试次数限制 */
    maxRetries: number;
}
/** Agent实例状态 */
export interface AgentInstance {
    role: AgentRole;
    status: 'idle' | 'busy' | 'error';
    currentTask?: string;
    assignedTasks: string[];
    completedTasks: string[];
    failedTasks: string[];
    lastActivity: Date;
}
/** 协作任务 */
export interface CollaborationTask {
    id: string;
    description: string;
    subTasks: SubTask[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    agents: string[];
    results: Map<string, CollaborationResult>;
    startTime: string;
    endTime?: string;
    metadata?: Record<string, unknown>;
}
/** 单个子任务的协作结果 */
export interface CollaborationResult {
    subTaskId: string;
    agentId: string;
    success: boolean;
    output?: string;
    error?: string;
    tokenUsage?: {
        input: number;
        output: number;
    };
    elapsed: number;
    retries: number;
}
/** 协作事件 */
export type CollaborationEventType = 'task_started' | 'task_completed' | 'subtask_assigned' | 'subtask_started' | 'subtask_completed' | 'subtask_failed' | 'agent_idle' | 'agent_busy' | 'conflict_detected' | 'error';
export interface CollaborationEvent {
    type: CollaborationEventType;
    taskId?: string;
    subTaskId?: string;
    agentId?: string;
    message: string;
    data?: Record<string, unknown>;
    timestamp: string;
}
/**
 * 预定义的Agent角色
 */
export declare const PREDEFINED_ROLES: AgentRole[];
/**
 * 多Agent协作协调器
 */
export declare class MultiAgentCoordinator extends EventEmitter {
    private agents;
    private tasks;
    private taskQueue;
    private isRunning;
    private maxParallelAgents;
    constructor(maxParallel?: number);
    /**
     * 注册自定义Agent角色
     */
    registerAgent(role: AgentRole): void;
    /**
     * 通过能力标签匹配Agent
     */
    findMatchingAgents(expertise: string[]): AgentInstance[];
    /**
     * 分解任务为子任务
     */
    decomposeTask(taskDescription: string, parentId: string): SubTask[];
    /**
     * 创建协作任务
     */
    createTask(description: string): CollaborationTask;
    /**
     * 将子任务分配给最合适的Agent
     */
    assignSubTask(subTask: SubTask): AgentInstance | null;
    /**
     * 将Agent分配给任务
     */
    private assignAgentToTask;
    /**
     * 处理完成状态
     */
    completeSubTask(taskId: string, subTaskId: string, agentId: string, success: boolean, output?: string, error?: string): void;
    /**
     * 检查任务是否全部完成
     */
    private checkTaskCompletion;
    /**
     * 运行协作任务（模拟版 - 实际需要 Agent Engine）
     */
    runCollaborationTask(description: string): Promise<CollaborationTask>;
    /**
     * 获取Agent状态列表
     */
    getAgentStatus(): Array<{
        id: string;
        name: string;
        status: string;
        currentTask?: string;
        totalCompleted: number;
        totalFailed: number;
    }>;
    /**
     * 获取任务统计
     */
    getTaskStats(): {
        total: number;
        active: number;
        completed: number;
        failed: number;
        averageSubtasks: number;
    };
    /**
     * 生成协作报告
     */
    generateReport(taskId?: string): string;
    /**
     * 触发事件
     */
    private emitEvent;
    /**
     * 重置协调器
     */
    reset(): void;
}
//# sourceMappingURL=MultiAgentCoordinator.d.ts.map