<# ================================================================
   EasyAgent 服务器一键部署脚本 (Windows)
   作用: 校验 Node 版本 → 拉取代码 → 安装依赖(编译 better-sqlite3)
         → 激活系统 Node 原生模块 → 构建 core/langgraph/server/web
         → (可选) 以管理员身份启动服务
   前置条件(见 docs/60_服务器部署指南.md):
     - Git for Windows
     - Node.js 18/20/22 LTS（禁止 24，否则 preinstall 拦截）
     - pnpm@11.7.0 (npm i -g pnpm@11.7.0)
     - Visual Studio 2022 Build Tools (C++ 桌面开发) + Python 3
   用法:
     pwsh scripts/deploy-server.ps1            # 仅构建
     pwsh scripts/deploy-server.ps1 -Start     # 构建后启动服务(新开管理员窗口)
     pwsh scripts/deploy-server.ps1 -SkipPull  # 不拉取代码，直接构建
#>
param(
    [switch]$Start,
    [switch]$SkipPull
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Test-Command($cmd) { return (Get-Command $cmd -ErrorAction SilentlyContinue) -ne $null }

try {
    # ---------------------------------------------------------------
    # 1. 校验 Node 版本（项目要求 >=18 且 <24）
    # ---------------------------------------------------------------
    Write-Step '校验 Node.js 版本'
    if (-not (Test-Command node)) {
        throw '未检测到 node。请先安装 Node.js 18/20/22 LTS (winget install OpenJS.NodeJS.LTS)'
    }
    $nodeVer = (node -v).TrimStart('v')
    $major = [int]($nodeVer.Split('.')[0])
    if ($major -ge 24) {
        throw "检测到 Node $nodeVer (>=24)，项目 preinstall 会拦截且 better-sqlite3 无预编译。请降到 Node 20/22 LTS。"
    }
    if ($major -lt 18) {
        throw "Node $nodeVer 过低，需 >=18。请升级 Node.js LTS。"
    }
    Write-Host "Node 版本: $nodeVer ✓" -ForegroundColor Green

    # ---------------------------------------------------------------
    # 2. 校验 pnpm
    # ---------------------------------------------------------------
    Write-Step '校验 pnpm'
    if (-not (Test-Command pnpm)) {
        Write-Host '未检测到 pnpm，自动安装 pnpm@11.7.0 ...' -ForegroundColor Yellow
        npm install -g pnpm@11.7.0
    }
    pnpm -v

    # ---------------------------------------------------------------
    # 3. 拉取最新代码
    # ---------------------------------------------------------------
    Write-Step '更新代码'
    Set-Location $ProjectRoot
    if (-not (Test-Path '.git')) {
        throw '当前目录不是 git 仓库，请先 git clone 后再运行本脚本。'
    }
    if (-not $SkipPull) {
        git pull --ff-only origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'git pull 失败（可能有本地改动），建议先处理。继续构建...' -ForegroundColor Yellow
        }
    }

    # ---------------------------------------------------------------
    # 4. 安装依赖（pnpm-workspace.yaml 已 allowBuilds better-sqlite3，会编译原生模块）
    # ---------------------------------------------------------------
    Write-Step 'pnpm install（将编译 better-sqlite3 原生模块）'
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        throw 'pnpm install 失败。常见原因：缺少 VS Build Tools / Python，导致 better-sqlite3 编译失败。'
    }

    # ---------------------------------------------------------------
    # 5. 激活系统 Node 版 better-sqlite3
    # ---------------------------------------------------------------
    Write-Step '激活系统 Node 版 better-sqlite3'
    node scripts/sqlite3-loader.mjs system
    if ($LASTEXITCODE -ne 0) {
        throw 'better-sqlite3 切换失败，原生模块可能未编译成功。'
    }

    # ---------------------------------------------------------------
    # 6. 构建（顺序: core → langgraph → server → web）
    #     web 由 Vite 直接打包 @easyagent/frontend 源码，无需单独 build frontend
    # ---------------------------------------------------------------
    Write-Step '构建 core'
    pnpm --filter @easyagent/core build
    Write-Step '构建 langgraph'
    pnpm --filter @easyagent/langgraph build
    Write-Step '构建 server'
    pnpm --filter @easyagent/server build
    Write-Step '构建 web'
    pnpm --filter @easyagent/web build

    Write-Host "`n✓ 构建完成！Server 产物: packages/server/dist/index.js" -ForegroundColor Green
    Write-Host "✓ Web 产物: packages/web/dist" -ForegroundColor Green

    # ---------------------------------------------------------------
    # 7. (可选) 启动服务
    # ---------------------------------------------------------------
    if ($Start) {
        Write-Step '以管理员身份启动服务 (start-server.cmd)'
        Start-Process -FilePath (Join-Path $PSScriptRoot 'start-server.cmd') -Verb RunAs
        Write-Host '已在新的管理员窗口启动。请检查该窗口日志是否显示 "服务器已启动"。' -ForegroundColor Green
    } else {
        Write-Host "`n下一步: 以管理员身份运行 scripts\start-server.cmd 启动服务。" -ForegroundColor Yellow
        Write-Host "域名 CCCN.fable5.icu 需解析到 82.156.71.231，并在防火墙/安全组放行 80 端口。" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "`n[部署失败] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    exit 1
}
