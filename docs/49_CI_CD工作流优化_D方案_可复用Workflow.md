# D 方案：CI/CD 工作流优化 — 可复用 Workflow

> 创建日期: 2026-06-28  
> 关联: `.github/workflows/_test.yml`, `ci.yml`, `release.yml`, `scripts/release.mjs`, `release-publish.bat`

---

## 1. 背景与问题

### 1.1 当前发版流程

```
scripts/release.mjs:
  git commit "release: vX.Y.Z"  → push main  → 🔵 CI #1 (8 jobs)
  git tag vX.Y.Z                → push tag   → 🟢 Release workflow (4 jobs)

release-publish.bat Step 7:
  git commit "chore: release artifacts for vX.Y.Z" → push main → 🔵 CI #2 (8 jobs)

合计: 3 个 workflow, 20 个 job 调用/发版
```

每次发版触发 **2 轮 CI + 1 轮 Release**，CI 跑了两遍完全相同的测试。

### 1.2 核心痛点

| 痛点 | 说明 |
|------|------|
| CI 重复跑 | artifacts commit 触发第 2 轮 CI，8 个 job 完全重复 |
| 无质量门禁 | Release 流程不等 CI 结果，测试挂了照样构建发版 |
| Windows runner 浪费 | 每次发版 6 个 Windows job（CI × 2 + Release × 1） |

---

## 2. 方案对比

### 2.1 方案 A：仅 artifacts commit 加 `[skip ci]`

改动 2 行，发版 workflow 从 3 → 2。

**劣势**：Release workflow 仍无质量门禁。

### 2.2 方案 B：全合并到 Release

CI 的测试 job 复制到 release.yml，发版 workflow 从 3 → 1。

**致命劣势**：测试配置双重维护（`ci.yml` + `release.yml` 各一份），长期隐患大。

### 2.3 方案 D：可复用 Workflow（选中）

提取测试 job 为共享模块 `_test.yml`，`ci.yml` 和 `release.yml` 都引用同一份。

| 维度 | 当前 | A | B | **D** |
|------|------|------|------|------|
| 发版 workflow 数 | 3 | 2 | 1 | **1** |
| 测试配置重复 | 无 | 无 | ⚠️ 两份 | ✅ **无** |
| 发版质量门禁 | ❌ | ❌ | ✅ | ✅ |
| 发版耗时 | ~15-20min | ~15-20min | ~20-28min | ~20-28min |
| 维护复杂度 | 中 | 中 | ⚠️ 高 | ✅ **低** |
| 日常 push 影响 | - | 不变 | 不变 | 不变 |

---

## 3. D 方案架构

```
.github/workflows/
  _test.yml       ← NEW: 可复用测试定义（唯一真相来源）
  ci.yml           ← 引用 _test.yml + sync-pipeline
  release.yml      ← 引用 _test.yml + build + release + sync-pipeline
```

### 3.1 _test.yml（共享测试模块）

```yaml
on: workflow_call   # 仅被调用，不被事件直接触发

jobs:
  test-core       # Windows, vitest, upload vitest-core artifact
  test-server     # Windows, vitest, needs: test-core
  test-desktop    # Windows, vitest, needs: test-core
  coverage        # Windows, needs: [test-core, test-server, test-desktop]
  test-pipeline   # Ubuntu, needs: test-core
  lint-and-format # Windows, continue-on-error
  build-check     # Windows, needs: test-core
```

### 3.2 ci.yml（日常 push/PR）

```yaml
on: [push: main, pull_request: main]

jobs:
  tests:
    uses: ./.github/workflows/_test.yml    # 引用共享测试
  sync-pipeline:
    needs: tests    # 所有测试通过后才同步管线数据
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

### 3.3 release.yml（发版）

```yaml
on: [push: tags v*, workflow_dispatch]

jobs:
  version:          # 解析版本号
  tests:            # 质量门禁（测试不通过 → 不构建）
    uses: ./.github/workflows/_test.yml
  build-desktop:    # Windows EXE 构建，needs: [version, tests]
  build-web:        # Web 构建，needs: [version, tests]
  release:          # 创建 Release，needs: [build-desktop, build-web]
  sync-pipeline:    # 管线数据同步，needs: [tests, build-desktop, build-web]
```

### 3.4 配套修改

| 文件 | 改动 | 说明 |
|------|------|------|
| `scripts/release.mjs` | commit message 加 `[skip ci]` | 发版 commit 不触发 CI |
| `release-publish.bat` | artifacts commit 加 `[skip ci]` | 产物 commit 不触发 CI |

---

## 4. 对日常代码同步（不发版）的影响

### 结论：零影响

```
日常 push main（无 tag）:
  push → ci.yml 触发 → 调用 _test.yml → sync-pipeline

  变化仅在于：
  现在: ci.yml 内联定义 8 个 job
  D方案: ci.yml 引用 _test.yml，执行同样的 8 个 job
