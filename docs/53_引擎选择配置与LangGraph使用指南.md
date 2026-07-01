# 引擎选择配置与 LangGraph 使用指南

> **创建日期**: 2026-06-30  
> **相关文件**: `engine.config.json`、`packages/server/src/langgraph/engineFactory.ts`、`start-backend.bat`

---

## 1. 为什么不用纯环境变量？

原方案通过环境变量 `EASYAGENT_ENGINE` 控制引擎选择，架构审查发现以下局限性：

| 维度 | 环境变量 | 配置文件 | CLI 参数 |
|------|---------|---------|---------|
| **可发现性** | ❌ 隐式，`set` 命令不可见 | ✅ 文件存在于项目根 | ✅ `--help` 可直接显示 |
| **持久化** | ❌ 进程重启消失 | ✅ 一次写入持久生效 | ❌ 每次都要传 |
| **版本管控** | ❌ 不受 git 管理 | ✅ 可提交到仓库共享 | ❌ 不受 git 管理 |
| **UI 友好** | ❌ 普通用户无感知 | ✅ 可在设置页暴露 | ⚠️ 仅 CLI 用户 |
| **部署友好** | ✅ Docker/k8s 标配 | ⚠️ 需挂载卷 | ⚠️ 需改 Dockerfile |

**最终方案：三级优先级**。以配置文件为主、CLI 和 env 为覆盖手段。

---

## 2. 三级优先级

```
┌─────────────────────────────────────────┐
│ 1. CLI 参数  --engine langgraph|legacy  │ ← 最高优先级
├─────────────────────────────────────────┤
│ 2. 环境变量  EASYAGENT_ENGINE          │
├─────────────────────────────────────────┤
│ 3. 配置文件  engine.config.json         │
├─────────────────────────────────────────┤
│ 4. 默认值    legacy                     │ ← 兜底
└─────────────────────────────────────────┘
```

---

## 3. 配置方式

### 方式一：配置文件（推荐，提交 Git 共享）

编辑项目根目录的 `engine.config.json`：

```json
{
  "engine": "langgraph",
  "langgraph": {
    "maxTurns": 25,
    "checkpointDb": "data/checkpoints.db"
  }
}
```

配置项说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `engine` | `"legacy"` \| `"langgraph"` | 引擎类型 |
| `langgraph.maxTurns` | `number` | LangGraph 最大对话轮次 |
| `langgraph.checkpointDb` | `string` | Checkpoint 数据库路径 |

配置文件的查找策略：从当前工作目录开始向上逐级查找（最多 6 层），无论从 `packages/server/` 还是 `packages/server/dist/` 启动都能找到。

### 方式二：启动脚本参数

```bat
# 在 start-backend.bat 的参数位传入
start-backend.bat --engine langgraph
start-backend.bat --engine legacy
```

`start-backend.bat` 会将参数透传给 `node dist/index.js`。

### 方式三：环境变量（临时覆盖）

```bat
# CMD
set EASYAGENT_ENGINE=langgraph
start-backend.bat

# PowerShell
$env:EASYAGENT_ENGINE="langgraph"
.\start-backend.bat
```

环境变量会覆盖配置文件但可以被 CLI 参数再次覆盖。

---

## 4. 验证引擎类型

### 4.1 API 验证

```bash
curl http://localhost:3456/api/engine-type
# 返回: {"engineType":"langgraph"}  或  {"engineType":"legacy"}
```

### 4.2 前端验证

打开 EasyAgent → 侧边栏点击 **LangGraph** → 功能区状态栏显示当前引擎：

- `LangGraph`（青色半高亮）→ 正在使用 LangGraph 引擎
- `Legacy`（灰色）→ 正在使用 Legacy 引擎

### 4.3 启动日志验证

后端启动时会在日志中输出一行清晰的引擎信息：

```
▶ Agent 引擎: LangGraph  |  来源: 配置文件 engine.config.json
{ engine: 'langgraph', source: 'config', cli: '无', env: '无', configPath: 'D:\\...\\engine.config.json' }

▶ Agent 引擎: Legacy (AgentEngine)  |  来源: CLI 参数 --engine legacy
{ engine: 'legacy', source: 'cli', cli: 'legacy', env: '无', configPath: '无' }
```

关键字段说明：

| 字段 | 含义 |
|------|------|
| `engine` | 实际生效的引擎：`langgraph` 或 `legacy` |
| `source` | 来源类型：`cli` / `env` / `config` / `default` |
| `cli` | CLI 参数值，无则为 `无` |
| `env` | 环境变量值，无则为 `无` |
| `configPath` | 配置文件绝对路径（仅 `source=config` 时有效） |

---

## 5. LangGraph 控制面板使用

### 5.1 三种模式

进入 `/langgraph` 页面后，首先看到模式选择器：

