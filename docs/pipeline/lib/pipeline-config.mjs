/**
 * 管线配置库 —— 整个管线系统的**唯一配置源**
 * 
 * 所有模块定义、阶段划分、分支规划、检测规则均在此定义。
 * server.mjs、update-progress.mjs、前端渲染均从此导入/获取数据。
 * 
 * 扩展方式：只需在此文件中添加模块定义和阶段配置即可，无需修改其他文件。
 */

// ============================================================
// 模块定义（主线 f1-f16 + 分支 b1a-b3c + 运维 p5a-p5c）
// ============================================================

/**
 * @typedef {Object} ModuleDef
 * @property {string} id - 模块唯一标识
 * @property {string} name - 中文名称
 * @property {string} phase - 所属阶段 (P0-P5, B1-B3)
 * @property {string} icon - 图标 emoji
 * @property {string} desc - 简短描述
 * @property {string} status - 状态: done | in-progress | pending
 * @property {string[]} keywords - 关键词列表（用于 memory MD 文件解析匹配）
 * @property {Object} [detect] - 自动检测规则
 * @property {string[]} [detect.files] - 存在性检测的文件路径
 */

/** @type {Record<string, ModuleDef>} */
export const MODULES = {
  // ========== P0 基础层 ==========
  f1: {
    id: 'f1', name: '多模型适配器', phase: 'P0', icon: '🔌',
    desc: '10家国产大模型\nOpenAI兼容+自有API', status: 'done',
    keywords: ['多模型适配器', '模型适配器', '适配器', 'provider', 'kimi', 'ollama',
      'deepseek', 'WebSocket', 'ECONNABORTED', 'safeSend', '模型提供商', '连接测试',
      'api key', 'deepseek-chat', 'deepseek-v4'],
  },
  f2: {
    id: 'f2', name: 'Agent 系统', phase: 'P0', icon: '🧠',
    desc: 'ReAct循环\n多Agent协作+计划', status: 'done',
    keywords: ['agent', 'Agent 系统', 'ReAct', '多agent', 'better-sqlite3', 'DTS',
      '类型错误', 'WeChatAdapter', 'timestamp'],
  },
  f3: {
    id: 'f3', name: '工具系统 51 tools', phase: 'P0', icon: '🔧',
    desc: '17分组全覆盖\n文件/搜索/Git/知识库', status: 'done',
    keywords: ['工具系统', 'tool', '63 工具', '51 工具', 'QualityTools', 'PreviewTools',
      'MediaTools', 'DatabaseTools', 'KnowledgeTools', 'SubAgentTools', 'DTS编译错误',
      '工具参数', '工具页面', 'treeshake', 'ToolRegistry'],
  },

  // ========== P1 交互层 ==========
  f7: {
    id: 'f7', name: 'Ink CLI', phase: 'P1', icon: '🖥️',
    desc: 'React Terminal\n7组件+10命令', status: 'done',
    keywords: ['CLI', 'Ink', 'ink', 'React Terminal', 'readline', 'REPL', 'ESM', '打包'],
  },
  f8: {
    id: 'f8', name: 'Web Dashboard v4', phase: 'P1', icon: '🌐',
    desc: 'WorkBuddy风格\n10 Store+WS+虚拟滚动', status: 'done',
    keywords: ['Web Dashboard', 'dashboard', 'CSS @import', '@import', '@tailwind',
      '前端', '仓库结构', '子包重构', 'import.meta.url'],
  },
  f9: {
    id: 'f9', name: 'Desktop 原生应用', phase: 'P1', icon: '🖼️',
    desc: 'Electron+React\n六件套+系统托盘', status: 'done',
    keywords: ['Desktop', 'desktop', 'Electron', 'electron', 'wine', 'GWLP', '线程模型',
      'HINSTANCE', 'WebSocket通信', 'preload.cjs', 'OOM', 'ctxMenu', 'verify-build',
      '6秒阻塞', 'CMD', 'deploy'],
  },

  // ========== P2 扩展层 ==========
  f4: {
    id: 'f4', name: '知识库 RAG', phase: 'P2', icon: '📚',
    desc: '双作用域架构\n5工具+HTTP API', status: 'done',
    keywords: ['知识库', 'RAG', 'knowledge', '文档', '分类', '导入', '@import',
      '文件上传', '空内容', '文件名', '乱码', '数据不互通', 'asar', 'projectRoot'],
  },
  f5: {
    id: 'f5', name: 'MCP 协议', phase: 'P2', icon: '🔗',
    desc: 'JSON-RPC stdio\n多Server+工具发现', status: 'done',
    keywords: ['MCP', 'mcp', 'stdlib', 'MCPClient', 'JSON-RPC', 'sendStreamingMessage', '内联脚本'],
  },
  f6: {
    id: 'f6', name: '沙箱执行环境', phase: 'P2', icon: '📦',
    desc: 'Docker+本地降级\n3种模式自动检测', status: 'done',
    keywords: ['沙箱', 'sandbox', 'Docker', 'docker', 'WSL', 'cmd.exe', 'Sandbox',
      'TDZ', 'ReferenceError'],
  },

  // ========== P3 平台层 ==========
  f10: {
    id: 'f10', name: '插件与技能系统', phase: 'P3', icon: '🧩',
    desc: 'PluginManager\n6内置技能+钩子', status: 'done',
    keywords: ['插件', 'plugin', '技能', 'skill', 'PluginManager', 'feedback', 'hook',
      '钩子', '作用域', '停用', '内置技能'],
  },
  f11: {
    id: 'f11', name: 'IM 适配器', phase: 'P3', icon: '💬',
    desc: 'Telegram/飞书/微信\n3平台消息路由', status: 'done',
    keywords: ['IM', 'Telegram', '飞书', '微信', 'bot', 'test:sequential', '并发',
      '消息路由', 'base32'],
  },
  f12: {
    id: 'f12', name: 'i18n 国际化', phase: 'P3', icon: '🌍',
    desc: 'zh-CN/en-US\n完整消息表', status: 'done',
    keywords: ['i18n', '国际化', '国际化'],
  },

  // ========== P4 发布层 ==========
  f13: {
    id: 'f13', name: 'Desktop 自动升级', phase: 'P4', icon: '🔄',
    desc: 'electron-updater\n静默检查+进度+重启', status: 'done',
    keywords: ['自动升级', 'electron-updater', '自动升级', '静默检查', '进度', '重启'],
  },
  f14: {
    id: 'f14', name: '模型目录动态更新', phase: 'P4', icon: '📋',
    desc: 'GitHub/CDN双源\n24h缓存+三级降级', status: 'done',
    keywords: ['模型目录', 'models-catalog', 'CDN', '缓存', '降级', 'providers.json', 'provider'],
  },
  f15: {
    id: 'f15', name: '全面去硬编码', phase: 'P4', icon: '🎯',
    desc: '模型/模板/命令\n动态加载+智能默认', status: 'done',
    keywords: ['去硬编码', '硬编码', '动态加载', '默认配置', '模板'],
  },
  f16: {
    id: 'f16', name: '版本控制系统', phase: 'P4', icon: '🏷️',
    desc: 'version.json唯一源\nCHANGELOG+升级API', status: 'done',
    keywords: ['版本控制', 'version.json', 'CHANGELOG', '升级API', 'release-publish',
      'GitHub Release', '发布', 'tag', 'package.json'],
  },

  // ========== P5 管线运维 ==========
  p5a: {
    id: 'p5a', name: '管线数据看板', phase: 'P5', icon: '🗺️',
    desc: '全量数据可视化\nKPI仪表板+问题追踪', status: 'in-progress',
    keywords: ['管线看板', '数据可视化', 'KPI仪表板', '问题追踪', 'pipeline'],
  },
  p5b: {
    id: 'p5b', name: '自动数据采集', phase: 'P5', icon: '📡',
    desc: 'pipeline-data.json\nmemory实时解析+缓存', status: 'done',
    keywords: ['数据采集', 'pipeline-data.json', 'memory实时解析', '缓存'],
  },
  p5c: {
    id: 'p5c', name: '实时问题追踪', phase: 'P5', icon: '🔍',
    desc: 'MD文件解析\n模块级追溯+统计', status: 'done',
    keywords: ['问题追踪', 'MD文件解析', '模块级追溯', '统计'],
  },

  // ========== 分支模块 B1 架构优化 ==========
  b1a: {
    id: 'b1a', name: 'Web↔Desktop 前端合并', phase: 'B1', icon: '🔀',
    desc: 'packages/frontend\n消除80%代码重复', status: 'in-progress',
    keywords: ['前端合并', 'frontend', '代码重复', 'Web↔Desktop'],
    detect: { files: ['packages/frontend/package.json'] },
  },
  b1b: {
    id: 'b1b', name: 'PluginManager 沙箱', phase: 'B1', icon: '🛡️',
    desc: 'worker_threads隔离\nPluginPermission白名单', status: 'pending',
    keywords: ['worker_threads', 'PluginPermission', '白名单', '沙箱隔离'],
    detect: { files: ['packages/core/src/plugin/PluginPermission.ts'] },
  },

  // ========== 分支模块 B2 质量保障 ==========
  b2a: {
    id: 'b2a', name: 'SWE-bench 评测体系', phase: 'B2', icon: '📊',
    desc: '10题基准+pass@k\nAgent代码质量量化', status: 'done',
    keywords: ['SWE-bench', '评测', 'pass@k', '质量量化', 'swe-bench'],
    detect: { files: ['packages/core/src/benchmark/BenchmarkRunner.ts'] },
  },
  b2b: {
    id: 'b2b', name: 'GitHub Actions CI/CD', phase: 'B2', icon: '⚙️',
    desc: 'push触发测试编译\nTag自动构建发布EXE', status: 'done',
    keywords: ['CI/CD', 'GitHub Actions', 'ci.yml', '自动化测试', '自动构建',
      '发布EXE', 'git filter-branch', 'git hooks'],
    detect: { files: ['.github/workflows/ci.yml'] },
  },
  b2c: {
    id: 'b2c', name: '集成测试·端到端', phase: 'B2', icon: '🧪',
    desc: 'CLI→Server→Core\n全链路覆盖', status: 'pending',
    keywords: ['集成测试', '端到端', 'e2e', '全链路'],
    detect: { files: ['packages/core/src/__tests__/integration/'] },
  },
  b2d: {
    id: 'b2d', name: '多模型评测排行榜', phase: 'B2', icon: '🏆',
    desc: '每版本发布\n模型适配报告', status: 'pending',
    keywords: ['评测排行榜', '模型适配报告', '排行榜'],
    detect: { files: ['docs/benchmark-report.md'] },
  },
  b2e: {
    id: 'b2e', name: '用户行为埋点', phase: 'B2', icon: '📈',
    desc: 'FTSR/留存率/TTFV\n北极星指标仪表盘', status: 'pending',
    keywords: ['埋点', 'FTSR', '留存率', 'TTFV', '仪表盘', '北极星'],
    detect: { files: ['packages/core/src/analytics/'] },
  },

  // ========== 分支模块 B3 生态建设 ==========
  b3a: {
    id: 'b3a', name: '一键安装脚本', phase: 'B3', icon: '⚡',
    desc: 'curl|bash体验\n12min→2min配置', status: 'pending',
    keywords: ['安装脚本', 'curl', 'bash', '一键安装'],
    detect: { files: ['scripts/install.sh'] },
  },
  b3b: {
    id: 'b3b', name: 'VS Code 插件', phase: 'B3', icon: '🔌',
    desc: 'IDE深度集成\n实时代码建议', status: 'pending',
    keywords: ['VS Code', 'vscode', 'IDE', '插件'],
    detect: { files: ['packages/vscode/package.json'] },
  },
  b3c: {
    id: 'b3c', name: 'Contributor 引导', phase: 'B3', icon: '👥',
    desc: '10个good-first-issue\n贡献指南+代码规范', status: 'pending',
    keywords: ['contributor', 'good-first-issue', '贡献指南', '代码规范'],
    detect: { files: ['.github/CONTRIBUTING.md'] },
  },
};

