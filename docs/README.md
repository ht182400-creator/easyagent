# EasyAgent 文档导航中心

> **最后更新**: 2026-07-02  
> **适用版本**: v0.6.25+（方案 D CI/CD 落地，插件市场 GitHub Actions 自动构建）  
> **欢迎新人！从这里开始 →** 先读 `00_新手上手指南.md`，再按你的角色选读下面的路径。

---

## 📖 新手阅读路径

### 所有人（先花 10 分钟）

```
00_新手上手指南.md    ← 从这里开始！（项目简介 → 启动 → 发布）
14_构建前必检清单.md    ← 30秒救命清单，每次构建前看
12_项目启动与运行方式指南.md  ← 如何启动后端/前端
```

### 开发者（写代码）

```
37_双重构建体系详解_Desktop与Web.md   ← 理解构建流程
11_构建链路对照表_tsup_asar_inline详解.md  ← 源码→产物的映射关系
02_架构设计文档_ADD.md                 ← 完整架构
54_AI引擎架构决策知识库.md             ← 🆕 AI引擎架构决策 + 可复用模式
36_调试日志规范体系.md                 ← 怎么写 debug 日志
39_CHANGELOG自动生成机制_三级Fallback.md ← CHANGELOG 怎么来的
```

### 发布者（发版本）

```
38_双通道发布指南_本地vs服务器.md     ← 两种发布方式对比
40_发布产物与自动化流程详解_面向新手.md  ← latest.yml / release.yml 是什么
06_版本发布与CI-CD流程指南.md          ← CI/CD 全流程
05_Desktop_EXE打包标准流程.md          ← 打包技术细节
07_自动更新分发方案对比.md             ← 自动更新方案
```

### 排查者（救火）

```
MEMORY.md (项目根目录 .codebuddy/memory/)  ← 陷阱清单 47 条 + 高频问题速查
修复汇总.md                                 ← 🆕 所有修复汇总的集中记录，按日期查找
35_MODULE_VERSION问题分析与根治方案.md     ← better-sqlite3 必读
45_管线同步编码问题深度复盘.md             ← pipeline-auto-sync 4 大陷阱
04_CORS修复深度复盘_编译链与假成功陷阱.md   ← CORS 陷阱
10_Desktop连接失败深度排查_React竞态条件修复.md ← 连接问题
```

---

## 📁 核心文档索引

