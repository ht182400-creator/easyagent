# EasyAgent 双重构建体系详解：Desktop 与 Web

> **版本**：v0.6.6 | **更新**：2026-06-27  
> **适合读者**：从未接触过 EasyAgent 构建流程的初学者、需要维护构建脚本的开发者  
> **前置阅读**：[14\_构建前必检清单](./14_构建前必检清单.md)、[11\_构建链路对照表](./11_构建链路对照表_tsup_asar_inline详解.md)

---

## 目录

1. [为什么要两种构建？](#1-为什么要两种构建)
2. [项目架构速览](#2-项目架构速览)
3. [代码共享机制深度解析](#3-代码共享机制深度解析)
4. [build.bat 完整指南（Desktop 桌面版）](#4-buildbat-完整指南desktop-桌面版)
5. [build-web.bat 完整指南（Web 仪表盘）](#5-build-webbat-完整指南web-仪表盘)
6. [构建产物对比](#6-构建产物对比)
7. [后续优化建议](#7-后续优化建议)
8. [常见问题 FAQ](#8-常见问题-faq)

---

## 1. 为什么要两种构建？

EasyAgent 同时提供两种交付形态：

| 形态                  | 用户受众      | 运行方式                 | 特点                         |
| --------------------- | ------------- | ------------------------ | ---------------------------- |
| **Desktop（桌面版）** | 普通用户      | 下载 `.exe`，双击运行    | 自带 Electron 环境，开箱即用 |
| **Web（仪表盘）**     | 开发者 / 运维 | 部署到服务器，浏览器访问 | 需另启后端 API 服务          |

两者**共享同一套业务代码**（core 引擎 + server 后端），但**分发方式完全不同**，因此需要两套独立的构建流水线。

---

## 2. 项目架构速览

EasyAgent 使用 **pnpm monorepo** 管理，所有子包在 `packages/` 下：

```
EasyAgent/
├── packages/
│   ├── core/                ← 核心引擎（Agent、Tool、Session）
│   │   └── dist/            ← tsup 编译产物（ESM）
│   │
│   ├── server/              ← 后端 API（Express + WebSocket）
│   │   └── dist/            ← tsup 编译产物（ESM）
│   │
│   ├── frontend/            ← React 前端组件（UI 代码）
│   │   └── src/             ← 被 desktop 和 web 复用
│   │
│   ├── desktop/             ← Electron 桌面版主进程
│   │   ├── src/main.ts      ← 主进程入口
│   │   ├── dist/main.js     ← tsup 内联 core+server 的产物
│   │   ├── dist/renderer/   ← Vite 前端产物（嵌入 EXE）
│   │   └── release/         ← electron-builder 输出（.exe）
│   │
│   └── web/                 ← Web 仪表盘（纯前端打包）
│       └── dist/            ← Vite 前端产物（部署到 Nginx/静态服务）
│
├── build.bat                ← Desktop 构建入口
├── build-web.bat            ← Web 构建入口
└── pnpm-workspace.yaml      ← monorepo 配置
```

**包依赖关系**：

```
@easyagent/core          ← 最底层，被所有包依赖
    ↑
@easyagent/server        ← 依赖 core，提供 API
    ↑
    ├── @easyagent/desktop  ← 依赖 core + server + frontend（内联打包进 EXE）
    └── @easyagent/web      ← 依赖 frontend（纯前端）
            ↑
    @easyagent/frontend     ← React UI 组件，被 desktop 和 web 复用
```

---

## 3. 代码共享机制深度解析

### 3.1 核心问题

一个最常被问到的问题：

> **"build.bat 和 build-web.bat 都重新构建 core 和 server，为什么要重复做？"**

答案分两层：

### 3.2 core 和 server 的构建步骤完全相同

无论是 Desktop 还是 Web，core 和 server 的构建方式**完全一致**：

```batch
# core 构建（两个脚本完全相同）
cd packages\core
pnpm exec tsup
# 产出: packages/core/dist/index.js（ESM 格式，含类型声明）

# server 构建（两个脚本完全相同）
cd packages\server
pnpm exec tsup
# 产出: packages/server/dist/index.js（ESM 格式，220KB+）
```

因为它们都执行 `pnpm exec tsup`，读取的是**同一份 `tsup.config.ts`**。

### 3.3 但消费方式完全不同（⚠️ 关键差异）

这才是两者需要各自执行 core/server 构建的真正原因——**它们的打包策略截然不同**：

```
                       Desktop 打包                       Web 打包
                    ═══════════════                     ═══════════

  core/dist/index.js ───┐                            core/dist/index.js
                         │                                  │
  server/dist/index.js ──┤                            server/dist/index.js
                         │                                  │
                         ▼                                  ▼
              desktop/tsup (noExternal)               Node.js 运行时
              ┌─────────────────────┐                动态 import()
              │ main.js (1.14 MB)   │               从磁盘加载 dist/
              │ ┌─────────────────┐ │
              │ │  core 全部代码   │ │        ┌──────────────────────┐
              │ │  server 全部代码 │ │        │  web dist/           │
              │ │  desktop 主进程  │ │        │  ├── index.html      │
              │ └─────────────────┘ │        │  └── assets/         │
              └─────────────────────┘        │      ├── .js(416KB)  │
                       │                     │      └── .css(61KB)  │
                       ▼                     └──────────────────────┘
              electron-builder                         │
              ┌─────────────────────┐                  ▼
              │ app.asar            │          静态文件服务
              │  └── main.js        │       (Nginx / CloudStudio)
              │  └── node_modules   │                  │
              │  └── dist/renderer  │                  ▼
              └─────────────────────┘          浏览器访问
                       │                     (需单独启动后端)
                       ▼
              EasyAgent.exe (168MB)
              双击即可运行（内置全部）
```

### 3.4 Desktop：noExternal 内联机制

这是 Desktop 构建最核心的概念，必须理解。查看 `packages/desktop/tsup.config.ts`：

```typescript
noExternal: ['@easyagent/core', '@easyagent/server'],
```

**`noExternal` 的含义**：tsup 读取 `@easyagent/core` 和 `@easyagent/server` 的源码 → 直接把它们的**完整代码写进 `main.js`**，而不是留下 `import '...'` 引用。

**为什么要这样做？**

| 问题                     | 说明                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| pnpm workspace symlink   | 开发时 `@easyagent/core` 通过 pnpm 软链接指向 `../core`             |
| asar 打包后 symlink 失效 | electron-builder 将文件打包成 `app.asar` 压缩包，软链接路径全部断裂 |
| noExternal 解决          | 把依赖代码**物理写入** `main.js`，不依赖软链接                      |

**验证方法**：打开 `packages/desktop/dist/main.js`，搜索 `class Agent` 或 `class Session`，能找到来自 core 的类定义——它们确实被写入了这个文件。

### 3.5 Web：运行时动态加载

Web 版不需要 Electron 打包，直接跑 Node.js 进程：

```typescript
// server 启动时
import '@easyagent/core'; // → Node.js 解析为 core/dist/index.js（磁盘真实文件）
```

没有 asar 打包，没有 symlink 问题，就是普通的 Node.js 导入。

### 3.6 共享的前端代码

`frontend/` 包被 **desktop** 和 **web** 同时引用：

```json
// packages/desktop/package.json
"@easyagent/frontend": "workspace:*"

// packages/web/package.json
"@easyagent/frontend": "workspace:*"
```

两者通过各自的 Vite 构建入口引用同一套 React 组件：

```
packages/frontend/src/
├── pages/
│   ├── Settings.tsx      ← Desktop 和 Web 共用
│   ├── Chat.tsx
│   └── Dashboard.tsx
├── components/
│   └── ...               ← 所有 UI 组件共享
└── hooks/
    └── ...               ← 所有 React Hooks 共享
```

**Desktop 的 Vite** 将前端编译为 `desktop/dist/renderer/`，打包进 EXE。
**Web 的 Vite** 将前端编译为 `web/dist/`，部署到服务器。

两者的 Vite 配置不同：

- Desktop：嵌入 Electron，使用 `file://` 协议加载
- Web：独立部署，通过代理 `/api` → `localhost:3456` 访问后端

### 3.7 一句话总结

```
core+server 构建步骤相同 ──▶ 但 b.bat 把它们内联进 main.js
                               b-web.bat 让 Node 运行时动态加载

因此：修改 core/server 源码后，两个构建脚本都要重跑才能确保各自产物更新。
```

---

## 4. build.bat 完整指南（Desktop 桌面版）

### 4.1 命令行参数

```batch
build.bat                  Fast 模式：快速测试（仅 --dir，~60s）
build.bat --release        发布模式：生成 NSIS 安装包（~3 min）
build.bat --fast           同 Fast 模式（显式指定）
build.bat --verify         预检模式：仅运行 30+ 项检查，不构建
build.bat --debug          调试模式（需先 set EASYAGENT_DEBUG=1）
```

### 4.2 典型使用场景

| 你想要做什么                    | 命令                                 | 耗时   | 说明                     |
| ------------------------------- | ------------------------------------ | ------ | ------------------------ |
| 改完代码想快速验证 EXE 能否启动 | `build.bat`                          | ~60s   | 输出便携版，可双击测试   |
| 准备发布新版本                  | `build.bat --release`                | ~3 min | 输出便携版 + NSIS 安装包 |
| 构建前先检查环境                | `build.bat --verify`                 | ~5s    | 不改任何文件             |
| 调试构建失败原因                | `set EASYAGENT_DEBUG=1 && build.bat` | —      | 输出详细日志             |

### 4.3 完整流水线（Phase 0-5）

```
Phase 0: 清理
  ├─ 杀旧进程（EasyAgent.exe, electron.exe）
  ├─ 清 release/ 目录
  └─ 清 dist/renderer（防 Vite 缓存旧代码）

Phase 1: 预检（30+ 项）
  └─ verify-build.cjs → 检查 Node 版本、依赖完整性、preload 配置等

Phase 2: 构建所有模块
  ├─ build-shared.bat  (~1s) → core tsup + server tsup（与 build-web.bat 共用）
  ├─ desktop tsup       (~0.5s) → main.js（内联 core+server）
  ├─ desktop preload    (~0.2s) → preload.js（CJS，供 Electron 渲染进程用）
  └─ desktop vite       (~20s)  → dist/renderer/（前端 UI）
  └─ desktop vite     (~20s)  → dist/renderer/（前端 UI）

Phase 2.5: sqlite3 ABI 切换
  └─ better_sqlite3.node（system → electron）
     备份 system 版本，换上为 Electron 编译的版本

Phase 2.8: 依赖补齐
  └─ 复制 jsonfile/universalify 到 desktop/node_modules
     （electron-builder 需要，pnpm hoist 时可能漏掉）

Phase 3: 打包
  ├─ Fast 模式：electron-builder --dir（仅解包目录）
  └─ Release 模式：electron-builder --win --x64（NSIS 安装包）
     含 Defender 拦截自动重试机制

Phase 3.5: sqlite3 恢复
  └─ better_sqlite3.node（electron → system）
     还原 system 版本，保证开发时后端能正常启动

Phase 4-5: 输出验证
  ├─ EasyAgent.exe 大小检查（正常 ~168MB）
  ├─ app.asar 大小检查
  ├─ asar 内容验证（检查是否含 localhost 硬编码等常见问题）
  └─ Installer 文件大小展示
```

### 4.4 关键文件输出

| 位置                                                            | 说明                  |
| --------------------------------------------------------------- | --------------------- |
| `packages/desktop/release/win-unpacked/EasyAgent.exe`           | 便携版 EXE（~168MB）  |
| `packages/desktop/release/EasyAgent-0.6.6-win-x64.exe`          | NSIS 安装包（~105MB） |
| `packages/desktop/release/latest.yml`                           | 自动更新元数据        |
| `packages/desktop/release/EasyAgent-0.6.6-win-x64.exe.blockmap` | 增量更新差分表        |

### 4.5 环境变量

| 变量                          | 作用                             |
| ----------------------------- | -------------------------------- |
| `EASYAGENT_SKIP_NODE_CHECK=1` | 跳过 Node 版本检查（脚本自动设） |
| `EASYAGENT_DEBUG=1`           | 启用调试日志，输出详细执行信息   |

---

## 5. build-web.bat 完整指南（Web 仪表盘）

### 5.1 命令行参数

```batch
build-web.bat              Fast 模式：仅 vite 打包（~20s）
build-web.bat --check      完整模式：tsc 类型检查 + vite 打包（~50s）
build-web.bat --fast       同 Fast 模式（显式指定）
build-web.bat --serve      构建 + 启动预览服务器
build-web.bat --clean      仅清理 dist 目录，不构建
```

### 5.2 典型使用场景

| 你想要做什么          | 命令                    | 耗时 | 说明                 |
| --------------------- | ----------------------- | ---- | -------------------- |
| 改了前端 UI，想看效果 | `build-web.bat`         | ~20s | 跳过 tsc，快速出产物 |
| 准备部署到生产        | `build-web.bat --check` | ~50s | 含类型检查，确保质量 |
| 本地预览 Web 效果     | `build-web.bat --serve` | ~25s | 自动打开浏览器       |
| 清理旧产物            | `build-web.bat --clean` | ~1s  | 仅删除 dist          |

### 5.3 完整流水线（Phase 0-4）

```
Phase 0: 清理
  └─ 清 packages/web/dist/

Phase 1: 构建共享模块 (build-shared.bat)
  ├─ core tsup（~0.3s）+ server tsup（~0.3s）
  └─ 不包含：electron 相关依赖处理（Desktop 专用）

Phase 2: 构建 Web 前端
  ├─ [--check 模式] tsc --noEmit（类型检查）
  └─ vite build（~20s）

Phase 3: 输出验证
  ├─ index.html 大小检查
  ├─ JS/CSS 文件大小展示
  └─ HTML 结构正确性验证（含 root div 和 script 标签）
```

### 5.4 与 Desktop 构建的差异

| 操作                  | build.bat                   | build-web.bat            |
| --------------------- | --------------------------- | ------------------------ |
| sqlite3 ABI 切换      | ✅ 需要（Electron 版本）    | ❌ 不需要（System 版本） |
| preload 构建          | ✅ 需要（CJS 格式）         | ❌ 不需要                |
| electron-builder 打包 | ✅                          | ❌                       |
| electron 依赖补齐     | ✅（jsonfile/universalify） | ❌                       |
| tsc 类型检查          | ❌ 不单独执行               | ✅ `--check` 模式        |
| 静态文件服务器        | ❌                          | ✅ `--serve` 模式        |
| 杀旧进程              | ✅                          | ❌                       |

> **🚫 禁忌**：Web 产物不能当 Desktop 用，Desktop EXE 不能当 Web 部署。两者是完全不同的分发形式。

---

## 6. 构建产物对比

| 属性         | Desktop 构建                     | Web 构建                        |
| ------------ | -------------------------------- | ------------------------------- |
| **入口命令** | `build.bat --release`            | `build-web.bat --check`         |
| **输出位置** | `packages/desktop/release/`      | `packages/web/dist/`            |
| **产品形态** | `.exe` 安装包                    | 静态 HTML + JS + CSS            |
| **产物数量** | 3 个文件（EXE + blockmap + yml） | 若干文件（index.html + assets） |
| **总大小**   | EXE ~168MB / Installer ~105MB    | JS ~416KB + CSS ~61KB           |
| **依赖环境** | 无需（自含 Electron）            | 需 Node.js 后端（~5MB）         |
| **分发方式** | GitHub Release 下载              | 服务器部署 / 静态托管           |
| **更新机制** | electron-updater 自动更新        | git pull / docker pull 手动更新 |

---

## 7. 后续优化建议

### 7.1 提取共享构建步骤（推荐 ⭐⭐⭐）

**当前问题**：core 和 server 的 `pnpm exec tsup` 在两个脚本中完全重复。

**优化方案**：创建 `build-shared.bat`，core+server 构建只做一次。

```batch
REM === 新建 scripts/build-shared.bat ===
@echo off
cd /d "%~dp0\.."
echo [SHARED] Building core...
cd packages\core && call pnpm exec tsup
if %errorlevel% neq 0 exit /b 1
echo [SHARED] Building server...
cd ..\server && call pnpm exec tsup
if %errorlevel% neq 0 exit /b 1
cd ..\..
```

然后 `build.bat` 和 `build-web.bat` 的 Phase 1-2 替换为 `call scripts\build-shared.bat`。

**预期收益**：构建时间不变（tsup 本身就快），但维护负担减半——修改共享构建逻辑只需改一处。

**风险评估**：低。因为 core 和 server 的 tsup 配置本来就是完全相同的，不存在平台差异。

### 7.2 增量构建支持（推荐 ⭐⭐）

**当前问题**：每次构建都全量重新编译 core 和 server，哪怕没改过代码。

**优化方案**：

- tsup 本身支持缓存（通过配置 `tsup.config.ts` 的缓存选项）
- 或者在 `build-shared.bat` 中加入文件时间戳比对，跳过未修改的模块

```batch
REM 伪代码：增量判断
if exist "packages\core\dist\index.js" (
    for %%F in ("packages\core\dist\index.js") do set DIST_TIME=%%~tF
    for %%F in ("packages\core\src\index.ts") do set SRC_TIME=%%~tF
    if "!DIST_TIME!" geq "!SRC_TIME!" (
        echo [SKIP] core unchanged, skipping.
        goto :skip_core
    )
)
```

**预期收益**：未改动代码时，构建时间从 ~30s 降到 ~20s。

**风险评估**：中等。文件时间戳判断可能不可靠（git checkout 会重置时间戳），建议同时检查文件哈希。

### 7.3 并行构建（推荐 ⭐）

**当前问题**：core 和 server 在 build.bat/build-web.bat 中各自独立构建，存在重复。

**已优化**：已提取 `build-shared.bat`，core + server 构建只执行一次。

**进一步优化**：core 和 server 之间没有严格的构建依赖（server 只是 import core 的 dist 产物，但 tsup 不解析 `noExternal` 以外的内容），可以尝试并行构建。

但收益有限——tsup 编译极快（~0.3s），主要耗时在 Vite 打包（~20s）和 electron-builder（~2min），这两者没法并行。

**结论**：暂不建议。投入产出比不高。

### 7.4 CI/CD 集成（✅ 已实现）

**状态**：`v0.6.6` 已完成，配置文件位于 `.github/workflows/release.yml`。

#### 触发方式

| 方式         | 操作                                    | 场景             |
| ------------ | --------------------------------------- | ---------------- |
| **自动触发** | 推送版本标签 `git push origin v0.6.6`   | 正式发布         |
| **手动触发** | GitHub Actions → Release → Run workflow | 紧急修复或预发布 |

#### 发布流程

```bash
# 1. 确保所有代码已提交
git add .
git commit -m "release: v0.6.6"

# 2. 打标签并推送（自动触发 CI/CD）
git tag v0.6.6
git push origin main
git push origin v0.6.6   # ← 这行触发自动构建

# 3. 等待 GitHub Actions 完成（约 5-10 分钟）
#    访问 https://github.com/ht182400-creator/easyagent/actions
#    查看 Release 工作流

# 4. 完成后自动创建 GitHub Release
#    https://github.com/ht182400-creator/easyagent/releases
```

#### 工作流架构

```
推送标签 v0.6.2
        │
        ├──→ version job (提取版本号)
        │
        ├──→ build-desktop (Windows)
        │    ├─ core tsup + server tsup
        │    ├─ desktop tsup + preload CJS + vite
        │    ├─ verify-build.cjs
        │    ├─ better-sqlite3 双版本编译
        │    ├─ electron-builder --win --x64
        │    └─ 上传: EXE + blockmap + latest.yml
        │
        ├──→ build-web (Ubuntu)
        │    ├─ core tsup + server tsup
        │    ├─ vite build
        │    └─ 上传: web-dist.tar.gz
        │
        └──→ release (Ubuntu)
             ├─ 下载所有产物
             ├─ 验证完整性
             ├─ 生成 Release Notes (从 CHANGELOG.md)
             ├─ 创建 GitHub Release (latest=true)
             └─ 上传 4 个 Assets
```

#### 构建环境

| Job             | Runner          | 耗时   | 特殊需求                                                  |
| --------------- | --------------- | ------ | --------------------------------------------------------- |
| `build-desktop` | `windows-2022`  | ~5 min | MSVC (ilammy/msvc-dev-cmd), better-sqlite3 native compile |
| `build-web`     | `ubuntu-latest` | ~2 min | 无                                                        |
| `release`       | `ubuntu-latest` | ~30s   | `contents: write` 权限                                    |

#### 产物

| Asset                                | 大小   | 用途                      |
| ------------------------------------ | ------ | ------------------------- |
| `EasyAgent-{v}-win-x64.exe`          | ~105MB | 用户下载安装              |
| `EasyAgent-{v}-win-x64.exe.blockmap` | ~1MB   | electron-updater 增量更新 |
| `latest.yml`                         | ~300B  | 自动更新版本检测清单      |
| `web-dist.tar.gz`                    | ~200KB | Web 仪表盘部署            |

### 7.5 优化优先级总结

| 优先级 | 建议                    | 难度 | 收益             | 状态      |
| ------ | ----------------------- | ---- | ---------------- | --------- |
| 🥇     | CI/CD 自动化构建        | 中   | 高：质量可追溯   | ✅ 已完成 |
| 🥈     | 提取 `build-shared.bat` | 低   | 高：减少重复维护 | ✅ 已完成（2026-06-27） |
| 🥉     | 增量构建                | 中   | 中：小幅加速     | 📋 待实现 |
| 4      | 并行构建                | 低   | 低：tsup 已够快  | 📋 暂缓   |

---

## 8. 常见问题 FAQ

### Q1: 我只改了 `Settings.tsx`，需要重新构建 core/server 吗？

**A**: 不需要。前端代码的变更只需要 Vite 重新打包。你可以直接跑：

- Desktop：`cd packages/desktop && npx vite build && npx electron-builder --dir`
- Web：`build-web.bat`（只重编 vite）

但如果使用 `build.bat --release`，它会自动重建 core/server（很快，~0.6s），不会造成实质影响。

### Q2: 改了 `server/src/index.ts`，两个构建都要重跑吗？

**A**: 是的。因为 Desktop 的 `main.js` 内联了 server 代码（`noExternal`），Web 需要 server 的 `dist/` 产物。两个脚本都会重新 tsup 编译 server。

### Q3: Web 构建的产物能在 Desktop 里用吗？

**A**: **绝对不能**。Web 的 dist 是为浏览器设计的独立静态文件。Desktop 的 renderer 产物在 `packages/desktop/dist/renderer/`，由 Desktop 自己的 Vite 构建（配置不同）。

### Q4: build.bat 报 "Access Denied" 怎么办？

**A**: EasyAgent.exe 还在运行。执行 `taskkill /f /im EasyAgent.exe` 后再构建。

### Q5: build.bat 报 "Can't open output file"？

**A**: Windows Defender 锁定了 `release/` 目录。构建脚本已内置 Defender 重试机制（等 5 秒后自动重试），如果两次都失败，用管理员 PowerShell 添加排除项。

### Q6: 怎么验证构建的 EXE 是最新的？

**A**: 三个方法：

1. 看 `build.bat` 最后的 [VERIFYING OUTPUT] 输出，EXE 大小应在 ~168MB 左右
2. 启动 EXE → Settings 页面 → 检查版本号
3. 检查 `packages/desktop/dist/main.js` 的修改时间

### Q7: Web 构建产物怎么部署？

**A**: `packages/web/dist/` 中的文件部署到任意静态文件服务器即可。但注意需要单独启动后端 API 服务：

```batch
cd packages/server
pnpm run start    # 启动在 localhost:3456
```

Web 前端默认配置了 `/api` 代理 → `localhost:3456`，如果后端在其他地址，需修改 Vite 配置。

### Q8: 开发时想快速预览前端修改，最快的方式是？

**A**:

- Desktop 开发：`cd packages/desktop && npx vite` → 热更新前端 → 配合 `pnpm run dev:main` 热更新后端
- Web 开发：`cd packages/web && npx vite` → 热更新 + 代理到后端 API

**不要每次都跑完整构建**——`build.bat` 是给发布用的。

---

## 参考文档

| 文档                                                              | 内容                            |
| ----------------------------------------------------------------- | ------------------------------- |
| [11\_构建链路对照表](./11_构建链路对照表_tsup_asar_inline详解.md) | tsup、asar、noExternal 机制详解 |
| [14\_构建前必检清单](./14_构建前必检清单.md)                      | 构建前 30 秒速查卡              |
| [05_Desktop EXE打包标准流程](./05_Desktop_EXE打包标准流程.md)     | 28 个历史问题详解               |
| [12\_项目启动与运行方式指南](./12_项目启动与运行方式指南.md)      | 开发环境搭建                    |
| [13\_自动更新架构设计文档](./13_自动更新架构设计文档.md)          | electron-updater 自动更新机制   |

---

> **最后**：记住两个核心概念——**noExternal 内联**（Desktop）和**运行时 import**（Web）——理解了这两个，整个构建体系就通了。
