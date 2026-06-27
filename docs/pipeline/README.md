# EasyAgent 项目进度管线 · Pipeline Module

> 独立模块 | 流程图可视化 | 数据驱动 | 自动更新

## 文件结构

```
docs/pipeline/
├── index.html                  # SVG 动态流程图（主页面，含问题追溯面板 + 顶部仪表板）
├── server.mjs                  # Node.js HTTP 服务器（静态文件 + 实时问题解析 API + 文件级缓存）
├── .pipeline-cache.json        # 解析缓存（自动生成，按 mtime 增量更新）
├── memory-format-spec.md       # Memory 目录记录格式规范 v1.0
├── pipeline-data.json          # 管线数据源（16功能模块 + 10分支优化项）
├── project-progress.html       # 旧版备用页（列表/卡片双视图）
├── project-progress-data.json  # 旧版进度数据
├── issue-data.json             # 模块问题追溯数据（快照版，API 不可用时回退）
└── README.md                   # 本文件
```

## 架构说明

```
                    ┌──────────────────────┐
                    │  pipeline-data.json  │  ← 管线数据源
                    │  (phases + branches) │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  server.mjs   │────▶│  /api/issues │────▶│ .codebuddy/      │
│  (HTTP 8898)  │     │  实时解析API  │     │ memory/*.md      │
└──────┬───────┘     └──────┬───────┘     │ 动态读取+解析     │
       │                    │             └──────────────────┘
       ▼                    ▼
┌─────────────────────────────────────────────┐
│              index.html                      │
│  ① 顶部仪表板（KPI 统计）                     │
│  ② SVG 管线流程图（动态流动箭头）              │
│  ③ 右侧问题追溯面板（39+ 个问题实时数据）      │
│  ④ 数据加载策略：/api/issues → issue-data.json│
└─────────────────────────────────────────────┘
```

## 问题数据实时解析（带文件级缓存）

`server.mjs` 提供 `/api/issues` 端点，扫描 `.codebuddy/memory/*.md` 文件：

### 缓存机制（v1.0）

- **存量文件**（非今天 + mtime 未变）→ 直接复用 `.pipeline-cache.json` 缓存，不重新解析
- **今天文件** → 每次重新解析（可能还在追加内容）
- **实测效果**：6 个文件，首次全量解析 39 问题；后续请求 5/6 缓存命中（仅今天文件解析）
- **强制重建**：删除 `docs/pipeline/.pipeline-cache.json` 即可

### 解析规则

- 按 `## ` 标题分段，识别 `- **问题**：` / `- **根因**：` / `- **修复**：` 模式
- **优先**：`## [模块:F1] 标题` 中的显式模块标签（v1.0 新格式）
- **回退**：通过关键词映射到 26 个功能模块（存量文件兼容）
- 返回结构化 JSON（含 `_generatedAt` + `_cacheStats`）

### 格式规范

详见 `docs/pipeline/memory-format-spec.md`，新增记录需包含 `[模块:ID]` 标签和 `- **状态**:` 字段。

**加载策略**（`index.html` 内置）：

1. 优先 `fetch('/api/issues')` → 获取 **最新实时数据**（含缓存命中率）
2. 失败时回退 `fetch('issue-data.json')` → 使用快照数据
3. 仪表板底部显示数据来源（🟢 实时 @ 缓存命中率 / 🟡 快照）

## 核心特性

1. **动态流动箭头** — 主线紫色实线箭头 + 分支蓝色虚线箭头，CSS `stroke-dasharray` 动画
2. **高亮当前任务** — `in-progress` 节点带有 `glowPulse` 滤镜闪烁效果 + 状态图标闪烁
3. **分支管线** — P1/P2/P3 三个优化分支展示架构改进/质量保障/生态建设
4. **完整功能覆盖** — 16 个功能模块 + 10 个分支优化项
5. **KPI 仪表盘** — 测试用例/通过率/工具数/模型数/综合评分
6. **数据驱动** — 支持 `file://` 和 HTTP 两种访问模式
7. **模块问题追溯** — 点击任意功能卡片，右侧滑出该模块所有开发问题的完整时间线（问题→解决方案）

## 视觉元素

| 元素                   | 样式                | 含义           |
| ---------------------- | ------------------- | -------------- |
| 紫色实线箭头 ⇢         | 流动虚线动画 (2s)   | 主流程管线连接 |
| 蓝色虚线箭头 ⇢         | 流动虚线动画 (1.6s) | 分支优化管线   |
| 🟢 绿色实线节点        | `done`              | 已完成功能     |
| 🔵 蓝色节点 + 脉冲光晕 | `in-progress`       | 当前进行中     |
| ⬜ 灰色虚线节点        | `pending`           | 待启动         |

## 自动更新流程

```
git commit 完成
  ↓
.git/hooks/post-commit 触发
  ↓
node scripts/update-progress.mjs
  ↓
检测文件变化 → 更新 pipeline-data.json
  ↓
HTML 页面自动反映最新状态
```

## 数据同步

`scripts/update-progress.mjs` 中的 `syncPipelineData()` 函数会在更新旧版数据后，自动同步管线数据：

- 更新版本号和 meta 信息
- 更新 KPI 数值（测试用例数、模型数等）
- 检测分支优化节点的文件状态
- 写入 `docs/pipeline/pipeline-data.json`

## 预览

```bash
# 启动动态服务器（支持实时解析 memory 文件）
node docs/pipeline/server.mjs

# 浏览器打开
# http://127.0.0.1:8898/index.html
```

## 测试

管线模块自带 4 个测试文件，覆盖配置/缓存/解析/API 四个核心组件，共 58 个用例，使用 Node.js 内置测试运行器：

```bash
# 运行所有管线测试
node --test docs/pipeline/__tests__/pipeline-*.test.mjs

# 分别运行
node --test docs/pipeline/__tests__/pipeline-config.test.mjs  # 配置模块 29 用例
node --test docs/pipeline/__tests__/pipeline-cache.test.mjs   # 缓存模块 15 用例
node --test docs/pipeline/__tests__/pipeline-parser.test.mjs  # 解析器 8 用例
node --test docs/pipeline/__tests__/pipeline-api.test.mjs     # API 14 用例
```