| 编号 | 标题                        | 一句话描述                                           |
| :--: | --------------------------- | ---------------------------------------------------- |
| `00` | 新手上手指南                | 从克隆代码到第一次发布的完整步行                     |
| `01` | 需求规格说明书 PRD          | 产品需求，版本控制与升级系统                         |
| `02` | 架构设计文档 ADD            | 完整技术架构，v5.4                                   |
| `03` | 测试案例文档                | 1578 用例 (1503+75)，覆盖率报告，含 Phase D                 |
| `04` | CORS 修复深度复盘           | 编译链与假成功陷阱                                   |
| `05` | Desktop EXE 打包标准流程    | 28 个问题的手册级详解                                |
| `06` | 版本发布与 CI/CD 流程指南   | 发布全流程                                           |
| `07` | 自动更新分发方案对比        | GitHub/R2/COS 等 5 方案                              |
| `08` | 项目战略审查与发展蓝皮书    | 决策级参考                                           |
| `09` | 项目 Review 与优化建议报告  | CPO + 架构师双视角                                   |
| `10` | Desktop 连接失败深度排查    | React 竞态条件修复                                   |
| `11` | 构建链路对照表              | 源码→编译→asar→EXE 完整映射                          |
| `12` | 项目启动与运行方式指南      | 环境搭建与启动                                       |
| `13` | 自动更新架构设计文档        | 自动更新完整架构                                     |
| `14` | 构建前必检清单              | 30 秒避免 2 小时排错                                 |
| `35` | MODULE_VERSION 问题根治方案 | better-sqlite3 深度分析                              |
| `36` | 调试日志规范体系            | TS/.mjs/.bat 统一日志标准                            |
| `37` | 双重构建体系详解            | Desktop vs Web 构建原理                              |
| `38` | 双通道发布指南              | 本地构建 vs 服务器构建                               |
| `39` | CHANGELOG 自动生成机制      | 三级 Fallback 方案                                   |
| `40` | 发布产物与自动化流程详解    | latest.yml/release.yml 详解                          |
| `41` | 前端架构优化方案            | 模块共享歧义根治 + 平台适配器模式设计                |
| `42` | 前端工程优化改进路线图      | 15 项改进需求 + 管线分工 + 验收标准                  |
| `43` | 管线模块添加标准流程        | 决策树 + 4 场景模板 + 校验脚本，零决策成本           |
| `44` | 优化内容综合进度与优先级    | 41+42+43 三文档统一视图，18 项优化唯一执行表         |
| `45` | 管线同步编码问题深度复盘    | 4 个问题完整诊断：CI 阻塞/PS 乱码/JSON 解析/验证逻辑 |
| `46` | CI 管道全盘修复深度复盘     | 从 5 连败到全绿，6 个根因 + 3 轮修复完整记录      |
| `47` | 发版推送竞态条件分析与根治  | push rejected + rebase 冲突三处修复               |
| `48` | v0.6.13 发版CI全链路复盘    | 4 截图全修复：GH_TOKEN / jsx-runtime / unstaged   |
| `49` | CI/CD 工作流优化 D 方案     | 可复用 workflow（_test.yml），3→1 workflow          |
| `50` | v0.6.18 双问题复盘          | eslint scoped 包路径 + [skip ci] 双重抑制 Release  |
| `51` | v0.6.21 CI修复全记录        | package 版本对齐与 lint 错误清零                      |
| `52` | 项目端口统一规划 (v2.1)    | 10 端口 + 方案 D CI/CD 插件市场架构（npm→GitHub Actions→Release Asset） |
| `53` | 引擎选择配置与LangGraph使用指南 | 引擎切换三级优先级 + engine.config.json 详解 |
| `54` | 🧠 AI引擎架构决策知识库    | 提示词工程/工具暴露/循环控制/模型适配/上下文管理/失败恢复六大领域架构决策 |
| `55` | 📚 MD文档管理方案选型与知识库体系设计 | 9 方案对比 + Obsidian 九维度分析 + 反向索引规范 |
| `56` | 🔬 EasyAgent vs Odysseus 深度对比评审与改进建议 | 架构/引擎/工具/安全/上下文/前端全维度对比 + 21 项改进路线图 |
| `57` | 🧠 EasyAgent vs Odysseus 对比评审 — DeepSeek-V4-Pro 视角 | 14 章全维度对比 + 安全/上下文/LLM韧性深度分析 + 改进路线图 P0→P3 |
| `58` | 🔌 EasyAgent 插件系统规划与 GitHub 插件市场设计 | 插件市场架构/协议/UI/安全 + Doc_project Obsidian-like 文档浏览器规划 |
| `60` | 🚀 服务器部署指南（Windows 云服务器） | 一键部署脚本 + 域名 + HTTPS 升级（理想态步骤） |
| `61` | 🚀 部署讨论与结论复盘 | 备案拦截/SNI/EdgeOne 配额/3456 兜底 实战复盘与方案对比 |
| `修复汇总` | 🔧 修复汇总（所有修复的集中记录） | 按日期时间标题记录所有 bug 修复/架构决策/问题排查摘要，每次修复后自动追加 |

---



## 🔍 反向索引（按关键词查找）

> **用法**：Ctrl+F 搜索关键词 → 跳转到对应文档。  
> **维护规则**：新增文档时追加对应条目；同一关键词合并到一行；超过 30 条按类别拆分。  
> 详细规范见 `docs/55_MD文档管理方案选型与知识库体系设计.md` §6。

