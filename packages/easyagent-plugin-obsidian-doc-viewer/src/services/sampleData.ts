import type { DocNode } from '../types';

/**
 * MVP 示例数据
 * 模拟一个项目的 Markdown 文档结构
 */
export const sampleDocs: DocNode[] = [
  {
    id: '00_项目规划.md',
    name: '00_项目规划',
    type: 'file',
    path: '00_项目规划.md',
    content: '# 项目规划\n\n本项目目标是 [[01_整体架构|构建一个可扩展的架构]]。\n\n参考 [[03_开发路线图]] 进行排期。',
    links: ['01_整体架构.md', '03_开发路线图.md'],
    backlinks: [],
  },
  {
    id: '01_整体架构.md',
    name: '01_整体架构',
    type: 'file',
    path: '01_整体架构.md',
    content: '# 整体架构\n\n系统采用 [[02_约束规范|三层架构]]。\n\n与 [[00_项目规划]] 保持一致。',
    links: ['02_约束规范.md', '00_项目规划.md'],
    backlinks: [],
  },
  {
    id: '02_约束规范.md',
    name: '02_约束规范',
    type: 'file',
    path: '02_约束规范.md',
    content: '# 约束规范\n\n所有模块需遵循单一职责原则。\n\n详见 [[05_启动与执行指南_新手向]]。',
    links: ['05_启动与执行指南_新手向.md'],
    backlinks: [],
  },
  {
    id: '03_开发路线图.md',
    name: '03_开发路线图',
    type: 'file',
    path: '03_开发路线图.md',
    content: '# 开发路线图\n\n- Phase A: 核心框架\n- Phase B: [[04_测试文档|测试覆盖]]\n- Phase C: 文档工具\n- Phase D: [[06_LangGraph集成EasyAgent方案|LangGraph 集成]]',
    links: ['04_测试文档.md', '06_LangGraph集成EasyAgent方案.md'],
    backlinks: [],
  },
  {
    id: '04_测试文档.md',
    name: '04_测试文档',
    type: 'file',
    path: '04_测试文档.md',
    content: '# 测试文档\n\n测试策略包括单元测试、集成测试和 E2E 测试。\n\n参考 [[05_启动与执行指南_新手向]] 运行测试。',
    links: ['05_启动与执行指南_新手向.md'],
    backlinks: [],
  },
  {
    id: '05_启动与执行指南_新手向.md',
    name: '05_启动与执行指南_新手向',
    type: 'file',
    path: '05_启动与执行指南_新手向.md',
    content: '# 启动与执行指南 (新手向)\n\n新手请按照以下步骤启动项目：\n\n1. 安装依赖\n2. 配置 [[langgraph.config.json]]\n3. 运行 [[index.html]]\n4. 参考 [[00_项目规划]] 了解背景',
    links: ['langgraph.config.json', 'index.html', '00_项目规划.md'],
    backlinks: [],
  },
  {
    id: '06_LangGraph集成EasyAgent方案.md',
    name: '06_LangGraph集成EasyAgent方案',
    type: 'file',
    path: '06_LangGraph集成EasyAgent方案.md',
    content: '# LangGraph 集成 EasyAgent 方案\n\n将核心 Agent 引擎从 ReAct 循环迁移到 LangGraph StateGraph。\n\n详见 [[01_整体架构]] 和 [[03_开发路线图]]。',
    links: ['01_整体架构.md', '03_开发路线图.md'],
    backlinks: [],
  },
  {
    id: 'langgraph.config.json',
    name: 'langgraph.config.json',
    type: 'file',
    path: 'langgraph.config.json',
    content: '{\n  "engine": "langgraph",\n  "maxTurns": 25\n}',
    links: [],
    backlinks: [],
  },
  {
    id: 'index.html',
    name: 'index.html',
    type: 'file',
    path: 'index.html',
    content: '<!-- 应用入口 HTML -->',
    links: [],
    backlinks: [],
  },
];
