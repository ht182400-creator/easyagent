# logs/ — EasyAgent 日志总目录

> **铁律**：所有日志必须落在**本目录**（项目内）。
> **禁止**写入系统临时目录（`%TEMP%`、`/tmp`），**禁止**随手重定向到 `temp/`
> （那是 gitignore 的临时目录，等同丢弃，事后无从追溯）。

## 目录布局

| 子目录 | 内容 | 生成方式 | 是否入库 |
|--------|------|---------|:--------:|
| `runtime/` | **程序运行日志**（服务端/CLI/桌面端）。每日一个文件：`easyagent-YYYY-MM-DD.log`，ISO 毫秒时间戳，NDJSON 一行一条 | 运行时由 `packages/core/src/utils/logger.ts` 自动写入 | ❌ gitignore |
| `test-logs/` | **回归测试日志**。每次运行一个时间戳目录：分层 `.log` + 失败标红 `.html` + `summary.json` + `raw/<包>.log` | `pnpm test:log`（`scripts/run-tests-log.mjs`） | ✅ 汇总入库，`raw/` 忽略 |
| `build-logs/` | **命令输出日志**。构建 / 部署 / 校验等任意命令的完整输出 | `node scripts/run-logged.mjs --label X -- <命令>` | ❌ gitignore |
| `test-logs/archive/` | 历史遗留日志归档（从 `packages/*/vitest_*.txt` 迁移而来） | 手工 | ✅ |

## 运行日志（runtime/）

### 两条输出通道，级别**故意不同**

| 通道 | 级别来源 | 默认 | 为什么 |
|------|---------|------|--------|
| 控制台 | `LOG_LEVEL` > `EASYAGENT_DEBUG` | `info` | 日常使用要清爽，不被 DEBUG 刷屏 |
| 文件 | `EASYAGENT_LOG_FILE_LEVEL` | **`debug`** | 事后排查必须能查到细节，否则"日志在，证据没了" |

> 这就是「为什么我在控制台看不到 debug，但文件里应该有」的答案：
> 控制台按需过滤，文件默认全量。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `LOG_LEVEL` | — | `trace`/`debug`/`info`/`warn`/`error`/`fatal`，**控制台**级别（最高优先级） |
| `EASYAGENT_DEBUG` | — | 置 `1` 等价于控制台 `LOG_LEVEL=debug` |
| `EASYAGENT_LOG_FILE_LEVEL` | `debug` | **文件**级别；置 `silent` 可完全关闭文件日志 |
| `EASYAGENT_LOG_DIR` | 见下 | 日志根目录覆盖 |
| `EASYAGENT_LOG_RETENTION_DAYS` | `30` | 文件保留天数，超期自动删除（防磁盘占满） |

### 日志文件位置如何决定

- **服务端 / CLI**（非 Electron）：`<当前工作目录>/logs/runtime/`
  → 从项目根启动即为 `<项目>/logs/runtime/`，符合"日志在项目里"的约定。
- **Electron 桌面端**：`~/.easyagent/logs/runtime/`
  → 桌面端工作目录不可控（从快捷方式启动可能是 `C:\Windows\System32`），必须另择位置。
- 需要固定位置时统一设置 `EASYAGENT_LOG_DIR`。

### 怎么快速看日志

```bash
# 看今天的运行日志（Windows PowerShell）
Get-Content "logs/runtime/easyagent-$(Get-Date -Format yyyy-MM-dd).log" -Tail 50

# 只看错误与告警
Select-String -Path "logs/runtime/*.log" -Pattern '"level":"(error|warn)"'

# 打开实时详细日志（控制台也输出 debug）
$env:EASYAGENT_DEBUG = "1"; node packages/server/dist/index.js
```

服务端启动时会**主动打印日志文件路径**，不必再猜：

```
EasyAgent Server vX.Y.Z 已启动
  HTTP:      http://127.0.0.1:3456
  WebSocket: ws://127.0.0.1:3456/ws
  安全策略:  监听=127.0.0.1 · 鉴权: 开启（令牌来源=env） · 限流=开启 · 回环免鉴权=是
  日志文件:  D:\...\logs\runtime\easyagent-2026-09-18.log
```

## 命令输出（build-logs/）

构建、校验、部署这类一次性命令的输出，用统一入口执行即可自动存档：

```bash
node scripts/run-logged.mjs --label 构建web --cwd packages/web -- npm run build
node scripts/run-logged.mjs --label 数据校验 -- node scripts/verify-data-consistency.mjs
```

日志头部记录「命令 / 工作目录 / Git 提交 / Node 版本」，尾部记录「退出码 / 耗时」，
排查"某次构建为什么失败"时可直接定位到具体提交。

## 相关

- 运行日志实现：`packages/core/src/utils/logger.ts`
- 测试日志运行器：`scripts/run-tests-log.mjs`
- 命令日志运行器：`scripts/run-logged.mjs`
- 测试日志细则：`logs/test-logs/README.md`
