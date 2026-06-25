/**
 * 统一模块注册表 —— 项目全景管线的唯一数据源
 * 
 * 所有其他文件（test-case-mapping.json, pipeline-data.json, update-progress.mjs）
 * 均从此文件生成，不再有分散的数据源。
 * 
 * 用法:
 *   import { MODULE_REGISTRY, getModuleById, getAllModules, getTestFilesForModule } from './module-registry.mjs';
 * 
 * 数据流:
 *   module-registry.mjs (唯一权威源)
 *     ├──→ test-case-mapping.json (由 update-progress 从本文件生成)
 *     ├──→ pipeline-data.json phases/branches 节点列表 (由本文件定义)
 *     ├──→ getKPI() 测试覆盖计算 (读取 mapping + vitest)
 *     └──→ dashboard 展示 (通过 API 的 getPipelineView())
 */

/**
 * @typedef {Object} ModuleDef
 * @property {string} id - 唯一模块 ID (f1-f16, p5a-p5c, b1a-b3c)
 * @property {string} name - 显示名称
 * @property {string} icon - emoji 图标
 * @property {string} desc - 描述
 * @property {string} phase - 所属阶段 P0-P5
 * @property {string} [branch] - 所属分支 B1-B3 (可选)
 * @property {string[]} testFiles - 关联的测试文件相对路径 (相对于 packages/)
 * @property {'done'|'in-progress'|'pending'} status - 状态
 * @property {string[]} [tags] - 标签
 */

