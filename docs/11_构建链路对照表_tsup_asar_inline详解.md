# EasyAgent Desktop 构建链路对照表：tsup · asar · inline 全解析

> **更新**：2026-06-26 03:00  
> **背景**：v0.5.4 桌面版连接失败问题排查历时 3 小时，构建链路复杂是核心痛点之一。  
> **目的**：建立源代码 → 编译产物 → asar 打包 → EXE 安装包的完整映射关系，消除"不知道改哪个、不知道哪个生效"的困惑。

---

## 1. 项目仓库结构概览

```
EasyAgent/
├── packages/
│   ├── server/           ← Express 后端 (API + WebSocket)
│   │   ├── src/index.ts  ← 【源码】CORS、路由、中间件
│   │   └── dist/index.js ← 【产物】tsup 编译 (610 KB)
│   │
│   ├── core/             ← 核心引擎 (Agent/Tools/Session)
│   │   └── dist/index.js ← 【产物】tsup 编译
│   │
│   ├── desktop/          ← Electron 桌面版
│   │   ├── src/main.ts   ← 【源码】Electron 主进程
│   │   ├── dist/
│   │   │   ├── main.js   ← 【产物】tsup 编译 (1.14 MB) ⚠️ 内联了 server+core
│   │   │   ├── preload.js← 【产物】tsup 编译 (~0 KB)
│   │   │   └── renderer/ ← 【产物】Vite 编译 (前端 React)
│   │   ├── release/
│   │   │   ├── win-unpacked/
│   │   │   │   ├── EasyAgent.exe       (168.9 MB)
│   │   │   │   └── resources/app.asar (100.4 MB)
│   │   │   └── EasyAgent-0.5.4-win-x64.exe  (95.8 MB, NSIS 安装包)
│   │   └── package.json
│   │
│   └── frontend/         ← React 前端 (Web + Desktop 共用)
│       └── src/
│           ├── config.tsx  ← ⚠️ useEffect→useLayoutEffect (竞态修复)
│           └── request.ts  ← apiRequest() 重试机制
```

---

