/**
 * SWE-Bench 评测工具集
 */
import type { ITool } from './ToolRegistry.js';
/** 清除引擎缓存（测试用） */
export declare function resetBenchmarkEngine(): void;
/**
 * 加载 SWE-Bench 数据集
 */
export declare const LoadBenchmarkTool: ITool;
/**
 * 运行 SWE-Bench 评测
 */
export declare const RunBenchmarkTool: ITool;
/**
 * 查看评测结果报告
 */
export declare const BenchmarkReportTool: ITool;
/**
 * 扫描 SWE-Bench 数据
 */
export declare const BenchmarkScanTool: ITool;
/** SWE-Bench 评测工具集 */
export declare const BenchmarkTools: ITool[];
//# sourceMappingURL=BenchmarkTools.d.ts.map