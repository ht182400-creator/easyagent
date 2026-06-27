# EasyAgent - 架构设计文档 (ADD)

> 版本: v5.4 | 日期: 2026-06-20 | 更新: +版本控制系统架构 + version.json + CHANGELOG + 版本API + 发布脚本 + 仓库修正

---

## 一、整体架构

```
┌───────────────────────────────────────────────────────────────────┐
│                       EasyAgent System v2.0                       │
├───────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ Ink CLI  │ │  Web     │ │  Desktop     │ │   IM 适配器      │ │
│  │(React    │ │Dashboard │ │  (Electron   │ │ (Telegram/飞书/  │ │
│  │Terminal) │ │v4(WorkBuddy │ │ 原生 React)  │ │  企业微信)       │ │
│  │7组件架构 │ │10 Store) │ │六件套布局   │ │ 长轮询+Webhook  │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ └────────┬─────────┘ │
│       │            │              │                   │           │
│  ┌────┴────────────┴──────────────┴───────────────────┴─────────┐ │
│  │                     Core Engine (核心引擎)                    │ │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌────────────┐  │ │
│  │  │  Agent   │ │   Tool    │ │   Session    │ │  Plugins   │  │ │
│  │  │  Engine  │ │  System   │ │   Manager    │ │  Manager   │  │ │
│  │  │(ReAct循环)│ │(70 tools) │ │  (SQLite)   │ │(6 builtin) │  │ │
│  │  └────┬─────┘ └─────┬─────┘ └──────┬───────┘ └─────┬──────┘  │ │
│  │       │             │              │               │         │ │
│  │  ┌────┴─────────────┴──────────────┴───────────────┴──────┐  │ │
│  │  │              Model Adapter Layer (模型适配器层)          │  │ │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │  │ │
│  │  │  │DeepSeek│ │Zhipu│ │Qwen │ │Kimi │ │Ernie│ │其他5家│ │  │ │
│  │  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────┐  │ │
│  │  │              Infrastructure Layer (基础设施层)           │  │ │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────┐  │  │ │
│  │  │  │Config│ │Logger│ │  DB  │ │ MCP  │ │ i18n(zh/en) │  │  │ │
│  │  │  │Mgr   │ │(Pino)│ │(SQLite)│ │Server│ │ +SubAgent    │  │  │ │
│  │  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────────────┘  │  │ │
│  │  │  ┌──────────────┐   🆕                                 │  │ │
│  │  │  │ModelRegistry │  远程模型目录 + 缓存 + 三级降级        │  │ │
│  │  │  └──────────────┘                                      │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## 二、技术选型

| 层级     | 技术                        | 理由                               | 注意事项                             |
| -------- | --------------------------- | ---------------------------------- | ------------------------------------ |
| 运行时   | Node.js 18+                 | Windows兼容性最好，生态丰富        | 推荐 20 LTS                          |
| 语言     | TypeScript 5.x              | 类型安全，ESM 输出                 |                                      |
| CLI框架  | Ink (React Terminal)        | 类似Claude Code的终端体验          | Banner/Chat/StatusBar 组件           |
| Web框架  | Express + React 18 + Vite   | 轻量高效                           | Zustand + WebSocket 流式             |
| 桌面框架 | Electron 30 + React/Vite    | 原生桌面体验                       | 四件套: Shell/Sidebar/TabBar/Content |
| 数据库   | **better-sqlite3** (SQLite) | 零配置，本地存储                   | ⚠️ Node 24 需编译工具链              |
| 测试     | Vitest                      | 快速，Vite生态                     | better-sqlite3 通过 alias mock       |
| 构建     | tsup + Vite                 | 快速TypeScript打包 + 前端构建      | 多 entry 打包                        |
| 包管理   | pnpm                        | monorepo workspace                 |                                      |
| 插件系统 | 自研 PluginManager          | 生命周期 + 钩子 + 技能注册         | IPlugin/ISkill 接口                  |
| IM协议   | 原生 fetch (零外部依赖)     | Telegram Bot API / 飞书 / 企业微信 | 长轮询 + Webhook                     |

## 三、核心模块设计

### 3.1 Model Adapter Layer（模型适配器层）

```
interface IModelAdapter {
  readonly provider: string;
  readonly modelName: string;

  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
  getModels(): Promise<ModelInfo[]>;
  validateConnection(): Promise<boolean>;
}
```

**支持的提供商及API类型**:

| 提供商   | API类型    | 端点格式                                                             |
| -------- | ---------- | -------------------------------------------------------------------- |
| DeepSeek | OpenAI兼容 | `https://api.deepseek.com/v1`                                        |
| 智谱GLM  | OpenAI兼容 | `https://open.bigmodel.cn/api/paas/v4`                               |
| 通义千问 | OpenAI兼容 | `https://dashscope.aliyuncs.com/compatible-mode/v1`                  |
| Kimi     | OpenAI兼容 | `https://api.moonshot.cn/v1`                                         |
| 文心一言 | 自有API    | `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/` |
| 豆包     | OpenAI兼容 | `https://ark.cn-beijing.volces.com/api/v3`                           |
| 混元     | 自有API    | `https://hunyuan.tencentcloudapi.com`                                |
| MiniMax  | OpenAI兼容 | `https://api.minimax.chat/v1`                                        |
| Ollama   | OpenAI兼容 | `http://localhost:11434/v1`                                          |

### 3.2 Agent Engine（智能体引擎）

```
┌──────────────────────────────────────────────────┐
│              Agent Loop (ReAct + 流式)             │
│                                                    │
│  ┌────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ THINK  │───▶│   ACT    │───▶│ Tool Executor│  │
│  │ (LLM)  │◀───│ (Tools)  │◀───│ (31 tools)  │  │
│  └────────┘    └──────────┘    └──────────────┘  │
│       │              │                             │
│       ▼              ▼                             │
│  ┌────────┐    ┌──────────┐                       │
│  │OBSERVE │◀───│ RESULTS  │                       │
│  └────────┘    └──────────┘                       │
│                                                    │
│  Terminate conditions:                             │
│  - Max turns (25) exceeded                         │
│  - Final answer provided                           │
│  - User interruption (AbortSignal)                 │
│  - onPartialResponse 流式回调                      │
└──────────────────────────────────────────────────┘
```