## 2. 完整构建流水线 (6 步)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Phase 1: 源码编译                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Step 1: Server tsup                                                │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ packages/server/src/index.ts ──tsup──▶ dist/index.js     │      │
│  │                                   610 KB (625,637 字节)   │      │
│  │  clean: true  → 每次清空 dist 重新编译                       │      │
│  │  format: esm, platform: node                               │      │
│  │                                                           │      │
│  │  ⚠️ 此产物用于: CI 测试 / pnpm workspace 引用               │      │
│  │  ❌ 不用于: Electron 运行时 (会被 Step 3 inline)            │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Step 2: Core tsup                                                  │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ packages/core/src/*.ts ──tsup──▶ dist/index.js            │      │
│  │                                                           │      │
│  │  ⚠️ 此产物用于: CI 测试 / pnpm workspace 引用               │      │
│  │  ❌ 不用于: Electron 运行时 (会被 Step 3 inline)            │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Step 3: Desktop tsup (main.js) ← ⚠️ 最关键的步骤                    │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ packages/desktop/src/main.ts ──tsup──▶ dist/main.js      │      │
│  │                                   1.14 MB (1,200,xxx 字节) │      │
│  │                                                           │      │
│  │  tsup.config.ts 关键配置:                                  │      │
│  │  ┌─────────────────────────────────────────────────┐    │      │
│  │  │ entry:     ['src/main.ts', 'src/preload.ts']    │    │      │
│  │  │ format:    ['esm']                              │    │      │
│  │  │ external:  ['electron','better-sqlite3',        │    │      │
│  │  │             'pino','express','cors','ws',        │    │      │
│  │  │             'multer','electron-updater',         │    │      │
│  │  │             'electron-store']                    │    │      │
│  │  │                                                 │    │      │
│  │  │ noExternal: ['@easyagent/core',                 │    │      │
│  │  │              '@easyagent/server']  ← 内联到      │    │      │
│  │  │                 main.js 内部                    │    │      │
│  │  │ clean:      false  ← 不清理 dist (保留 Vite 产物)│    │      │
│  │  │ target:     'node20'                           │    │      │
│  │  └─────────────────────────────────────────────────┘    │      │
│  │                                                           │      │
│  │  最终 main.js 内容分布 (实测定行):                          │      │
│  │  ┌─────────────────────────────────────────────────┐    │      │
│  │  │ Lines   1    ~ 13130: desktop 主进程逻辑        │    │      │
│  │  │ Lines 13131 ~ 15196: @easyagent/server 内联代码  │    │      │
│  │  │                      (含 CORS @ line 13415)      │    │      │
│  │  │ Lines 15197 ~ END:   @easyagent/core 内联代码    │    │      │
│  │  │                      (init_dist2 入口 @ 15197)   │    │      │
│  │  └─────────────────────────────────────────────────┘    │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Step 4: Vite 前端构建                                              │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ packages/frontend/src/*.tsx ──vite──▶ dist/renderer/     │      │
│  │                                   index.html + assets/   │      │
│  │                                                           │      │
│  │  输出到 packages/desktop/dist/renderer/                    │      │
│  │  (Vite 配置: outDir = ../desktop/dist/renderer)           │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                       Phase 2: 打包发布                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Step 5: electron-builder pack (--dir 模式)                         │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ 输入: packages/desktop/ 整个目录                            │      │
│  │                                                           │      │
│  │ electron-builder 配置 (package.json build 字段):            │      │
│  │ ┌─────────────────────────────────────────────────┐    │      │
│  │ │ files: [                                         │    │      │
│  │ │   "dist/**/*",       ← main.js + renderer        │    │      │
│  │ │   "assets/**/*",                                 │    │      │
│  │ │   "node_modules/**/*",  ← 所有依赖                │    │      │
│  │ │   "!node_modules/.cache",                        │    │      │
│  │ │   "!node_modules/**/*.ts",   ← 排除源文件        │    │      │
│  │ │   "!node_modules/**/*.map",  ← 排除 map 文件     │    │      │
│  │ │   ...其他排除规则...                              │    │      │
│  │ │ ]                                                │    │      │
│  │ │ asar: true  ← 打包成单文件                       │    │      │
│  │ └─────────────────────────────────────────────────┘    │      │
│  │                                                           │      │
│  │ 输出: release/win-unpacked/                                │      │
│  │   ├── EasyAgent.exe           168.92 MB                  │      │
│  │   └── resources/                                          │      │
│  │       ├── app.asar             100.40 MB  ← 核心          │      │
│  │       └── app.asar.unpacked/   (解压的原生模块)            │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Step 6: electron-builder dist (NSIS 安装包)                        │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ 输入: release/win-unpacked/                                │      │
│  │ 输出: release/EasyAgent-0.5.4-win-x64.exe  95.75 MB      │      │
│  └──────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 关键文件对照表 (源 → 产物 → asar)

| 序号 | 源文件 (源码)                     | 编译器          | 中间产物                           | 大小    | asar 内路径                                   | 运行时使用?               |
| ---- | --------------------------------- | --------------- | ---------------------------------- | ------- | --------------------------------------------- | ------------------------- |
| 1    | `packages/server/src/index.ts`    | tsup            | `packages/server/dist/index.js`    | 610 KB  | ❌ 不在 asar 中                               | **❌ 不直接使用**         |
| 2    | `packages/desktop/src/main.ts`    | tsup            | `packages/desktop/dist/main.js`    | 1.14 MB | `/dist/main.js`                               | **✅ 主进程入口**         |
| 3    | ⊂ 同 #2 — server 内联             | tsup noExternal | ⊂ main.js lines 13131~15196        | ~200 KB | ⊂ `/dist/main.js`                             | **✅ 运行时 CORS 代码**   |
| 4    | ⊂ 同 #2 — core 内联               | tsup noExternal | ⊂ main.js lines 15197~END          | ~350 KB | ⊂ `/dist/main.js`                             | **✅ 运行时 Agent**       |
| 5    | `packages/desktop/src/preload.ts` | tsup            | `packages/desktop/dist/preload.js` | ~0 KB   | `/dist/preload.js`                            | ✅ preload 脚本           |
| 6    | `packages/frontend/src/*.tsx`     | Vite            | `packages/desktop/dist/renderer/`  | ~2 MB   | `/dist/renderer/`                             | ✅ 前端页面               |
| 7    | ⊂ 同 #6 — config.tsx              | Vite            | ⊂ renderer/assets/index-\*.js      | ~100 KB | ⊂ `/dist/renderer/`                           | ✅ apiBase 配置           |
| 8    | - (npm cors 包)                   | -               | `node_modules/cors/`               | ~30 KB  | `/node_modules/cors/`                         | ✅ Express CORS 中间件    |
| 9    | - (npm express 包)                | -               | `node_modules/express/`            | ~100 KB | `/node_modules/express/`                      | ✅ Web 框架               |
| 10   | `packages/core/src/*.ts`          | tsup            | `packages/core/dist/index.js`      | ~200 KB | `/node_modules/@easyagent/core/dist/index.js` | ⚠️ 两份 (asar 中的是冗余) |

