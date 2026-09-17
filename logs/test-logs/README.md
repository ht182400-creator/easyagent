# 测试日志目录（logs/test-logs/）

> **约定**：EasyAgent 的**所有**测试日志必须落在本目录，**禁止**写入系统临时目录
> （`%TEMP%`、`/tmp`）或散落到各包目录（如 `packages/*/vitest_*.txt`）。
> 日志是**项目资产**，需要可追溯、可 diff、可 grep。

## 目录结构

每次运行生成一个**时间戳目录**，互不覆盖：

```
logs/test-logs/
├── README.md                          ← 本文件
├── archive/                           ← 历史遗留日志归档（从包目录搬迁而来）
└── <YYYY-MM-DD_HHmmss>_<范围>/         ← 一次完整回归
    ├── 回归测试.log                    ← 分层文本日志（可 grep "FAIL" / "\[ERROR\]"）
    ├── 回归测试.html                   ← 可视化报告（失败标红，浏览器打开）
    ├── summary.json                    ← 机器可读汇总（CI / 管线消费）
    └── raw/<包名>.log                  ← 各包 vitest 原始完整输出（gitignore）
```

## 生成方式

```bash
# 全量回归（core + server + frontend + desktop + langgraph + web）
pnpm test:log

# 冒烟（仅 web + frontend，秒级）
pnpm test:log:smoke

# 自定义包与范围名
node scripts/run-tests-log.mjs --only core,server --scope 核心回归
```

**退出码**：`0` = 全部通过；`1` = 存在失败用例或包执行异常（可直接用作 CI 门禁）。

## 日志分级规则

| 级别 | 内容 | 出现时机 | 颜色 |
|------|------|---------|------|
| `[TRACE]` | 逐用例明细 | 需 `EASYAGENT_DEBUG=1` 或 `LOG_LEVEL=trace` | — |
| `[DEBUG]` | 执行命令、耗时、JSON 报告路径 | 需 `EASYAGENT_DEBUG=1` 或 `LOG_LEVEL=debug` | 灰 |
| `[INFO ]` | 包开始/结束、汇总数字 | 始终 | 默认 |
| `[WARN ]` | 跳过用例、JSON 报告缺失降级 | 始终 | 黄 |
| `[ERROR]` | **失败用例**、包崩溃、落盘失败 | 始终 | **红** |

时间戳精确到**毫秒**：`[2026-09-18 00:30:00.123] [ERROR] [scope] ...`

## 为什么 `raw/` 不入库

单次全量回归的原始输出可达 1~2 MB（core 包单包就 ~270KB），
逐次提交会让仓库迅速膨胀。因此：

- **入库**（便于追溯回归历史）：`回归测试.log`、`回归测试.html`、`summary.json`
- **不入库**（体积大、可按需重跑）：`raw/*.log`

如需长期留档某次异常，请把失败片段摘录进 `docs/` 下的回归记录文档。

## 与管线（docs/pipeline）的关系

各包 `vitest.config.ts` 仍会把结构化结果写到 `docs/pipeline/_vitest-<包>.json`
（该文件被 gitignore），供 `scripts/unified-sync.mjs` 计算看板 KPI。
本目录的日志是**人可读 + 可追溯**的那一份，两者互补：

- `docs/pipeline/_vitest-*.json` → 给**仪表板**用的机器数据
- `logs/test-logs/**` → 给**人**看的回归证据链

## 相关

- 运行器源码：`scripts/run-tests-log.mjs`
- 测试用例文档：`docs/03_测试案例文档.md`
- 回归记录：`docs/63_P0优化实施方案与回归记录.md`