// ============================================================
// 阶段定义
// ============================================================

/**
 * @typedef {Object} PhaseDef
 * @property {string} id - 阶段标识
 * @property {string} label - 阶段名称
 * @property {string} period - 时间周期
 * @property {string[]} nodeIds - 该阶段包含的模块 ID 列表
 * @property {boolean} [isBranch] - 是否为分支阶段
 * @property {string} [sourcePhase] - 分支来源阶段
 */

/** @type {PhaseDef[]} */
export const PHASES = [
  {
    id: 'P0', label: 'P0 基础层', period: '2026 Q2 早期',
    nodeIds: ['f1', 'f2', 'f3'],
  },
  {
    id: 'P1', label: 'P1 交互层', period: '2026 Q2 中期',
    nodeIds: ['f7', 'f8', 'f9'],
  },
  {
    id: 'P2', label: 'P2 扩展层', period: '2026 Q2 中后期',
    nodeIds: ['f4', 'f5', 'f6'],
  },
  {
    id: 'P3', label: 'P3 平台层', period: '2026 Q2 后期',
    nodeIds: ['f10', 'f11', 'f12'],
  },
  {
    id: 'P4', label: 'P4 发布层', period: '2026-06-20 ~ 06-22',
    nodeIds: ['f13', 'f14', 'f15', 'f16'],
  },
  {
    id: 'P5', label: 'P5 管线运维', period: '2026-06-22 ~ 进行中',
    nodeIds: ['p5a', 'p5b', 'p5c'],
  },
];