### 重要说明

- **`@easyagent/server`** 完全不在 asar 的 `node_modules` 中 → 100% 内联到 main.js
- **`@easyagent/core`** 既内联到 main.js，又以 `node_modules/@easyagent/core/` 出现在 asar 中 → asar 中的副本是冗余的（electron-builder 的 `files` 规则 `node_modules/**/*` 将其打包，但运行时不使用）
- **`cors`、`express`、`ws`** 等 npm 包作为 external，在运行时从 asar 内的 `node_modules/` 读取

---

## 4. CORS 代码在产物中的位置对照表

### 4.1 相同的 CORS 逻辑出现在 2 个文件中

| 文件                            | 行号        | 是否使用          | 说明                                            |
| ------------------------------- | ----------- | ----------------- | ----------------------------------------------- |
| `packages/server/src/index.ts`  | 428~450     | 源码              | 手写的 CORS 回调函数                            |
| `packages/server/dist/index.js` | 3686~3700   | ❌                | tsup 编译，但 Electron 运行时不用（被内联覆盖） |
| `packages/desktop/dist/main.js` | 13415~13434 | **✅ 运行时生效** | tsup noExternal 内联后的 CORS 代码              |

### 4.2 修改 CORS 需要做什么？

| 操作                                             | 必需?       | 原因                                  |
| ------------------------------------------------ | ----------- | ------------------------------------- |
| 1. 修改 `server/src/index.ts` CORS 代码          | ✅          | 这是源码，唯一真理源                  |
| 2. `pnpm --filter @easyagent/server build`       | ⚠️ 可选     | 更新 server/dist/index.js（CI测试用） |
| 3. `pnpm --filter @easyagent/desktop build:main` | **✅ 必须** | 重新内联 server 代码到 main.js        |
| 4. `build.bat` (electron-builder --dir)          | **✅ 必须** | 重新打包 asar                         |
| 5. `release-publish.bat` (如果发布)              | ✅          | 生成 NSIS 安装包                      |

**一句话**：改 server 的 CORS → **必须重编译 desktop main.js**（因为 server 代码是内联进去的）。

---

## 5. 版本与时间戳对照表 (v0.5.4 构建实例)

| 版本标签 | Git Commit | 提交时间         | 关键事件            |
| -------- | ---------- | ---------------- | ------------------- |
| v0.5.3   | `ae54e55`  | 2026-06-26 00:11 | 上一版本 (工作正常) |
| v0.5.4   | `d5cf8d1`  | 2026-06-26 00:40 | 当前版本标签        |

### v0.5.4 构建时间线 (2026-06-26)

| 时间     | 产物                          | 大小      | 工具                   | 说明                             |
| -------- | ----------------------------- | --------- | ---------------------- | -------------------------------- |
| 01:27    | `EasyAgent-0.5.4-win-x64.exe` | 95.75 MB  | electron-builder dist  | 原始 NSIS 安装包 (含旧代码)      |
| 02:23    | `server/dist/index.js`        | 610 KB    | tsup                   | server 重编译 (CORS 修复后)      |
| 02:38    | (better-sqlite3 编译)         | -         | node-gyp               | 原生模块编译                     |
| 02:49:43 | `desktop/dist/main.js`        | 1.14 MB   | tsup                   | **desktop 重编译 (内联新 CORS)** |
| 02:49:43 | `desktop/dist/preload.js`     | ~0 KB     | tsup                   | preload 脚本                     |
| 02:49:50 | `release/win-unpacked/`       | -         | electron-builder --dir | 解包目录                         |
| 02:49:55 | `app.asar`                    | 100.40 MB | electron-builder       | **asar 打包 (含新 main.js)**     |
| 02:49:56 | `EasyAgent.exe` (unpacked)    | 168.92 MB | electron-builder       | 便携版 EXE                       |

