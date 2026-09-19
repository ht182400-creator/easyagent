# Forgejo 发布指南

> **建立日期**: 2026-09-18 · **最后更新**: 2026-09-19（v0.6.43 实际发布，补充 PowerShell 调 API 与发布记录）
> **适用场景**: 把 EasyAgent 同步发布到自建 Forgejo（与 GitHub 双通道并行）
> **凭据原则**: **任何凭据都不写入仓库、git config、remote URL 或文档**；只在运行时通过环境变量提供

---

## 一、实例信息

| 项        | 值                                                                          |
| --------- | --------------------------------------------------------------------------- |
| 服务地址  | `http://localhost:3000`                                                     |
| 版本      | `16.0.2+gitea-1.22.0`（Forgejo，兼容 Gitea 1.22 API）                       |
| 用户名    | `ht182400`（注意：不是 `ht82400`，少一个 `1` 会得到 `user does not exist`） |
| 仓库      | `http://localhost:3000/ht182400/easyagent`                                  |
| Clone URL | `http://localhost:3000/ht182400/easyagent.git`                              |
| 默认分支  | `main`                                                                      |
| 可见性    | 公开（与 GitHub 侧保持一致）                                                |

**远端配置（已完成，不含凭据）**：

```bash
git remote add forgejo http://localhost:3000/ht182400/easyagent.git
```

当前远端一览：

| remote    | 地址                                            | 认证方式                       |
| --------- | ----------------------------------------------- | ------------------------------ |
| `origin`  | `git@github.com:ht182400-creator/easyagent.git` | SSH 密钥                       |
| `forgejo` | `http://localhost:3000/ht182400/easyagent.git`  | HTTP Basic（运行时注入，见下） |

---

## 二、为什么不用「URL 里带账号密码」

把凭据写进 remote URL 会残留在三处：

1. `.git/config` —— 明文，且可能被误提交；
2. `git reflog` / shell 历史 —— 间接泄漏；
3. 任何打印 remote URL 的脚本输出。

因此本项目统一改用**一次性的 `http.extraHeader`**：

```bash
git -c "http.extraHeader=Authorization: Basic <base64(user:token)>" push forgejo main
```

- 只对**这一条命令**生效，不写入任何文件；
- `reflog` 只记录 remote 名，不含 header；
- 凭据仅存在于进程内存。

已封装为脚本：`scripts/push-forgejo.mjs`。

---

## 三、推送流程（推荐）

### 3.1 准备凭据（每次新开终端都要做）

```powershell
# PowerShell —— 令牌只存在于当前会话
$env:FORGEJO_USER  = 'ht182400'
$env:FORGEJO_TOKEN = '<你的访问令牌>'
```

> **推荐用访问令牌而不是登录密码**：
> Forgejo → `用户设置 → 应用 → 生成令牌`，勾选 `repository: write` 即可。
> 令牌可随时撤销，且不会因改密码而失效。
> 本实例已存在一个名为 `easyagent-release` 的令牌（如不再需要请到 Forgejo 中撤销）。

### 3.2 推送

```bash
# 推送当前分支 + 最近 20 个标签
pnpm push:forgejo

# 只推送指定标签
node scripts/push-forgejo.mjs --tag v0.6.26

# 只推分支、不推标签
node scripts/push-forgejo.mjs --no-tags
```

脚本行为：

1. 校验 `FORGEJO_USER` / `FORGEJO_TOKEN` 是否提供（缺失则给出可操作提示并退出 1）；
2. 校验 `forgejo` remote 是否存在；
3. 推送当前分支；
4. 推送标签（默认最近 20 个，已存在的会自动跳过）。

### 3.3 创建 Release

推送标签**不会**在 Forgejo 自动创建 Release（该实例未配置 Actions 工作流），必须显式调用 API。

**PowerShell（推荐；v0.6.43 实测可用）**：

```powershell
# 凭据从环境变量读（见 §3.1），不落盘
$b64 = [Convert]::ToBase64String(
  [Text.Encoding]::UTF8.GetBytes("$($env:FORGEJO_USER):$($env:FORGEJO_TOKEN)")
)

# 正文风格沿用本实例既有 Release：主题 / Changed / Fixed / 验证（不直接贴 CHANGELOG 全文）
$lines = @('## 主题', '', '一句话主题', '', '## Changed', '', '- 变更 1', '', '## 验证', '', '- 回归结果')
$payload = @{
  tag_name         = 'v0.6.43'
  target_commitish = 'main'
  name             = 'v0.6.43 — 标题'
  draft            = $false
  prerelease       = $false
  body             = ($lines -join "`n")
} | ConvertTo-Json -Depth 4

$r = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/repos/ht182400/easyagent/releases' `
  -Method Post -Headers @{ Authorization = "Basic $b64" } `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($payload))   # ⚠️ 必须传字节数组，否则中文正文乱码（踩坑 #9）
"id=$($r.id) url=$($r.html_url)"
```

**curl.exe（等价写法）**：

```bash
curl.exe -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <base64(user:token)>' \
  -d '@<release-请求体>.json' \
  -X POST http://localhost:3000/api/v1/repos/ht182400/easyagent/releases
```

请求体字段：

```json
{
  "tag_name": "v0.6.26",
  "target_commitish": "main",
  "name": "v0.6.26 — 标题",
  "draft": false,
  "prerelease": false,
  "body": "Markdown 正文（换行用 \\n）"
}
```

> 注意 1：若已存在同名 tag 的 Release，会返回 `release already exists`，此时改用
> `PATCH /api/v1/repos/{owner}/{repo}/releases/{id}` 更新。
> 注意 2：创建后**必须回读校验**：`GET .../releases/{id}` 看 `body` 中文是否正常、`draft=false`、
> `tag_name` 正确 —— 中文乱码与草稿态都是"看起来成功了"的静默失败。

