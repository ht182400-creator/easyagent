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

- [ ] `_test.yml` YAML 语法正确
- [ ] `ci.yml` 正确引用 `_test.yml`
- [ ] `release.yml` 正确引用 `_test.yml` + 质量门禁
- [ ] `scripts/release.mjs` commit message 含 `[skip ci]`
- [ ] `release-publish.bat` artifacts commit 含 `[skip ci]`
- [ ] 所有 job 依赖链正确（needs 顺序）
- [ ] Artifact 名称一致（vitest-core/server/desktop）
- [ ] sync-pipeline 下载 artifact 路径正确
