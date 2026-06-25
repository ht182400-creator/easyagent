# 贡献指南 - EasyAgent

感谢你对 EasyAgent 的关注！EasyAgent 是一个集成中国主流大模型的开源 AI 编程助手，我们欢迎任何形式的贡献。

## 📋 目录

- [行为准则](#行为准则)
- [我能贡献什么？](#我能贡献什么)
- [开发环境搭建](#开发环境搭建)
- [项目结构](#项目结构)
- [开发工作流](#开发工作流)
- [代码规范](#代码规范)
- [测试规范](#测试规范)
- [提交规范](#提交规范)
- [发布流程](#发布流程)
- [Good First Issues](#good-first-issues)

---

## 行为准则

请阅读并遵守我们的[行为准则](CODE_OF_CONDUCT.md)。简单来说：**保持友善、尊重他人、建设性讨论**。

---

## 我能贡献什么？

### 🟢 新手上手 (Good First Issue)

| # | 任务 | 涉及模块 | 难度 |
|---|------|---------|------|
| 1 | 为 CLI 添加单元测试 | `packages/cli/src/__tests__/` | ⭐ |
| 2 | 添加缺失的 JSDoc 注释 | 全项目 | ⭐ |
| 3 | 修复 Markdown 文档拼写错误 | `docs/` | ⭐ |
| 4 | 为 Desktop 组件添加 loading 状态 | `packages/desktop/src/renderer/` | ⭐⭐ |
| 5 | 添加 Tailwind CSS 暗色模式支持 | `packages/frontend/src/` | ⭐⭐ |

### 🔵 中等难度

| # | 任务 | 涉及模块 | 难度 |
|---|------|---------|------|
| 6 | 实现缺失的工具 (Tool) | `packages/core/src/tools/` | ⭐⭐ |
| 7 | 添加新的 Provider 适配器 | `packages/core/src/adapters/` | ⭐⭐⭐ |
| 8 | 前端国际化 (i18n) 支持 | `packages/frontend/src/` | ⭐⭐⭐ |
| 9 | WebSocket 重连机制优化 | `packages/server/src/` | ⭐⭐ |

### 🔴 高级

| # | 任务 | 涉及模块 | 难度 |
|---|------|---------|------|
| 10 | 实现模型评测基准体系 | `scripts/swe-bench/` | ⭐⭐⭐⭐ |

---

## 开发环境搭建

### 前置要求

- **Node.js** >= 18.0.0 (推荐 22.x LTS)
- **pnpm** >= 8.0.0
- **Git**
- **Visual Studio Build Tools** (仅 Windows，用于编译 native 模块)

### 一键安装

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/easyagent/easyagent/main/scripts/install.sh | bash

# Windows PowerShell
iwr -Uri https://raw.githubusercontent.com/easyagent/easyagent/main/scripts/install.ps1 | iex
```

### 手动安装

```bash
# 1. 克隆仓库
git clone https://github.com/easyagent/easyagent.git
cd easyagent

# 2. 安装依赖
pnpm install

# 3. 构建项目
pnpm build

# 4. 运行测试
pnpm test

# 5. 启动开发模式
pnpm dev:server    # Web UI + API Server
pnpm dev:cli       # CLI 模式
```

### 配置模型

```bash
# DeepSeek (推荐入门)
export DEEPSEEK_API_KEY="sk-xxx"

# 智谱 GLM
export ZHIPU_API_KEY="xxx"

# 通义千问
export QWEN_API_KEY="xxx"

# 启动后通过 Web UI 或 CLI 选择模型
```

---

## 项目结构

```
easyagent/
├── packages/
│   ├── core/          # 核心引擎 (Token 工具、适配器、适配器工厂)
│   │   ├── src/
│   │   │   ├── adapters/      # 大模型适配器 (DeepSeek/智谱/千问/...)
│   │   │   ├── plugins/       # 插件系统 + 沙箱隔离
│   │   │   ├── tools/         # 51 个工具 (文件/搜索/Git/知识库)
│   │   │   ├── types/         # TypeScript 类型定义
│   │   │   └── __tests__/     # 核心模块测试
│   ├── cli/           # Ink React 终端 CLI
│   ├── server/        # Express API Server + WebSocket
│   ├── desktop/       # Electron Desktop 应用
│   └── frontend/      # React Web Dashboard
├── docs/              # 文档 & 管线数据
├── scripts/           # 构建/发布脚本
│   └── swe-bench/     # SWE-Bench 基准测试
├── .github/workflows/ # CI/CD 配置
├── models-catalog.json # 模型目录 (自动更新)
├── version.json       # 版本号 (唯一源)
└── CHANGELOG.md       # 变更日志
```

---

## 开发工作流

### 分支策略

```
main          ← 稳定版本
├── feat/*    ← 新功能分支
├── fix/*     ← 修复分支
├── docs/*    ← 文档分支
└── chore/*   ← 维护分支
```

### 开发步骤

1. **Fork 仓库** → 从 `main` 创建功能分支
2. **编码** → 遵循代码规范，添加测试
3. **自测** → `pnpm test` 全部通过
4. **提交** → 遵循 Conventional Commits
5. **PR** → 描述清晰，关联 Issue
6. **Review** → 通过 CI 检查 + 人工审查
7. **合并** → Squash Merge 到 `main`

### 本地开发命令

```bash
# 开发模式 (watch + hot-reload)
pnpm dev:server     # API Server + Web Dashboard
pnpm dev:cli        # CLI Terminal

# 构建
pnpm build          # 全量构建
pnpm build:core     # 仅 Core
pnpm build:server   # 仅 Server

# 测试
pnpm test           # 运行所有测试
pnpm test:core      # 仅 Core 测试
pnpm test:server    # 仅 Server 测试
pnpm test:coverage  # 覆盖率报告

# 代码检查
pnpm lint           # ESLint + Prettier
pnpm lint:fix       # 自动修复
```

---

## 代码规范

### TypeScript

- 使用 TypeScript 严格模式
- 所有公有函数必须有 **JSDoc 注释**（中文优先）
- 复杂逻辑添加行内注释
- 使用 `try-catch` 包裹可能出错的代码

```typescript
/**
 * 创建模型适配器
 * @param providerConfig - 提供商配置
 * @returns 对应的适配器实例
 * @throws {Error} 不支持的 apiFormat 时抛出
 */
function createAdapter(providerConfig: ProviderConfig): BaseAdapter {
  try {
    switch (providerConfig.apiFormat) {
      case 'openai':
        return new OpenAICompatibleAdapter(providerConfig);
      case 'custom':
        return createCustomAdapter(providerConfig);
      default:
        throw new Error(`不支持的 apiFormat: ${providerConfig.apiFormat}`);
    }
  } catch (error) {
    logger.error('创建适配器失败', error);
    throw error;
  }
}
```

### React 组件

- 使用函数组件 + Hooks
- 优先使用 Zustand 状态管理
- 组件注释使用中文

### Git 提交

遵循 [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: 添加通义千问 Qwen3 适配器
fix: 修复 DeepSeek 流式响应截断问题
docs: 更新贡献指南
test: 添加 Chat API 集成测试
refactor: 重构 PluginManager 沙箱隔离逻辑
chore: 更新 pnpm-lock.yaml
```

---

## 测试规范

### 测试分层

| 层级 | 位置 | 框架 | 覆盖目标 |
|------|------|------|---------|
| 单元测试 | `packages/core/src/__tests__/` | Vitest | 核心逻辑 |
| 集成测试 | `packages/server/src/__tests__/` | Vitest + supertest | API 端点 |
| 组件测试 | `packages/desktop/src/__tests__/` | Vitest + jodom | React 组件 |
| E2E 测试 | 待实现 | Playwright | 全链路 |

### 写测试的规则

1. 每个新功能必须包含测试
2. 修复 Bug 必须包含回归测试
3. 测试文件命名: `*.test.ts` 或 `*.test.tsx`
4. 使用 `describe` / `it` 组织测试，描述使用中文
5. 运行 `pnpm test` 确保全部通过后再提交

### 测试命令

```bash
pnpm test               # 全部测试
pnpm test:core          # Core 模块 (908 cases)
pnpm test:server        # Server 模块 (151 cases)
pnpm test:coverage      # 生成覆盖率报告
```

---

## 发布流程

1. 更新 `version.json`
2. 运行 `node scripts/sync-version.mjs`
3. 更新 `CHANGELOG.md`
4. 运行 `node scripts/release.mjs patch|minor|major`
5. 推送到 GitHub → CI 自动构建并发布

---

## Good First Issues

以下是适合新贡献者的入门任务，标注为 `good-first-issue`:

### #1 为 CLI 添加单元测试 ⭐

- **文件**: `packages/cli/src/__tests__/`
- **描述**: CLI 模块目前缺少单元测试，需要为命令处理器添加基础测试
- **涉及**: Vitest, CLI 命令解析
- **预期**: 新增 10-15 个测试用例

### #2 添加缺失的 JSDoc 注释 ⭐

- **文件**: 全项目
- **描述**: 部分工具类和工具函数缺少 JSDoc 注释，需要补齐
- **涉及**: TypeScript, JSDoc

### #3 修复 Markdown 文档拼写错误 ⭐

- **文件**: `docs/` 目录
- **描述**: 文档中存在少量拼写或格式错误
- **涉及**: Markdown

### #4 为 Desktop 组件添加 loading 状态 ⭐⭐

- **文件**: `packages/desktop/src/renderer/`
- **描述**: 部分组件在数据加载时缺少 loading 指示器
- **涉及**: React, Zustand Store

### #5 添加 Tailwind CSS 暗色模式 ⭐⭐

- **文件**: `packages/frontend/src/`
- **描述**: Web Dashboard 需要暗色模式支持
- **涉及**: React, Tailwind CSS, CSS Variables

### #6 实现缺失的工具 ⭐⭐

- **文件**: `packages/core/src/tools/`
- **描述**: 工具系统还有部分计划中的工具未实现
- **涉及**: Tool 接口实现

### #7 添加新的 Provider 适配器 ⭐⭐⭐

- **文件**: `packages/core/src/adapters/`
- **描述**: 为新的中国大模型提供商添加适配器
- **涉及**: OpenAI 兼容 API, 适配器模式

### #8 前端国际化 (i18n) ⭐⭐⭐

- **文件**: `packages/frontend/src/`
- **描述**: Web Dashboard 需要多语言支持
- **涉及**: React, i18n 框架

### #9 WebSocket 重连机制 ⭐⭐

- **文件**: `packages/server/src/`
- **描述**: WebSocket 连接断开后需要自动重连
- **涉及**: WebSocket, 指数退避

### #10 模型评测基准体系 ⭐⭐⭐⭐

- **文件**: `scripts/swe-bench/`
- **描述**: 建立标准化的模型评测流程
- **涉及**: SWE-Bench, 评测指标体系

---

## 获取帮助

- 📖 [项目文档](docs/)
- 🐛 [提交 Bug](https://github.com/easyagent/easyagent/issues/new?template=bug_report.md)
- 💡 [功能请求](https://github.com/easyagent/easyagent/issues/new?template=feature_request.md)
- 💬 [讨论区](https://github.com/easyagent/easyagent/discussions)

---

## 致谢

感谢所有为 EasyAgent 做出贡献的开发者！

遵循 [All Contributors](https://allcontributors.org/) 规范，我们珍视每一种贡献形式：
代码、文档、测试、设计、社区运营、问题反馈等。