/** @type {Record<string, ModuleDef>}  */
export const MODULE_REGISTRY = {
  // ==================== P0: 基础层 ====================
  f1: {
    id: 'f1', name: '多模型适配器', icon: '🔌',
    desc: '10家国产大模型\nOpenAI兼容+自有API',
    phase: 'P0', status: 'done',
    tags: ['models', 'api'],
    testFiles: [
      'core/src/__tests__/adapter-factory.test.ts',
      'core/src/__tests__/model-registry.test.ts',
    ],
  },
  f2: {
    id: 'f2', name: 'Agent 系统', icon: '🧠',
    desc: 'ReAct循环\n多Agent协作+计划',
    phase: 'P0', status: 'done',
    tags: ['agent', 'core'],
    testFiles: [
      'core/src/__tests__/agent-engine.test.ts',
      'core/src/__tests__/session-manager.test.ts',
      'core/src/__tests__/config-manager.test.ts',
      'core/src/__tests__/core.test.ts',
      'core/src/__tests__/semantic.test.ts',
      'core/src/__tests__/automation-manager.test.ts',
    ],
  },
  f3: {
    id: 'f3', name: '工具系统 51 tools', icon: '🔧',
    desc: '17分组全覆盖\n文件/搜索/Git/知识库',
    phase: 'P0', status: 'done',
    tags: ['tools', 'core'],
    testFiles: [
      'core/src/__tests__/builtin-tools.test.ts',
      'core/src/__tests__/code-tools.test.ts',
      'core/src/__tests__/exec-tools-security.test.ts',
      'core/src/__tests__/file-extra-tools.test.ts',
      'core/src/__tests__/file-tools-security.test.ts',
      'core/src/__tests__/git-advanced-tools.test.ts',
      'core/src/__tests__/preview-media-tools.test.ts',
      'core/src/__tests__/project-tools.test.ts',
      'core/src/__tests__/subagent-db-tools.test.ts',
      'core/src/__tests__/tool-registry.test.ts',
    ],
  },

  // ==================== P1: 交互层 ====================
  f7: {
    id: 'f7', name: 'Ink CLI', icon: '🖥️',
    desc: 'React Terminal\n7组件+10命令',
    phase: 'P1', status: 'done',
    tags: ['cli', 'ui'],
    testFiles: [
      // CLI 功能由 core.test.ts + tool-registry.test.ts 覆盖
      // 前端组件测试集成在 desktop 的 stores 测试中
    ],
  },
  f8: {
    id: 'f8', name: 'Web Dashboard v4', icon: '🌐',
    desc: 'WorkBuddy风格\n10 Store+WS+虚拟滚动',
    phase: 'P1', status: 'done',
    tags: ['web', 'ui', 'dashboard'],
    testFiles: [
      'server/src/__tests__/api.test.ts',
      'server/src/__tests__/chat-session-api.test.ts',
      'server/src/__tests__/provider-config-api.test.ts',
      'server/src/__tests__/static-files.test.ts',
      'server/src/__tests__/websocket.test.ts',
      'desktop/src/__tests__/stores/chatStore.test.ts',
      'desktop/src/__tests__/stores/sessionStore.test.ts',
      'desktop/src/__tests__/stores/uiStore.test.ts',
      'desktop/src/__tests__/components/StatusBar.test.tsx',
      'desktop/src/__tests__/components/TabBar.test.tsx',
    ],
  },
  f9: {
    id: 'f9', name: 'Desktop 原生应用', icon: '🖼️',
    desc: 'Electron+React\n六件套+系统托盘',
    phase: 'P1', status: 'done',
    tags: ['desktop', 'electron'],
    testFiles: [
      'desktop/src/__tests__/ipc/preload.test.ts',
    ],
  },

  // ==================== P2: 扩展层 ====================
  f4: {
    id: 'f4', name: '知识库 RAG', icon: '📚',
    desc: '双作用域架构\n5工具+HTTP API',
    phase: 'P2', status: 'done',
    tags: ['rag', 'knowledge'],
    testFiles: [
      'core/src/__tests__/knowledge-service.test.ts',
      'core/src/__tests__/knowledge-tools.test.ts',
    ],
  },
  f5: {
    id: 'f5', name: 'MCP 协议', icon: '🔗',
    desc: 'JSON-RPC stdio\n多Server+工具发现',
    phase: 'P2', status: 'done',
    tags: ['mcp', 'protocol'],
    testFiles: [
      'core/src/__tests__/mcp-client.test.ts',
    ],
  },
  f6: {
    id: 'f6', name: '沙箱执行环境', icon: '📦',
    desc: 'Docker+本地降级\n3种模式自动检测',
    phase: 'P2', status: 'done',
    tags: ['sandbox', 'security'],
    testFiles: [
      'core/src/__tests__/sandbox.test.ts',
    ],
  },

  // ==================== P3: 平台层 ====================
  f10: {
    id: 'f10', name: '插件与技能系统', icon: '🧩',
    desc: 'PluginManager\n6内置技能+钩子',
    phase: 'P3', status: 'done',
    tags: ['plugin', 'skills'],
    testFiles: [
      'core/src/__tests__/plugin-manager.test.ts',
      'core/src/__tests__/plugins-skills.test.ts',
    ],
  },
  f11: {
    id: 'f11', name: 'IM 适配器', icon: '💬',
    desc: 'Telegram/飞书/微信\n3平台消息路由',
    phase: 'P3', status: 'done',
    tags: ['im', 'messaging'],
    testFiles: [
      'core/src/__tests__/feishu-adapter.test.ts',
      'core/src/__tests__/im-adapters.test.ts',
      'core/src/__tests__/telegram-adapter.test.ts',
      'core/src/__tests__/wechat-adapter.test.ts',
      'core/src/__tests__/wechat-crypto.test.ts',
    ],
  },
  f12: {
    id: 'f12', name: 'i18n 国际化', icon: '🌍',
    desc: 'zh-CN/en-US\n完整消息表',
    phase: 'P3', status: 'done',
    tags: ['i18n', 'l10n'],
    testFiles: [
      // i18n 由 utils.test.ts 中的国际化用例覆盖
    ],
  },

  // ==================== P4: 发布层 ====================
  f13: {
    id: 'f13', name: 'Desktop 自动升级', icon: '🔄',
    desc: 'electron-updater\n静默检查+进度+重启',
    phase: 'P4', status: 'done',
    tags: ['desktop', 'auto-update'],
    testFiles: [
      'desktop/src/__tests__/main/version.test.ts',
    ],
  },
  f14: {
    id: 'f14', name: '模型目录动态更新', icon: '📋',
    desc: 'GitHub/CDN双源\n24h缓存+三级降级',
    phase: 'P4', status: 'done',
    tags: ['models', 'release'],
    testFiles: [
      // model-registry.test.ts 已归属 f1
    ],
  },
  f15: {
    id: 'f15', name: '全面去硬编码', icon: '🎯',
    desc: '模型/模板/命令\n动态加载+智能默认',
    phase: 'P4', status: 'done',
    tags: ['refactor', 'config'],
    testFiles: [
      // 清理型重构，无专属测试文件
    ],
  },
  f16: {
    id: 'f16', name: '版本控制系统', icon: '🏷️',
    desc: 'version.json唯一源\nCHANGELOG+升级API',
    phase: 'P4', status: 'done',
    tags: ['version', 'release'],
    testFiles: [
      // server auto-upgrade tests covered in api.test.ts
    ],
  },

  // ==================== P5: 管线运维 ====================
  p5a: {
    id: 'p5a', name: '管线数据看板', icon: '🗺️',
    desc: '全量数据可视化\nKPI仪表板+问题追踪',
    phase: 'P5', status: 'done',
    tags: ['pipeline', 'dashboard'],
    testFiles: [
      'core/src/__tests__/automation-knowledge-api.test.ts',
      'server/src/__tests__/automation-knowledge-api.test.ts',
    ],
  },
  p5b: {
    id: 'p5b', name: '自动数据采集', icon: '📡',
    desc: 'pipeline-data.json\nmemory实时解析+缓存',
    phase: 'P5', status: 'done',
    tags: ['pipeline', 'data'],
    testFiles: [
      'server/src/__tests__/middleware-security.test.ts',
    ],
  },
  p5c: {
    id: 'p5c', name: '实时问题追踪', icon: '🔍',
    desc: 'MD文件解析\n模块级追溯+统计',
    phase: 'P5', status: 'done',
    tags: ['pipeline', 'issues'],
    testFiles: [
      'core/src/__tests__/analytics.test.ts',
    ],
  },

  // ==================== B1: 架构优化分支 ====================
  b1a: {
    id: 'b1a', name: 'Web↔Desktop 前端合并', icon: '🔀',
    desc: 'packages/frontend\n消除80%代码重复',
    phase: 'P4', branch: 'B1', status: 'done',
    tags: ['merge', 'frontend'],
    testFiles: [],
  },
  b1b: {
    id: 'b1b', name: 'PluginManager 沙箱', icon: '🛡️',
    desc: '插件隔离+权限\n安全审计日志',
    phase: 'P4', branch: 'B1', status: 'done',
    tags: ['plugin', 'security'],
    testFiles: [
      'core/src/__tests__/plugin-sandbox.test.ts',
    ],
  },

  // ==================== B2: 质量保障分支 ====================
  b2a: {
    id: 'b2a', name: 'SWE-bench 评测体系', icon: '📊',
    desc: '自动化评测\n数据集+评分算法',
    phase: 'P4', branch: 'B2', status: 'done',
    tags: ['benchmark', 'quality'],
    testFiles: [],
  },
  b2b: {
    id: 'b2b', name: 'GitHub Actions CI/CD', icon: '⚙️',
    desc: 'CI 6 jobs全通过\nWindows+Linux矩阵',
    phase: 'P4', branch: 'B2', status: 'done',
    tags: ['ci', 'devops'],
    testFiles: [],
  },
  b2c: {
    id: 'b2c', name: '集成测试·端到端', icon: '🧪',
    desc: '106个端到端测试\npipeline自动化',
    phase: 'P4', branch: 'B2', status: 'done',
    tags: ['testing', 'e2e'],
    testFiles: [
      'core/src/__tests__/utils.test.ts',
      'core/src/__tests__/encryption.test.ts',
    ],
  },
  b2d: {
    id: 'b2d', name: '多模型评测排行榜', icon: '📈',
    desc: '10模型对比\n性能+准确率排名',
    phase: 'P4', branch: 'B2', status: 'done',
    tags: ['benchmark', 'models'],
    testFiles: [],
  },
  b2e: {
    id: 'b2e', name: '用户行为埋点', icon: '📡',
    desc: '分析事件追踪\n用户路径+漏斗',
    phase: 'P4', branch: 'B2', status: 'done',
    tags: ['analytics', 'telemetry'],
    testFiles: [],
  },

  // ==================== B3: 生态建设分支 ====================
  b3a: {
    id: 'b3a', name: '一键安装脚本', icon: '📜',
    desc: 'install.sh/ps1\n全平台零依赖部署',
    phase: 'P4', branch: 'B3', status: 'done',
    tags: ['install', 'devops'],
    testFiles: [],
  },
  b3b: {
    id: 'b3b', name: 'VS Code 插件', icon: '🧩',
    desc: '内嵌终端+补全\n配置同步+热键',
    phase: 'P4', branch: 'B3', status: 'done',
    tags: ['vscode', 'extension'],
    testFiles: [],
  },
  b3c: {
    id: 'b3c', name: 'Contributor 引导', icon: '🤝',
    desc: 'CONTRIBUTING.md\nissue模板+PR检查清单',
    phase: 'P4', branch: 'B3', status: 'done',
    tags: ['community', 'docs'],
    testFiles: [],
  },
};