---

## 四、与 GitHub 通道的差异

| 项       | GitHub（origin）                                                             | Forgejo（forgejo）                                         |
| -------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 传输     | SSH                                                                          | HTTP                                                       |
| CI       | ✅ `.github/workflows/*`：push 触发测试、**tag 触发构建 + 自动创建 Release** | ❌ 无工作流（该实例未配置）                                |
| Release  | 由 `release.yml` 自动创建，含 EXE 产物                                       | **需手动调 API 创建**，无构建产物（仅源码归档 zip/tar.gz） |
| 推送命令 | `git push origin main && git push origin <tag>`                              | `pnpm push:forgejo`                                        |

**因此一次完整发布 = 两处都推**：

```bash
# 1) 版本号与变更日志（唯一版本源 version.json）
node scripts/sync-version.mjs          # 同步 7 个 package.json + server 硬编码兜底

# 2) 发版前验证（三项门禁 + 全量回归）
pnpm verify:data && pnpm verify:tokens && pnpm test:log

# 3) 提交 + 打标签
git add -A && git commit -m "release: vX.Y.Z <主题>"
git tag -a vX.Y.Z -m "EasyAgent vX.Y.Z - <主题>"

# 4) 推送 GitHub（会自动触发构建与 Release）
git push origin main && git push origin vX.Y.Z

# 5) 推送 Forgejo（凭据从环境变量读，不落盘）
pnpm push:forgejo --tag vX.Y.Z

# 6) 在 Forgejo 创建 Release（见 §3.3）
```

---

## 五、踩坑记录

| #   | 现象                                                                                                     | 根因                                                                                                           | 对策                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | API 返回 `user does not exist [name: ht82400]`                                                           | 用户名少打了一个 `1`                                                                                           | 正确用户名是 `ht182400`                                                                                                                  |
| 2   | PowerShell 里 `curl -s -m 8 ...` 报「参数名称 m 具有二义性」                                             | PowerShell 的 `curl` 是 `Invoke-WebRequest` 的别名，参数集不同                                                 | 显式写 `curl.exe`                                                                                                                        |
| 3   | 建仓返回 `repository with the same name already exists`                                                  | 仓库早已存在（2026-08-19 创建）                                                                                | 先 `GET /api/v1/repos/{owner}/{repo}` 探测；存在则跳过建仓，直接比对历史                                                                 |
| 4   | 担心推送覆盖远端                                                                                         | 未确认历史是否同源                                                                                             | 先 `git fetch forgejo` 比对 HEAD；本次确认 `forgejo/main` 与本地完全一致后才推送（**若历史不同源，绝不可 force push，需先与用户确认**）  |
| 5   | `write:repository` 权限不足                                                                              | 令牌 scope 不含 `write:user`                                                                                   | 建仓需 `write:user`；纯推送 `write:repository` 即可                                                                                      |
| 6   | 脚本报「(up-to-date)」但实际推送成功                                                                     | **git 的推送结果写在 stderr**，`execFileSync` 只返回 stdout → `output` 为空，被 `\|\| '(up-to-date)'` 兜底误判 | 改用 `spawnSync` 同时捕获 stdout+stderr；并区分「已推送 / 已是最新」两种文案                                                             |
| 7   | 推送成功但 Release 没建，v0.6.40~v0.6.42 三个版本在 Forgejo 上**完全没有 Release**（tag 有、Release 无） | 「调 API 建 Release」是手工步骤（该实例无工作流），只靠记忆执行 → 必然漏                                       | 把「建 Release + 回读校验」写进发版清单**固定动作**；发布后自查版本序列连续性（见 §六）                                                  |
| 8   | `v0.6.43` 标签解引用指向 `308f50c`，而非推送时的 HEAD `713e095`                                          | 标签在最后一条「发版记录」文档提交**之前**就打了 → 标签内容不含该记录                                          | 打标签前确认「发版相关提交已全部落盘」；**已推送的标签绝不移位**（移位需 force push 两个远端，风险远大于收益）                           |
| 9   | PowerShell 调 API 建 Release，中文正文乱码                                                               | `Invoke-RestMethod -Body <string>` 按本地代码页编码，而 `ConvertTo-Json` 产物含中文                            | `-ContentType 'application/json; charset=utf-8'` + `-Body ([Text.Encoding]::UTF8.GetBytes($json))`（传**字节数组**），并回读 `body` 校验 |

---

## 六、发布记录

| 版本                        | 日期       | Forgejo Release | 备注                                                                                                            |
| --------------------------- | ---------- | :-------------: | --------------------------------------------------------------------------------------------------------------- |
| v0.6.43                     | 2026-09-19 |    ✅ id=82     | 语义扫描性能治理（11.0s→0.26s）；分支 `32cffa6..713e095` 快进推送 + tag `v0.6.43`（标签指向 `308f50c`）         |
| v0.6.40 / v0.6.41 / v0.6.42 | 2026-09-19 |  ✅ 补建 79~81  | 首发时**漏建 Release**（踩坑 #7）；同日按 §3.3 从 `CHANGELOG.md` 对应小节提炼正文补齐（id 恰好补上 79~81 空档） |
| v0.6.39 及以前              | —          |       ✅        | 最新一条为 id=78                                                                                                |

> 只读自查（不写任何凭据到文件）：
> `Invoke-RestMethod 'http://localhost:3000/api/v1/repos/ht182400/easyagent/releases?limit=50' | Select tag_name`

---

## 七、相关

- 推送脚本：`scripts/push-forgejo.mjs`
- 版本发布流程（GitHub）：`docs/06_版本发布与CI-CD流程指南.md`、`docs/38_双通道发布指南_本地vs服务器.md`
- 运行日志：`logs/README.md`