| 关键词 | 出现位置 | 类别 |
|--------|---------|:---:|
| better-sqlite3 / MODULE_VERSION | `35_MODULE_VERSION问题分析与根治方案.md`, MEMORY #9 | 🔧 构建 |
| benchmark 死循环 / 工具误触发 | MEMORY #41, `54_§2.2` | 🧠 引擎 |
| recursionLimit / maxTurns | `53_§4.3`, `54_§3.1` | 🧠 引擎 |
| qwen2.5 适配 / 小模型优化 | `54_§1.2-1.3`, `54_§4.1`, MEMORY #42 | 🤖 模型 |
| 工具污染上下文 / JSON 误输出 | `54_§1.2`, MEMORY #42 | 🤖 模型 |
| 模型自适应提示词 | `54_§1.3`, `54_§4.3` | 🤖 模型 |
| 构建缓存陷阱 / dist缓存 | MEMORY 主文档, `37_双重构建体系详解`, `14_构建前必检清单` | 🔧 构建 |
| 构建链路 / tsup / asar | `11_构建链路对照表`, `37_双重构建体系详解` | 🔧 构建 |
| CORS / 编译链假成功 | `04_CORS修复深度复盘` | 🔧 构建 |
| Electron 打包 / EXE | `05_Desktop_EXE打包标准流程`, `37_双重构建体系详解` | 🔧 构建 |
| 发布 / release / CI/CD | `06_版本发布与CI-CD流程指南`, `40_发布产物与自动化流程详解`, `52_项目端口统一规划(方案D)` | 🚀 发布 |
| 自动更新 / auto-update | `07_自动更新分发方案对比`, `13_自动更新架构设计文档` | 🚀 发布 |
| 前端架构 / 模块共享 | `41_前端架构优化方案`, `42_前端工程优化改进路线图` | 📐 架构 |
| LangGraph / 引擎切换 | `53_引擎选择配置与LangGraph使用指南`, `54_§3` | 🧠 引擎 |
| checkpoint / 流式输出 / streamEvents | `54_§3.2-3.3` | 🧠 引擎 |
| 文档管理 / MD拆分 / Obsidian / RAG | `55_MD文档管理方案选型` | 📐 架构 |
| Odysseus / 对比评审 / 改进路线 | `56_EasyAgent_vs_Odysseus`, `57_对比评审_DeepSeek模型视角` | 📐 架构 |
| 插件系统 / GitHub插件市场 / DocViewer | `58_EasyAgent插件系统规划` | 🔌 生态 |
| 文档浏览器 / Doc_project / iframe面板 / open-doc-viewer | `修复汇总.md`(§ 2026-07-02 13:40), `58_§11` | 🔌 生态 |
| 管线 / 同步 / pipeline | `45_管线同步编码问题深度复盘`, `43_管线模块添加标准流程` | 📋 规范 |
| 端口 / localhost | `52_项目端口统一规划` | 📐 架构 |
| 部署 / 服务器 / 公网访问 / 备案 | `60_服务器部署指南`, `61_部署讨论与结论复盘` | 🚀 发布 |
| 备案拦截 / SNI / EdgeOne Pages vs 站点加速 / 轻量防火墙 | `61_部署讨论与结论复盘` | 🚀 发布 |
| HTTPS / 自签证书 / 3456 兜底 / Let's Encrypt | `61_部署讨论与结论复盘` | 🚀 发布 |
| CI 修复 / lint / eslint | `50_v0.6.18_发版双问题复盘`, `51_v0.6.21_CI修复全记录` | 🚀 发布 |
| 新手 / 入门 / 启动 | `00_新手上手指南`, `12_项目启动与运行方式指南` | 📋 规范 |
| 日志 / debug / 调试 | `36_调试日志规范体系` | 📋 规范 |

### 类别说明