### 3.3 Tool System（工具系统 - 70 tools, 17 分组）

```
interface ITool {
  name: string;
  description: string;
  requiresConfirm: boolean;  // 危险操作需确认
  parameters: JSONSchema;

  execute(params: any, context: ToolContext): Promise<ToolResult>;
  validate?(params: any): ValidationResult;
}

interface ToolContext {
  workspace: string;
  sessionId: string;
  signal?: AbortSignal;
}
```

| 分组              | 工具数 | 核心工具                                                | 说明           |
| ----------------- | ------ | ------------------------------------------------------- | -------------- |
| FileTools         | 5      | read_file, write_file, edit_file, delete_file, list_dir | 基础文件操作   |
| FileExtraTools    | 4      | file_info, create_dir, move_file, batch_edit            | 扩展文件操作   |
| SearchTools       | 4      | grep, glob, web_search, web_fetch                       | 内容搜索与网络 |
| ExecTools         | 7      | exec, git_status/diff/log/branch/blame/commit           | 命令执行与Git  |
| CodeTools         | 4      | code_stats, run_tests, find_imports, find_definitions   | 代码分析       |
| QualityTools 🆕   | 4      | lint_code, format_code, read_lints, type_check          | 代码质量       |
| ProjectTools      | 4      | read_config, package_run, env_info, project_overview    | 项目管理       |
| PreviewTools 🆕   | 4      | start_server, preview_url, diff_files, ask_user         | 预览与交互     |
| MediaTools 🆕     | 3      | read_image, generate_image, screenshot                  | 媒体操作       |
| DatabaseTools 🆕  | 2      | query_db, db_schema                                     | 数据库查询     |
| KnowledgeTools 🆕 | 5      | knowledge_add/search/get/list/remove                    | 知识库管理     |
| SubAgentTools 🆕  | 3      | delegate_task, list_subagents, install_runtime          | 子Agent委派    |
| MemoryTools       | 3      | remember, recall, forget                                | 记忆管理       |

### 3.4 Session Management（会话管理）

```
Session {
  id: string;
  workspace: string;
  model: string;
  messages: Message[];
  metadata: {
    tokenUsage: { input: number; output: number };
    createdAt: Date;
    updatedAt: Date;
    status: 'active' | 'paused' | 'completed';
  };
  summary?: string;     // 自动摘要用于长对话
  checkpoint?: string;  // 检查点用于恢复
}
```

### 3.5 Sandbox System（沙箱执行系统）🆕

```
┌─────────────────────────────────────────────────────────┐
│                   Sandbox System                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              SandboxManager                      │   │
│  │  · init() → 检测 Docker 可用性 → 返回 mode       │   │
│  │  · createSandbox() → 按模式分发                  │   │
│  │  · getOverview() → 状态汇总(含 localMode)       │   │
│  └────────┬────────────────────┬──────────────────┘   │
│           │                    │                       │
│  ┌────────┴──────────┐  ┌─────┴──────────────┐       │
│  │  DockerSandbox     │  │  LocalSandbox 🆕   │       │
│  │  (Docker 容器隔离)  │  │  (本地进程降级)     │       │
│  │  · docker exec     │  │  · child_process    │       │
│  │  · 完全隔离        │  │  · cmd.exe / sh     │       │
│  │  · 资源限制        │  │  · 超时 + taskkill  │       │
│  │                    │  │  · 输出限制(10MB)   │       │
│  └───────────────────┘  └────────────────────┘       │
│                                                         │
│  模式: docker | local | disabled                        │
│  降级策略: Docker不可用 → 自动切换 LocalSandbox         │
│  (无需 DISM/WSL2，Windows Home 版友好)                 │
└─────────────────────────────────────────────────────────┘
```

**核心接口**:

```typescript
interface SandboxInstance {
  id: string;
  start(): Promise<void>;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  getStatus(): SandboxStatus;
  stop(): Promise<void>;
}
```

**降级决策流程**:

```
SandboxManager.init()
  → 检测 Docker 可用性(docker info)
  ├── Docker 可用 → 模式: docker (完整功能, 容器隔离)
  ├── Docker 不可用 → 模式: local (本地进程, 无隔离但可用)
  └── 手动禁用 → 模式: disabled
```

### 3.6 Plugins & Skills System（插件与技能系统）🆕

```
┌─────────────────────────────────────────────────────────┐
│                   Plugin System                         │
│                                                         │
│  ┌─────────────────┐    ┌───────────────────────────┐  │
│  │  PluginManager   │───▶│  ToolRegistry             │  │
│  │  (生命周期管理)    │    │  (注册插件工具)            │  │
│  └────────┬────────┘    └───────────────────────────┘  │
│           │                                             │
│  ┌────────┴────────────────────────────────────────┐   │
│  │              IPlugin (插件接口)                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │   │
│  │  │ getName  │  │ getTools │  │  getSkills   │  │   │
│  │  │ getVer   │  │          │  │              │  │   │
│  │  └──────────┘  └──────────┘  └──────────────┘  │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │         IPluginHook (钩子接口)             │   │   │
│  │  │  event + priority + handler(ctx)          │   │   │
│  │  │  7种事件: preRun/postRun/preTool/         │   │   │
│  │  │           postTool/onError/onStream/...   │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  内置技能 (ISkill):                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │code-review│ │unit-test │ │code-explain│ │debug    │  │
│  │          │ │generator │ │          │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐                             │
│  │generate  │ │ refactor │                             │
│  │doc       │ │          │                             │
│  └──────────┘ └──────────┘                             │
└─────────────────────────────────────────────────────────┘
```

### 3.7 IM Adapter System（IM 适配器系统 ✅）