| 模式 | 图标 | 界面 | 用途 |
|------|------|------|------|
| **集成可视化** | 🔵 Monitor | 大图(420px) + 9 张场景卡片 + Checkpoint 会话 | 日常开发、手动逐项验证 |
| **终端演示** | 🟢 Terminal | 紧凑图(260px) + PowerShell 终端日志 | 演示、批量回归、一键跑全量 |
| **独立 Demo** | 🟠 Zap | 终端控制台 + iframe 内嵌 | 启动独立 Demo 服务展示原始页面 |

点击「切换模式」可随时回到选择界面。

> **注意**：三种模式进入后均**不会自动执行场景**，需要点击界面上的执行按钮开始运行。

### 5.2 操作按钮

**集成可视化 / 终端演示** 模式：

- **▶ 执行全部场景**：按顺序手动执行全部 9 个场景
- **就绪 / 执行中(N)**：显示当前执行状态

**独立 Demo** 模式：

- **一键启动 Demo**：启动 `packages/langgraph/start-demo.bat --web`
- **停止 Demo**：终止 Demo 进程
- **打开 Demo**：在新窗口打开 `http://localhost:3455`

### 5.3 9 个测试场景

> 这 9 个场景是 **LangGraph 引擎的能力验收用例**，用于验证引擎的各个功能模块，非聊天时自动触发。

| # | 场景名称 | 测试能力 | 执行路径 |
|---|---------|---------|---------|
| 1 | 纯文本对话 | 最简单的 think→END | START→think→route→END |
| 2 | 工具调用循环 | 调用天气工具后观察再思考 | think→act→observe→think→END |
| 3 | 多工具并行 | 同时调用多个工具 | think→act(并行)→observe→END |
| 4 | maxTurns 安全终止 | 防止无限循环 | think→act→observe (×3)→END |
| 5 | Checkpoint + Resume | 保存并恢复上下文 | 两段独立 session → 断点续传 |
| 6 | 图结构可视化 | 静态展示全部节点和边 | 全节点+条件分支+循环边 |
| 7 | 上下文摘要与压缩 | 200+条消息自动摘要 | think→act→observe→END |
| 8 | 工具失败自动重试 | 工具失败后修正重试 | 失败→修正→重试成功 |
| 9 | 链式工具调用 | A输出→B输入链式流转 | 2轮循环·链式工具 |

**操作方式**：
- 点击单张卡片的 **运行** 按钮 → 仅执行该场景
- 点击顶部 **▶ 执行全部场景** → 自动顺序执行全部 9 个

**前提条件**：后端必须处于 `langgraph` 引擎模式，否则场景执行会使用 Legacy 引擎的模拟数据。

---

## 6. 在真实聊天中使用 LangGraph

### 6.1 当前状态

- ✅ 后端通过 `engineFactory` 支持引擎切换
- ✅ Chat API (`/api/chat`) 和 WebSocket (`/ws`) 通过 `newAgent()` 统一使用当前引擎
- ✅ LangGraph 页面有 9 个独立测试场景
- ✅ Chat 页面顶部显示当前引擎徽章（Legacy / LangGraph）
- ❌ Chat 页面的真实会话与 LangGraph 页面的可视化尚未打通

### 6.2 启用 LangGraph 后聊天会走什么路径

```
用户发送消息 → /api/chat 或 /ws (chat事件)
              → newAgent(providerConfig, {engine: currentEngine})
              → engineFactory.createAgent()
              → langgraph ? createLangGraphAgent() : new AgentEngine()
              → agent.run(message)
              → LLM 通过 LangGraph 有向图节点执行
              → 返回回复
```

启用后，聊天消息会经过 LangGraph 的 `START→think→route→act→observe→END` 有向图执行，具备：
- Checkpoint 自动保存/恢复
- maxTurns 安全截断
- 工具调用循环管理

**如何确认 Chat 已启用 LangGraph**：
打开 **AI 对话** 页面，标题栏连接状态旁边会显示引擎徽章：
- `Legacy`（灰色）→ 仍在使用旧引擎
- `LangGraph`（青色）→ 已切换到 LangGraph 引擎

### 6.3 后续方向

- 将 Chat 页面的实时 session 挂载到 LangGraph 页面进行可视化
- 在设置页暴露引擎切换开关（改 `engine.config.json` 后提示重启）
- 打通 scenarioResults 与真实 chat session 的状态共享

---

## 7. 相关文件

| 文件 | 说明 |
|------|------|
| `engine.config.json` | 引擎配置文件（可提交 Git） |
| `packages/server/src/langgraph/engineFactory.ts` | 引擎工厂：优先级解析 + Agent 创建 |
| `packages/server/src/langgraph/index.ts` | 模块导出 |
| `packages/server/src/index.ts` | 后端入口：CLI 解析 + API 路由 |
| `packages/frontend/src/pages/LangGraph.tsx` | 前端：三种模式 + 9 个场景 UI |
| `start-backend.bat` | 后端启动脚本：支持 `--engine` 参数 |