| 图标 | 类别 | 涵盖范围 |
|:---:|------|------|
| 🔧 | 构建 | tsup/vite/electron-builder/sqlite3 编译 |
| 🚀 | 发布 | CI/CD/release/自动更新/CHANGELOG |
| 🧠 | 引擎 | LangGraph/Adapter/Agent/LLM 循环控制 |
| 🤖 | 模型 | 提示词/模型适配/embedding/上下文 |
| 🐛 | 陷阱 | MEMORY 或复盘中的已修复问题 |
| 📐 | 架构 | 系统设计/架构决策/技术选型 |
| 📋 | 规范 | 编码/日志/格式/流程约束 |

---

## 🧠 AI 引擎架构决策知识库

> **这是什么？** — EasyAgent AI 引擎层的**架构决策记录与知识沉淀**，覆盖提示词工程、工具暴露策略、引擎循环控制、模型适配、上下文管理、失败恢复六大领域。  
> **谁应该看？** — 架构师、全栈开发者、任何需要理解或优化 AI 引擎行为的人员。  
> **可复用性？** — 包含"其他项目借鉴清单"，各模式可独立提取应用到其他 AI 工程化项目。

📄 入口文档：`docs/54_AI引擎架构决策知识库.md`

| 决策领域 | 核心内容 | 关键决策 |
|---------|---------|---------|
| 提示词工程 | 系统提示词对 7B 模型行为的影响 | 小模型精简、大模型完整 |
| 工具暴露策略 | 66 工具全量暴露的上下文成本 | 按模型规模分级暴露 (L1/L2/L3) |
| 引擎循环控制 | recursionLimit vs maxTurns 单位差异 | `maxTurns * 3 + 10` 公式 |
| 模型适配层 | API vs CLI 调用行为差异分析 | 模型能力感知矩阵 |
| 上下文管理 | 32K 窗口预算分配模型 | 工具 schema 占比 ≤ 6% |
| 失败恢复模式 | 连续失败计数 + checkpoint 兜底 | 3 次阈值 + finalResponse 优先 |

---

## 🔗 LangGraph 引擎集成（Phase A/B/C/D）

> **当前进度**: ✅ Phase A 已完成 (2026-06-29) | ✅ Phase B 已完成 (2026-06-29) | ✅ Phase C 已完成 (2026-06-29) | ✅ Phase D 已完成 (2026-06-29)

### 是什么？

EasyAgent 正在从硬编码 `while` 循环 (`AgentEngine`) 升级到声明式有向图引擎 (`LangGraphAgent`)，后者基于 `@langchain/langgraph ^0.2`，提供原生持久化、可视化、可扩展性。

### Phase A-B-C 文档导航

| 想了解的内容 | 看哪份文档 | 对应章节 |
|------------|-----------|---------|
| **架构** — 图结构、节点、Checkpoint 设计 | `packages/langgraph/docs/01_整体架构.md` | 全篇（含新增桥接层架构 §九） |
| **实现** — Phase A 桥接代码 + 技术决策 | `packages/langgraph/docs/06_LangGraph集成EasyAgent方案.md` | §四（方案） + §五（实施记录） |
| **周期** — 全部 Phase 的进度和路线 | `packages/langgraph/docs/03_开发路线图.md` | §Phase 6: 集成路线 |
| **优化** — 架构/测试/构建/文档优化 | `packages/langgraph/docs/06_LangGraph集成EasyAgent方案.md` | §七 优化建议 |
| **案例** — 10 行代码独立使用 | `packages/langgraph/docs/06_LangGraph集成EasyAgent方案.md` | §八 独立使用与应用前景 |
| **实施记录** — Phase A/B 增改文件、测试结果 | `packages/langgraph/docs/06_LangGraph集成EasyAgent方案.md` | §五 Phase A/B 实施记录 |
| **新手上手** — Demo 启动与环境 | `packages/langgraph/docs/05_启动与执行指南_新手向.md` | 全篇 |
| **引擎配置** — Server 引擎切换方式 | `packages/langgraph/docs/06_LangGraph集成EasyAgent方案.md` | §五.1 Phase B 实施记录 |
| **API** — Checkpoint 管理端点 | → `GET/POST /api/langgraph/sessions` (Server) | `server/src/langgraph/agentAdapter.ts` |