/** Phase 定义 */
export const PHASE_DEFINITIONS = [
  { id: 'P0', label: 'P0 基础层', period: '2026 Q2 早期', nodeIds: ['f1', 'f2', 'f3'] },
  { id: 'P1', label: 'P1 交互层', period: '2026 Q2 中期', nodeIds: ['f7', 'f8', 'f9'] },
  { id: 'P2', label: 'P2 扩展层', period: '2026 Q2 中后期', nodeIds: ['f4', 'f5', 'f6'] },
  { id: 'P3', label: 'P3 平台层', period: '2026 Q2 后期', nodeIds: ['f10', 'f11', 'f12'] },
  { id: 'P4', label: 'P4 发布层', period: '2026-06-20 ~ 06-22', nodeIds: ['f13', 'f14', 'f15', 'f16'] },
  { id: 'P5', label: 'P5 管线运维', period: '2026-06-22 ~ 进行中', nodeIds: ['p5a', 'p5b', 'p5c'] },
];

/** Branch 定义 */
export const BRANCH_DEFINITIONS = [
  { id: 'B1', label: 'P1 架构优化分支', sourcePhase: 'P4', nodeIds: ['b1a', 'b1b'] },
  { id: 'B2', label: 'P2 质量保障分支', sourcePhase: 'P4', nodeIds: ['b2a', 'b2b', 'b2c', 'b2d', 'b2e'] },
  { id: 'B3', label: 'P3 生态建设分支', sourcePhase: 'P4', nodeIds: ['b3a', 'b3b', 'b3c'] },
];