```
┌─────────────────────────────────────────────────────────┐
│                   IM Adapter System                     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                IMManager (管理器)                 │   │
│  │  · startPlatform/stopPlatform                    │   │
│  │  · updateConfig/removeConfig                     │   │
│  │  · handleWebhook (飞书/微信 URL验证+回调)         │   │
│  │  · messageHandler: IM → Agent → IM 消息路由      │   │
│  └────────┬────────────────────────────┬───────────┘   │
│           │                            │                │
│  ┌────────┴──────────┐    ┌───────────┴───────────┐   │
│  │  BaseIMAdapter    │    │  BaseIMAdapter         │   │
│  │  (抽象基类)        │    │  · sendMessage        │   │
│  │  · start()/stop() │    │  · sendStreamingMessage│   │
│  │  · EventEmitter   │    │  · poll/setWebhook     │   │
│  └────────┬──────────┘    └───────────┬───────────┘   │
│           │                            │                │
│  ┌────────┴────────────────────────────┴───────────┐   │
│  │              平台适配器实现                        │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │   │
│  │  │ Telegram  │ │  Feishu   │ │  WeChat       │  │   │
│  │  │ (完整实现) │ │ (Webhook) │ │ (企业微信 ✅) │  │   │
│  │  │ 长轮询/    │ │ token刷新 │ │ AES-256解密   │  │   │
│  │  │ Webhook   │ │ URL验证   │ │ XML消息解析   │  │   │
│  │  │ 流式编辑   │ │ 双域名    │ │ token管理     │  │   │
│  │  │ 白名单    │ │ 文件上传✅│ │ 文本消息发送  │  │   │
│  │  └───────────┘ └───────────┘ └───────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.8 Knowledge Base（知识库 — 双作用域架构 🆕 v5.3）

```
┌─────────────────────────────────────────────────────────────────┐
│                     Knowledge Base System                        │
│                       双作用域架构 v5.3                            │
│                                                                  │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │   🌐 全局知识库 (Global)  │    │   📁 项目知识库 (Project) │   │
│  │   ~/.easyagent/knowledge/ │    │ {PROJECT}/.easyagent/    │   │
│  │                           │    │       knowledge/          │   │
│  │   跨项目共享、长期积累     │    │   项目专属、随项目隔离     │   │
│  │   · 技术规范/最佳实践     │    │   · 项目文档/README      │   │
│  │   · 公司级知识文档        │    │   · 代码分析/设计文档     │   │
│  │   · 个人笔记/经验总结     │    │   · 任务记录/会议纪要     │   │
│  └────────────┬─────────────┘    └────────────┬─────────────┘   │
│               │                               │                   │
│               └───────────┬───────────────────┘                   │
│                           │                                       │
│              ┌────────────▼──────────────┐                       │
│              │   resolveKnowledgeService │                       │
│              │   (scope: 'project'|'global')│                     │
│              └────────────┬──────────────┘                       │
│                           │                                       │
│         ┌─────────────────┼─────────────────┐                    │
│         ▼                 ▼                  ▼                    │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐            │
│  │ CRUD 操作   │  │ 文本搜索     │  │ 文件导入      │            │
│  │ · 增删改查  │  │ · 关键词匹配 │  │ · 项目文件    │            │
│  │ · 分类/tag  │  │ · 分词索引   │  │ · 上传导入    │            │
│  │ · 统计摘要  │  │ · 相关度排序 │  │ · 内容导入    │            │
│  └────────────┘  └──────────────┘  └───────────────┘            │
│                                                                  │
│  9 个 HTTP REST API + 5 个知识库工具                              │
│  文件上传 (multer, 10MB上限, ~/.easyagent/uploads/)               │
│  双域统计合并 (GET /api/knowledge/stats/summary → merged scope)   │
│  跨域文档查询 (GET /api/knowledge/:id → 自动 fallback)            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.8.1 KnowledgeService（知识库服务层 🆕 v5.3）

```
┌─────────────────────────────────────────────────────────┐
│                  KnowledgeService                        │
│             双作用域单例模式 v5.3                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  构造与实例管理                                    │   │
│  │  · new KnowledgeService(rootPath, scope)         │   │
│  │  · static getGlobal() → 全局单例（跨项目共享）    │   │
│  │  · getScope() → 'project' | 'global'            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  CRUD Operations                                  │   │
│  │  · addDocument({ title, content, filePath,      │   │
│  │                   category, tags })               │   │
│  │  · search({ query, category, tag, maxResults })  │   │
│  │  · getDocument(docId) → { doc, content }         │   │
│  │  · listDocuments({ category?, tag? })            │   │
│  │  · removeDocument(docId)                          │   │
│  │  · importFromFile(filePath) — 项目内相对路径      │   │
│  │  · importFromAbsolutePath(absPath) 🆕 — 绝对路径  │   │
│  │  · importFromContent(name, content, cat, tags) 🆕 │   │
│  │  · getStats() → { totalDocs, totalSize, cats }   │   │
│  │  · getAllTags() → string[]                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  DocIndex 增加 scope 字段:                               │
│  type KBScope = 'project' | 'global'                    │
│  interface DocIndex {                                   │
│    id: string; scope: KBScope; 🆕                        │
│    title: string; category?: string; tags: string[];    │
│    chunkCount: number; totalSize: number;               │
│    createdAt: string; updatedAt: string;                │
│  }                                                      │
│                                                         │
│  存储: 项目级 → {workspace}/.easyagent/knowledge/       │
│        全局级 → ~/.easyagent/knowledge/                  │
│  · index.json — 文档元数据索引（含 scope 字段）          │
│  · {docId}/chunk_0001.txt … chunk_NNNN.txt — 分块内容   │
└─────────────────────────────────────────────────────────┘
```

### 3.8.2 知识库 API 路由设计 🆕（路由注册顺序关键）

