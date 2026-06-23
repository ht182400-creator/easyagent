/**
 * 管线 API 库 —— HTTP 请求处理
 * 
 * 提供 RESTful API 端点：
 * - GET /api/pipeline    — 管线配置 + KPI + 仪表板详情
 * - GET /api/issues      — 实时解析 memory/*.md 的模块问题
 * - GET /api/status      — 系统状态摘要
 * - GET /api/dashboard/:id — 单个仪表板卡片详情
 * 
 * 所有端点均支持 CORS，返回 JSON。
 */

import { parseMemoryIssues } from './pipeline-parser.mjs';
import {
  getPipelineView, generateDashboardDetails,
  getKPI, SCORE_HISTORY, KPI_DEFAULTS,
  generateTestDetailPanel,
} from './pipeline-config.mjs';

/**
 * 创建管线 API 路由处理器
 * @param {string} memoryDir - .codebuddy/memory 目录路径
 * @param {string} cacheFilePath - 缓存文件路径
 * @returns {Function} (url, res) => void
 */
export function createApiHandler(memoryDir, cacheFilePath) {
  /**
   * 处理 API 请求
   * @param {URL} url - 解析后的 URL
   * @param {import('http').ServerResponse} res - HTTP 响应对象
   */
  return function handleApi(url, res) {
    const pathname = url.pathname;

    try {
      // ---- /api/issues ---- //
      if (pathname === '/api/issues') {
        const result = parseMemoryIssues(memoryDir, cacheFilePath);
        sendJson(res, 200, result);
        return true;
      }

      // ---- /api/pipeline ---- //
      if (pathname === '/api/pipeline') {
        const pipelineView = getPipelineView();
        const kpi = getKPI();  // 每次请求动态计算
        sendJson(res, 200, {
          pipeline: pipelineView,
          kpi,
          scoreHistory: SCORE_HISTORY,
        });
        return true;
      }

      // ---- /api/dashboard ---- //
      if (pathname === '/api/dashboard') {
        const kpi = getKPI();  // 每次请求动态计算
        const details = generateDashboardDetails(kpi);
        sendJson(res, 200, details);
        return true;
      }

      // ---- /api/dashboard/:id ---- //
      const dashMatch = pathname.match(/^\/api\/dashboard\/(\w+)$/);
      if (dashMatch) {
        const cardId = dashMatch[1];
        const kpi = getKPI();  // 每次请求动态计算
        const details = generateDashboardDetails(kpi);
        if (details[cardId]) {
          sendJson(res, 200, details[cardId]);
        } else {
          sendJson(res, 404, { error: `卡片 '${cardId}' 不存在` });
        }
        return true;
      }

      // ---- /api/status ---- //
      if (pathname === '/api/status') {
        const result = parseMemoryIssues(memoryDir, cacheFilePath);
        const pv = getPipelineView();
        // 计算总模块数: 主线阶段 + 分支
        let totalModules = 0;
        for (const phase of pv.phases) totalModules += (phase.nodes || []).length;
        for (const branch of pv.branches) totalModules += (branch.nodes || []).length;
        sendJson(res, 200, {
          generatedAt: result._generatedAt,
          totalIssues: result._totalIssues,
          sourceFiles: result._sourceFiles,
          cacheStats: result._cacheStats,
          pipeline: { phases: pv.phases.length, modules: totalModules },
        });
        return true;
      }

      // ---- /api/modules ---- //
      if (pathname === '/api/modules') {
        const pipelineView = getPipelineView();
        const allModules = [];
        for (const phase of pipelineView.phases) {
          for (const node of phase.nodes) {
            allModules.push({
              id: node.id,
              name: node.label,
              phase: phase.id,
              status: node.status,
              desc: node.desc,
              icon: node.icon,
            });
          }
        }
        for (const branch of pipelineView.branches) {
          for (const node of branch.nodes) {
            allModules.push({
              id: node.id,
              name: node.label,
              phase: branch.id,
              status: node.status,
              desc: node.desc,
              icon: node.icon,
            });
          }
        }
        sendJson(res, 200, { modules: allModules, total: allModules.length });
        return true;
      }

      // ---- /api/test-detail ---- //
      if (pathname === '/api/test-detail') {
        const panel = generateTestDetailPanel();
        sendJson(res, 200, panel);
        return true;
      }

    } catch (e) {
      console.error('[api] 请求处理错误:', e.message);
      sendJson(res, 500, { error: '服务器内部错误', detail: e.message });
      return true;
    }

    return false; // 不是 API 请求
  };
}

/**
 * 发送 JSON 响应
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {Object} data
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data, null, 2));
}