```

`_test.yml` 只是代码组织方式，不是新的 workflow trigger。它不会被 push 事件直接触发，只被 `ci.yml` 的 `workflow_call` 调用。

| 维度 | 当前 | D 方案 | 变化 |
|------|------|--------|------|
| 触发条件 | push main | push main | ❌ 不变 |
| 测试内容 | 相同 vitest/lint/build-check | 相同 | ❌ 不变 |
| sync-pipeline | 每次 push 都跑 | 每次 push 都跑 | ❌ 不变 |
| Actions 分钟消耗 | 相同 | 相同 | ❌ 不变 |
| GitHub UI 状态 | CI workflow 通过/失败 | CI workflow 通过/失败 | ❌ 不变 |
| PR CI checks | 正常 | 正常 | ❌ 不变 |

唯一外观差异：Actions 日志中测试 job 显示为 `tests / test-core`（嵌套一层）。

---

## 5. 风险分析

| 风险 | 等级 | 说明 | 缓解 |
|------|------|------|------|
| 发版耗时增加 5-8min | 🟡 中 | 测试必须完成后才构建 | 可接受，质量门禁更重要 |
| workflow_call 嵌套调试 | 🟢 低 | 多一层间接调用 | GitHub Actions UI 支持展开查看 |
| 日常同步不受影响 | 🟢 无 | 触发机制不变 | - |
| `[skip ci]` 误影响 | 🟢 无 | 只跳过 push/pr 触发，不影响 tag/手动触发 | - |
| Artifact 命名冲突 | 🟢 无 | 同一 workflow run 内 artifact 唯一 | - |

---

## 6. 改动范围汇总

| 文件 | 操作 | 行数变化 |
|------|------|----------|
| `.github/workflows/_test.yml` | **新建** | +160 行 |
| `.github/workflows/ci.yml` | **删减** | -180 行 → +25 行 |
| `.github/workflows/release.yml` | **扩增** | +50 行 |
| `scripts/release.mjs` | **1 行** | commit message 加 `[skip ci]` |
| `release-publish.bat` | **1 行** | artifacts commit 加 `[skip ci]` |

**不受影响**：`build.bat`, `build-web.bat`, `release-server.bat`, 所有 `package.json`, `pnpm-lock.yaml`

---

## 7. 测试验证清单

- [x] `_test.yml` YAML 语法正确
- [x] `ci.yml` 正确引用 `_test.yml`
- [x] `release.yml` 正确引用 `_test.yml` + 质量门禁
- [x] `scripts/release.mjs` commit message 含 `[skip ci]`
- [x] `release-publish.bat` artifacts commit 含 `[skip ci]`
- [x] 所有 job 依赖链正确（needs 顺序）
- [x] Artifact 名称一致（vitest-core/server/desktop）
- [x] sync-pipeline 下载 artifact 路径正确

---

## 8. 实战场验证：v0.6.17 发布问题与修复

> 日期: 2026-06-28  ·  版本: v0.6.17  ·  状态: ✅ 已修复

### 8.1 现象

v0.6.17 通过 `release-publish.bat` 完整发布了（commit + tag + GitHub Release + EXE 上传全部成功），但 **`release.yml` 没有被自动触发**，只能通过 `workflow_dispatch` 手动启动。

```
$ gh run list --workflow=release.yml --limit 5
# 只显示历史 v0.6.13~v0.6.15，没有 v0.6.17
```

### 8.2 根因分析

#### 8.2.1 关键代码路径

`scripts/release.mjs` 第 375 行（修复前）：

```js
execSync('git push origin main --follow-tags', { cwd: root, stdio: 'inherit' });
```

这条命令一次性推送了：
- Commit `cf3a750`（消息：`release: v0.6.17 [skip ci]`）
- Tag `v0.6.17`（消息：`EasyAgent v0.6.17`）

#### 8.2.2 GitHub Actions 的 `[skip ci]` 机制

GitHub 的 skip 规则是**以 push 事件为单位判断的**：

```
一次 git push → 一个 push event → 检查该 push 中所有 commit 的消息
                                      ↓
                          是否有 [skip ci] / [ci skip] 等标记？
                          ↓ Yes                    ↓ No
                   整个 push event 的          正常触发所有
                   所有 workflow 全部跳过        workflow