```
Express 路由注册顺序（影响匹配优先级）：

  GET  /api/knowledge                ✓ 列表查询（支持 scope 参数）
  POST /api/knowledge                ✓ 添加文档
  DEL  /api/knowledge/:id            ✓ 删除文档（支持 scope 参数）
  GET  /api/knowledge/search         ✓ 全文搜索（需 q 参数）
  POST /api/knowledge/import         ✓ 项目文件导入
  POST /api/knowledge/upload         ✓ 上传文件导入（multer 中间件）
  GET  /api/knowledge/stats/summary  ✓ 统计摘要（支持双域合并）
  GET  /api/knowledge/:id            ✓ 单文档查询（必须在 stats/summary 之后）

⚠ 关键设计：/api/knowledge/:id 必须注册在 /api/knowledge/stats/summary 之后，
  否则 Express 会将 'stats' 作为 :id 参数捕获，导致 stats API 返回 404。

  跨域 fallback：GET /api/knowledge/:id 在当前作用域找不到时，
  自动回退到另一个作用域查找，减少客户端复杂度。

  合并统计：GET /api/knowledge/stats/summary（无 scope 参数）时，
  自动合并 project + global 双域统计数据：
  { scope: 'merged', totalDocs, project: {...}, global: {...} }
```

### 3.8.3 文件上传系统 🆕

```
┌────────────────────────────────────────────────────────────┐
│                   File Upload System                        │
│                                                            │
│  前端 (React):                                              │
│  ┌──────────────────────────────────────────────────┐    │
│  │  KnowledgeBase.tsx — 三种导入模式:                 │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│    │
│  │  │ 手动输入  │  │ 项目文件  │  │ 上传文件 🆕      ││    │
│  │  │ (表单)   │  │ (浏览器) │  │ (拖拽/点击选择)   ││    │
│  │  └──────────┘  └──────────┘  └──────────────────┘│    │
│  │                                                    │    │
│  │  上传模式特性:                                       │    │
│  │  · 拖拽区域 (drag & drop) 带视觉反馈               │    │
│  │  · 点击选择文件 (accept: .md/.txt/.json/.csv/.pdf) │    │
│  │  · 显示已选文件名和大小                             │    │
│  │  · FormData + fetch → POST /api/knowledge/upload   │    │
│  │  · 支持指定 scope (project/global)                │    │
│  └──────────────────────────────────────────────────┘    │
│                              │                             │
│                              ▼                             │
│  后端 (Express + multer):                                  │
│  ┌──────────────────────────────────────────────────┐    │
│  │  POST /api/knowledge/upload                       │    │
│  │  · multer.diskStorage → ~/.easyagent/uploads/    │    │
│  │  · 文件名: {timestamp}_{random}_{originalname}   │    │
│  │  · 大小限制: 10MB (limits.fileSize)              │    │
│  │  · 读取文件内容 → importFromContent() 入库       │    │
│  │  · 清理临时文件 (rmSync)                          │    │
│  └──────────────────────────────────────────────────┘    │
│                                                            │
│  知识库作用域选择器 (Scope Toggle):                          │
│  ┌───────────────┐  ┌───────────────┐                     │
│  │ 📁 项目       │  │ 🌐 全局       │                     │
│  │ knowledge/    │  │ knowledge/    │                     │
│  │ (项目隔离)    │  │ (跨项目共享)  │                     │
│  └───────────────┘  └───────────────┘                     │
│  切换作用域时自动重新加载文档列表和标签                      │
└────────────────────────────────────────────────────────────┘
```

### 3.8.4 AutomationManager（自动化任务管理器 🆕）

```
┌─────────────────────────────────────────────────────────┐
│                 AutomationManager                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Task CRUD                                        │   │
│  │  · createTask({ name, prompt, schedule, ... })   │   │
│  │  · updateTask(id, updates)                        │   │
│  │  · deleteTask(id)                                 │   │
│  │  · toggleTask(id, active)                         │   │
│  │  · getTasks() / getTask(id)                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Scheduler Engine                                 │   │
│  │  · 30s 检查间隔 (setInterval)                     │   │
│  │  · RRULE 解析: HOURLY/DAILY/WEEKLY               │   │
│  │  · computeNextRun() → 下次执行时间                 │   │
│  │  · 有效期检查 (validFrom/validUntil)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Execution Engine                                 │   │
│  │  · AgentEngine 集成 → AI 执行任务提示词           │   │
│  │  · AbortController → 手动停止/超时取消            │   │
│  │  · maxDurationMinutes → 超时保护                  │   │
│  │  · Token 用量追踪                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  History                                          │   │
│  │  · AutomationRun[] — 最多500条                    │   │
│  │  · 状态: running/completed/failed/timeout         │   │
│  │  · EventEmitter: task:start/complete/error        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  存储: ~/.easyagent/data/automations.json                │
│         ~/.easyagent/data/automations_history.json       │
└─────────────────────────────────────────────────────────┘
```

### 3.9 ModelRegistry（模型目录动态注册表）🆕

```
┌─────────────────────────────────────────────────────────────────┐
│                   ModelRegistry System                          │
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │   Download Sources    │    │       Local Cache            │  │
│  │  ┌─────────────────┐ │    │  ~/.easyagent/               │  │
│  │  │ GitHub Raw      │ │    │  models-catalog.json         │  │
│  │  │ (Primary)       │─┼───▶│  (24h TTL)                   │  │
│  │  └─────────────────┘ │    └──────────────┬───────────────┘  │
│  │  ┌─────────────────┐ │                   │                   │
│  │  │ jsdelivr CDN    │ │                   ▼                   │
│  │  │ (Fallback)      │ │    ┌──────────────────────────────┐  │
│  │  └─────────────────┘ │    │      Merge Strategy          │  │
│  └──────────────────────┘    │                               │  │
│                               │  1. Remote catalog (primary) │  │
│  ┌──────────────────────┐    │  2. Provider /models API     │  │
│  │   ConfigManager      │    │  3. ProviderPresets (fallback)│  │
│  │   ┌───────────────┐  │    └──────────────┬───────────────┘  │
│  │   │ mergeRemote   │  │                   │                   │
│  │   │ Models()      │◀─┼───────────────────┘                   │
│  │   └───────────────┘  │                                       │
│  └──────────────────────┘                                       │
│                                                                  │
│  Startup Flow:                                                  │
│  ┌────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐  │
│  │ App    │──▶│ load     │──▶│ init     │──▶│ background   │  │
│  │ Start  │   │ Config   │   │ Registry │   │ download     │  │
│  └────────┘   └──────────┘   └──────────┘   └──────┬───────┘  │
│                                                     │           │
│  ┌──────────────────────────────────────────────────┘           │
│  │  download complete → mergeRemoteModels()                     │
│  │  cache valid (<24h)  → load from cache                       │
│  │  cache expired       → re-download                           │
│  │  download failed     → use provider APIs + presets           │
│  └──────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

**核心接口**:

```typescript
interface IModelRegistry {
  /** 初始化：下载远程目录并缓存 */
  initialize(): Promise<void>;
  /** 强制刷新（忽略缓存） */
  refresh(): Promise<boolean>;
  /** 获取特定提供商的远程模型数据 */
  getProviderEntry(providerId: string): RemoteProviderEntry | undefined;
  /** 获取注册表状态 */
  getStatus(): RegistryStatus;
}