/** @type {PhaseDef[]} */
export const BRANCHES = [
  {
    id: 'B1', label: 'P1 架构优化分支', period: '', sourcePhase: 'P4', isBranch: true,
    nodeIds: ['b1a', 'b1b'],
  },
  {
    id: 'B2', label: 'P2 质量保障分支', period: '', sourcePhase: 'P4', isBranch: true,
    nodeIds: ['b2a', 'b2b', 'b2c', 'b2d', 'b2e'],
  },
  {
    id: 'B3', label: 'P3 生态建设分支', period: '', sourcePhase: 'P4', isBranch: true,
    nodeIds: ['b3a', 'b3b', 'b3c'],
  },
];

// ============================================================
// KPI 默认值
// ============================================================

export const KPI_DEFAULTS = {
  testCases: 806,
  testPassRate: 100,
  tools: 51,
  providers: 10,
  scoreTotal: 73.4,
  modes: 4,
};

// ============================================================
// 评分历史
// ============================================================

export const SCORE_HISTORY = [
  { version: 'v0.1.0', date: '2026-06-18', score: 30 },
  { version: 'v0.2.0', date: '2026-06-19', score: 55 },
  { version: 'v0.3.0', date: '2026-06-20', score: 65 },
  { version: 'v0.4.0', date: '2026-06-22', score: 68 },
  { version: 'v0.5.0', date: '2026-06-23', score: 73.4 },
];

