/** SWE-Bench 问题定义 */
export interface SWEBenchProblem {
    id: string;
    repo: string;
    instance_id: string;
    base_commit: string;
    issue_title: string;
    issue_body: string;
    hint_text?: string;
    patch?: string;
    test_patch?: string;
    fail_to_pass: string[];
    pass_to_pass: string[];
    created_at: string;
    version: string;
    difficulty?: 'easy' | 'medium' | 'hard';
}
/** 评估结果 */
export interface EvaluationResult {
    problemId: string;
    passed: boolean;
    score: number;
    details: {
        resolved: boolean;
        testResults?: {
            total: number;
            passed: number;
            failed: number;
            errors: string[];
        };
        patchGenerated?: string;
        tokenUsage?: {
            inputTokens: number;
            outputTokens: number;
        };
        timeElapsed: number;
        attempts: number;
    };
    metadata?: Record<string, unknown>;
}
/** 评测会话 */
export interface EvaluationSession {
    id: string;
    startTime: string;
    problems: string[];
    results: Map<string, EvaluationResult>;
    status: 'idle' | 'running' | 'completed' | 'error';
    progress: {
        total: number;
        completed: number;
        passed: number;
        failed: number;
    };
    summary?: EvaluationSummary;
}
/** 评测摘要 */
export interface EvaluationSummary {
    totalProblems: number;
    resolved: number;
    unresolved: number;
    resolutionRate: number;
    averageTime: number;
    averageTokens: {
        input: number;
        output: number;
    };
    byDifficulty: Record<string, {
        total: number;
        resolved: number;
    }>;
    topErrors: Array<{
        message: string;
        count: number;
    }>;
}
/** 框架配置 */
export interface BenchmarkConfig {
    dataDir: string;
    resultsDir: string;
    maxProblems?: number;
    filterDifficulty?: 'easy' | 'medium' | 'hard';
    filterRepos?: string[];
    timeoutPerProblem?: number;
    parallel?: number;
}
/**
 * SWE-Bench 评测引擎
 */
export declare class SWEBenchEngine {
    private config;
    private problems;
    private session;
    constructor(config: BenchmarkConfig);
    /**
     * 从标准 SWE-Bench JSONL 文件加载问题
     */
    loadProblems(dataPath?: string): SWEBenchProblem[];
    /**
     * 从单个文件加载
     */
    private loadFromFile;
    /**
     * 推断问题难度
     */
    private inferDifficulty;
    /**
     * 应用过滤器
     */
    private applyFilters;
    /**
     * 获取已加载的问题列表
     */
    getProblems(): SWEBenchProblem[];
    /**
     * 创建评测会话
     */
    createSession(problemIds?: string[]): EvaluationSession;
    /**
     * 记录单个问题的评测结果
     */
    recordResult(problemId: string, result: EvaluationResult): void;
    /**
     * 生成评测摘要
     */
    generateSummary(): EvaluationSummary;
    /**
     * 保存评测结果到文件
     */
    saveResults(outputPath?: string): string;
    /**
     * 格式化评测报告文本
     */
    formatReport(): string;
    /**
     * 获取当前会话
     */
    getSession(): EvaluationSession | null;
    /**
     * 重置引擎
     */
    reset(): void;
}
/**
 * 从目录扫描 SWE-Bench 格式的数据
 */
export declare function scanSWEBenchData(dataDir: string): {
    files: string[];
    problemCount: number;
};
//# sourceMappingURL=SWEBenchEngine.d.ts.map