**注意**：`EasyAgent-0.5.4-win-x64.exe` (NSIS 安装包, 95.75 MB) 是 01:27 生成的，**早于** 所有 CORS/竞态修复。如果要发布正式版，需要重新运行 `build.bat --release`。

---

## 6. 修改 → 生效路径图

```
┌──────────────────────────────────────────────────────────────────┐
│                    你在 IDE 中修改源码                               │
└────────┬─────────────────────────┬──────────────────┬────────────┘
         │                         │                  │
    ┌────▼────┐               ┌────▼────┐       ┌─────▼──────┐
    │ Server  │               │Desktop  │       │ Frontend   │
    │ src/    │               │ src/    │       │ src/       │
    │index.ts │               │main.ts  │       │ config.tsx │
    └────┬────┘               └────┬────┘       └─────┬──────┘
         │                         │                  │
    ┌────▼──────────┐        ┌─────▼──────────┐  ┌───▼────────────┐
    │ tsup server   │        │ tsup desktop   │  │ Vite build     │
    │ ↓             │        │ ↓              │  │ ↓              │
    │ dist/index.js │        │ dist/main.js   │  │ dist/renderer/ │
    │ (610 KB)      │        │ (1.14 MB)      │  │                │
    │               │        │                │  │                │
    │ ⚠️ 此时还未    │        │ ⚠️ 此时内联了   │  │ ⚠️ 前端已构建   │
    │   进入 asar    │        │   server 代码   │  │   进入 dist/   │
    └────┬───────────┘        └─────┬──────────┘  └───┬────────────┘
         │                          │                  │
         │              ┌───────────▼──────────────────▼──┐
         │              │  electron-builder --dir         │
         │              │  ↓                              │
         │              │  release/win-unpacked/          │
         │              │    resources/app.asar (100 MB)  │
         │              │      ├── dist/main.js    ← 含 CORS │
         │              │      ├── dist/renderer/  ← 含 config│
         │              │      ├── node_modules/cors/       │
         │              │      └── node_modules/express/    │
         └──────────────┤                                  │
           (不进入 asar) │                                  │
                        └──────────────────────────────────┘
                                    │
                          ┌─────────▼────────────┐
                          │ electron-builder dist │
                          │ ↓                     │
                          │ EasyAgent-*.exe       │
                          │ (NSIS 安装包)          │
                          └───────────────────────┘
```

### 各路径修改后的生效条件

| 修改了哪个文件                   | 最少执行什么命令                                     | 生效位置               |
| -------------------------------- | ---------------------------------------------------- | ---------------------- |
| `server/src/index.ts` (CORS)     | `pnpm --filter desktop build:main` + `build.bat`     | asar 内 main.js        |
| `desktop/src/main.ts` (主进程)   | `pnpm --filter desktop build:main` + `build.bat`     | asar 内 main.js        |
| `frontend/src/config.tsx` (前端) | `pnpm --filter desktop build:renderer` + `build.bat` | asar 内 dist/renderer/ |
| `frontend/src/request.ts` (API)  | `pnpm --filter desktop build:renderer` + `build.bat` | asar 内 dist/renderer/ |

**最简单的全量重编命令**：

```batch
cd packages/desktop
npx tsup --clean           # 重编 main.js + preload.js
npx vite build             # 重编前端
cd ../..
build.bat                  # 重新打包 asar + EXE
```

---

## 7. tsup noExternal 内联机制详解

### 7.1 为什么需要 noExternal？