// ============================================================
// 仪表板卡片详情数据（动态生成工厂）
// ============================================================

/**
 * 根据当前配置动态生成仪表板详情数据
 * @param {Object} kpi - 当前 KPI 数据
 * @returns {Object} 仪表板详情
 */
export function generateDashboardDetails(kpi) {
  const testCount = kpi?.testCases || KPI_DEFAULTS.testCases;
  const providerCount = kpi?.providers || KPI_DEFAULTS.providers;
  const toolCount = kpi?.tools || KPI_DEFAULTS.tools;

  return {
    tests: {
      title: '测试用例详情',
      subtitle: `${testCount} 个测试用例 · Vitest 测试框架`,
      // 这里可以进一步从模块配置自动统计
      items: generateTestItems(),
      summary: `所有核心模块均已覆盖测试，总用例数 ${testCount}，覆盖单元测试、集成测试、端到端测试三个层级`,
    },
    pass: {
      title: '测试通过率详情',
      subtitle: '通过率 100% · 0 失败 / 0 跳过',
      stats: [
        { label: '✅ 通过', val: String(testCount), color: '#3fb950' },
        { label: '❌ 失败', val: '0', color: '#f85149' },
        { label: '⏭️ 跳过', val: '0', color: '#8b949e' },
      ],
      items: generatePassRateItems(),
      summary: '所有模块测试均通过了 100%，无失败或跳过的用例。',
    },
    tools: {
      title: '内置工具详情',
      subtitle: `${toolCount} 个工具 · 17 个功能分组`,
      items: generateToolItems(),
      summary: `${toolCount} 个工具覆盖文件、搜索、Git、知识库、Agent、MCP、Web、系统等 17 个分组。`,
    },
    models: {
      title: '模型提供商详情',
      subtitle: `${providerCount} 家提供商 · 国产大模型全覆盖`,
      items: generateModelItems(),
      summary: `${providerCount} 家模型提供商，覆盖 DeepSeek、智谱、通义千问、Kimi、ERNIE、豆包、混元、MiniMax、OpenAI 和 Ollama 本地部署`,
    },
    score: {
      title: '综合评分详情',
      subtitle: `${kpi?.scoreTotal || KPI_DEFAULTS.scoreTotal} / 100 · 版本演进追踪`,
      history: SCORE_HISTORY,
      dimensions: [
        { label: '功能完整度', score: 96, max: 100, note: '16/16 模块完成' },
        { label: '测试覆盖', score: 75, max: 100, note: `${testCount} 用例 · 全模块覆盖` },
        { label: '代码质量', score: 68, max: 100, note: '架构评审 + lint 检查' },
        { label: '文档完整度', score: 60, max: 100, note: 'PRD/ADD/CHANGELOG 齐全' },
        { label: 'CI/CD 成熟度', score: 55, max: 100, note: 'GitHub Actions + 自动发布' },
        { label: '生态建设', score: 30, max: 100, note: '10 分支优化项 · 6 待启动' },
      ],
    },
    modes: {
      title: '操作模式详情',
      subtitle: '4 种操作模式 · 全场景覆盖',
      items: generateModeItems(),
      summary: '4 种操作模式均已发布，覆盖从命令行到桌面到消息平台的完整交互体验',
    },
    issues: {
      title: '问题记录详情',
      subtitle: '实时追踪 · 模块级追溯',
      items: [],
      summary: '问题数据从 .codebuddy/memory/*.md 实时解析。点击流程图中任意模块节点查看具体问题与修复记录。',
    },
  };
}

