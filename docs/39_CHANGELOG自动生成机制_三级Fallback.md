# CHANGELOG 自动生成机制：三级 Fallback 保障方案

> 版本: v1.0 | 日期: 2026-06-27 | 作者: ht182400-creator

## 目录

- [1. 问题背景](#1-问题背景)
- [2. 修改概览](#2-修改概览)
- [3. 三级 Fallback 生成链路](#3-三级-fallback-生成链路)
  - [3.1 一级：git log 自动提取](#31-一级git-log-自动提取)
  - [3.2 二级：Memory 记录回退](#32-二级memory-记录回退)
  - [3.3 三级：兜底占位](#33-三级兜底占位)
- [4. 后端 API 提取逻辑](#4-后端-api-提取逻辑)
- [5. 前端显示机制](#5-前端显示机制)
- [6. Git Commit Message 增强](#6-git-commit-message-增强)
- [7. 独立脚本使用](#7-独立脚本使用)
- [8. 触发入口](#8-触发入口)
- [9. 完整数据流图](#9-完整数据流图)

---

## 1. 问题背景

v0.6.1 发布后，Settings 页面的"更新日志"区域出现两个问题：

| #   | 现象                                                     | 根因                                                    |
| --- | -------------------------------------------------------- | ------------------------------------------------------- |
| 1   | 页面显示 `🔧 v0.5.29 — 修复 CSP 字体加载...` 硬编码文本  | `Settings.tsx:516` 硬编码了旧版变更，无论版本如何都显示 |
| 2   | v0.6.0 和 v0.6.1 的 CHANGELOG 条目为空（只有标题无内容） | `release.mjs` 在 git log 为空时不生成内容               |
| 3   | `/api/version` 取前 2 个条目都是空的，`<pre>` 区域无内容 | 服务器未跳过空条目                                      |

### 核心根因

`release.mjs` 的执行顺序导致时序错位：

```
release.mjs 运行流程:
  Step 1: git log v0.5.32..HEAD   ← 此时改动还在工作区未 commit → 返回空！
  Step 2: 生成 CHANGELOG 条目     ← 空数组 → 兜底条件未命中 → 只生成空标题
  Step 3: git add .               ← 之后才把改动加入暂存区
  Step 4: git commit              ← 之后才提交
```

---

## 2. 修改概览

| 文件                                           | 改动内容                       | 作用          |
| ---------------------------------------------- | ------------------------------ | ------------- |
| `packages/frontend/src/pages/Settings.tsx:516` | 🔴 移除硬编码 v0.5.29 文本     | 修复显示      |
| `packages/server/src/index.ts:500-511`         | 🟡 提取逻辑跳过空条目          | 修复 API      |
| `scripts/release.mjs:94-167`                   | 🟢 新增 `extractFromMemory()`  | 二级 fallback |
| `scripts/release.mjs:130-136`                  | 🟢 空条目最终兜底              | 三级 fallback |
| `scripts/release.mjs:220-248`                  | 🟢 commit message 嵌入变更摘要 | 增强 commit   |
| `scripts/changelog-from-memory.mjs`            | 🆕 独立脚本                    | 手动工具      |

---

## 3. 三级 Fallback 生成链路

`release.mjs` 的 `generateChangelogEntry(version)` 函数按以下优先级尝试获取变更内容：

```
getChangelogEntry(version)
  │
  ├─ ① git log <last_tag>..HEAD
  │     └→ 有提交 → 自动分类 Added/Fixed/Changed → ✅ 完成
  │     └→ 无提交 →
  │
  ├─ ② extractFromMemory(version)
  │     │  读取 .codebuddy/memory/ 下 tag 日期~今天的 .md 文件
  │     │  解析 `## 标题 (HH:MM)` + `**字段**: 值` 结构化条目
  │     │  跳过未 ✅ 的条目
  │     │  按标题关键词自动分类
  │     │
  │     └→ 有记录 → ✅ 完成
  │     └→ 无记录 →
  │
  └─ ③ 兜底占位
        └→ "### Changed\n- 新版本发布\n"
```

### 3.1 一级：git log 自动提取

```js
// scripts/release.mjs:170-189
function generateChangelogEntry(version) {
  // 获取上一个 tag
  const since = execSync('git describe --tags --abbrev=0');

  // 取出期间的 commit，格式: "- 提交信息 (作者)"
  const commits = execSync(
    `git log ${since}..HEAD --pretty=format:"- %s (%an)"`
  );

  // 按关键词自动分类
  for (const line of commits) {
    if (/add|feat/i.test(line))    → Added
    if (/fix|bug/i.test(line))     → Fixed
    if (/change|refactor/i.test(line)) → Changed
    else                            → other
  }
  // 拼接成 Keep a Changelog 格式
}
```

**示例输出：**

```
## [0.6.2] - 2026-06-27

### Added
- feat: 双通道发布支持 (ht182400-creator)

### Fixed
- fix: updater 状态未清除 (ht182400-creator)
```

### 3.2 二级：Memory 记录回退

当 git log 为空时（改动尚未 commit），自动从 `.codebuddy/memory/` 结构化记录中提取。

#### 解析规则

| 步骤         | 逻辑                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| 确定日期范围 | 从上个 release tag 的日期 → 今天；无 tag 则取 7 天前                      |
| 读取文件     | 筛选 `YYYY-MM-DD.md` 格式的文件                                           |
| 解析条目     | 按 `## 标题 (HH:MM)` 分割，提取结构化字段                                 |
| 跳过未完成   | `**状态**: ...` 不含 `✅` 的条目被排除                                    |
| 提取描述     | 优先级：`**问题**` > `**背景**` > `**需求**` > `**产物**` > 标题          |
| 自动分类     | `fix/修复` → Fixed；`feat/新增` → Added；`移除` → Removed；默认 → Changed |

#### Memory 记录格式要求

```markdown
## 修复标题 (10:30)

- **问题**: 具体的问题描述
- **根因**: 原因分析
- **修复**: 修改了什么
- **状态**: ✅ resolved
```

### 3.3 三级：兜底占位

```js
// scripts/release.mjs:130-136
if (!added.length && !changed.length && !fixed.length && !other.length) {
  entry += `\n### Changed\n- 新版本发布\n`;
}
```

---

## 4. 后端 API 提取逻辑

`/api/version` 端点从 CHANGELOG.md 提取最近 2 个版本展示给前端。

```ts
// packages/server/src/index.ts:499-512
const sections = raw.split(/^## \[/m);
const meaningful: string[] = [];

for (let i = 1; i < sections.length; i++) {
  const entry = '## [' + sections[i];
  // 判断是否有实质内容：至少包含一个 ### 分类标题
  const hasContent = /^###\s/m.test(sections[i]);
  if (hasContent) {
    meaningful.push(entry);
    if (meaningful.length >= 2) break;
  }
}
changelog = meaningful.join('\n').trim();
```

**改进点：** 原来直接用 `sections.slice(1, 3)` 取前两个条目，现在改为向后遍历跳过空条目，直到找到 2 个有实质内容的版本。

---

## 5. 前端显示机制

```tsx
// packages/frontend/src/pages/Settings.tsx:645-652
{
  versionInfo?.changelog && (
    <div className="mt-2">
      <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
        更新日志
      </h4>
      <pre
        className="text-xs text-gray-500 whitespace-pre-wrap font-mono 
                   leading-relaxed max-h-80 overflow-y-auto 
                   bg-black/20 rounded-lg p-3"
      >
        {versionInfo.changelog}
      </pre>
    </div>
  );
}
```

### 显示特性

| 样式                  | 效果                                          |
| --------------------- | --------------------------------------------- |
| `max-h-80`            | 最大高度 20rem（约 320px，18-20 行）          |
| `overflow-y-auto`     | 超出时显示垂直滚动条，不会无限扩展撑破页面    |
| `whitespace-pre-wrap` | 保留 CHANGELOG 的换行和缩进，超出行宽自动换行 |
| `font-mono`           | 等宽字体，便于阅读格式化的 changelog          |

---

## 6. Git Commit Message 增强

`release.mjs` 的 commit 不再是单行 `release: v0.x.x`，而是嵌入 CHANGELOG 内容：

```js
// scripts/release.mjs:220-248 (main 函数)
const changelogSummary = changelogEntry
  .replace(/^## \[.*\] - .*\n/gm, '') // 去掉标题行
  .replace(/^###\s/gm, '') // 保留分类名但去 ### 前缀
  .trim();

const commitMsg = `release: v${targetVersion}\n\n${changelogSummary}`;

execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
```

### 效果对比

|                | 之前              | 之后                                                                                                    |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| commit message | `release: v0.6.6` | `release: v0.6.6`<br><br>`Added`<br>`- feat: 双通道发布`<br><br>`Fixed`<br>`- fix: Settings 硬编码文本` |
| 空 git log 时  | 完全空白          | `Changed`<br>`- 新版本发布`（兜底）                                                                     |
| 有关键变更时   | 丢失信息          | 完整嵌入 commit body                                                                                    |

---

## 7. 独立脚本使用

`scripts/changelog-from-memory.mjs` 可脱离 release 流程单独运行。

### 用法

```bash
# 方式 1：指定版本号，自动从上个 tag 日期取 memory
node scripts/changelog-from-memory.mjs 0.6.2

# 方式 2：指定起始日期
node scripts/changelog-from-memory.mjs --since 2026-06-25

# 方式 3：交互模式（无参数）
node scripts/changelog-from-memory.mjs
# → 输入起始日期 → 输入版本号 → 预览 → 确认写入
```

### 运行流程

```
读取 .codebuddy/memory/ 下期间内文件
  → 解析结构化条目
  → 按分类统计并预览
  → 用户确认 [y/N]
  → 自动移除已存在的同版本空标题
  → 写入 CHANGELOG.md 顶部
```

---

## 8. 触发入口

所有发布途径最终都调用 `release.mjs`，三级 fallback 全部生效：

| 入口                                | 调用方式                                  | 说明               |
| ----------------------------------- | ----------------------------------------- | ------------------ |
| `release-publish.bat`               | `node scripts/release.mjs %RELEASE_TYPE%` | 本地构建发布       |
| `release-server.bat`                | `node scripts/release.mjs !NEW_VERSION!`  | 服务器端发布       |
| `scripts/changelog-from-memory.mjs` | 直接执行                                  | 手动补填 CHANGELOG |

---

## 9. 完整数据流图

```
用户执行 release-publish.bat / release-server.bat
    │
    ▼
release.mjs ── generateChangelogEntry(version)
    │
    ├─ ① git log <last_tag>..HEAD  ← 尝试取 git commit
    │     │
    │     ├─ 有提交 ──→ 自动分类 ──→ ✅ CHANGELOG 条目
    │     │                         └─→ commit message 含变更摘要
    │     │
    │     └─ 无提交 ──→ ② 回退
    │
    ├─ ② extractFromMemory(version)
    │     │
    │     │  读取 .codebuddy/memory/2026-06-27.md 等
    │     │  解析: ## 标题 (HH:MM) → **问题**/**状态** → 分类
    │     │
    │     ├─ 有记录 ──→ ✅ CHANGELOG 条目（从工作日志自动生成）
    │     │
    │     └─ 无记录 ──→ ③ 兜底
    │
    └─ ③ 兜底: "### Changed\n- 新版本发布\n"

                   ┌─────────────────────────────────┐
                   │  CHANGELOG.md 写入完成           │
                   │  git commit 含完整变更摘要        │
                   │  git tag / GitHub Release 创建    │
                   └─────────────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │  用户打开 EasyAgent        │
              │  Settings → 关于 → 更新日志 │
              └──────────────────────────┘
                            │
                            ▼
              GET /api/version
                            │
              从 CHANGELOG.md 取最近 2 个
              "有实质内容" 的版本条目
              （跳过只有标题的空条目）
                            │
                            ▼
              <pre className="max-h-80 overflow-y-auto">
              显示 changelog，超出滚动
```

---

## 相关文件索引

| 文件                                       | 说明                                    |
| ------------------------------------------ | --------------------------------------- |
| `scripts/release.mjs`                      | 发布主脚本，含三级 fallback             |
| `scripts/changelog-from-memory.mjs`        | 从 Memory 生成 CHANGELOG 的独立工具     |
| `packages/server/src/index.ts`             | `/api/version` 端点，changelog 提取逻辑 |
| `packages/frontend/src/pages/Settings.tsx` | Settings 页面，changelog 显示组件       |
| `CHANGELOG.md`                             | 变更日志文件                            |
| `.codebuddy/memory/YYYY-MM-DD.md`          | Memory 工作日志，二级 fallback 数据源   |
| `release-publish.bat`                      | 本地发布入口                            |
| `release-server.bat`                       | 服务器发布入口                          |