interface RegistryStatus {
  initialized: boolean;
  lastUpdated: string | null;
  source: 'remote' | 'cache' | 'none';
  providerCount: number;
  error?: string;
}
```

**数据源优先级**:

1. **ModelRegistry 远程目录** (GitHub/CDN → `models-catalog.json`) — 最高优先级
2. **各提供商 /models API** (Server 动态获取，5分钟缓存) — 中等优先级
3. **ProviderPresets 硬编码** (内置兜底，2026最新模型) — 最低优先级

**下载配置**:

- 主 URL: `https://raw.githubusercontent.com/ht182400-creator/easyagent/main/models-catalog.json`
- 备用 URL: `https://cdn.jsdelivr.net/gh/ht182400-creator/easyagent@main/models-catalog.json`
- 超时: 15 秒
- 重试: 主 URL 失败后自动切换备用

## 四、目录结构 (v2.0 实际结构)

```
easyagent/
├── packages/
│   ├── core/                    # 核心引擎包 (196KB + DTS 43KB)
│   │   ├── src/
│   │   │   ├── agent/           # Agent引擎
│   │   │   │   └── AgentEngine.ts     # ReAct循环 + 流式 + 工具调用
│   │   │   ├── adapters/        # 模型适配器 (10家提供商)
│   │   │   │   ├── BaseAdapter.ts / AdapterFactory.ts
│   │   │   │   ├── OpenAICompatibleAdapter.ts
│   │   │   │   ├── ErnieAdapter.ts / HunyuanAdapter.ts
│   │   │   │   └── OllamaAdapter.ts
│   │   │   ├── tools/           # 工具系统 (70 tools, 17 分组)
│   │   │   │   ├── ToolRegistry.ts       # 工具注册/执行/权限
│   │   │   │   ├── FileTools.ts / FileExtraTools.ts
│   │   │   │   ├── SearchTools.ts
│   │   │   │   ├── ExecTools.ts
│   │   │   │   ├── CodeTools.ts / QualityTools.ts 🆕
│   │   │   │   ├── ProjectTools.ts / MemoryTools.ts
│   │   │   │   ├── PreviewTools.ts / MediaTools.ts 🆕
│   │   │   │   ├── DatabaseTools.ts / KnowledgeTools.ts 🆕
│   │   │   │   ├── SubAgentTools.ts 🆕
│   │   │   │   └── index.ts (getAllBuiltinTools)
│   │   │   ├── plugins/         # 插件/技能系统 🆕
│   │   │   │   ├── types.ts           # IPlugin/ISkill/IPluginHook
│   │   │   │   ├── PluginManager.ts   # 生命周期管理
│   │   │   │   └── BuiltinSkills.ts   # 6个内置技能
│   │   │   ├── im/              # IM 适配器系统 ✅
│   │   │   │   ├── types.ts           # IM 完整类型系统
│   │   │   │   ├── BaseIMAdapter.ts   # 抽象基类 + 流式发送
│   │   │   │   ├── TelegramAdapter.ts # Bot API (长轮询+Webhook)
│   │   │   │   ├── FeishuAdapter.ts   # Webhook + 文件上传 ✅
│   │   │   │   ├── WeChatAdapter.ts   # AES解密 + XML解析 ✅
│   │   │   │   └── IMManager.ts       # 管理器
│   │   │   ├── mcp/             # MCP协议
│   │   │   │   ├── MCPClient.ts       # JSON-RPC over stdio
│   │   │   │   └── MCPManager.ts      # 多服务器管理
│   │   │   ├── knowledge/        # 知识库服务 🆕
│   │   │   │   └── KnowledgeService.ts # CRUD + 搜索 + 统计
│   │   │   ├── automation/       # 自动化任务 🆕
│   │   │   │   └── AutomationManager.ts # 调度引擎 + 执行 + 历史
│   │   │   ├── session/         # 会话管理
│   │   │   │   └── SessionManager.ts  # SQLite持久化 + WAL
│   │   │   ├── sandbox/          # 沙箱系统 🆕
│   │   │   │   ├── DockerSandbox.ts
│   │   │   │   ├── LocalSandbox.ts      # 本地进程降级
│   │   │   │   ├── SandboxManager.ts    # 统一管理 + 降级决策
│   │   │   │   └── SandboxTools.ts      # sandbox_exec 工具
│   │   │   ├── config/          # 配置管理 + 模型注册表 🆕
│   │   │   │   ├── ConfigManager.ts
│   │   │   │   ├── ModelRegistry.ts    # 远程目录下载/缓存/合并
│   │   │   │   └── ProviderPresets.ts
│   │   │   ├── utils/           # 工具函数
│   │   │   │   ├── logger.ts (Pino)
│   │   │   │   ├── encryption.ts (AES-256-GCM)
│   │   │   │   └── i18n.ts (zh-CN/en-US) 🆕
│   │   │   ├── types/           # 核心类型定义
│   │   │   │   └── index.ts
│   │   │   └── __mocks__/       # 测试 Mock 🆕
│   │   │       └── better-sqlite3.ts  # 内存模拟
│   │   └── vitest.config.ts     # alias mock 配置
│   │
│   ├── cli/                     # Ink CLI (14KB)
│   │   └── src/main.tsx         # Banner/ChatView/StatusBar/HelpPanel
│   │
│   ├── server/                  # Web服务端 (20KB)
│   │   └── src/index.ts         # REST + WS + Plugins + IM API
│   │
│   ├── frontend/                # 共享前端组件 (Desktop+Web 共用) 🆕
│   │   ├── src/                 # React 组件/页面/stores/样式
│   │   │   ├── components/      # 共享 UI 组件 (Chat/Settings/Layout)
│   │   │   ├── pages/           # 页面入口
│   │   │   ├── stores/          # Zustand 状态管理
│   │   │   └── styles/          # 全局样式/主题
│   │   └── package.json
│   │
│   ├── web/                     # Web Dashboard v4 WorkBuddy (306KB JS + 46KB CSS)
│   │   ├── src/
│   │   │   ├── stores/          # Zustand: app/chat/provider/session/settings
│   │   │   ├── components/
│   │   │   │   ├── Chat/        # MessageList(react-window)/ChatInput/ToolCallCard
│   │   │   │   └── Layout.tsx   # 侧边栏 + 导航
│   │   │   └── pages/           # Chat/Dashboard/Settings/Sessions/Skills/IMSettings
│   │   └── vite.config.ts
│   │
│   └── desktop/                 # Electron 桌面版 (173KB JS + 16KB CSS)
│       ├── src/main.ts          # 主进程 (Agent/IPC/菜单/托盘/自动更新)
│       ├── src/preload.ts       # contextBridge (API + 事件桥接)
│       ├── vitest.config.ts     # 测试配置 (jsdom + React Testing Library)
│       ├── src/__tests__/       # 127 测试用例
│       │   ├── stores/          # uiStore (24) + sessionStore (25) = 49
│       │   ├── components/      # StatusBar(9) + ChatView(19) + TabBar(9) + Sidebar(15) = 52
│       │   ├── ipc/             # preload API (13)
│       │   └── main/            # version + IPC handlers (13)
│       └── src/renderer/        # React 原生 UI
│           ├── components/layout/ # AppShell/Sidebar/TabBar/ContentRouter/StatusBar
│           └── components/chat/   # ChatView (消息气泡+流式+动态版本号)
│
│   └── vscode/                   # VS Code 扩展 🆕
│       ├── src/                   # 扩展源码 (Provider/Completion/InlineChat)
│       └── package.json           # 独立版本号
│
├── docs/                        # 文档
│   ├── 01_需求规格说明书_PRD.md
│   ├── 02_架构设计文档_ADD.md
│   ├── 03_测试案例文档.md
│   ├── 05_Desktop_EXE打包标准流程.md
│   ├── 06_版本发布与CI-CD流程指南.md 🆕
│   └── 07_自动更新分发方案对比.md 🆕
├── scripts/                     # 工具脚本 🆕
│   ├── sync-version.mjs         # 版本同步 (version.json → 7个package.json)
│   └── release.mjs              # 发布自动化 (patch/minor/major)
├── build.bat                     # Desktop EXE 构建入口
├── build-web.bat                 # Web Dashboard 构建入口
├── build-shared.bat              # 共享构建 (core + server) 🆕
├── repack.bat                    # 快速重打包 (不编译，仅 electron-builder) 🆕
├── CHANGELOG.md                  # 更新日志 (Keep a Changelog 格式) 🆕
├── version.json                  # 单一版本源 🆕
├── models-catalog.json          # 远程模型目录模板 🆕
├── .codebuddy/memory/           # AI 工作记忆
│   ├── MEMORY.md                # 长期记忆
│   └── 2026-06-20.md            # 每日日志
├── package.json                 # 根配置
├── pnpm-workspace.yaml          # pnpm monorepo
├── tsconfig.json                # TypeScript配置
└── README.md                    # 项目自述
```

