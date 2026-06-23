# 全景管线模块 · 架构设计文档 v2.2

> **版本**: 2.2 (全覆盖 L4 + 进度卡片 + 管线自测试)  
> **日期**: 2026-06-23  
> **设计原则**: 单一配置源 · 数据-渲染分离 · 三级渐进式加载 · 四级渐进展开 · 可测试性

---

## 目录

1. [架构总览](#1-架构总览)
2. [组件职责与数据流](#2-组件职责与数据流)
3. [当前实现状态](#3-当前实现状态)
4. [核心设计决策](#4-核心设计决策)
5. [待优化项](#5-待优化项)
6. [扩展路线图](#6-扩展路线图)

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                      pipeline-config.mjs                            │
│                       【唯一配置源】                                  │
│  MODULES · PHASES · BRANCHES · KPI_DEFAULTS · generateDashboard()   │
└───────┬───────────────┬───────────────────────┬─────────────────────┘
        │               │                       │
        ▼               ▼                       ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐
│ pipeline-    │ │ pipeline-    │ │  lib/pipeline-           │
│ api.mjs      │ │ parser.mjs   │ │  cache.mjs               │
│ 6 REST API   │ │ MD 文件解析   │ │ mtime 增量缓存            │
└──────┬───────┘ └──────┬───────┘ └──────────┬───────────────┘
       │                │                    │
       └────────┬───────┴────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        server.mjs (113 行)                          │
│                    HTTP 路由分发 + 静态文件服务                        │
│  端口 8898  ·  CORS  ·  lib/*.mjs 安全隔离                           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              HTTP 模式                   file:// 模式
           (fetch API)              (fetch 静态 JSON)
                    │                         │
                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        index.html                                    │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐    │
│  │   数据加载层 (新增)    │  │        渲染引擎 (纯函数化)         │    │
│  │                      │  │                                  │    │
│  │ Tier 1: /api/*       │  │  layout(pd) → 坐标计算            │    │
│  │ Tier 2: .json 快照   │──▶│  render(pd) → SVG 生成           │    │
│  │ Tier 3: EMBEDDED     │  │  applyDataAndRender() → 统一入口   │    │
│  └──────────────────────┘  └──────────────────────────────────┘    │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐    │
│  │  仪表板卡片系统 (9张)    │  │     问题追溯面板                  │    │
│  │  generateDashboardDetails()│  │  loadIssueData() → /api/issues   │    │
│  │  → tests/pass/tools/       │  │  openPanel() → 时间线渲染         │    │
│  │    models/score/modes/     │  │                                  │    │
│  │    progress/modules_progress│  │                                  │    │
│  │    /issues                 │  │                                  │    │
│  │  L1→L4 渐进展开 (全面覆盖)  │  │                                  │    │
│  └──────────────────────┘  └──────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 关键指标

| 指标 | v1.0 (重构前) | v2.2 (当前) | 改善 |
|------|-------------|-----------|------|
| 硬编码行数 | ~530 行 | 0 行 | **-100%** |
| 配置源数量 | 3 个不同步 | 1 个 (`pipeline-config.mjs`) | **-67%** |
| 渲染函数耦合 | 直接访问全局变量 | 纯函数,接受数据参数 | ✅ |
| 数据加载 | 单一回退 | 三级渐进式 (API/JSON/嵌入) | ✅ |
| Dashboard 卡片 | 6(部分L1→L2) | 9张(L1→L4全覆盖) | **+50%** |
| L4 用例覆盖率 | 仅F1(43/209=21%) | 全部14模块(含P5管线/209=100%) | **+79pp** |
| 模块变更影响 | 3 文件需同步修改 | 仅改 `pipeline-config.mjs` | **-67%** |
| **管线自测试** 🆕 | 0 | 4文件×58用例 100%通过 | **∞** |

---

## 2. 组件职责与数据流

### 2.1 配置层 (pipeline-config.mjs)

**职责**: 整个管线系统的**唯一配置源**。

```js
// 所有模块定义、阶段划分、分支规划、检测规则均在此定义
export const MODULES    = { f1: { id, name, phase, icon, desc, status, keywords, detect }, ... }
export const PHASES     = [ { id, label, period, nodeIds }, ... ]
export const BRANCHES   = [ { id, label, sourcePhase, isBranch, nodeIds }, ... ]
export const KPI_DEFAULTS = { testCases, testPassRate, tools, providers, ... }
export const SCORE_HISTORY = [ { version, date, score }, ... ]

// 工厂函数：根据当前 KPI 动态生成仪表板详情（9张卡片）
export function generateDashboardDetails(kpi) → { tests, pass, tools, models, score, modes, progress, modules_progress, issues }

// 内部辅助函数
function generateTestItems() → [ 平台测试, 模型适配, ... ]   // 9个大类,每一类含 expandItems
function generateToolItems() → [ 文件操作, 搜索, Git, ... ]  // 8组,每组含工具名+参数(L3)
function generatePhaseProgressItems() → [ P0, P1, ... B3 ]  // 分期进度+进度条+模块明细
function generateModuleStatusItems() → [ 已完成, 进行中, 待启动 ]  // 按状态分组

// 视图函数：生成渲染器可直接使用的管线结构
export function getPipelineView() → { phases, branches }

// 工具函数：供 parser 使用
export function getKeywordMap() → { moduleId: { name, phase, keywords } }
export function getDetectRules() → { moduleId: [filePaths] }
export function getStatusMap() → { moduleId: status }
```

**扩展方式**: 添加新模块只需在 `MODULES` 中新增一条记录，然后将其 ID 加入对应 `PHASES` 或 `BRANCHES` 的 `nodeIds` 列表。无需修改任何其他文件。

### 2.2 API 层 (pipeline-api.mjs)

**职责**: 将配置数据以 RESTful JSON 格式提供给前端。

| 端点 | 方法 | 数据源 | 说明 |
|------|------|--------|------|
| `/api/pipeline` | GET | `getPipelineView()` + KPI + scoreHistory | 管线结构 + KPI 指标 |
| `/api/dashboard` | GET | `generateDashboardDetails()` | 仪表板 9 张卡片详情 |
| `/api/dashboard/:id` | GET | `generateDashboardDetails()[id]` | 单张卡片详情 |
| `/api/issues` | GET | `parseMemoryIssues()` | 实时解析 memory 目录 |
| `/api/status` | GET | 综合状态 | 服务器健康 + 缓存统计 |
| `/api/modules` | GET | `getPipelineView()` | 扁平模块列表 |

### 2.3 解析层 (pipeline-parser.mjs)

**职责**: 从 `.codebuddy/memory/*.md` 文件提取模块问题记录。

**解析策略**:
1. **显式标签优先**: `## [模块:F1] 标题` → 直接映射到模块 ID
2. **关键词回退**: 对无标签的 Section，通过关键词匹配到模块
3. **缓存加速**: 非今天的文件按 mtime 缓存，今天的文件每次都重新解析

**输出格式**:
```json
{
  "modules": {
    "f1": { "name": "多模型适配器", "phase": "P0", "issues": [...] },
    ...
  },
  "_totalIssues": 39,
  "_generatedAt": "2026-06-23T...",
  "_sourceFiles": ["2026-06-22.md", "2026-06-23.md", "MEMORY.md"],
  "_cacheStats": { "totalFiles": 3, "cacheHits": 2, "reparsed": 1 }
}
```

### 2.4 缓存层 (pipeline-cache.mjs)

**职责**: mtime + size 指纹缓存，避免每次请求都重新解析大量 MD 文件。

**缓存策略**:
- 今天的文件 (YYYY-MM-DD.md): **不缓存**，每次重新解析（可能还在追加内容）
- 历史文件: mtime 和 size 都没变 → 直接复用缓存
- 缓存文件: `docs/pipeline/.pipeline-cache.json`

### 2.5 前端数据加载层 (index.html)

**职责**: 三级渐进式数据加载，确保在 API、静态文件、离线三种场景下都能正常工作。

```js
async function init() {
  // Tier 1: HTTP API（最新实时数据）
  try {
    [pipelineRes, dashboardRes] = await Promise.all([
      fetch('/api/pipeline'), fetch('/api/dashboard')
    ]);
    if (ok) { dataSource = 'api'; applyDataAndRender(); return; }
  } catch(e) {}

  // Tier 2: 静态 JSON 快照（file:// 模式或 API 不可用）
  try {
    raw = await fetch('pipeline-data.json');
    pipelineData = transformJSONData(raw);  // 格式转换
    dashboardData = raw.dashboard;
    dataSource = 'json'; applyDataAndRender(); return;
  } catch(e) {}

  // Tier 3: 内嵌最小回退（离线/极端情况）
  pipelineData = EMBEDDED_PIPELINE;
  dashboardData = null;
  dataSource = 'embedded'; applyDataAndRender();
}
```

### 2.6 前端渲染引擎 (index.html)

**职责**: 纯函数化的 SVG 渲染，与数据源完全解耦。

```
render(pipelineData)
  ├── layout(pipelineData)     → 计算节点坐标
  ├── 背景网格
  ├── 阶段间流动箭头
  ├── 阶段标题 + 节点卡片
  ├── 汇总节点 v0.5.0
  ├── 分支管线
  └── 动态 viewBox 调整

applyDataAndRender()           → 统一入口
  ├── 更新 header meta
  ├── 更新 KPI 仪表板
  ├── 更新数据源标识
  └── 调用 render(pipelineData)
```

### 2.7 数据同步 (update-progress.mjs)

**职责**: Git post-commit hook 触发，检测文件变化并更新 `pipeline-data.json`。

```
git commit
  → .git/hooks/post-commit
    → node scripts/update-progress.mjs
      → 检测文件存在性
      → 更新 node.status (done/pending)
      → 写入 pipeline-data.json
        → 更新 meta.version, kpi.testCases, kpi.providers
        → 同步 mainLane 和 branchLanes 的 node status
        → 保留 dashboard 段（不覆盖）
```

---

## 3. 当前实现状态

### 3.1 已完成 (✅)

| 组件 | 状态 | 说明 |
|------|------|------|
| `pipeline-config.mjs` | ✅ | 单一配置源，29 模块 + 6 阶段 + 3 分支 + 9 卡片生成 |
| `pipeline-api.mjs` | ✅ | 6 个 REST API 端点 |
| `pipeline-parser.mjs` | ✅ | MD 文件解析 + 显式标签 + 关键词回退 |
| `pipeline-cache.mjs` | ✅ | mtime+size 文件级缓存 |
| `server.mjs` | ✅ | 113 行精简路由分发 |
| `index.html` 数据加载层 | ✅ | 三级渐进式加载 (API→JSON→嵌入) |
| `index.html` 渲染引擎 | ✅ | 纯函数化，L1→L4 渐进展开，9 张卡片 |
| `pipeline-data.json` | ✅ | 含 pipeline + dashboard 完整快照 |
| `update-progress.mjs` | ✅ | Git hook 自动检测更新 |
| `memory-format-spec.md` | ✅ | Memory 记录格式规范 v1.0 |
| Dashboard 四级展开 | ✅ | L4 具体用例名：209/209 L3 项 100% 覆盖（含 P5 管线运维） |
| Dashboard 进度卡片 | ✅ | 分期进度（进度条）+ 模块完成状态 |
| Tools 卡片 L3 参数 | ✅ | 30 个工具的参数签名可展开 |
| **管线自测试** 🆕 | ✅ | 4 测试文件 × 58 用例，100% 通过 |
| `pipeline-config.test.mjs` 🆕 | ✅ | 29 用例：MODULES/PHASES/KPI/Dashboard/Keywords |
| `pipeline-cache.test.mjs` 🆕 | ✅ | 15+1 用例：读写/快照/有效性/压力 |
| `pipeline-parser.test.mjs` 🆕 | ✅ | 8 用例：标签/关键词/去重/缓存/状态 |
| `pipeline-api.test.mjs` 🆕 | ✅ | 14 用例：6端点/JSON/CORS/404 |

### 3.2 进行中 (⏳)

| 项目 | 状态 | 说明 |
|------|------|------|
| `p5a` 管线数据看板 | ⏳ | 当前正在优化中（本次重构） |
| `b1a` Web↔Desktop 前端合并 | ⏳ | packages/frontend 目录已创建 |

### 3.3 待启动 (⬜)

| 项目 | 优先级 | 说明 |
|------|--------|------|
| `b1b` PluginManager 沙箱 | P1 | worker_threads 隔离 |
| `b2c` 集成测试·端到端 | P1 | CLI→Server→Core 全链路 |
| `b2d` 多模型评测排行榜 | P2 | 每版本模型适配报告 |
| `b2e` 用户行为埋点 | P2 | FTSR/留存率/TTFV |
| `b3a` 一键安装脚本 | P1 | curl\|bash 体验 |
| `b3b` VS Code 插件 | P2 | IDE 深度集成 |
| `b3c` Contributor 引导 | P2 | good-first-issue + 贡献指南 |

---

## 4. 核心设计决策

### 4.1 为什么采用"单一配置源 + 快照分发"

**问题**: 原架构中 `index.html`(PIPELINE) + `pipeline-data.json`(mainLane) + `pipeline-config.mjs`(MODULES) 三处各有管线结构定义，任一模块变更需同步修改 3 个文件。

**方案**: 
- `pipeline-config.mjs` 是**唯一配置源**（Node.js 模块，可用 JS 逻辑）
- `/api/pipeline` 和 `/api/dashboard` 从配置源**动态生成** JSON
- `pipeline-data.json` 是配置源的**文件系统快照**（供 file:// 模式使用）
- `index.html` 通过三级加载**自动选择最佳数据源**

**参考模式**: 
- GitOps 的 single source of truth + reconciliation loop
- PWA 的 progressive enhancement 策略
- D3.js 的 data-join 渲染模式（数据与视图分离）

### 4.2 为什么用三级渐进式加载

```
Tier 1: HTTP API  ──── 实时、最新、含缓存统计
Tier 2: 静态 JSON ──── file:// 模式、API 不可用时的快照
Tier 3: 内嵌回退  ──── 离线或 JSON 损坏时的骨架渲染
```

**决策依据**:
- 项目需要同时支持 `http://localhost:8898/` (服务器模式) 和 `file:///.../index.html` (直接打开)
- `file://` 协议下无法使用 fetch API 调用 localhost 端点（同源策略）
- 需要确保任何情况下页面都能渲染（骨架模式），用户体验不中断

### 4.3 为什么渲染函数要纯函数化

**原则**: 渲染函数不访问全局变量，所有数据通过参数传入。

```js
// ❌ 旧模式：直接访问全局 PIPELINE
function render() {
  PIPELINE.phases.forEach(...)
}

// ✅ 新模式：数据通过参数传入
function render(pd) {
  pd.phases.forEach(...)
}
```

**收益**:
1. **可测试性**: 渲染函数可以用任意 mock 数据测试
2. **数据源无关**: 同一套渲染逻辑支持 API/JSON/嵌入式三种数据源
3. **热更新友好**: 数据变化后只需重新调用 `render(newData)`，无需重写渲染逻辑

### 4.4 ID 映射表设计

pipeline-data.json 使用描述性 ID (如 `phase-foundation`)，渲染器使用短 ID (如 `P0`)。通过映射表解耦：

```js
const PHASE_ID_MAP = {
  'phase-foundation': 'P0', 'phase-interface': 'P1',
  'phase-extend': 'P2', 'phase-platform': 'P3',
  'phase-release': 'P4', 'phase-pipeline': 'P5'
};
```

这种设计允许内部 ID 独立演化（如添加更多描述性前缀），不影响渲染层。

### 4.5 Dashboard 数据的四级渐进展开设计

仪表板卡片采用统一的 L1→L4 渐进展开模式，无需为每个卡片编写专用渲染代码：

```
L1 大类 (工具组/模型类/测试分类/阶段)
 └─ L2 子类 (具体工具/模型名/适配器/阶段)
     └─ L3 详情项 (参数签名/测试点/模块状态)
         └─ L4 具体用例 (测试用例名称)
```

**数据注入机制**:
- `TEST_LEVEL3_MAP`：为 L2 项注入 L3 数据（测试分类→测试点）
- `TEST_LEVEL4_MAP`：为 L3 项注入 L4 数据（测试点→具体用例名），当前覆盖 209/209
- `TOOL_PARAMS_MAP`：为工具的 L2 注入 L3 参数签名（30 个工具）
- `attachLevel3()` / `attachToolParams()`：统一注入逻辑

**渲染规则**: 前端 `openCardDetail` 检测 `expandItems` 是否存在，自动渲染为可展开行（▶ 箭头），无需针对特定卡片硬编码 UI。

### 4.6 Dashboard 数据的"产品目录"定位

仪表板详情（测试分布、工具列表、模型目录、模式描述）本质上是**产品文档/目录**，而非运行时配置。因此：

- 静态内容（工具名、模型名、描述文字、用例名称）→ 保留在产品目录中
- 动态内容（KPI 数值、模块状态、评分历史、分期进度）→ 从配置源实时计算
- 进度卡片（`progress`、`modules_progress`）→ 每次 API 请求实时计算完成率
- 数据聚合在 `pipeline-data.json` 的 `dashboard` 段中，与 pipeline 结构共存

---

## 5. 待优化项

### 5.1 高优先级 (P0)

| # | 优化项 | 现状 | 方案 | 复杂度 |
|---|--------|------|------|--------|
| 1 | **节点 ID 统一** | pipeline-data.json 用 `opt-p1a`，配置用 `b1a` | 统一使用配置中的 ID，去掉 JSON 中的映射表 | 中 |
| 2 | **监听文件变化自动刷新** | 手动刷新浏览器 | 添加 SSE 端点，文件变化时推送事件 | 低 |
| 3 | **流水线数据看板的数据刷新按钮** | 无手动刷新 | 添加"刷新数据"按钮，调用 `/api/status` + 重新加载 | 低 |

### 5.2 中优先级 (P1)

| # | 优化项 | 现状 | 方案 | 复杂度 |
|---|--------|------|------|--------|
| 4 | **SVG 交互增强** | 仅点击打开面板 | 添加悬停 tooltip、节点拖拽重排 | 中 |
| 5 | **移动端响应式** | media query 基础适配 | SVG 改用 `preserveAspectRatio` + 触摸交互 | 中 |
| 6 | **导出功能** | 无 | 导出为 PNG/SVG 文件、JSON 报告 | 低 |
| 7 | **多语言支持** | 仅中文 | i18n 键值对，仪表板文字国际化 | 中 |

### 5.3 低优先级 (P2)

| # | 优化项 | 现状 | 方案 | 复杂度 |
|---|--------|------|------|--------|
| 8 | **Dashboard 卡片自定义排序** | 固定顺序 | 拖拽排序 + localStorage 持久化 | 低 |
| 9 | **时序数据对比** | 仅显示当前状态 | 历史快照对比，版本间差异高亮 | 高 |
| 10 | **WebSocket 实时推送** | 轮询式 | WebSocket 双向通信，状态变化即时推送 | 中 |
| 11 | **暗色/亮色主题切换** | 仅暗色 | CSS 变量切换 + localStorage 持久化 | 低 |

---

## 6. 扩展路线图

### 6.0 短期 (当前 Sprint) —— 管线模块完善

- [x] 完成库化架构重构（v2.0）
  - [x] 单一配置源 (pipeline-config.mjs)
  - [x] 三级渐进式数据加载
  - [x] 渲染引擎纯函数化
  - [x] 硬编码数据全部移除
- [x] Dashboard 四级展开全覆盖（v2.1）
  - [x] 209/209 L3 项均有 L4 具体用例名
  - [x] 30 个工具参数签名可展开
  - [x] 分期进度 + 模块进度卡片
- [ ] 节点 ID 统一标准化
- [ ] 数据刷新按钮 + 自动刷新
- [x] 架构文档完善

### 6.1 中期 (v0.6.0) —— 管线运维增强

- [ ] **时序数据存储**: 每次 `update-progress.mjs` 运行时保存历史快照
- [ ] **进度趋势图**: 基于历史快照绘制评分/进度折线图
- [ ] **异常检测**: 模块状态回退自动告警
- [ ] **测试覆盖率仪表板**: 从 vitest 输出中提取覆盖率数据
- [ ] **构建时间追踪**: 记录每次 build.bat 耗时

### 6.2 长期 (v0.7.0+) —— 平台化

- [ ] **多项目支持**: 配置文件指定多个项目目录，统一看板
- [ ] **插件化渲染器**: 支持自定义节点样式、连线样式、布局算法
- [ ] **CI/CD 深度集成**: 在 GitHub Actions 中直接生成 SVG 报告
- [ ] **团队协作视图**: 多人贡献热力图、代码审查状态
- [ ] **API 网关化**: GraphQL 查询接口，按需获取字段子集

### 6.3 架构演进方向

```
当前 (v2.0)              近期 (v2.5)              远期 (v3.0)
─────────────          ───────────────          ───────────────
单一项目看板      →     多项目看板          →     平台化看板
静态 JSON 快照    →     时序数据存储        →     TimescaleDB
SVG 渲染           →     Canvas/WebGL 渲染    →     3D 管线可视化
HTTP API           →     WebSocket 推送       →     gRPC streaming
手动刷新           →     文件监听自动刷新     →     Event Sourcing
```

---

## 附录

### A. 文件结构

```
docs/pipeline/
├── ARCHITECTURE.md             # 本文件 —— 架构设计文档
├── README.md                   # 使用说明
├── index.html                  # 主页面 (SVG 流程图 + 仪表板 + 问题面板)
├── server.mjs                  # HTTP 服务器 (113 行)
├── pipeline-data.json          # 管线数据快照 (含 dashboard)
├── memory-format-spec.md       # Memory 记录格式规范 v1.0
├── .pipeline-cache.json        # 解析缓存 (自动生成)
├── project-progress.html       # 旧版备用页
├── project-progress-data.json  # 旧版进度数据
├── issue-data.json             # 问题追溯数据快照 (API 不可用时回退)
└── lib/
    ├── pipeline-config.mjs     # 【唯一配置源】模块/阶段/分支/KPI 定义
    ├── pipeline-api.mjs        # REST API 路由处理器
    ├── pipeline-parser.mjs     # Memory MD 文件解析器
    └── pipeline-cache.mjs      # mtime 文件级缓存系统
└── __tests__/                  # 管线模块自我测试 🆕
    ├── pipeline-config.test.mjs  # 配置模块测试 (29 用例)
    ├── pipeline-cache.test.mjs   # 缓存模块测试 (15 用例)
    ├── pipeline-parser.test.mjs  # 解析器模块测试 (8 用例)
    └── pipeline-api.test.mjs     # API 模块测试 (14 用例)
```

### B. 关键命令

```bash
# 启动管线服务器 (含实时 API)
node docs/pipeline/server.mjs

# 手动触发进度检测
node scripts/update-progress.mjs

# 清除缓存 (强制重建)
del docs\pipeline\.pipeline-cache.json

# 安装 Git hooks (自动检测)
node scripts/install-git-hooks.mjs
```

### C. 数据格式对照

| 格式 | 来源 | Phase ID | Node ID (主线) | Node ID (分支) |
|------|------|----------|---------------|---------------|
| 配置源 | pipeline-config.mjs | P0-P5 | f1-f16, p5a-p5c | b1a-b3c |
| API 输出 | /api/pipeline | P0-P5 | f1-f16, p5a-p5c | b1a-b3c |
| JSON 快照 | pipeline-data.json | phase-* | f1-f16, p5a-p5c | opt-p1a-opt-p3c |
| 渲染器 | index.html (运行时) | P0-P5 | f1-f16, p5a-p5c | b1a-b3c |