```
问题：
pnpm workspace 使用 symlink 链接 @easyagent/server
electron-builder 打包 asar 时 symlink 会断裂
→ 运行时找不到 @easyagent/server 模块

方案对比：
┌──────────────────────┬──────────────────────────────────┐
│ 方案 A: 复制文件     │ electron-builder 配置             │
│                      │ node_modules 扁平化               │
│                      │ → 包体积大，有版本冲突风险          │
├──────────────────────┼──────────────────────────────────┤
│ 方案 B: noExternal   │ tsup 将源码直接打入 main.js        │
│ (当前采用)           │ → 无 symlink 问题                 │
│                      │ → 包体积小 (复用 treeshake)        │
│                      │ → ⚠️ 但修改 server 后必须重编 desktop│
└──────────────────────┴──────────────────────────────────┘
```

### 7.2 noExternal vs external 决策表

| 包                  | 分类                  | 原因                                        |
| ------------------- | --------------------- | ------------------------------------------- |
| `@easyagent/server` | **noExternal** (内联) | pnpm symlink 在 asar 中会断                 |
| `@easyagent/core`   | **noExternal** (内联) | 同上                                        |
| `electron`          | external              | Electron 运行时自动提供                     |
| `better-sqlite3`    | external              | 原生模块，不可 bundle                       |
| `pino`              | external              | 内部 CJS require，ESM bundle 会炸           |
| `cors`              | external              | npm 包，asar 内 node_modules 可正常 require |
| `express`           | external              | npm 包，同上                                |
| `ws`                | external              | npm 包，同上                                |
| `multer`            | external              | npm 包，同上                                |

### 7.3 dynamic import 在 noExternal 下的行为

```typescript
// desktop/src/main.ts line ~50
const { createApp } = await import('@easyagent/server');
```

```
tsup 编译后 (desktop/dist/main.js line 18648):

  const { createApp: createApp2 } = await Promise.resolve()
    .then(() => (init_dist2(), dist_exports));

  其中 init_dist2 (line 15197) 是 tsup 生成的 chunk 加载器：

  var init_dist2 = __esm({
    "../server/dist/index.js"() {
      // ... 整个 server/dist/index.js 的内容
    }
  });
```

**关键点**：

- `import('@easyagent/server')` 是动态导入，但 tsup 仍然将其**内联**（因为 noExternal）
- 代码变成了 `init_dist2()` 调用，避免了运行时的模块解析
- 这意味着 `packages/server/dist/index.js` 在构建时必须存在且是最新的

---

## 8. asar 包内部结构图 (实测)

```
app.asar (100.40 MB)
│
├── /package.json                    ← desktop package.json
│
├── /dist/
│   ├── main.js          (1.14 MB)   ← ⚠️ 内联了 server+core CORS 代码
│   ├── main.js.map      (1.68 MB)
│   ├── preload.js       (~0 KB)
│   ├── preload.js.map   (0.01 MB)
│   └── renderer/
│       ├── index.html
│       └── assets/
│           ├── index-BBA_WhUs.js    ← ⚠️ 内联了 config.tsx/request.ts
│           ├── index-BBA_WhUs.js.map
│           └── index-CEh7i41C.css
│
├── /node_modules/
│   ├── @easyagent/
│   │   └── core/         ← ⚠️ 冗余副本 (代码已内联至 main.js)
│   │       ├── dist/index.js
│   │       └── src/...
│   │   └── server/       ← ❌ 不存在 (100% 内联)
│   │
│   ├── cors/             ← ✅ 运行时从此处加载
│   ├── express/          ← ✅ 运行时从此处加载
│   ├── ws/               ← ✅ 运行时从此处加载
│   ├── multer/           ← ✅ 运行时从此处加载
│   ├── react/            ← (renderer 用)
│   ├── react-dom/        ← (renderer 用)
│   └── ...约 500+ 个 npm 包
│
└── /assets/
    ├── icon.ico
    ├── icon.png
    └── ...

app.asar.unpacked/  ← asarUnpack 配置的原生模块
├── node_modules/better-sqlite3/
├── node_modules/bindings/
├── node_modules/file-uri-to-path/
└── node_modules/electron-updater/
```

---

## 9. 常见修改场景速查

### 场景 A：修改后端 CORS 配置

```batch
# 1. 编辑 packages/server/src/index.ts
# 2. 重新编译 desktop (会自动内联新 server 代码)
cd packages/desktop
npx tsup          # 重编 main.js
# 3. 重新打包
cd ../..
build.bat         # electron-builder --dir
```