## 五、Desktop 自动更新架构 🆕

### 5.0 自动更新流程

```
应用启动 → 5s静默检查 → 发现新版本?
  ├── 是 → 下载更新 (StatusBar实时进度)
  │         └── 下载完成 → 弹窗通知 → 用户选择:
  │               ├── 立即重启 → quitAndInstall()
  │               └── 稍后 → 下次启动自动安装
  └── 否 → 无操作

手动检查 → 帮助菜单 "检查更新"
  ├── electron-updater 可用 → checkForUpdates() → 同上
  └── electron-updater 不可用 → 打开 GitHub Releases 页面
```

### 5.0.1 技术实现

```typescript
// 主进程 (main.ts)
initAutoUpdater() → electron-updater
  ├── feedURL: GitHub Releases (ht182400-creator/easyagent)
  ├── 事件: update-available / download-progress / update-downloaded / error
  └── IPC 通知渲染进程: update-status → StatusBar

// 渲染进程 (StatusBar.tsx)
onUpdateStatus → 状态展示:
  ├── available → "更新可用" (黄色)
  ├── downloading → "下载中... 45%" (蓝色)
  ├── downloaded → "重启以安装更新" (绿色)
  └── error → 静默 (后台错误)
```

### 5.0.2 IPC 通道 (新增)

| 通道                | 方向            | 功能             |
| ------------------- | --------------- | ---------------- |
| `get-app-version`   | renderer → main | 获取当前版本号   |
| `check-update`      | renderer → main | 手动触发更新检查 |
| `get-update-status` | renderer → main | 查询更新系统状态 |
| `update-status`     | main → renderer | 推送更新状态变更 |

### 5.0.3 electron-builder 发布配置

```json
{
  "publish": {
    "provider": "github",
    "owner": "ht182400-creator",
    "repo": "easyagent"
  }
}
```