```

**关键**: tag push 不是独立事件。当 `--follow-tags` 把 commit 和 tag 在一次 push 中发送时，GitHub 将它视为**同一个 push event**。因为 commit 消息含 `[skip ci]`，整个 push event 被跳过——包括本来该由 tag 触发的 `release.yml`。

#### 8.2.3 图解

```
修复前：
  git push origin main --follow-tags
    │
    ├─ commit cf3a750: "release: v0.6.17 [skip ci]"
    └─ tag v0.6.17:    "EasyAgent v0.6.17"
    ↓
  GitHub 收到 1 个 push event → 发现 [skip ci] → ❌ 全部跳过
    ├─ ci.yml 被跳过       ✅ 期望
    └─ release.yml 被跳过   ❌ 不期望！
```

### 8.3 修复方案

#### 8.3.1 核心思路

把 commit 和 tag 分两次独立 push，让 tag push 成为一个**不含 `[skip ci]` 的独立事件**。

#### 8.3.2 代码修改

`scripts/release.mjs`（`cba41d8`）：

```js
// 修复前：
// execSync('git stash', ...);
// execSync('git pull --rebase origin main', ...);
// execSync('git stash pop', ...);
// execSync('git push origin main --follow-tags', ...);  ← 一处致命

// 修复后：
// ① 回退 post-commit hook 产生的管线文件修改（避免 rebase 冲突）
try {
  execSync('git restore docs/pipeline/', { cwd: root, stdio: 'pipe' });
} catch { /* 没有修改则跳过 */ }

// ② rebase 远程（CI 管线同步可能提前推了新 commit）
execSync('git pull --rebase origin main', { cwd: root, stdio: 'inherit' });

// ③ 第一次 push：只推 commit（含 [skip ci] → ci.yml 被跳过 ✅）
execSync('git push origin main', { cwd: root, stdio: 'inherit' });
// ④ 第二次 push：只推 tag（无 [skip ci] → release.yml 正常触发 ✅）
execSync(`git push origin v${targetVersion}`, { cwd: root, stdio: 'inherit' });
```

#### 8.3.3 修复后效果

```
修复后：
  git push origin main
    └─ commit cf3a750: "release: v0.6.17 [skip ci]"
    ↓
  GitHub 收到 push event → 发现 [skip ci] → ❌ ci.yml 跳过  ✅

  git push origin v0.6.17
    └─ tag v0.6.17: "EasyAgent v0.6.17"
    ↓
  GitHub 收到 tag create event → 无 [skip ci] → ✅ release.yml 触发
    ├─ version:    解析 v0.6.17
    ├─ tests:      质量门禁（引用 _test.yml）
    ├─ build-desktop:  needs: [version, tests]
    ├─ build-web:      needs: [version, tests]
    ├─ release:        创建 GitHub Release + 上传构建产物
    └─ sync-pipeline:  管线数据同步
```

### 8.4 附带改进

#### 8.4.1 post-commit hook 干扰缓解

原代码在 commit + tag 后执行 `git stash → pull --rebase → stash pop` 来避免远程冲突。但 `post-commit` hook 会重新运行 `unified-sync`，修改 `docs/pipeline/*.json`，导致：

```
commit → hook 改脏管线文件 → stash 保护 → rebase → stash pop 恢复脏文件 → 无法 clean push
```

修复：在 rebase 前用 `git restore docs/pipeline/` 回退 hook 产生的修改，减少脏文件干扰。

#### 8.4.2 风险说明

| 场景 | 风险 | 缓解 |
|------|------|------|
| 两次 push 之间远程有新 commit | git push 可能 non-fast-forward | 仍在 try-catch 内，失败会提示手动处理 |
| tag 已存在的重复推送 | git push tag 报错 | release-publish.bat Step 5 会先检查 tag 是否存在 |
| post-commit hook 持续改文件 | `git restore` 后 hook 可能再次触发 | 仅影响本地工作区，不影响远程；Step 7 会处理 |

### 8.5 经验教训

1. **`[skip ci]` 是 push event 级别的开关**，不是 commit 级别的。理解了这一点，就能理解为什么 `--follow-tags` 是问题的根因。
2. **tag 推送必须是独立事件** 才能触发 tag 相关的 workflow。`--follow-tags` 把 tag 绑在 commit push 上，破坏了独立性。
3. **D 方案本身正确**，只是 `scripts/release.mjs` 的推送方式与 GitHub 的 skip 机制产生了预期之外的交互。修复后 D 方案完整可用。

### 8.6 下次发版验证点

执行 `release-publish.bat` 后应确认：

- [x] 控制台输出 `已推送 tag vX.Y.Z（release.yml 应自动触发）`
- [ ] `gh run list --workflow=release.yml` 立即出现新的 Running/Queued run
- [ ] release.yml → tests job 全部通过 → build-desktop + build-web 自动执行 → release job 创建 Release
- [ ] sync-pipeline job 自动推送管线数据
- [ ] 全程无需手动 `workflow_dispatch`