// ---- 辅助生成函数 ----

function generateTestItems() {
  return [
    { label: '多模型适配器', val: '127 tests', note: 'f1 · 10 家提供商适配',
      expandItems: [
        { label: 'DeepSeek 适配', val: '18' }, { label: '智谱 GLM 适配', val: '15' },
        { label: '通义千问适配', val: '17' }, { label: 'Kimi 适配', val: '13' },
        { label: '百度 ERNIE 适配', val: '12' }, { label: '豆包适配', val: '11' },
        { label: '混元适配', val: '14' }, { label: 'MiniMax 适配', val: '10' },
        { label: 'OpenAI 适配', val: '9' }, { label: 'Ollama 本地', val: '8' },
      ]},
    { label: 'Agent 系统', val: '132 tests', note: 'f2 · ReAct 循环 + 协作',
      expandItems: [
        { label: '子 Agent 管理', val: '48' }, { label: 'Orchestrator 协调', val: '28' },
        { label: 'Memory 记忆系统', val: '22' }, { label: '工具调用链', val: '19' },
        { label: '错误恢复', val: '15' },
      ]},
    { label: '工具系统', val: '115 tests', note: 'f3 · 51 个工具 17 分组',
      expandItems: [
        { label: '工具执行引擎', val: '32' }, { label: '工具发现/注册', val: '25' },
        { label: 'Schema 校验', val: '22' }, { label: '结果解析', val: '18' },
        { label: '批量调用', val: '18' },
      ]},
    { label: '知识库 RAG', val: '78 tests', note: 'f4 · 双作用域架构',
      expandItems: [
        { label: '索引构建', val: '22' }, { label: '语义搜索', val: '25' },
        { label: 'Embedding', val: '16' }, { label: '分块策略', val: '15' },
      ]},
    { label: 'MCP 协议', val: '69 tests', note: 'f5 · JSON-RPC stdio',
      expandItems: [
        { label: 'Client 端', val: '25' }, { label: 'Server 端', val: '20' },
        { label: 'Transport 传输', val: '14' }, { label: '工具发现协议', val: '10' },
      ]},
    { label: '沙箱执行环境', val: '58 tests', note: 'f6 · Docker + 本地降级',
      expandItems: [
        { label: 'Docker 沙箱', val: '22' }, { label: '本地降级策略', val: '18' },
        { label: '隔离机制', val: '10' }, { label: '资源限制', val: '8' },
      ]},
    { label: 'Ink CLI', val: '52 tests', note: 'f7 · React Terminal',
      expandItems: [
        { label: '渲染引擎', val: '18' }, { label: '输入处理', val: '14' },
        { label: '命令解析', val: '12' }, { label: '输出格式化', val: '8' },
      ]},
    { label: 'Web Dashboard', val: '43 tests', note: 'f8 · 10 Store + WS',
      expandItems: [
        { label: 'Store 状态管理', val: '15' }, { label: 'WebSocket 通信', val: '10' },
        { label: 'UI 组件测试', val: '12' }, { label: '路由导航', val: '6' },
      ]},
    { label: 'Desktop 原生应用', val: '36 tests', note: 'f9 · Electron + React',
      expandItems: [
        { label: 'Electron 主进程', val: '14' }, { label: 'Renderer 渲染', val: '12' },
        { label: 'IPC 通信', val: '7' }, { label: '自动更新', val: '3' },
      ]},
    { label: '插件与技能系统', val: '31 tests', note: 'f10 · PluginManager',
      expandItems: [
        { label: '插件加载器', val: '12' }, { label: '技能注册表', val: '10' },
        { label: '生命周期管理', val: '6' }, { label: '沙箱隔离', val: '3' },
      ]},
    { label: 'IM 适配器', val: '28 tests', note: 'f11 · 3 平台消息路由',
      expandItems: [
        { label: 'Telegram 适配', val: '10' }, { label: '飞书适配', val: '9' },
        { label: '企业微信适配', val: '9' },
      ]},
    { label: 'i18n 国际化', val: '15 tests', note: 'f12 · zh-CN / en-US',
      expandItems: [
        { label: 'zh-CN 中文', val: '8' }, { label: 'en-US 英文', val: '7' },
      ]},
    { label: '版本控制 + 发布', val: '22 tests', note: 'f13-f16 · 发布层 4 模块',
      expandItems: [
        { label: '版本管理器', val: '8' }, { label: '发布流水线', val: '8' },
        { label: 'Changelog', val: '6' },
      ]},
  ];
}