**不需要**：单独编译 server (`pnpm --filter server build`)，因为 desktop tsup 会直接读取 server 源码并内联。

### 场景 B：修改前端页面 (config.tsx / Dashboard)

```batch
# 1. 编辑 packages/frontend/src/*.tsx
# 2. 重新构建前端
cd packages/desktop
npx vite build    # 输出到 dist/renderer/
# 3. 重新打包
cd ../..
build.bat
```

### 场景 C：修改 Electron 主进程 (main.ts)

```batch
# 1. 编辑 packages/desktop/src/main.ts
# 2. 重新编译
cd packages/desktop
npx tsup          # 重编 main.js
# 3. 重新打包
cd ../..
build.bat
```

### 场景 D：全量干净构建 (发布前必做)

```batch
# 停止所有进程
taskkill /f /im EasyAgent.exe 2>nul
taskkill /f /im electron.exe 2>nul

# 清理旧产物
rmdir /s /q packages\desktop\dist 2>nul
rmdir /s /q packages\desktop\release 2>nul

# 按顺序重编
pnpm --filter @easyagent/core build
pnpm --filter @easyagent/server build
cd packages/desktop
npx tsup          # main.js + preload.js
npx vite build    # 前端
cd ../..
build.bat --release  # NSIS 安装包
```

### 场景 E：快速验证 (不用重新打包 asar)

```batch
cd packages/desktop
npx tsup          # 重编 main.js
npx electron dist/main.js --dev  # 直接用 electron 运行
```

跳过 electron-builder 打包，直接验证代码正确性。

---

## 10. 常见陷阱与对照

| 陷阱                                              | 错误认知        | 正确理解                                                 |
| ------------------------------------------------- | --------------- | -------------------------------------------------------- |
| "改完 server/index.ts → pnpm build server 就够了" | ❌              | server 代码被 inline 到 main.js，必须重编 desktop        |
| "改完 config.tsx → pnpm build frontend 就够了"    | ❌              | frontend build 输出到 desktop/dist/renderer，需重做 asar |
| "app.asar 里有 @easyagent/server 目录"            | ❌              | **不在** asar 中，100% 内联到 main.js                    |
| "app.asar 里有 @easyagent/core 目录"              | ✅ 有，但是冗余 | 代码已内联进 main.js，asar 中的副本不使用                |
| "CORS 修改后 main.js 会自动更新"                  | ❌              | 必须手动运行 tsup 重编译                                 |
| "build.bat 会自动 tsup"                           | ❌ (旧版)     | build.bat 现在通过 `build-shared.bat` 自动编译 core+server+desktop，但不会编译 cli/web/frontend |

---

## 11. 文件大小汇总

| 文件                          | 大小            | 说明                 |
| ----------------------------- | --------------- | -------------------- |
| `server/dist/index.js`        | 610 KB (0.6 MB) | 独立 server 编译产物 |
| `desktop/dist/main.js`        | 1.14 MB         | 含内联 server + core |
| `desktop/dist/main.js.map`    | 1.68 MB         | Source map           |
| `app.asar`                    | 100.40 MB       | 整个应用的 asar 包   |
| `EasyAgent.exe` (unpacked)    | 168.92 MB       | 解包目录中的便携 EXE |
| `EasyAgent-0.5.4-win-x64.exe` | 95.75 MB        | NSIS 安装包          |

---

## 12. 总结：为什么这个构建链路让人觉得"复杂"？

```
复杂感来源 = 3 层间接性

第 1 层：编译产物不是最终产物
    tsup 输出 → 还要被 electron-builder 打包 → asar
    中间产物 (dist/) ≠ 运行时代码 (app.asar)

第 2 层：代码内联隐藏了依赖关系
    main.js 内包含 server 代码 → 看不出边界
    修改 A → 必须重编 B → 但编辑器不提示

第 3 层：多个构建工具链串联
    tsup (node) → Vite (browser) → electron-builder (desktop)
    各自有各自的配置文件和输出目录
    一个步骤出错 → 整个链路断裂 → 难以定位
```

**解药**：记住 **"改什么，重编什么，重打包什么"** 的三问原则，对照本文的速查表执行。