/** 获取所有模块 ID 列表 */
export function getAllModuleIds() {
  return Object.keys(MODULE_REGISTRY);
}

/** 获取指定模块定义 */
export function getModuleById(id) {
  return MODULE_REGISTRY[id] || null;
}

/** 获取模块的所有测试文件路径 */
export function getTestFilesForModule(id) {
  return MODULE_REGISTRY[id]?.testFiles || [];
}

/**
 * 构建测试文件 → 模块 ID 的反向映射
 * @returns {Map<string, string>}
 */
export function buildFileToModuleMap() {
  const map = new Map();
  for (const [modId, mod] of Object.entries(MODULE_REGISTRY)) {
    for (const f of (mod.testFiles || [])) {
      const normalized = f.replace(/\\/g, '/').toLowerCase();
      if (!map.has(normalized)) {
        map.set(normalized, modId);
      }
    }
  }
  return map;
}

/**
 * 统计有测试文件的模块 vs 无测试文件的模块
 */
export function getModuleTestCoverage() {
  const withTests = [];
  const withoutTests = [];
  for (const [id, mod] of Object.entries(MODULE_REGISTRY)) {
    if (mod.testFiles && mod.testFiles.length > 0) {
      withTests.push(id);
    } else {
      withoutTests.push(id);
    }
  }
  return { withTests, withoutTests };
}
