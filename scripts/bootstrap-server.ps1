<# ================================================================
   EasyAgent 服务器一键初始化（Windows）
   作用: 安装全部前置环境 → 克隆仓库 → 一键部署 → 启动服务
   用法（在服务器上以"管理员 PowerShell"粘贴一行）:
     irm https://raw.githubusercontent.com/ht182400-creator/easyagent/main/scripts/bootstrap-server.ps1 | iex
   说明:
     - 需 Windows 10/11/Server 2022 且已带 winget
     - VS Build Tools 安装后可能需要重启；重启后再次粘贴同一行即可（已自动跳过已装项）
     - 默认克隆到 D:\easyagent，可用 -CloneDir 修改
#>
param(
    [string]$RepoUrl = 'https://github.com/ht182400-creator/easyagent.git',
    [string]$CloneDir = 'D:\easyagent'
)

$ErrorActionPreference = 'Stop'

# 必须管理员（绑定 80 端口 / 安装系统组件需要）
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '⛔ 请以"管理员身份"运行 PowerShell 后再执行本脚本。' -ForegroundColor Red
    exit 1
}

function Test-Command($c) { return (Get-Command $c -ErrorAction SilentlyContinue) -ne $null }

try {
    if (-not (Test-Command winget)) {
        throw '未找到 winget。请在服务器上安装"应用安装程序"(App Installer) 后重试。'
    }

    Write-Host "`n=== 1/5 安装 Git ===" -ForegroundColor Cyan
    if (-not (Test-Command git)) {
        winget install Git.Git --accept-package-agreements --accept-source-agreements
    } else { Write-Host 'Git 已存在，跳过' }

    Write-Host "`n=== 2/5 安装 Node.js LTS (严禁 24) ===" -ForegroundColor Cyan
    if (-not (Test-Command node)) {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    } else { Write-Host "Node $(node -v) 已存在，跳过" }

    # 刷新 PATH 使新装命令立即可用
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

    Write-Host "`n=== 3/5 安装 pnpm + C++ 编译工具链 + Python ===" -ForegroundColor Cyan
    if (-not (Test-Command pnpm)) {
        npm install -g pnpm@11.7.0
    } else { Write-Host 'pnpm 已存在，跳过' }

    if (-not (Test-Command python)) {
        winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    } else { Write-Host 'Python 已存在，跳过' }

    # VS 2022 构建工具（better-sqlite3 原生编译依赖）
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $hasVC = (Test-Path $vsWhere) -and (& $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -latest -property installationPath 2>$null)
    if (-not $hasVC) {
        winget install Microsoft.VisualStudio.2022.BuildTools --override '--add Microsoft.VisualStudio.Workload.VCTools;includeRecommended' --accept-package-agreements --accept-source-agreements
        Write-Host '⚠ VS Build Tools 安装完成，建议重启服务器后再次粘贴本行以确保编译环境就绪。' -ForegroundColor Yellow
    } else { Write-Host 'VC 工具链已存在，跳过' }

    Write-Host "`n=== 4/5 克隆/更新代码 ===" -ForegroundColor Cyan
    if (-not (Test-Path $CloneDir)) {
        git clone $RepoUrl $CloneDir
    } else {
        Set-Location $CloneDir
        git pull --ff-only origin main
    }
    Set-Location $CloneDir

    Write-Host "`n=== 5/5 部署并启动 ===" -ForegroundColor Cyan
    pwsh scripts/deploy-server.ps1 -Start

    Write-Host "`n✅ 初始化完成。请确认启动窗口显示 '服务器已启动'。" -ForegroundColor Green
    Write-Host "下一步: 配置 DNS A 记录(CCCN.fable5.icu → 82.156.71.231) 并在防火墙/安全组放行 80。" -ForegroundColor Yellow
}
catch {
    Write-Host "`n[初始化失败] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '可重试：修复后再次粘贴同一行（已安装项会自动跳过）。' -ForegroundColor DarkGray
    exit 1
}