### 代码位置

```
packages/langgraph/src/bridge/    ← Phase A 桥接层（3 个文件）
  ├── adapterBridge.ts           ← BaseAdapter → thinkNode 回调
  ├── toolBridge.ts              ← ToolRegistry → actNode 回调
  └── AgentFactory.ts            ← 一键 createLangGraphAgent()
packages/langgraph/__tests__/integration.test.ts  ← 9 个集成测试

packages/server/src/langgraph/   ← Phase B Server 接入（3 个文件）
  ├── agentAdapter.ts            ← LangGraphAgent → AgentEngine 适配器
  ├── engineFactory.ts           ← createAgent() 双引擎工厂
  └── index.ts                   ← 公共导出
packages/server/src/__tests__/langgraph-engine.test.ts  ← 9 个 Phase B 测试

packages/frontend/src/components/LangGraph/  ← Phase C 前端可视化（6 个文件）
  ├── GraphCanvas.tsx            ← 有向图 SVG 画布
  ├── MiniFlowGraph.tsx          ← 迷你流转图
  ├── ScenarioCard.tsx           ← 场景卡片 + 终端日志
  ├── FlowZoomModal.tsx          ← 放大弹窗 (缩放/拖拽)
  └── SessionDetailModal.tsx     ← 🆕 Phase D Checkpoint 详情弹窗
packages/frontend/src/pages/LangGraph.tsx       ← Phase C 页面入口 (/langgraph)
packages/frontend/src/stores/langGraphStore.ts  ← Phase C/D Zustand Store (含 WebSocket + 遍历动画)
packages/server/src/index.ts                    ← 🆕 Phase D WebSocket 广播机制
```

---

## 📊 管线系统 —— 项目进度与数据

### 是什么？

管线系统是 EasyAgent 的"指挥中心"，可视化展示：项目进度、测试覆盖率、模块完成状态、问题跟踪、综合评分。

### 怎么访问

```bash
# 启动管线服务器
node docs/pipeline/server.mjs

# 浏览器打开
http://127.0.0.1:8899/index.html      # 仪表板
http://127.0.0.1:8899/api/pipeline    # 原始 API
```

### 9 张仪表板卡片

| 卡片            | 说明                        | 怎么看               |
| --------------- | --------------------------- | -------------------- |
| 🧪 测试用例总数 | 1578 用例 (1503+75)，按模块展开到 L4  | 点击卡片进入树形详情 |
| ✅ 测试通过率   | 按阶段分组，环形图+柱状图   | 看有没有红色（失败） |
| 🔧 内置工具数   | 51 工具，按组展开到参数签名 | 了解 Agent 能力边界  |
| 🤖 模型提供商   | 10 家国产模型               | 确认支持的模型       |
| 📈 综合评分     | 100/100，版本演进柱状图     | 看质量趋势           |
| 📋 项目进度     | 6 阶段完工率，进度条全绿    | 看开发到哪了         |
| ✅ 已完成模块   | 32/32 模块全部完成 (含 LangGraph 6 个新模块) | 按状态分组           |
| 🐛 问题记录     | 535+ 条，覆盖 23+ 模块      | 点击节点查看问题追溯 |
| 🗺️ SVG 管线图   | 32 节点全绿流动图 (含 LangGraph 6 模块) | 全局概览             |

### 数据怎么更新

```
你 git push → CI 自动跑测试 → CI 自动同步数据 → 你 git pull
```

本地快速刷新：`node scripts/unified-sync.mjs`

### 相关文档

| 文档                             | 内容                     |
| -------------------------------- | ------------------------ |
| `pipeline/ARCHITECTURE.md`       | 管线架构设计文档（24KB） |
| `pipeline/README.md`             | 管线模块说明             |
| `pipeline/memory-format-spec.md` | Memory 文件格式规范      |
| `pipeline/code-review-*.md`      | 历史代码评审报告         |