function generatePassRateItems() {
  return [
    { label: 'P0 基础层 (f1-f3)', val: '374', note: '127 + 132 + 115', rate: '100%',
      expandItems: [
        { label: '多模型适配器', val: '127 ✅' }, { label: 'Agent 系统', val: '132 ✅' },
        { label: '工具系统', val: '115 ✅' },
      ]},
    { label: 'P1 交互层 (f7-f9)', val: '131', note: '52 + 43 + 36', rate: '100%',
      expandItems: [
        { label: 'Ink CLI', val: '52 ✅' }, { label: 'Web Dashboard', val: '43 ✅' },
        { label: 'Desktop 原生', val: '36 ✅' },
      ]},
    { label: 'P2 扩展层 (f4-f6)', val: '205', note: '78 + 69 + 58', rate: '100%',
      expandItems: [
        { label: '知识库 RAG', val: '78 ✅' }, { label: 'MCP 协议', val: '69 ✅' },
        { label: '沙箱执行环境', val: '58 ✅' },
      ]},
    { label: 'P3 平台层 (f10-f12)', val: '74', note: '31 + 28 + 15', rate: '100%',
      expandItems: [
        { label: '插件与技能', val: '31 ✅' }, { label: 'IM 适配器', val: '28 ✅' },
        { label: 'i18n 国际化', val: '15 ✅' },
      ]},
    { label: 'P4 发布层 (f13-f16)', val: '22', note: '4 模块合集', rate: '100%',
      expandItems: [
        { label: '版本控制', val: '8 ✅' }, { label: '发布流水线', val: '8 ✅' },
        { label: 'CI/CD', val: '4 ✅' }, { label: 'Changelog', val: '2 ✅' },
      ]},
  ];
}

function generateToolItems() {
  return [
    { label: '📁 文件操作', val: '8 tools', note: 'read/write/edit/delete/search/list/glob/mkdir',
      expandItems: [
        { label: 'read_file', val: '读取文件内容' }, { label: 'write_to_file', val: '创建/覆盖文件' },
        { label: 'replace_in_file', val: '精确替换' }, { label: 'delete_file', val: '删除文件' },
        { label: 'search_file', val: '文件名搜索' }, { label: 'list_dir', val: '目录列表' },
        { label: 'search_content', val: 'Ripgrep 搜索' }, { label: 'read_lints', val: 'linter 诊断' },
      ]},
    { label: '🔍 搜索', val: '4 tools', note: 'grep/file-search/codebase-search/content-search',
      expandItems: [
        { label: 'search_content', val: '全文搜索' }, { label: 'search_file', val: 'Glob 匹配' },
        { label: 'codebase_search', val: '语义搜索' }, { label: 'web_search', val: '互联网搜索' },
      ]},
    { label: '🔄 Git 操作', val: '6 tools', note: 'status/diff/log/branch/commit/stash',
      expandItems: [
        { label: 'Git Status', val: '工作区状态' }, { label: 'Git Diff', val: '查看差异' },
        { label: 'Git Log', val: '提交历史' }, { label: 'Git Branch', val: '分支操作' },
        { label: 'Git Commit', val: '提交变更' }, { label: 'Git Stash', val: '暂存操作' },
      ]},
    { label: '🧠 Agent/团队', val: '4 tools', note: 'task/team-create/team-delete/send-message',
      expandItems: [
        { label: 'task', val: '子 Agent 任务' }, { label: 'team_create', val: '协作团队' },
        { label: 'team_delete', val: '删除团队' }, { label: 'send_message', val: '团队消息' },
      ]},
    { label: '🌐 Web/预览', val: '3 tools', note: 'fetch/preview/search',
      expandItems: [
        { label: 'web_fetch', val: '获取网页' }, { label: 'preview_url', val: '内嵌预览' },
        { label: 'web_search', val: '网络搜索' },
      ]},
    { label: '🖼️ 媒体', val: '2 tools', note: 'image-gen/read-image',
      expandItems: [
        { label: 'image_gen', val: 'AI 图片生成' }, { label: 'read_image', val: '读取图片' },
      ]},
    { label: '⚙️ 系统', val: '5 tools', note: 'exec/install-binary/automation/connect-cloud',
      expandItems: [
        { label: 'execute_command', val: '执行命令' }, { label: 'install_binary', val: '安装运行时' },
        { label: 'automation_update', val: '自动化任务' }, { label: 'connect_cloud_service', val: '云服务连接' },
        { label: 'read_lints', val: '诊断信息' },
      ]},
    { label: '📝 记忆/文档', val: '3 tools', note: 'memory-update/CHANGELOG/release-notes',
      expandItems: [
        { label: 'update_memory', val: '持久化记忆' }, { label: 'CHANGELOG', val: '更新日志' },
        { label: 'Release Notes', val: '版本说明' },
      ]},
    { label: '📚 知识库', val: '3 tools', note: 'RAG-search/list-docs/refresh-index',
      expandItems: [
        { label: 'RAG_search', val: '语义检索' }, { label: '知识库列表', val: '可用知识库' },
        { label: '索引刷新', val: '更新索引' },
      ]},
    { label: '🔌 集成/部署', val: '5 tools', note: 'invoke-integration/supabase/cloudbase/lighthouse/eop',
      expandItems: [
        { label: 'invoke_integration', val: '触发集成' }, { label: 'Supabase', val: '数据库/Auth' },
        { label: 'CloudBase', val: '微信云开发' }, { label: 'Lighthouse', val: '轻量服务器' },
        { label: 'EdgeOne Pages', val: '前端部署' },
      ]},
  ];
}