- **版本**: 精确锁定 **electron-builder 23.6.0**（禁止使用 24.x alpha 版本）
- Windows (NSIS): 支持差分更新 (blockmap)，输出 `EasyAgent-{version}-win-x64.exe`
- macOS (DMG): 需要 Apple Developer 签名
- Linux (AppImage): 支持 AppImageUpdate
- **构建命令**: `pnpm exec electron-builder --win --x64`（使用 pnpm exec 确保运行本地安装版本）
- **完整打包手册**: 见 `docs/05_Desktop_EXE打包标准流程.md`（25 个历史问题 + 必检清单 + 黄金法则）
- **版本发布与 CI/CD**: 见 `docs/06_版本发布与CI-CD流程指南.md`（发布全流程 + GitHub Actions 自动构建）
- **分发方案对比**: 见 `docs/07_自动更新分发方案对比.md`（GitHub Releases / Cloudflare R2 / 腾讯云 COS / 自建）

---

### 5.1 版本控制与升级系统 🆕 v5.4

#### 5.1.0 版本控制架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Version Control System                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  version.json (唯一版本源)                  │   │
│  │  { "version": "0.3.0", "codename": "Gemini",             │   │
│  │    "releaseDate": "2026-06-20" }                         │   │
│  └────────┬─────────────────────────────────────────────────┘   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              scripts/sync-version.mjs                      │   │
│  │  同步 version.json → 所有 package.json (8处)               │   │
│  │  Root / CLI / Core / Server / Web / Desktop / Frontend / VSCode │
│  └──────────────────────────────────────────────────────────┘   │
│           │                                                      │
│           ├──────────────────────────────────────┐               │
│           ▼                                      ▼               │
│  ┌────────────────────┐              ┌────────────────────┐     │
│  │  scripts/release.mjs│              │  CHANGELOG.md      │     │
│  │  patch/minor/major  │              │  Keep a Changelog  │     │
│  │  --dry-run 预览     │              │  格式规范           │     │
│  │  git tag + commit   │              │  v0.1→v0.2→v0.3    │     │
│  └────────┬───────────┘              └────────────────────┘     │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                Server API Endpoints                        │   │
│  │  GET /api/version                                          │   │
│  │    → { version, codename, releaseDate, changelog }        │   │
│  │  GET /api/version/check                                    │   │
│  │    → { currentVersion, latestVersion, hasUpdate, url }    │   │
│  └────────┬─────────────────────────────────────────────────┘   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                Frontend Integration                        │   │
│  │  Web/Desktop Layout: 侧边栏动态版本号 (fetch /api/version) │   │
│  │  Settings Page: 版本信息卡片 + 检查更新按钮 + CHANGELOG    │   │
│  │  Desktop main.ts: electron-updater feedURL 仓库修正       │   │
│  │  构建: EASYAGENT_VERSION 环境变量注入                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.1.1 版本更新检查流程

```
用户点击"检查更新" / 定期检查
  └── GET /api/version/check
      └── Server → GitHub Releases API (https)
          ├── 成功 → 比较 semver
          │   ├── 有新版本 → 返回 { hasUpdate: true, latestVersion, url }
          │   └── 已是最新 → 返回 { hasUpdate: false }
          └── 失败 → 降级 { hasUpdate: false, error: '...' }
```

#### 5.1.2 发布工作流

```
开发者运行: node scripts/release.mjs [patch|minor|major]
  ├── [1/5] 读取 version.json 当前版本 (0.3.0)
  ├── [2/5] 计算新版本 (如 patch → 0.3.1)
  ├── [3/5] 更新 version.json
  ├── [4/5] 运行 sync-version.mjs 同步所有 package.json
  ├── [5/5] git tag + commit
  └── 输出: 发布成功，新版本 0.3.1

  可选: node scripts/release.mjs --dry-run   (仅预览，不实际修改)
```

#### 5.1.3 版本号分布 (修复前 vs 修复后)

| 位置                          | 修复前        | 修复后                |
| ----------------------------- | ------------- | --------------------- |
| version.json (唯一源)         | ❌ 不存在     | ✅ 0.3.0              |
| root package.json             | 0.2.0         | 0.3.0                 |
| packages/core/package.json    | 0.1.0         | 0.3.0                 |
| packages/cli/package.json     | 0.5.0         | 0.3.0                 |
| packages/server/package.json  | 0.2.0         | 0.3.0                 |
| packages/web/package.json     | 0.2.0         | 0.3.0                 |
| packages/desktop/package.json | 0.8.0         | 0.3.0                 |
| packages/frontend/package.json | 🆕 0.3.0      | 0.3.0                 |
| packages/vscode/package.json   | 🆕 独立版本   | 独立版本              |
| CLI Banner                    | 硬编码 0.5.0  | 动态读取 package.json |
| Web/Desktop Layout            | 硬编码 v0.8.0 | fetch('/api/version') |

---

## 六、数据流设计

### 6.1 Agent对话流 (多通道)

```
User Input → CLI/Web/Desktop/IM → SessionManager
  → AgentLoop → ModelAdapter → LLM API
    → [Tool Call?] → ToolExecutor → Result
      → AgentLoop (继续循环)
  → Final Response → SessionManager → CLI/Web/Desktop/IM → User
```

### 6.2 IM 消息流 🆕

```
Telegram/飞书/微信 → IMAdapter.poll/webhook
  → IMManager.messageHandler
    → SessionManager → AgentEngine → Stream Response
    → IMAdapter.sendStreamingMessage → Telegram/飞书/微信
```

### 5.3 插件钩子流 🆕

```
AgentLoop.preRun → PluginManager.triggerHook("preRun", ctx)
  → AgentLoop.run → [Tool execution] → PluginManager.triggerHook("preTool", ctx)
    → tool.execute() → PluginManager.triggerHook("postTool", ctx)
  → AgentLoop → PluginManager.triggerHook("onStream", ctx)
    → PluginManager.triggerHook("postRun", ctx)
```

### 5.4 MCP工具调用流

```
AgentLoop → MCPClient → MCP Server (stdio/HTTP)
  → listTools/callTool → Result → AgentLoop
```

### 5.5 WebSocket 流式通信

