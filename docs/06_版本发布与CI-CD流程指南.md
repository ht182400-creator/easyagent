# EasyAgent 版本发布与 CI/CD 流程指南

> 版本: v1.2 | 日期: 2026-06-22 | 适用版本: 0.4.0+

---

## 目录

1. [核心概念：版本发布的完整链路](#一核心概念版本发布的完整链路)
2. [当前工作流：release-publish.bat 交互式发布](#二当前工作流release-publishbat-交互式发布)
3. [GitHub Actions 自动打包（可选但推荐）](#三github-actions-自动打包可选但推荐)
4. [两种方案对比](#四两种方案对比)
5. [FAQ](#五faq)

---

## 一、核心概念：版本发布的完整链路

### 1.1 发布是什么？

发布版本 ≠ 推送代码到 GitHub。一个完整的版本发布包含以下 **4 个步骤**：

```
┌──────────────────────────────────────────────────────────────────────┐
│                      EasyAgent 版本发布全链路                          │
│                                                                       │
│  [1] 标记版本           [2] 构建产物           [3] 创建 Release       │
│  ┌──────────────┐     ┌──────────────┐      ┌──────────────────┐     │
│  │ version.json  │     │ tsup 编译    │      │ GitHub Releases  │     │
│  │ v0.3.0→v0.3.1│ ──→ │ vite 打包    │ ──→  │ 上传 EXE/SHA256  │     │
│  │ git tag       │     │ electron-bld │      │ 填写 Release Note│     │
│  └──────────────┘     └──────────────┘      └────────┬─────────┘     │
│                                                       │               │
│                                                       ▼               │
│                                            [4] 用户端自动更新         │
│                                            ┌──────────────────┐      │
│                                            │ electron-updater │      │
│                                            │ 自动检测新版本    │      │
│                                            │ 下载 → 安装       │      │
│                                            └──────────────────┘      │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 关键理解

| 操作                    | 含义                         |    用户能不能更新？     |
| ----------------------- | ---------------------------- | :---------------------: |
| `git push`              | 把源代码推送到 GitHub        |         ❌ 不能         |
| `git tag v0.3.1`        | 在仓库中打一个版本标记       |         ❌ 不能         |
| **创建 GitHub Release** | 在 GitHub 网页上发布正式版本 | ⚠️ 能检测但无文件可下载 |
| **上传 EXE 到 Release** | 把安装包放到 Release 资源中  |     ✅ 可以自动更新     |

> **结论**：只有源代码 + Tag 是不够的，必须把编译好的 `.exe` 安装包上传到 GitHub Release，用户才能通过自动更新功能获取新版本。

### 1.3 electron-updater 的工作原理

```
Desktop App 启动
  └── initAutoUpdater()
      └── electron-updater 访问 GitHub API
          └── GET https://api.github.com/repos/ht182400-creator/easyagent/releases/latest
              ├── 比对自己版本 vs 远程最新版本
              ├── 有更新 → 下载 .exe 或 blockmap 增量包
              └── 无更新 → 静默跳过
```

---

## 二、当前工作流：release-publish.bat 交互式发布

### 2.1 当前工具链

| 脚本                                        | 功能                                                      |
| ------------------------------------------- | --------------------------------------------------------- |
| `release-publish.bat`                       | **一键交互式发布**：版本递增 → 构建 → GitHub Release 上传 |
| `version.json`                              | 唯一版本源，记录版本号 + 代号 + 发布日期                  |
| `scripts/sync-version.mjs`                  | 将 `version.json` 同步到 7 个子包 `package.json`（含 frontend + vscode） |
| `scripts/release.mjs`                       | 版本递增：同步 → CHANGELOG → git commit/tag/push          |
| `CHANGELOG.md`                              | 遵循 Keep a Changelog 格式的更新日志                      |
| `build.bat`                                 | Desktop EXE 打包流水线（编译 + electron-builder）         |
| `packages/desktop/scripts/verify-build.cjs` | 打包前 8 大类自动检查                                     |
| `scripts/.release_token`                    | GitHub Token（仅本地，已 gitignored）                     |

### 2.2 推荐方式：release-publish.bat 一键发布

直接在项目根目录运行：

```powershell
.\release-publish.bat
```

**交互式步骤**：

```
Step 1: Select version bump type
  [1] patch  (bug fix)      → 0.4.0 → 0.4.1
  [2] minor  (feature)      → 0.4.0 → 0.5.0
  [3] major  (breaking)     → 0.4.0 → 1.0.0
  [4] custom (enter x.y.z)
  [0] skip   (already tagged, build/upload only)

Step 2: Pre-checks (git status, remote connectivity)

Step 3: Version Bump (version.json + package.json + CHANGELOG + git push)

Step 4: Build Desktop EXE (build.bat --release)

Step 5: Create GitHub Release
  [1] gh CLI (recommended, requires install)
  [2] GitHub Token + curl (semi-auto)    ← Token 自动从 scripts/.release_token 读取
  [3] Manual upload (open browser)
  [0] Skip
```

**常用场景**：

| 场景                  | 选择            | 说明                           |
| --------------------- | --------------- | ------------------------------ |
| 新版本发布（patch）   | `1 → Y → Y → 2` | 版本递增 + 构建 + curl 上传    |
| 已有 tag 重新构建上传 | `0 → Y → Y → 2` | 跳过版本递增，只构建上传       |
| 仅上游代码，不构建    | `1 → Y → n → 0` | 只做版本递增推送，后续手动处理 |

### 2.3 Token 自动加载机制

为防止 Token 泄露到 git 历史，采用本地文件 + gitignore 方式：

```
scripts/.release_token          ← 单行文本，仅存 Token（已 gitignored）
.gitignore                      ← 新增 scripts/.release_token
release-publish.bat (option 2)  ← 自动从文件读取，不存在才提示输入
```

**首次配置 Token**：

1. 创建 `scripts/.release_token` 文件，写入 GitHub Token（纯文本，无换行）
2. 以后每次选 option 2，Token 自动加载，无需手动粘贴

### 2.4 手动分步发布（备用方式）

#### 步骤 1：版本递增 + Tag + 推送

```powershell
node scripts/release.mjs patch
```

#### 步骤 2：构建 EXE

```powershell
.\build.bat --release
```

#### 步骤 3：上传 GitHub Release

```powershell
# 方式 A：运行 release-publish.bat 选 0 → Y → n → 2（仅上传）
.\release-publish.bat

# 方式 B：用 PowerShell 脚本
powershell -ExecutionPolicy Bypass -File scripts\upload-release.ps1
```

### 2.5 发布流程图

```
你（开发者）
  │
  ├─ [本地] .\release-publish.bat
  │   │
  │   ├─ Step 1: 选版本类型 (patch/minor/major/custom/skip)
  │   ├─ Step 2: Pre-checks (git/remote/working tree)
  │   ├─ Step 3: node scripts/release.mjs
  │   │   └─ version.json → package.json → CHANGELOG → git push
  │   ├─ Step 4: .\build.bat --release
  │   │   └─ verify-build.cjs → tsup → vite → electron-builder
  │   └─ Step 5: 上传 GitHub Release
  │       ├─ [1] gh CLI 自动上传
  │       ├─ [2] Token+curl 上传（Token 自动读取）
  │       └─ [3] 手动浏览器拖拽上传
  │
  └─ 用户端自动更新
      └─ electron-updater 检测 latest.yml → 下载 EXE → 安装
```

---

## 三、GitHub Actions 自动打包（可选但推荐）

### 3.1 为什么需要？

手动发布的问题：

- **环境依赖**：必须在 Windows 上构建（electron-builder 生成 .exe）
- **容易遗漏**：上传文件到 Release 需要手动操作
- **不可重复**：不同机器构建可能产生不同结果
- **效率低**：每次发布需要 10+ 分钟人工操作

GitHub Actions 能解决：

- ✅ 推送 Tag 后自动触发构建
- ✅ 在 GitHub 的 Windows 虚拟机上构建（环境一致）
- ✅ 自动上传 EXE 到 Release
- ✅ 邮件/通知构建结果

### 3.2 需要做的事（前置条件）

GitHub Actions 需要 **GitHub Personal Access Token (PAT)**：

1. 访问 https://github.com/settings/tokens
2. 点击 **"Generate new token (classic)"**
3. 勾选权限：`repo`（全部）、`workflow`
4. 生成后复制 Token（形如 `ghp_xxxxxxxxxxxx`）
5. 在仓库设置中添加为 Secret：
   - 访问 https://github.com/ht182400-creator/easyagent/settings/secrets/actions
   - 点击 **"New repository secret"**
   - Name: `GH_TOKEN`
   - Value: 粘贴刚才复制的 Token

### 3.3 创建 Workflow 文件

在项目中创建 `.github/workflows/release.yml`：

```yaml
# .github/workflows/release.yml
# EasyAgent Desktop 自动构建与发布
# 触发条件: 推送版本 tag (v*)

name: Build and Release

on:
  push:
    tags:
      - 'v*' # 推送 v0.3.1 等 tag 时触发
  workflow_dispatch: # 允许手动触发
    inputs:
      version:
        description: '版本号 (如 0.3.1)'
        required: true

permissions:
  contents: write # 允许创建 Release

jobs:
  build-and-release:
    name: Build on ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest] # 目前只需 Windows，未来可加 macos-latest, ubuntu-latest
        include:
          - os: windows-latest
            artifact_name: EasyAgent-${{ github.ref_name }}-win-x64.exe
            blockmap_name: EasyAgent-${{ github.ref_name }}-win-x64.exe.blockmap

    runs-on: ${{ matrix.os }}

    steps:
      # ============================================================
      # Step 1: 检出代码
      # ============================================================
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # 获取所有历史（CHANGELOG 生成需要）

      # ============================================================
      # Step 2: 设置 Node.js 和 pnpm
      # ============================================================
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: '8'

      # ============================================================
      # Step 3: 安装依赖
      # ============================================================
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # ============================================================
      # Step 4: 同步版本号 (从 tag 获取)
      # ============================================================
      - name: Sync version from tag
        shell: pwsh
        run: |
          # 从 tag 提取版本号: v0.3.1 → 0.3.1
          $tag = "${{ github.ref_name }}"
          $version = $tag -replace '^v', ''
          Write-Host "Building version: $version"

          # 更新 version.json
          $versionJson = Get-Content version.json -Raw | ConvertFrom-Json
          $versionJson.version = $version
          $versionJson.releaseDate = (Get-Date -Format "yyyy-MM-dd")
          $versionJson | ConvertTo-Json -Depth 10 | Set-Content version.json

          # 运行版本同步
          node scripts/sync-version.mjs

      # ============================================================
      # Step 5: 运行测试 (确保质量)
      # ============================================================
      - name: Run tests
        run: |
          cd packages/core && npx vitest run
          cd ../server && npx vitest run
          cd ../desktop && npx vitest run

      # ============================================================
      # Step 6: 构建所有模块
      # ============================================================
      - name: Build core
        run: cd packages/core && pnpm exec tsup

      - name: Build server
        run: cd packages/server && pnpm exec tsup

      - name: Build desktop (tsup + vite)
        run: |
          cd packages/desktop
          pnpm exec tsup
          pnpm exec vite build

      # ============================================================
      # Step 7: 打包 EXE (electron-builder)
      # ============================================================
      - name: Package Electron app
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          EASYAGENT_VERSION: ${{ github.ref_name }}
        run: |
          cd packages/desktop
          pnpm exec electron-builder --win --x64 --publish always

      # ============================================================
      # Step 8: 上传 EXE 到 GitHub Release
      # ============================================================
      - name: Upload artifacts to Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            packages/desktop/release/*.exe
            packages/desktop/release/*.blockmap
            packages/desktop/release/latest.yml
          body_path: CHANGELOG.md
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # ============================================================
      # Step 9: 验证产物
      # ============================================================
      - name: Verify build output
        shell: pwsh
        run: |
          $exe = Get-ChildItem -Path "packages/desktop/release" -Filter "*.exe" | Select-Object -First 1
          if ($exe) {
            $sizeMB = [math]::Round($exe.Length / 1MB, 1)
            Write-Host "✅ EXE generated: $($exe.Name) ($sizeMB MB)"
          } else {
            Write-Host "❌ No EXE found!"
            exit 1
          }
```

### 3.4 使用 GitHub Actions 后的发布流程

配置好 Workflow 后，发布流程简化为：

```
你（开发者）
  │
  ├─ [本地] node scripts/release.mjs patch
  │   └─ version.json → 0.3.1
  │   └─ sync-version.mjs
  │   └─ CHANGELOG.md 更新
  │   └─ git commit + tag v0.3.1
  │   └─ git push origin main --follow-tags   ← 推送即触发
  │
  └─ [自动] GitHub Actions 检测到 tag v*
      └─ Windows 虚拟机启动
      └─ pnpm install → 测试 → 编译 → 打包
      └─ 自动上传 EXE 到 Release
      └─ 通知: ✅ Release v0.3.1 已就绪
```

### 3.5 Workflow 部署步骤

```powershell
# 1. 创建目录
mkdir -p .github\workflows

# 2. 将上面的 YAML 内容保存为文件
# .github\workflows\release.yml

# 3. 提交并推送
git add .github\workflows\release.yml
git commit -m "ci: 添加 GitHub Actions 自动构建发布流程"
git push origin main
```

### 3.6 首次触发

```powershell
# 推送一个 tag 即可触发
git tag v0.3.1-test
git push origin v0.3.1-test

# 查看构建状态: https://github.com/ht182400-creator/easyagent/actions
```

---

## 四、两种方案对比

| 维度             |   方案 A：release-publish.bat    |    方案 B：GitHub Actions     |
| ---------------- | :------------------------------: | :---------------------------: |
| 初始设置         |    ✅ 配置 Token 文件一次即可    |  ⚠️ 需要 PAT + Workflow YAML  |
| 每次发布耗时     |        ~5 分钟（交互式）         |     ~1 分钟（推送即触发）     |
| 构建环境         |         依赖本机 Windows         | GitHub Windows 虚拟机（一致） |
| 上传 Release     | 自动（curl API，Token 自动读取） |           自动上传            |
| 出错风险         |       ✅ 脚本化，逐步确认        |      ✅ 脚本化，一致性高      |
| 成本             |             本机电费             |    GitHub 免费（公开仓库）    |
| 离线发布         |     ✅ 本地构建，构建可离线      |          ❌ 必须联网          |
| macOS/Linux 构建 |           需要对应设备           |       添加 matrix 即可        |

### 推荐策略

> **阶段 1 + 2 已完成**：`release-publish.bat` 交互式发布（日常备用）+ GitHub Actions CI/CD 自动构建已部署
>
> - `.github/workflows/ci.yml` — push/PR 触发日常测试和编译验证
> - `.github/workflows/release.yml` — Tag 推送触发自动构建+发布 EXE
> - 前置条件：GitHub Settings → Secrets → Actions 中添加 `GH_TOKEN`

**当前双轨策略**：

1. **日常开发**：`release-publish.bat` 交互式发布，适合快速修复和小版本
2. **正式发布**：`git push --follow-tags` 触发 GitHub Actions 自动构建，适合大版本和跨平台构建

---

## 五、FAQ

### Q1：推送代码到 GitHub 就等于发布新版本吗？

**不等于。** 推送代码只是更新了仓库的源代码。版本发布需要在 GitHub 上创建 Release，并上传编译好的安装包。自动更新系统（electron-updater）会通过 GitHub Release API 检测新版本。

### Q2：`release.mjs` 会自动创建 GitHub Release 吗？

**不会。** `release.mjs` 负责的是本地版本管理：更新 `version.json`、同步 `package.json`、更新 `CHANGELOG.md`、创建 git tag 并推送。创建 GitHub Release 和上传 EXE 需要手动操作（或通过 GitHub Actions 自动化）。

### Q3：为什么要上传 3 个文件而不是 1 个？

| 文件                                   | 作用                                                      |
| -------------------------------------- | --------------------------------------------------------- |
| `EasyAgent-0.3.1-win-x64.exe`          | 完整安装包，新用户直接下载                                |
| `EasyAgent-0.3.1-win-x64.exe.blockmap` | 增量更新映射，老用户只下载变更部分（省流量）              |
| `latest.yml`                           | electron-updater 的元数据文件（版本号、文件路径、SHA512） |

### Q4：release.mjs 报错 "工作区有未提交的更改" 怎么办？

```powershell
# 先提交或暂存所有更改
git add .
git commit -m "chore: 准备发布"

# 或者强制继续（会提示确认）
node scripts/release.mjs patch
# → 是否继续？（有未提交更改）[y/N] y
```

### Q5：GitHub Actions 构建失败常见原因？

1. **GH_TOKEN 未设置**：在仓库 Settings → Secrets → Actions 中添加
2. **better-sqlite3 编译失败**：actions 镜像可能缺少 C++ 编译工具，需在 workflow 中添加 `npm install --build-from-source`
3. **electron-builder v24 被意外使用**：pnpm lockfile 应锁定 23.6.0
4. **磁盘空间不足**：GitHub Actions 免费额度 14GB，大型项目可能超限

### Q6：如何避免每次上传都手动输入 Token？

在项目根目录创建 `scripts/.release_token` 文件，写入 Token（纯文本，无换行）。`release-publish.bat` 的 option 2 会自动读取。该文件已在 `.gitignore` 中排除，不会提交到仓库。

```powershell
# 创建 token 文件（仅需一次）
echo ghp_xxxxxxxxxxxx > scripts\.release_token
```

### Q7：已经 git tag 过了，只想重新构建和上传怎么办？

运行 `release-publish.bat`，Step 1 选 `[0] skip`，跳过版本递增。后续构建和上传流程不变。

---

## 附录：快速命令参考

```powershell
# ===== 日常开发 =====
git add . && git commit -m "feat: 某某功能"
git push origin main

# ===== 发布新版本 =====
# 1. 确保代码干净
git status

# 2. 版本递增 + Tag + 推送
node scripts/release.mjs patch

# 3. 构建 EXE
.\build.bat --release

# 4. 打开 GitHub Releases 页面，上传 EXE
start https://github.com/ht182400-creator/easyagent/releases/new

# ===== 仅查看版本变化（不实际修改）=====
node scripts/release.mjs --dry-run patch

# ===== 发布指定版本 =====
node scripts/release.mjs 0.4.0

# ===== 查看所有 tag =====
git tag -l

# ===== 删除错误的 tag（谨慎）=====
git tag -d v0.3.1-bad
git push origin :refs/tags/v0.3.1-bad
```

---

> **下一步建议**：GitHub Actions 已部署，首次使用需在 GitHub Settings → Secrets → Actions 中添加 `GH_TOKEN`。之后推送 Tag 即自动构建发布。日常小版本仍可使用 `release-publish.bat` 交互式发布。