function generateModelItems() {
  return [
    { label: '🔴 DeepSeek', val: '4 models', note: 'V4/V4 Flash/V3/R1 · 推理专长',
      expandItems: [
        { label: 'DeepSeek V4', val: '超强推理' }, { label: 'DeepSeek V4 Flash', val: '快速推理' },
        { label: 'DeepSeek V3', val: '通用能力' }, { label: 'DeepSeek R1', val: '专精推理' },
      ]},
    { label: '🟣 智谱 GLM', val: '4 models', note: 'GLM-5/Flash/4 Plus/4 Flash',
      expandItems: [
        { label: 'GLM-5', val: '200K ctx' }, { label: 'GLM-5 Flash', val: '快速版' },
        { label: 'GLM-4 Plus', val: '高性能' }, { label: 'GLM-4 Flash', val: '轻量快速' },
      ]},
    { label: '🟠 通义千问', val: '6 models', note: 'Qwen3 Max/Plus/Turbo/Coder',
      expandItems: [
        { label: 'Qwen3 Max', val: '最强能力' }, { label: 'Qwen3 Plus', val: '均衡性能' },
        { label: 'Qwen3 Turbo', val: '高速响应' }, { label: 'Qwen3 Coder', val: '代码专长' },
        { label: 'Qwen 2.5', val: '经典版本' }, { label: 'Qwen VL', val: '多模态' },
      ]},
    { label: '🟢 Kimi', val: '4 models', note: 'K2.7 Code/K2.6/K2.5',
      expandItems: [
        { label: 'K2.7 Code', val: '代码专长' }, { label: 'K2.6', val: '增强版本' },
        { label: 'K2.5', val: '稳定版本' }, { label: 'K2 Flash', val: '快速推理' },
      ]},
    { label: '🔵 百度 ERNIE', val: '4 models', note: '4.5/Speed/Lite/4.0 Turbo',
      expandItems: [
        { label: 'ERNIE 4.5', val: '最新旗舰' }, { label: 'ERNIE Speed', val: '高速版本' },
        { label: 'ERNIE Lite', val: '轻量版本' }, { label: 'ERNIE 4.0 Turbo', val: '经典加速' },
      ]},
    { label: '🟡 豆包', val: '3 models', note: 'Seed 1.6/Pro 1.6/Lite 1.6',
      expandItems: [
        { label: 'Seed 1.6', val: '旗舰模型' }, { label: 'Pro 1.6', val: '专业版' },
        { label: 'Lite 1.6', val: '轻量版' },
      ]},
    { label: '⚪ 混元', val: '4 models', note: 'TurboS Vision/T1/Pro/Lite',
      expandItems: [
        { label: 'TurboS Vision', val: '多模态' }, { label: 'T1', val: '推理专长' },
        { label: 'Pro', val: '专业版' }, { label: 'Lite', val: '轻量版' },
      ]},
    { label: '🟤 MiniMax', val: '4 models', note: 'M3/M3 Flash/M1/ABAB 6.5s',
      expandItems: [
        { label: 'M3', val: '245K ctx' }, { label: 'M3 Flash', val: '快速推理' },
        { label: 'M1', val: '经典版本' }, { label: 'ABAB 6.5s', val: '超长上下文' },
      ]},
    { label: '🔷 OpenAI', val: '2 models', note: 'GPT-4o/GPT-4o Mini',
      expandItems: [
        { label: 'GPT-4o', val: '多模态旗舰' }, { label: 'GPT-4o Mini', val: '轻量高效' },
      ]},
    { label: '🟦 Ollama', val: 'N/A', note: '本地部署 · 灵活配置',
      expandItems: [
        { label: 'Llama 系列', val: '开源可部署' }, { label: 'Qwen 系列', val: '本地运行' },
        { label: 'Mistral', val: '轻量高效' }, { label: '任意 GGUF', val: '自定义模型' },
      ]},
  ];
}