```
Web Client → ws://server/ws → subscribe(chatId)
  → chat message → AgentEngine.run(onPartialResponse)
    → text_delta → ws.send → Web UI 实时渲染
    → tool_use/tool_result → ws.send → ToolCallCard 展示
    → token_usage → ws.send → Token 统计更新
    → done → ws.send → 对话完成
```

### 6.6 知识库双作用域路由流 🆕 v5.3

```
Client Request  →  Express Router
  │
  ├─ scope === 'global' ?  ──→  globalKnowledgeService (~/.easyagent/knowledge/)
  │   GET /api/knowledge?scope=global     → 全局文档列表
  │   POST /api/knowledge { scope:global } → 添加到全局
  │   GET /api/knowledge/stats/summary?scope=global → 全局统计
  │
  └─ scope === 'project' ? (默认)  ──→  knowledgeService ({PROJECT}/.easyagent/knowledge/)
      GET /api/knowledge?scope=project    → 项目文档列表
      POST /api/knowledge { scope:project } → 添加到项目

  ── 无 scope 参数  ──→
    GET /api/knowledge/stats/summary  → 合并双域统计 { scope:'merged', project:{...}, global:{...} }
    GET /api/knowledge/:id            → 当前作用域查找 → 找不到则自动 fallback 另一作用域
```

### 6.7 文件上传导入流 🆕 v5.3

```
User (浏览器) → 拖拽/选择文件
  │
  ├─ 手动输入模式  → POST /api/knowledge { title, content, scope }
  ├─ 项目文件模式  → POST /api/knowledge { title, filePath, scope }
  └─ 上传文件模式  → POST /api/knowledge/upload { file (FormData), scope, category, tags }
      │
      ├─ multer 中间件 → 存储到 ~/.easyagent/uploads/{timestamp}_{random}_{filename}
      ├─ readFileSync → 读取内容
      ├─ importFromContent(fileName, content, category, tags) → 按1000字符分块入库
      ├─ rmSync(tempFile) → 清理临时文件
      └─ Response → { success, document, content, scope }
```

### 6.8 模型目录更新流 🆕

```
应用启动 → ModelRegistry.initialize()
  ├── 检查本地缓存 (24h TTL)
  │   ├── 有效 → 从缓存加载 → mergeRemoteModels()
  │   └── 过期/缺失 → 下载远程 catalog
  │       ├── GitHub Raw (15s超时)
  │       ├── 失败 → jsdelivr CDN (备用)
  │       └── 成功 → 缓存到本地 + mergeRemoteModels()
  │
  └── 同时 → Server 异步获取各提供商 /models API
      ├── DeepSeek / 智谱 / 通义千问 / Kimi ...
      └── 5分钟缓存 → 合并到 /api/providers/all-models

模型选择优先级:
  远程 catalog > 提供商 API > ProviderPresets 兜底
```

## 七、安全设计

1. **API Key加密**: 使用AES-256-GCM加密存储
2. **命令审查**: 危险命令白名单+用户确认 (requiresConfirm)
3. **文件沙箱**: 默认限制在工作区内操作
4. **Token预算**: 可设置日/月Token上限
5. **审计日志**: 记录所有Agent操作 (Pino structured logging)
6. **IM 安全** 🆕: Telegram 白名单 + Bot Token 脱敏返回

## 八、数据库设计 ⚠️

### better-sqlite3 原生模块说明

`better-sqlite3` 是 C++ 原生 Node.js 模块，运行时需要匹配当前平台的 `.node` 二进制文件：

| Node.js 版本 | Windows x64 预编译 | 解决方案                        |
| ------------ | ------------------ | ------------------------------- |
| 18.x / 20.x  | ✅ 有              | 开箱即用                        |
| 22.x         | ✅ 有              | 开箱即用                        |
| **24.x**     | ❌ **无**          | 需安装 C++ 编译工具链从源码编译 |

**从源码编译所需工具**:

- Windows: Visual Studio Build Tools (含 C++ 工作负载) + Python 3.x
- macOS: Xcode Command Line Tools
- Linux: build-essential + python3

**测试环境**: vitest 已通过 `resolve.alias` 配置内存 mock (`src/__mocks__/better-sqlite3.ts`)，用 Map 模拟 SQLite 操作，测试在任何 Node 版本下均可运行。

### SessionManager SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  token_usage TEXT NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"totalTokens":0}',
  summary TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  tags TEXT DEFAULT '[]'
);
```

## 九、编译产物

| 包               | 大小                    | 方式     | 备注                          |
| ---------------- | ----------------------- | -------- | ----------------------------- |
| core             | 195.99KB + DTS 42.85KB  | tsup ESM | better-sqlite3 external       |
| cli              | 14KB                    | tsup     | Ink React 组件内联            |
| server           | 20.04KB                 | tsup ESM | Express + WS + Plugins + IM   |
| web              | 266.3KB JS + 37.7KB CSS | Vite     | react-window + Zustand        |
| desktop-main     | 10KB                    | tsup ESM | Electron 主进程 + autoUpdater |
| desktop-renderer | 173KB JS + 16KB CSS     | Vite     | React 原生 UI                 |

## 十、部署方案

### 开发模式

```bash
pnpm install
pnpm --filter @easyagent/core build     # 先编译核心
pnpm --filter @easyagent/cli dev        # 开发 CLI
pnpm --filter @easyagent/server dev     # 开发服务端
pnpm --filter @easyagent/web dev        # 开发 Web Dashboard
```

**快捷启动脚本** (自动开启可见 cmd 窗口，便于查看运行日志):

```cmd
:: 后端 (Express :3456)
start-backend.bat

:: 前端 (Vite :5173)
start-frontend.bat
```

- 后端窗口标题: `EasyAgent Backend`
- 前端窗口标题: `EasyAgent Frontend`
- ⚠️ 开发阶段必须用可见窗口，禁止使用 `Start-Process -NoNewWindow`

### 生产构建

```bash
pnpm --filter @easyagent/core build
pnpm --filter @easyagent/server build   # → dist/index.js
pnpm --filter @easyagent/web build      # → dist/ (静态文件)
```
