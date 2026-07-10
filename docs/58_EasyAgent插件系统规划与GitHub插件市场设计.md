# EasyAgent 插件系统增强规划与 GitHub 插件市场设计

> **文档编号**: 58  
> **日期**: 2026-07-01 | **更新**: 2026-07-02  
> **定位**: 架构师/全栈/产品/界面/测试/代码/维护多角色联合评审文档  
> **目标**: 在 EasyAgent 现有插件系统基础上，实现 **GitHub 插件浏览市场** + **安装/使用/更新** 全链路，并配套规划 **Obsidian 式文档图谱项目 (Doc_project)**。所有三个阶段已完成。

---

## 目录

- [§1 需求复述与范围界定](#1-需求复述与范围界定)
- [§2 需求合理性评估 (正反论证)](#2-需求合理性评估-正反论证)
- [§3 现有 EasyAgent 插件系统盘点](#3-现有-easyagent-插件系统盘点)
- [§4 GitHub 插件市场架构设计](#4-github-插件市场架构设计)
- [§5 数据模型设计](#5-数据模型设计)
- [§6 API 与协议设计](#6-api-与协议设计)
- [§7 前端界面设计 (UI/UX)](#7-前端界面设计-uiux)
- [§8 安全模型](#8-安全模型)
- [§9 测试策略](#9-测试策略)
- [§10 实现路线图 (P0→P3)](#10-实现路线图-p0p3)
- [§11 Doc_project 规划 (Obsidian-like 文档工具)](#11-doc_project-规划-obsidian-like-文档工具)
- [§12 风险与维护](#12-风险与维护)
- [§13 结论与建议](#13-结论与建议)

---

## §1 需求复述与范围界定

### 1.1 用户原始需求

| # | 需求 | 交付物位置 | 关键功能 |
|---|------|----------|----------|
| 1 | EasyAgent 支持插件功能 | EasyAgent 项目内 | 第三方插件市场、安装、使用、更新 |
| 2 | GitHub 上的插件项目 | `ht182400-creator` GitHub Org | 类似 Obsidian 的 MD 文档工具：预览目录、关系图谱、点击节点预览、搜索、知识库索引 |

### 1.2 拆解后的功能清单

#### EasyAgent 侧 (目标 1)

- **插件市场入口**: 设置页新增"第三方插件"标签页
- **浏览插件**: 从 GitHub 拉取插件列表 (类似 Obsidian Community Plugins)
- **搜索/筛选**: 按关键词、下载量、更新时间、评分筛选
- **插件详情**: 显示 README、版本、作者、GitHub 地址、权限、安装按钮
- **安装/卸载**: 一键下载 GitHub Release/源码 → 解压到用户插件目录 → 注册
- **启用/禁用**: 安全模式开关 + 单个插件开关
- **自动更新**: 检查新版本，支持批量/单个更新
- **本地安装**: 从本地 zip 文件安装插件

#### Doc_project 侧 (目标 2)

- **GitHub 仓库**: `easyagent-doc-viewer` 或类似名称
- **核心功能**:
  - 目录树浏览项目下所有 Markdown 文件
  - 关系图谱 (Graph View): 节点 = MD 文件，边 = 双向链接 `[[...]]`
  - 点击节点 → 右侧/下侧预览文档内容
  - 全文搜索 (标题 + 内容)
  - 知识库索引: 向量索引 + 语义搜索
- **部署形态**: 独立 Web 应用 / npm 包 / EasyAgent 插件

### 1.3 范围边界

```
本次规划边界:
✅ 必须做: 插件市场设计文档、API 设计、数据模型、UI 原型、测试策略
✅ 必须做: Doc_project 项目结构 + 架构文档
✅ 建议做: 最小可运行 Demo (MVP)
❌ 不做: 大规模插件生态运营、审核机制、付费插件、官方插件商店服务器
```

---

## §2 需求合理性评估 (正反论证)

### 2.1 正面论证 — 为什么应该做

| 角色 | 论点 | 权重 |
|------|------|------|
| **产品专家** | 插件生态是 Agent 平台从"工具"升级为"平台"的关键路径。Obsidian 5,000+ 插件是其核心壁垒。 | ⭐⭐⭐⭐⭐ |
| **架构师** | EasyAgent 已有 `PluginManager` + `PluginSandbox` + `PluginManifest` 三层基础，增量成本低。 | ⭐⭐⭐⭐ |
| **界面专家** | 用户对"Obsidian 式插件市场"有明确心智模型，UI 可高度复用其布局。 | ⭐⭐⭐⭐ |
| **代码专家** | 第三方插件可用 Worker 沙箱运行，安全风险可控；GitHub 作为 registry 免维护。 | ⭐⭐⭐⭐ |
| **维护专家** | 插件系统与核心解耦，新功能通过插件交付可减少 core 的发布频率。 | ⭐⭐⭐ |
| **测试专家** | 插件可独立测试，沙箱隔离后回归范围可控。 | ⭐⭐⭐ |

### 2.2 反面论证 — 风险与代价

| 角色 | 论点 | 风险等级 |
|------|------|----------|
| **安全专家** | 第三方插件即使沙箱隔离，仍可能通过社会工程学诱导用户授权危险权限。 | 🔴 高 |
| **维护专家** | GitHub API 限流、仓库删除/改名、Release 资产格式不统一会导致安装失败。 | 🟡 中 |
| **产品专家** | 插件质量参差不齐，用户可能因某个插件崩溃而归咎于 EasyAgent 主产品。 | 🟡 中 |
| **测试专家** | 插件组合爆炸，不同插件之间的 hook/tool 命名冲突难以完全避免。 | 🟡 中 |
| **架构师** | 当前 PluginSandbox 缺少网络白名单、文件系统 chroot、内存硬限制等高级隔离。 | 🟡 中 |
| **界面专家** | 前端需要新增大量设置页面，若设计不当会破坏现有简洁体验。 | 🟢 低 |

### 2.3 综合评估结论

```
结论: 需求合理，建议以"安全优先、MVP 验证、逐步开放"的节奏实施。

立即做 (P0):
  - 补齐 PluginSandbox 安全短板 (网络/文件/权限)
  - 实现 GitHub 插件市场基础浏览+安装

暂缓做 (P2):
  - 插件评分/评论系统
  - 官方审核机制
  - 付费插件
```

---

## §3 现有 EasyAgent 插件系统盘点

### 3.1 已具备能力

| 模块 | 文件 | 能力 | 成熟度 |
|------|------|------|--------|
| **类型定义** | `packages/core/src/plugins/types.ts` | IPlugin / ISkill / IPluginHook / 生命周期 | ⭐⭐⭐⭐ |
| **插件管理器** | `PluginManager.ts` | 加载/卸载/启用/禁用/批量加载/依赖检查 | ⭐⭐⭐⭐ |
| **Manifest 验证** | `PluginManifest.ts` | JSON Schema 验证、权限声明、semver | ⭐⭐⭐⭐ |
| **权限系统** | `PluginPermission.ts` | 危险权限检测、权限级别 | ⭐⭐⭐ |
| **沙箱系统** | `PluginSandbox.ts` | Worker 线程隔离、RPC 通信、资源限制 | ⭐⭐⭐ |
| **内置技能** | `BuiltinSkills.ts` | 6 个内置技能 | ⭐⭐⭐⭐ |
| **Worker 入口** | `PluginWorkerEntry.ts` | 插件 Worker 主循环 | ⭐⭐⭐ |

### 3.2 关键缺失

| 缺失项 | 影响 | 优先级 |
|--------|------|--------|
| **前端插件 UI** | 用户无法可视化安装管理插件 | P0 |
| **远程插件源** | 无法从 GitHub 浏览/下载 | P0 |
| **插件更新机制** | 安装后无法自动更新 | P0 |
| **插件仓库协议** | 缺少 GitHub 插件 registry 规范 | P0 |
| **网络沙箱白名单** | 插件可能访问任意 URL | P1 |
| **文件系统 chroot** | 插件可读写用户插件目录外文件 | P1 |
| **签名/校验** | 无法验证插件来源完整性 | P2 |
| **热重载** | 开发体验不佳 | P2 |

---

## §4 GitHub 插件市场架构设计

### 4.1 总体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EasyAgent 插件市场                           │
├─────────────────────────────────────────────────────────────────────┤
│  前端 (packages/frontend/src/pages/settings/plugins)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ 插件市场列表  │  │ 插件详情页    │  │ 已安装管理    │             │
│  │ - 搜索       │  │ - README     │  │ - 启用/禁用   │             │
│  │ - 筛选       │  │ - 权限展示    │  │ - 更新/卸载   │             │
│  │ - 排序       │  │ - 安装按钮    │  │ - 安全模式    │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                     │
│  ┌──────┴──────────────────┴──────────────────┴──────────────────┐  │
│  │                     pluginStore (Zustand)                      │  │
│  └──────┬───────────────────────────────────────────────────────┘  │
│         │ HTTP/WebSocket                                             │
├─────────┼────────────────────────────────────────────────────────────┤
│  后端 (packages/server/src/routes/pluginMarket.ts)                  │
│  ┌──────┴──────┐  ┌────────────────────┐  ┌──────────────────┐     │
│  │ API 路由     │  │ PluginMarketService │  │ GitHub Client    │     │
│  │ /api/plugins │  │ - 缓存插件列表       │  │ - GraphQL API    │     │
│  │ /api/install │  │ - 安装队列          │  │ - Release 下载   │     │
│  │ /api/update  │  │ - 版本比对          │  │ - README 解析    │     │
│  └─────────────┘  └────────────────────┘  └──────────────────┘     │
│         │                                                            │
├─────────┼────────────────────────────────────────────────────────────┤
│  本地                                                                  │
│  ┌──────┴──────┐  ┌──────────────────────┐  ┌────────────────────┐  │
│  │ 用户插件目录  │  │  PluginManager       │  │  PluginSandbox     │  │
│  │ ~/.easyagent/ │  │  - 加载/卸载/启用     │  │  - Worker 隔离      │  │
│  │   plugins/   │  │  - 依赖解析           │  │  - RPC 代理         │  │
│  └─────────────┘  └──────────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

数据来源:
  GitHub Topic: easyagent-plugin
  GitHub Search: topic:easyagent-plugin
  可选: 官方 curated-list 仓库 ht182400-creator/easyagent-plugins
```

### 4.2 插件 Registry 协议

为了让 GitHub 上的仓库能被 EasyAgent 识别为插件，约定以下规范：

#### 4.2.1 仓库命名与 Topic

- 仓库名建议: `easyagent-plugin-{name}` 或 `{name}-easyagent-plugin`
- 必须 Topic: `easyagent-plugin`
- 可选 Topic: `easyagent-skill`, `easyagent-tool`, `easyagent-theme`

#### 4.2.2 仓库结构

```
my-easyagent-plugin/
├── manifest.json          # 必需，插件元信息
├── plugin.js / plugin.mjs # 必需，入口文件 (与 manifest.main 对应)
├── README.md              # 必需，插件说明
├── package.json           # 可选，声明 npm 依赖
├── icon.svg / icon.png    # 可选，插件图标
└── screenshots/           # 可选，截图
```

#### 4.2.3 manifest.json 字段扩展

```json
{
  "name": "obsidian-doc-viewer",
  "version": "1.0.0",
  "description": "Obsidian-like Markdown document viewer for EasyAgent",
  "main": "plugin.js",
  "author": "ht182400-creator",
  "license": "MIT",
  "repository": "https://github.com/ht182400-creator/easyagent-plugin-obsidian-doc-viewer",
  "keywords": ["viewer", "markdown", "graph"],
  "engines": {
    "easyagent": ">=0.6.23",
    "node": ">=18.0.0"
  },
  "permissions": {
    "filesystem": { "read": ["**/*.md"], "write": false },
    "network": { "domains": ["api.github.com"] }
  },
  "icon": "icon.svg",
  "screenshots": ["screenshots/graph.png"],
  "minApiVersion": "0.6.23"
}
```

### 4.3 GitHub 插件发现机制

#### 方案 A: GitHub Topic 搜索 (推荐 MVP)

```typescript
// 使用 GitHub Search API
GET https://api.github.com/search/repositories?q=topic:easyagent-plugin
```

**优点**: 零成本、社区自发注册  
**缺点**: 受 API 限流 (60 req/hr 未认证 / 5000 req/hr 认证)

#### 方案 B: Curated Registry 仓库

创建 `ht182400-creator/easyagent-plugins` 仓库，维护 `plugins.json`：

```json
{
  "version": "2026-07-01",
  "plugins": [
    {
      "name": "obsidian-doc-viewer",
      "repo": "ht182400-creator/easyagent-plugin-obsidian-doc-viewer",
      "categories": ["viewer"],
      "verified": true
    }
  ]
}
```

**优点**: 质量可控、可排序推荐、避免 GitHub API 限流  
**缺点**: 需要人工维护

#### 推荐组合

```
MVP: 方案 A (GitHub Topic 搜索) + 本地缓存
长期: 方案 B (Curated Registry) 作为可信源，方案 A 作为补充
```

---

## §5 数据模型设计

### 5.1 前端状态 (pluginStore)

```typescript
// packages/frontend/src/stores/pluginStore.ts
interface PluginMarketState {
  // 市场列表
  marketPlugins: RemotePluginInfo[];
  marketLoading: boolean;
  marketError: string | null;
  searchQuery: string;
  selectedCategory: string | null;
  sortBy: 'downloads' | 'updated' | 'name';

  // 已安装
  installedPlugins: InstalledPluginInfo[];
  installedLoading: boolean;

  // 操作状态
  installProgress: Map<string, PluginInstallProgress>;
  updateCheckResult: Map<string, UpdateInfo>;

  // 安全
  safeMode: boolean;
}

interface RemotePluginInfo {
  id: string;              // owner/repo
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  updatedAt: string;
  stars: number;
  repoUrl: string;
  readmeHtml?: string;
  permissions: PluginPermissions;
  iconUrl?: string;
}

interface InstalledPluginInfo extends RemotePluginInfo {
  installedVersion: string;
  enabled: boolean;
  installedAt: string;
  source: 'market' | 'local' | 'github';
  localPath: string;
}

interface PluginInstallProgress {
  status: 'downloading' | 'extracting' | 'verifying' | 'registering' | 'done' | 'error';
  progress: number; // 0-100
  message?: string;
}
```

### 5.2 后端实体

```typescript
// packages/server/src/types/pluginMarket.ts
interface PluginRegistryEntry {
  id: string;           // owner/repo
  name: string;
  repo: string;
  latestVersion: string;
  manifestUrl: string;
  downloadUrl: string;  // GitHub Release zipball
  publishedAt: string;
  lastFetchedAt: number;
}

interface PluginCache {
  entries: PluginRegistryEntry[];
  etag?: string;
  fetchedAt: number;
  ttl: number;          // 默认 1小时
}

interface InstallJob {
  jobId: string;
  pluginId: string;
  version: string;
  status: 'pending' | 'downloading' | 'extracting' | 'loading' | 'done' | 'error';
  error?: string;
  progress: number;
}
```

### 5.3 持久化存储

| 数据 | 存储位置 | 格式 |
|------|----------|------|
| 已安装插件元信息 | `~/.easyagent/plugins/installed.json` | JSON |
| 插件缓存 | `~/.easyagent/plugins/.cache/market.json` | JSON |
| 插件源码 | `~/.easyagent/plugins/{pluginName}/` | 目录 |
| 安装任务状态 | Server 内存 (短生命周期) | Map |

---

## §6 API 与协议设计

### 6.1 REST API

```
GET  /api/plugins/market          # 获取市场插件列表 (带缓存)
GET  /api/plugins/market/:id      # 获取单个插件详情 + README
POST /api/plugins/install         # 安装插件 { pluginId, version? }
GET  /api/plugins/install/:jobId  # 查询安装进度
POST /api/plugins/uninstall/:id   # 卸载插件
POST /api/plugins/enable/:id      # 启用插件
POST /api/plugins/disable/:id     # 禁用插件
POST /api/plugins/update/:id      # 更新插件
POST /api/plugins/update-check    # 批量检查更新
GET  /api/plugins/installed       # 已安装插件列表
POST /api/plugins/install-local   # 从本地上传 zip 安装
GET  /api/plugins/safe-mode       # 获取安全模式状态
POST /api/plugins/safe-mode       # 设置安全模式 { enabled }
```

### 6.2 WebSocket 事件

```typescript
// 安装进度实时推送
interface PluginInstallProgressEvent {
  type: 'plugin:install:progress';
  jobId: string;
  pluginId: string;
  progress: number;
  status: string;
  message?: string;
}

// 安装完成/失败
interface PluginInstallCompleteEvent {
  type: 'plugin:install:complete' | 'plugin:install:error';
  jobId: string;
  pluginId: string;
  error?: string;
}

// 插件状态变更
interface PluginStateChangeEvent {
  type: 'plugin:state:change';
  pluginId: string;
  enabled: boolean;
}
```

### 6.3 GitHub API 调用策略

```typescript
// 未认证限流 60/hr，认证后 5000/hr
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || config.githubToken;

// 1. 搜索插件仓库
GET https://api.github.com/search/repositories?q=topic:easyagent-plugin&sort=updated&order=desc&per_page=100
Header: Authorization: Bearer ${GITHUB_TOKEN}

// 2. 获取 Release 信息
GET https://api.github.com/repos/{owner}/{repo}/releases/latest

// 3. 下载插件包
GET https://api.github.com/repos/{owner}/{repo}/zipball/{tag}

// 4. 获取 README
GET https://api.github.com/repos/{owner}/{repo}/readme
Accept: application/vnd.github.html+json  // 返回 HTML 便于展示
```

---

## §7 前端界面设计 (UI/UX)

### 7.1 设置页结构

```
设置
├── 关于
├── 编辑器
├── 文件与链接
├── 外观
├── 快捷键
├── 钥匙串
├── 核心插件
└── 第三方插件  ← 新增入口
    ├── 社区插件市场  ← 默认标签
    ├── 已安装插件
    └── 安全模式开关
```

### 7.2 社区插件市场界面

```
┌─────────────────────────────────────────────────────────────────────┐
│  搜索社区插件...                [仅显示已安装 □]   [排序 ▼]  [刷新]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │ [图标]         │  │ [图标]         │  │ [图标]         │        │
│  │ Obsidian Doc   │  │ Code Review    │  │ Unit Test      │        │
│  │ Author: ht...  │  │ Author: devA   │  │ Author: devB   │        │
│  │ ⬇ 1.2k  3天前  │  │ ⬇ 856  1周前   │  │ ⬇ 432  2周前   │        │
│  │ Markdown 文档  │  │ 自动代码审查   │  │ 自动生成单元测试│       │
│  │ [安装]         │  │ [安装]         │  │ [已安装]       │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
│                                                                     │
│  ...                                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 插件详情弹窗

```
┌────────────────────────────────────────────────────────────────┐
│ ←  Obsidian Doc Viewer                              [安装] [×] │
├────────────────────────────────────────────────────────────────┤
│ [图标]  Obsidian Doc Viewer  v1.0.0                            │
│ 作者: ht182400-creator  |  下载: 1,234  |  更新: 3天前          │
│ GitHub: github.com/.../easyagent-plugin-obsidian-doc-viewer    │
│                                                                 │
│ 权限声明:                                                       │
│  ⚠ 读取本地 Markdown 文件                                      │
│  ⚠ 访问 api.github.com                                         │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│ ## 功能                                                         │
│ Obsidian-like Markdown document viewer...                       │
│                                                                 │
│ ### 关系图谱                                                   │
│ ... (README 渲染)                                               │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 7.4 已安装插件界面

```
┌────────────────────────────────────────────────────────────────┐
│  安全模式:  [已关闭 □]  开启以限制第三方插件运行                 │
│                                                                 │
│  已安装 3 个插件                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [图标] Obsidian Doc Viewer  v1.0.0  ● 已启用             │  │
│  │        作者: ht182400-creator  |  v1.0.1 可用            │  │
│  │        [禁用] [卸载] [更新] [配置]                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ...                                                            │
└────────────────────────────────────────────────────────────────┘
```

### 7.5 关键交互原则

1. **危险权限必须显式确认**: 安装前弹窗展示权限清单
2. **安装进度可感知**: WebSocket 推送进度条
3. **安装失败可回滚**: 自动清理临时目录
4. **安全模式一键恢复**: 所有第三方插件立即禁用
5. **插件崩溃不影响主应用**: Worker 沙箱隔离 + 错误边界

### 7.6 插件使用方法（用户指南）🆕 v0.6.24+

#### 概述

插件安装并启用后，**不需要手动点击"使用"按钮**。插件注册的工具/技能会自动进入 EasyAgent 的全局工具表（`ToolRegistry`），AI 在对话中就能识别并调用。这是 AI-native 插件模式的核心设计理念——用户通过自然语言驱动插件，而非传统 IDE 插件的快捷键/菜单触发。

#### 工作链路

```
用户发消息 "查看当前项目的文档关系图谱"
    ↓
  【需要 LLM 模型】AI 理解意图 → 判断该调用 open-doc-viewer 工具
    ↓
  【纯本地执行】工具在 Worker 沙箱里执行插件代码
    ↓
  【纯本地渲染】前端拿到数据，渲染成可视化结果
```

**关键认知**：即使插件工具完全在本地运行（如文档图谱扫描本地目录），触发工具调用的"意图理解 + 工具选择"步骤仍然需要 LLM 推理。这意味着 **Ollama（或任何 LLM provider）必须处于可用状态**，否则 AI 无法决定调用哪个工具。

#### 各页面分工

| 操作 | 页面 | 说明 |
|------|------|------|
| 浏览/搜索/安装/卸载插件 | `/plugins` | 插件市场页面，三标签页（社区/已安装/安全） |
| **使用插件功能** | `/chat` | 对话页面，用自然语言让 AI 调用 |
| 查看所有可用工具（含插件） | `/tools` | 工具管理页面，展示全部注册的工具清单 |
| 查看所有可用技能（含插件） | `/skills` | 技能管理页面 |

#### 使用示例

以 `obsidian-doc-viewer` 插件为例（注册工具 `open-doc-viewer`）：

1. 在 `/plugins` → "社区插件市场" 点击安装
2. 在 `/plugins` → "已安装插件" 确认状态为"已启用"
3. 切换到 `/chat` 对话页面
4. 发送消息：**"打开文档浏览器"** 或 **"查看当前项目的文档关系图谱"**
5. AI 自动调用 `open-doc-viewer` 工具，对话中出现可展开的工具调用卡片（`ToolCallCard`）

#### 常见问题

**Q: 已经安装并启用插件，但发消息后 AI 回复"错误: fetch failed"？**

A: 这通常是 LLM provider 不可达导致的。插件工具调用需要 AI 先理解意图并选择工具，这步推理必须经过 LLM。排查步骤：
1. 检查 Ollama 是否启动：`ollama serve`（默认 provider）
2. 或切换到已配置 API Key 的云端模型（`/模型` 页面）
3. 临时可用内置引擎标签验证（无 LangGraph 图谱能力）

**Q: 插件工具和内置工具有什么区别？**

A: 使用上没有区别。二者都在同一个 `ToolRegistry` 中，AI 根据用户意图自动选择调用哪个。区别仅在于插件工具运行在 Worker Threads 沙箱中（隔离更强），内置工具运行在主进程。

### 7.7 插件开发契约（Tool.execute 返回值规范）🆕 v0.6.24+

#### 接口契约

`ITool.execute()` 的契约签名（`packages/core/src/tools/ToolRegistry.ts:9-26`）：

```typescript
export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolDefinition['parameters'];
  readonly requiresConfirm: boolean;
  readonly group?: string;

  /** 执行工具 — 必须返回 ToolResult 而非原始字符串 */
  execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

**必须遵守的返回格式**：

```javascript
// ✅ 正确：返回 ToolResult 对象
async execute({ workspacePath }) {
  return {
    success: true,
    content: `文档浏览器已启动，工作区: ${workspacePath || '当前目录'}`,
  };
}

// ❌ 错误：返回字符串（即便 TS 类型断言放行，也会导致运行时错误）
async execute({ workspacePath }) {
  return `文档浏览器已启动，工作区: ${workspacePath || '当前目录'}`;
}
```

#### 错误示范与"未知错误"陷阱

如果插件错误地返回字符串，会引发如下连锁反应（2026-07-02 实测）：

```
1. plugin.execute() → 返回字符串 "文档浏览器已启动..."
2. Worker postMessage 把字符串当 data 发回主线程
3. PluginSandbox.createProxyTool.execute() → 直接 as Promise<ToolResult> 透传
4. ToolRegistry.execute() → 拿到字符串后 return result
5. actNode.executeSingleTool() 看到 result.success === undefined (falsy)
   → 走 else 分支 → 错误前缀 "工具执行失败: " + result.error || '未知错误'
   → 错误信息变成 "工具执行失败: 未知错误"
6. LLM 看到这条"工具失败"反馈 → 误以为工具坏了
   → 触发 think→act→observe 无意义反思循环
   → 耗时 144s 输出 282 字"反思"消息（截图里那段"恭喜您做出了一个非常棒的尝试"）
```

#### 四层防御（Defense in Depth）

EasyAgent 在 4 个层面对该契约违规做兜底：

| 层 | 文件 | 行为 |
|----|------|------|
| **L1 插件** | `packages/easyagent-plugin-obsidian-doc-viewer/plugin.js` | 直接返回 ToolResult |
| **L2 模板** | `packages/plugin-template/plugin.js` | 模板以身作则，注释警告 |
| **L3 沙箱** | `packages/core/src/plugins/PluginSandbox.ts` `normalizePluginResult()` | 兜底 4 种形态（标准/半结构/字符串/null）→ 强制规范为 ToolResult |
| **L4 执行节点** | `packages/langgraph/src/nodes/actNode.ts` `executeSingleTool()` | 检测 `result.success` 缺失时按成功处理 + 附加"系统提示" |

#### 常见错误日志与定位

| 错误现象 | 真正原因 | 修复 |
|---------|---------|------|
| `工具执行失败: 未知错误` | 插件返回 string 或 undefined 而非 ToolResult | 修复 plugin.js 用 `{success, content}` 返回 |
| `LLM 反思 144s + 282 字"恭喜"消息` | 插件返回结构异常被 LLM 当作工具失败 → 走无意义循环 | 修复 plugin + 检查 PluginSandbox 规范化是否生效 |
| `actNode 工具并行执行 50ms 返回，contentLen: 12` | 错误信息前缀"工具执行失败: 未知错误"刚好 12 字节 | 同上 |

#### 调试方法

1. **看后端日志**：`工具执行失败: <tool>` + `args: {...}` 即可判断是参数问题还是返回值问题
2. **看前端 ToolCallCard**：展开工具调用卡片，input 显示 LLM 传入的参数，output 显示工具返回内容
3. **快速验证**：在 plugin.js 里 `console.log` 输出形状，actNode 透传到 ToolMessage content
4. **直接测 RPC**：`node -e "import('./plugin.js').then(m => console.log(m.default.toString()))"` 静态检查导出

---

## §8 安全模型

### 8.1 多层安全架构

```
Layer 1: GitHub 来源验证
  - 仅允许通过 HTTPS 从 github.com 下载
  - 校验下载包 SHA256 (从 Release 资产获取)

Layer 2: Manifest 验证
  - 必填字段检查
  - 权限声明白名单
  - semver/easyagent 版本兼容

Layer 3: 权限授权
  - 安装前用户必须确认权限清单
  - 危险权限 (fs:write, shell:network) 必须单独授权

Layer 4: Worker 沙箱隔离
  - 第三方插件在 worker_threads 中运行
  - 资源限制: 256MB 内存, 30s 超时

Layer 5: 网络/文件访问代理
  - 插件无法直接访问 fetch/fs
  - 所有访问通过主进程代理，按 manifest 权限过滤

Layer 6: 安全模式
  - 用户可一键禁用所有第三方插件
  - 启动异常时自动进入安全模式
```

### 8.2 权限清单 (扩展)

```typescript
interface PluginPermissions {
  filesystem?: {
    read?: string[];    // glob 数组，如 ["**/*.md"]
    write?: string[];   // 写权限更危险
  };
  network?: {
    domains?: string[]; // 允许访问的域名
    allowAll?: boolean; // 默认 false
  };
  shell?: boolean;      // 是否允许执行 shell
  notifications?: boolean;
  clipboard?: boolean;
}
```

---

## §9 测试策略

### 9.1 测试金字塔

```
        /
       / \     E2E 测试 (5%)
      /   \    - 完整安装→启用→使用→卸载流程
     /_____\
    /       \  集成测试 (25%)
   /         \ - GitHub API 客户端
  /___________\- PluginMarketService
 /             \
/_______________\ 单元测试 (70%)
                  - Manifest 验证
                  - 权限检查
                  - 沙箱 RPC
                  - 安装进度状态机
```

### 9.2 关键测试用例

| 用例 | 类型 | 说明 |
|------|------|------|
| 正常安装 GitHub 插件 | E2E | 从真实/模拟 GitHub 下载并加载 |
| Manifest 缺少字段拒绝安装 | 单元 | 验证必填字段校验 |
| 危险权限必须用户确认 | 集成 | 安装流程阻塞等待确认 |
| 插件崩溃不影响主应用 | 集成 | Worker 异常后主应用继续运行 |
| 安全模式禁用所有第三方插件 | E2E | 一键切换后插件不再加载 |
| 安装失败自动清理 | 单元 | 临时文件不残留 |
| GitHub API 限流降级 | 集成 | 使用本地缓存 |
| 插件更新版本比对 | 单元 | semver 比较逻辑 |

### 9.3 Mock 策略

```typescript
// 避免测试依赖真实 GitHub
const mockGitHubClient = {
  searchRepositories: vi.fn().mockResolvedValue([mockPlugin]),
  getLatestRelease: vi.fn().mockResolvedValue(mockRelease),
  downloadAsset: vi.fn().mockResolvedValue(zipBuffer),
};
```

### 9.4 已知问题与修复记录

#### 9.4.1 前端安装进度卡"准备中"（WebSocket 未建立）🆕 v0.6.24+

**症状**：后端日志显示安装流程全部成功（"安装完成"、"插件已注册到 PluginManager"），但前端 `/plugins` 页面按钮始终卡在"准备中…"，不切换为"已安装"。

**根因**：前端 `PluginsMarket.tsx` 的安装进度完全依赖 WebSocket 推送 `plugin:install:progress` 事件。但 WebSocket 连接是**懒加载**的——只有用户进入"对话"页面时 `chatStore` 才会 `new WebSocket(url)`。在 `/plugins` 页面安装插件时 WebSocket 根本没建立，后端广播的事件无人接收，`installProgress` Map 永远停留在 `pending` 状态。

**修复**（2026-07-01）：

1. **HTTP 轮询兜底**：`installPlugin()` 调用后端返回 jobId 后，启动 `pollInstallJob()`（每 1s 轮询 `GET /api/plugins/install/:jobId`，最多 60s），将进度通过同一 `updateInstallProgress()` 推入 store。
2. **终态清理 progress 条目**：`updateInstallProgress()` 在 `status === 'done' || 'error'` 时删除 `installProgress` Map 中对应条目，避免残留记录锁定 UI。
3. **自动追加到 installed 列表**：`done` 时自动将新插件追加到 `installed` 数组，无需手动刷新。

**改动文件**：`packages/frontend/src/stores/pluginsStore.ts`（+50 行）。

**测试**：`pluginsStore.test.ts` 新增 2 用例（终态清理 + 自动追加），共 7/7 通过。

**预防**：WebSocket 推送 + HTTP 轮询双通道，确保在任何页面安装插件都能收到进度完成通知。

#### 9.4.2 "已安装插件"列表含某插件，但"社区插件市场"仍显示"使用"按钮 🆕 v0.6.24+

**症状**：在"已安装插件"标签下能看到 `obsidian-doc-viewer`（带"已启用"标签），但切换到"社区插件市场"后，对应卡片仍显示"使用/卸载"按钮而非"已安装"徽标。

**根因**：`fetchInstalled()` 在合并本地 + PluginManager 数据时，会将 `id` 改写为 `local:<name>` 形式（兼容本地插件 id 缺失场景）。但 `fetchMarketplace()` 注入"已安装"状态时仅按 `installedIds.has(p.id)` 严格匹配。marketplace 返回的 `p.id` 是 `obsidian-doc-viewer`，与 `local:obsidian-doc-viewer` 永远不等 → 按钮全部错误显示"使用"。

**修复**（2026-07-01）：

1. `fetchMarketplace()` 改用 `installedNames` Set 同时按 `id` 和 `name` 匹配（兼容两种 id 形式）。
2. 匹配公式：`installedIds.has(p.id) || installedNames.has(p.id) || installedNames.has(p.name)`。

**改动文件**：`packages/frontend/src/stores/pluginsStore.ts:188-203`（+10 行）。

**测试**：`pluginsStore.test.ts` 新增 1 用例（`fetchMarketplace` 通过 name 匹配已安装插件），共 8/8 通过。

**预防**：数据合并/去重场景下，单一字段匹配（尤其 `id` 形式可能被人改写的情况下）极易踩坑。应同时按多个稳定字段匹配（id + name），或统一规范化 id 形式。

#### 9.4.3 AI 回复"fetch failed" — Ollama 未启动导致 LLM 不可达 🆕 v0.6.24+

**症状**：用户在 LangGraph 模式下发送消息（如"查看当前项目的文档关系图谱"），AI 回复气泡显示"错误: fetch failed"，Token=0，耗时 500ms 左右。但后端服务（3456 端口）正常，`/api/health` 返回 200。

**排查步骤**（2026-07-02）：

1. 确认后端服务正常：`Test-NetConnection localhost:3456` ✅
2. 确认后端 API 正常：`curl /api/health` / `/api/tools` / `/api/sessions` 均 200 ✅
3. 检查 LLM provider 状态：`Test-NetConnection localhost:11434` ❌ **Ollama 未启动**

**根因**：EasyAgent 默认 provider 为 Ollama（`http://localhost:11434/v1`）。LangGraph 引擎链路为：

```
用户发消息 → WebSocket → Server
  → LangGraph Agent.start() → thinkNode → adapterBridge
    → BaseAdapter.chat() → Node.js fetch('http://localhost:11434/v1/chat/completions')
      → ECONNREFUSED → Node fetch 抛 'fetch failed'
        → LangGraph catch error → emit type=error
          → Server 转发给前端 → 显示 "错误: fetch failed"
```

注意：Chrome 100+ / Node.js 22+ 将错误信息从 `'Failed to fetch'` 改为 `'fetch failed'`（更短）。`request.ts:125` 的重试逻辑仅匹配旧版字符串，导致新版环境重试不生效。

**修复方案**：

| 方案 | 操作 | 适用场景 |
|------|------|---------|
| A：启动 Ollama | `ollama serve`，确保模型已拉取（如 `ollama pull qwen3.5:9b`） | 本地开发，无需 API Key |
| B：切换云端模型 | 进 `/模型` 页面选已配 Key 的 provider | 有云端 API Key 时 |
| C：切内置引擎 | 顶部 Tab 切到"内置引擎" | 临时验证，无 LangGraph 能力 |

**长期改进建议**：
- 后端 adapter 层 catch 时判断目标端口 → 给出友好提示（如"Ollama 服务未启动，请运行 ollama serve"）
- 前端区分后端宕机（HTTP 503）vs 上游 LLM 不可达（fetch failed 来自适配器层），给出不同级别的错误提示
- `/api/config` 可快速诊断当前 provider 状态（已有端点）

#### 9.4.4 插件 `execute` 返回 string 而非 ToolResult → "工具执行失败: 未知错误" → LLM 反思循环 🆕 v0.6.24+

**症状**（2026-07-02 实测截图）：
- Ollama 已启动 + LLM 推理成功（130s），决定调用 `open-doc-viewer`
- 工具执行返回 `args: {}`（LLM 没传参）
- ToolMessage content 变成 `工具执行失败: 未知错误`（12 字节）
- LLM 收到"工具失败"反馈 → 走 144s 无意义 think→act→observe 循环
- 最终输出 282 字的"反思"回复（"恭喜您做出了一个非常棒的尝试"），但工具实际没被调用

**根因链路**（详见 §7.7）：

```
plugin.execute() 返回 "string"
  ↓
PluginSandbox.createProxyTool.execute() as Promise<ToolResult> 透传
  ↓
ToolRegistry.execute() 拿到字符串后 return result
  ↓
actNode.executeSingleTool() result.success === undefined (falsy)
  ↓
走 else 分支 → 错误信息 "工具执行失败: 未知错误"
  ↓
LLM 误判"工具坏了" → 反思循环
```

**四层防御修复**（v0.6.24+）：

| 层 | 文件 | 改动 |
|----|------|------|
| L1 插件 | `packages/easyagent-plugin-obsidian-doc-viewer/plugin.js` | `return "string"` → `return { success: true, content: "..." }` |
| L2 模板 | `packages/plugin-template/plugin.js` | 同步修复 + 注释警告 |
| L3 沙箱 | `packages/core/src/plugins/PluginSandbox.ts` | 新增 `normalizePluginResult()` 兜底 4 种形态 |
| L4 执行 | `packages/langgraph/src/nodes/actNode.ts` | `executeSingleTool` 检测非标准返回值时按成功处理 + 附加系统提示 |

**修复后日志变化**：

| 修复前 | 修复后 |
|--------|--------|
| `[actNode] 工具结果: open-doc-viewer \| {"success":false,"contentLen":12,"contentPreview":"工具 执行失败: 未知错误"}` | `[actNode] 工具执行成功: open-doc-viewer \| {"contentLen":14}` |
| LLM 反思 144s + 282 字"恭喜" | 直接进入文档浏览器 UI |

**关联陷阱**（MEMORY #47）：插件 `execute` 返回 string 而非 ToolResult → "工具执行失败: 未知错误" → LLM 无意义反思循环

**长期改进建议**：
- 在 `PluginManager.install()` 后做"插件健康检查"：注册一个空 tool，调用一遍确保返回值符合契约，不符合则警告用户
- 提供 `easyagent-plugin-validate` CLI 工具，静态分析 plugin.js 源码是否遵守契约
- `ITool.execute` 返回类型从 `Promise<ToolResult>` 改为 branded type `Promise<Brand<ToolResult, 'ToolResult'>>` 防止 `as` 断言绕过

---

## §10 实现路线图 (P0→P3)

### 🔴 P0 — MVP (2-3 周)

| # | 任务 | 交付物 | 负责人 |
|---|------|--------|--------|
| P0-1 | 设计并实现 PluginMarketService | `packages/server/src/services/PluginMarketService.ts` | 后端 |
| P0-2 | 新增 Server API 路由 | `packages/server/src/routes/pluginMarket.ts` | 后端 |
| P0-3 | 实现 GitHub 搜索/Release 下载 | `packages/server/src/utils/githubClient.ts` | 后端 |
| P0-4 | 增强 PluginSandbox 网络/文件代理 | `PluginSandbox.ts` + `PluginWorkerEntry.ts` | 核心 |
| P0-5 | 前端插件市场页面 | `packages/frontend/src/pages/settings/PluginsPage.tsx` | 前端 |
| P0-6 | 前端 pluginStore | `packages/frontend/src/stores/pluginStore.ts` | 前端 |
| P0-7 | 安装进度 WebSocket 推送 | Server broadcast + frontend listener | 全栈 |
| P0-8 | 编写单元测试 | coverage ≥ 70% | 测试 |

### 🟡 P1 — 稳定版 (3-4 周)

| # | 任务 | 交付物 |
|---|------|--------|
| P1-1 | Curated Registry 仓库 | `ht182400-creator/easyagent-plugins` |
| P1-2 | 插件自动更新 | 后台检查 + 批量更新 |
| P1-3 | 本地 zip 安装 | 拖放/文件选择上传 |
| P1-4 | 插件配置持久化 | 每个插件独立 config.json |
| P1-5 | 安全模式启动 | 崩溃后自动进入 |
| P1-6 | README 渲染优化 | markdown-it + 代码高亮 |

### 🟢 P2 — 体验增强 (4-6 周)

| # | 任务 | 交付物 |
|---|------|--------|
| P2-1 | 插件评分/下载统计展示 | 前端 UI |
| P2-2 | 插件图标/截图展示 | 图片懒加载 |
| P2-3 | 插件分类筛选 | category tags |
| P2-4 | 插件热重载 (开发模式) | watch + reload |
| P2-5 | 插件开发者文档 | `docs/59_插件开发指南.md` |

### 🔵 P3 — 生态 (远期)

| # | 任务 | 交付物 |
|---|------|--------|
| P3-1 | 官方插件审核机制 | 人工/自动审核 |
| P3-2 | 插件崩溃报告收集 | 遥测 (可选) |
| P3-3 | 付费/赞助插件支持 | Stripe/微信支付 |

---

## §11 Doc_project 规划 (Obsidian-like 文档工具)

### 11.1 项目定位

```
名称: easyagent-doc-viewer (建议)
定位: EasyAgent 生态下的 Obsidian-like Markdown 文档浏览器
用途: 1) 独立 Web 应用  2) EasyAgent 插件  3) GitHub Pages 部署
```

### 11.2 仓库结构

```
D:\Work_Area\AI\Doc_project\
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── FileTree.tsx        # 左侧目录树
│   │   ├── GraphView.tsx       # 关系图谱 (D3/Force)
│   │   ├── MarkdownPreview.tsx # MD 预览
│   │   ├── SearchPanel.tsx     # 搜索面板
│   │   └── Toolbar.tsx         # 顶部工具栏
│   ├── hooks/
│   │   ├── useFileSystem.ts    # 文件扫描
│   │   ├── useGraphData.ts     # 图谱数据构建
│   │   └── useSearch.ts        # 搜索逻辑
│   ├── services/
│   │   ├── fsScanner.ts        # 扫描本地/远程 MD 文件
│   │   ├── linkParser.ts       # 解析 [[WikiLink]]
│   │   ├── searchIndex.ts      # 全文索引 (FlexSearch)
│   │   └── vectorIndex.ts      # 向量索引 (wasm embedding)
│   ├── stores/
│   │   └── docStore.ts         # Zustand 状态
│   ├── types/
│   │   └── index.ts
│   └── styles/
│       └── index.css
├── public/
│   └── manifest.json
├── tests/
│   └── *.test.ts
└── docs/
    ├── 00_项目规划.md          # 本文档对应物
    ├── 01_架构设计.md
    └── 02_开发指南.md
```

### 11.3 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| 框架 | React 18 + TypeScript | 与 EasyAgent 一致，便于复用 |
| 构建 | Vite | 快速 HMR |
| 样式 | Tailwind CSS | 与 EasyAgent 一致 |
| 图谱 | D3.js (force-directed) | 成熟、可控 |
| MD 渲染 | react-markdown + remark-gfm | 支持 Obsidian 扩展语法 |
| WikiLink | remark-wiki-link | 解析 `[[...]]` |
| 全文搜索 | FlexSearch | 轻量、高性能 |
| 向量索引 | transformers.js / fastembed-js | 本地 embedding |
| 状态 | Zustand | 与 EasyAgent 一致 |

### 11.4 核心功能实现要点

#### 11.4.1 目录树 (FileTree)

```typescript
// 扫描文件 (浏览器环境使用 File System Access API 或从 GitHub API 获取)
interface DocNode {
  id: string;        // 相对路径
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: DocNode[];
  links: string[];   //  outgoing wiki links
  backlinks: string[]; // incoming wiki links
}
```

#### 11.4.2 关系图谱 (GraphView)

```typescript
interface GraphNode {
  id: string;
  label: string;
  group?: string;    // 按目录分组着色
  radius: number;    // 基于链接数量
}

interface GraphLink {
  source: string;
  target: string;
  type: 'link' | 'backlink';
}

// D3 force simulation
const simulation = d3.forceSimulation<GraphNode>(nodes)
  .force('charge', d3.forceManyBody().strength(-300))
  .force('link', d3.forceLink(links).id(d => d.id).distance(100))
  .force('center', d3.forceCenter(width / 2, height / 2));
```

#### 11.4.3 点击节点预览

```typescript
// 点击图谱节点 → 设置 selectedDocId → MarkdownPreview 组件加载内容
<MarkdownPreview 
  content={doc.content} 
  onLinkClick={(targetId) => setSelectedDocId(targetId)}
/>
```

#### 11.4.4 搜索

```typescript
// FlexSearch 索引
const index = new FlexSearch.Document({
  document: {
    id: 'id',
    index: ['title', 'content'],
    store: ['title', 'path'],
  },
});

// 语义搜索 (transformers.js)
const embeddings = await embed(documents);
const results = cosineSimilarity(queryEmbedding, embeddings);
```

### 11.5 两种数据来源

| 模式 | 适用场景 | 实现方式 |
|------|----------|----------|
| **本地文件** | 桌面端/本地开发 | File System Access API + Electron 主进程 |
| **GitHub 仓库** | Web 部署/在线浏览 | GitHub API 递归获取 tree + raw content |

### 11.6 与 EasyAgent 的关系

```
Doc_project 有三种融入 EasyAgent 的方式:

方式 A: 作为独立 Web 应用运行 ✅ 已完成 (vite dev --base /, 端口 5184)
方式 B: 作为 EasyAgent 插件 (obsidian-doc-viewer) ✅ 已完成 (open-doc-viewer 工具注册)
方式 C: 内嵌到 EasyAgent frontend (iframe 右侧面板) ✅ 已完成 (2026-07-02)
  → EasyAgent Server 托管 Doc_project dist，WS open_panel 消息触发右侧 iframe

实施路径: A → B → C (全部完成)
```

**集成架构 (方式 C 实现细节)**：

```
LLM调用 open-doc-viewer 工具
  → Server 检测 tool_end (toolName==='open-doc-viewer' && !error)
  → WS 发送 { type:'open_panel', url:'http://localhost:3456/doc-viewer/' }
  → chatStore → uiStore.openRightPanel(url, '文档浏览器')
  → Layout 渲染右侧 700px 可关闭 iframe 面板
  → Doc_project SPA 在内嵌面板中运行
```

关键设计决策：
- **iframe 而非组件**：Doc_project 是独立 Vite 项目，iframe 隔离避免依赖冲突
- **同源托管**：Server 通过 `express.static` 托管 dev 产物 (`/doc-viewer/`)，`X-Frame-Options: SAMEORIGIN`
- **vite base**：`Doc_project/vite.config.ts` 设置 `base: '/doc-viewer/'` 使产物路径正确
- **dev 保持独立**：`package.json` 的 `dev` 命令改为 `vite --base /` 不影响独立开发

---

## §12 风险与维护

### 12.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| GitHub API 限流导致市场无法加载 | 中 | 高 | 本地缓存 + 可选 Registry 仓库 + GITHUB_TOKEN |
| 第三方插件安全漏洞 | 中 | 高 | Worker 沙箱 + 权限授权 + 安全模式 |
| 插件依赖冲突 | 中 | 中 | 依赖版本锁定 + 启动前依赖检查 |
| 插件质量差导致口碑下降 | 中 | 中 | Curated Registry + 评分机制 |
| Doc_project 向量索引性能差 | 中 | 中 | 使用轻量模型 / Web Worker / 分页 |
| 前端代码膨胀 | 中 | 中 | 懒加载插件市场页面 |

### 12.2 维护成本估算

| 项目 | 初始开发 (人月) | 持续维护 (人月/年) |
|------|----------------|-------------------|
| EasyAgent 插件市场 | 1.5-2 | 0.5 |
| PluginSandbox 安全增强 | 0.5-1 | 0.3 |
| Doc_project MVP | 1-1.5 | 0.3 |
| 文档与测试 | 0.5 | 0.2 |
| **总计** | **3.5-5** | **1.3** |

---

## §13 结论与建议

### 13.1 总体结论

**需求合理且可行。** EasyAgent 已具备插件系统基础，新增 GitHub 插件市场和 Doc_project 的边际成本可控，且能显著提升产品护城河。

### 13.2 分阶段建议

```
第一阶段 (2-3周): EasyAgent 插件市场 MVP ✅ 已完成
  - GitHub Topic 搜索
  - 安装/卸载/启用/禁用
  - Worker 沙箱安全增强
  - 前端基础 UI

第二阶段 (2-3周): Doc_project MVP ✅ 已完成
  - 独立 Web 应用
  - 目录树 + 关系图谱 + 搜索
  - GitHub 仓库数据读取

第三阶段 (1-2周): 集成 ✅ 已完成 (2026-07-02)
  - Doc_project 构建产物由 EasyAgent Server 托管
  - WS open_panel 消息驱动右侧 iframe 面板
  - 端到端：LLM 调用 open-doc-viewer → UI 自动弹出
```

### 13.3 立即执行的 3 件事 (状态)

| # | 任务 | 状态 | 产物 |
|---|------|------|------|
| 1 | 创建 GitHub 插件规范仓库 | ✅ 已完成 | [easyagent-plugin-template](https://github.com/ht182400-creator/easyagent-plugin-template) |
| 2 | 创建 Doc_project 目录结构 | ✅ 已完成 | `D:\Work_Area\AI\Doc_project` (完整项目骨架，构建通过，7 测试通过) |
| 3 | 补充 PluginSandbox 安全能力 | ⏳ 待实施 | 网络白名单 + 文件访问代理 |

**已额外完成**:
- ✅ [easyagent-plugin-obsidian-doc-viewer](https://github.com/ht182400-creator/easyagent-plugin-obsidian-doc-viewer) — Doc_project 的 EasyAgent 插件包装
- ✅ [easyagent-plugins](https://github.com/ht182400-creator/easyagent-plugins) — 官方插件注册表 (registry.json + README)
- ✅ 所有仓库已打 `easyagent-plugin` Topic 标签
- ✅ **Doc_project 内嵌集成** (2026-07-02) — Server 托管 dist + WS open_panel → 右侧 iframe 面板，LLM 调用 `open-doc-viewer` 自动弹出 UI

---

## 附录 A: 推荐 GitHub 插件仓库命名

```text
✅ ht182400-creator/easyagent-plugin-obsidian-doc-viewer  (已创建)
   ht182400-creator/easyagent-plugin-code-review          (远期)
   ht182400-creator/easyagent-plugin-unit-test            (远期)
✅ ht182400-creator/easyagent-plugins                     (已创建 - curated registry)
   ht182400-creator/easyagent-doc-viewer                  (远期)
✅ ht182400-creator/easyagent-plugin-template             (已创建)
```

## 附录 B: 关键决策记录 (ADR)

| # | 决策 | 方案 | 理由 |
|---|------|------|------|
| 1 | 插件发现 | GitHub Topic 搜索 + Curated Registry | 零成本启动 + 长期质量可控 |
| 2 | 插件包格式 | GitHub Release zipball | 无需自建存储 |
| 3 | 隔离方式 | Worker Threads (现有) | 复用已有架构 |
| 4 | 前端框架 | React + Tailwind (与 EasyAgent 一致) | 降低维护成本 |
| 5 | 图谱引擎 | D3.js | 可控、成熟 |
| 6 | 搜索 | FlexSearch + 可选向量 | 平衡性能与精度 |

---

> **下一步**: Doc_project 项目骨架和插件仓库已完成创建。推荐进入实现阶段：P0 GitHub Client + API 端点 → P0 设置页插件市场 UI → P1 自动更新与本地安装。