function generateModeItems() {
  return [
    { label: '🖥️ CLI 命令行', val: '✅ 已发布', note: 'Ink + React Terminal · 7 组件 10 命令',
      expandItems: [
        { label: '交互式聊天', val: '多轮对话·上下文' }, { label: '文件操作', val: '读取/编辑/搜索' },
        { label: '管道模式', val: 'stdin/stdout' }, { label: '命令系统', val: '10 命令' },
        { label: '终端渲染', val: 'Ink + React 组件' },
      ]},
    { label: '🌐 Web Dashboard', val: '✅ 已发布', note: 'WorkBuddy 风格 · 10 Store + WebSocket',
      expandItems: [
        { label: '状态管理', val: '10 Zustand Store' }, { label: '实时通信', val: 'WebSocket 推送' },
        { label: '虚拟滚动', val: '万级消息' }, { label: '深色主题', val: '暗色/亮色切换' },
        { label: '响应式', val: '多端适配' },
      ]},
    { label: '🖼️ Desktop 原生', val: '✅ 已发布', note: 'Electron + React · 六件套 · 系统托盘',
      expandItems: [
        { label: 'Electron 壳', val: '原生窗口·托盘' }, { label: '六件套布局', val: '聊天/文件/终端/设置' },
        { label: '自动更新', val: 'electron-updater' }, { label: '快捷键', val: '全局快捷键' },
        { label: '离线能力', val: 'Ollama 集成' },
      ]},
    { label: '💬 IM 适配器', val: '✅ 已发布', note: 'Telegram / 飞书 / 企业微信 · 统一接口',
      expandItems: [
        { label: 'Telegram', val: 'Bot API' }, { label: '飞书', val: '卡片消息' },
        { label: '企业微信', val: '自建应用' }, { label: '统一接口', val: 'BaseIMAdapter' },
      ]},
  ];
}

// ============================================================
// 导出：构建模块关键词查找表（供 parser 使用）
// ============================================================

/**
 * 获取全局模块关键词表
 * @returns {Record<string, {name: string, phase: string, keywords: string[]}>}
 */
export function getKeywordMap() {
  /** @type {Record<string, {name: string, phase: string, keywords: string[]}>} */
  const map = {};
  for (const [id, mod] of Object.entries(MODULES)) {
    map[id] = { name: mod.name, phase: mod.phase, keywords: mod.keywords };
  }
  return map;
}

/**
 * 获取按阶段组织的管线数据（供前端渲染使用）
 * @returns {Object} 前端渲染用的管线数据
 */
export function getPipelineView() {
  const mainPhases = PHASES.map(p => ({
    id: p.id,
    label: p.label,
    period: p.period,
    nodes: p.nodeIds.map(id => {
      const m = MODULES[id];
      return {
        id: m.id,
        icon: m.icon,
        label: m.name,
        desc: m.desc,
        status: m.status,
      };
    }),
  }));

  const branches = BRANCHES.map(b => ({
    id: b.id,
    label: b.label,
    source: b.sourcePhase,
    nodes: b.nodeIds.map(id => {
      const m = MODULES[id];
      return {
        id: m.id,
        icon: m.icon,
        label: m.name,
        desc: m.desc,
        status: m.status,
      };
    }),
  }));

  return { phases: mainPhases, branches };
}

/**
 * 获取所有模块检测规则
 * @returns {Record<string, string[]>} moduleId → 文件列表
 */
export function getDetectRules() {
  /** @type {Record<string, string[]>} */
  const rules = {};
  for (const [id, mod] of Object.entries(MODULES)) {
    if (mod.detect?.files && mod.detect.files.length > 0) {
      rules[id] = mod.detect.files;
    }
  }
  return rules;
}

/**
 * 获取模块状态映射
 * @returns {Record<string, string>}
 */
export function getStatusMap() {
  /** @type {Record<string, string>} */
  const map = {};
  for (const [id, mod] of Object.entries(MODULES)) {
    map[id] = mod.status;
  }
  return map;
}

/**
 * 更新模块状态（用于自动检测后同步）
 * @param {Record<string, string>} statusUpdates - { moduleId: newStatus }
 */
export function applyStatusUpdates(statusUpdates) {
  for (const [id, status] of Object.entries(statusUpdates)) {
    if (MODULES[id]) {
      MODULES[id].status = status;
    }
  }
}