---

## 📝 开发规范入口

| 规范                 | 在哪                                         | 强制等级 |
| -------------------- | -------------------------------------------- | :------: |
| 编码注释规范         | `MEMORY.md` → 编码规范                       |   建议   |
| 调试日志规范         | `docs/36_调试日志规范体系.md`                | 🔴 强制  |
| Memory 记录格式      | `docs/pipeline/memory-format-spec.md`        | 🔴 强制  |
| 测试数据同步约束     | `MEMORY.md` → 测试数据同步约束（6 文件清单） | 🔴 强制  |
| 日志优先排查原则     | `MEMORY.md` → 日志优先排查原则（5 步流程）   | 🔴 强制  |
| Web↔Desktop 代码隔离 | `MEMORY.md` → 代码隔离约束                   | 🔴 强制  |
| 陷阱自愈规则         | `MEMORY.md` → 陷阱自愈规则                   | 🔴 强制  |

---

## 🐛 陷阱速查

**最常踩的坑**（完整 51 条见 `MEMORY.md` → 关键陷阱清单）：

|  #  | 陷阱                      | 一句话                                      |
| :-: | ------------------------- | ------------------------------------------- |
|  9  | better-sqlite3 编译失败   | 用预编译 .node + `npmRebuild:false`         |
| 21  | mime 缺失 Express 500     | desktop 显式添加 `mime@^1.6.0`              |
| 22  | MODULE_VERSION 不一致     | 构建前跑 build.bat Phase 2.5                |
| 29  | production CSS 布局错乱   | tailwind content 加 frontend 路径           |
| 33  | electron-rebuild 静默跳过 | 用 node-gyp rebuild 不要用 electron-rebuild |

---

## 🔗 关键链接

| 链接                                                                      | 说明                     |
| ------------------------------------------------------------------------- | ------------------------ |
| [GitHub 仓库](https://github.com/ht182400-creator/easyagent)              | 源码                     |
| [GitHub Releases](https://github.com/ht182400-creator/easyagent/releases) | 下载 EXE                 |
| [CI/CD 流水线](https://github.com/ht182400-creator/easyagent/actions)     | 查看构建状态             |
| `http://127.0.0.1:3456`                                                   | 本地后端服务             |
| `http://127.0.0.1:5173`                                                   | 本地前端开发服务         |
| `http://127.0.0.1:8899`                                                   | 本地管线仪表板           |
| `release-publish.bat`                                                     | 一键发布（本地全流程）   |
| `release-server.bat`                                                      | CI/CD 发布（仅推送标签） |
| `build.bat --release`                                                     | 仅构建 EXE               |

---

## 📂 项目文件地图

```
EasyAgent/
├── packages/
│   ├── core/         # 核心库 (Agent/工具/MCP/适配器)
│   ├── langgraph/    # 🆕 LangGraph 工作流引擎 (StateGraph + Checkpoint)
│   ├── server/       # Express 后端 (端口 3456, 双引擎切换)
│   ├── desktop/      # Electron 桌面应用
│   ├── web/          # Web Dashboard
│   ├── frontend/     # 共享前端组件 (Desktop+Web 共用)
│   ├── cli/          # 命令行工具
│   └── vscode/       # VS Code 扩展 (独立版本)
├── docs/             # 📖 项目文档 (← 你在这里)
├── Doc_project/      # 📚 文档浏览器 (独立 Vite React 项目, 内嵌于 EasyAgent 右侧面板)
├── scripts/          # 构建/发布/同步脚本
├── .codebuddy/
│   └── memory/       # AI 开发日志 + MEMORY.md
├── .github/workflows/# CI/CD 配置
├── version.json      # 唯一版本号 (同步到 7 个 package.json)
├── CHANGELOG.md      # 版本更新日志
├── build.bat         # Desktop EXE 构建入口
└── build-web.bat     # Web Dashboard 构建入口
```
