#=============================================================================
# EasyAgent 一键安装脚本 (Windows PowerShell)
# 用法: iwr -Uri https://raw.githubusercontent.com/.../install.ps1 | iex
# 或:   .\install.ps1 -WithDeepSeek -Version "v0.5.1"
#=============================================================================

param(
    [switch]$WithDeepSeek,
    [string]$Version = "v0.5.1",
    [string]$InstallDir = "$env:USERPROFILE\.easyagent",
    [switch]$SkipBuild,
    [switch]$NoVerify,
    [switch]$Help
)

# --- 编码和错误处理 ---
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

# --- 帮助 ---
if ($Help) {
    Write-Host @"
EasyAgent 一键安装脚本 (Windows)
用法: .\install.ps1 [选项]

选项:
  -WithDeepSeek     安装后运行 DeepSeek 配置向导
  -Version VERSION  指定安装版本 (默认: v0.5.1)
  -InstallDir PATH  指定安装目录 (默认: ~/.easyagent)
  -SkipBuild        跳过构建步骤
  -NoVerify         跳过安装验证
  -Help             显示此帮助

示例:
  iwr https://.../install.ps1 | iex
  .\install.ps1 -WithDeepSeek -Version "v0.5.1"
"@
    exit 0
}

# --- 颜色函数 ---
function Write-Info    { Write-Host "[INFO]  $args" -ForegroundColor Blue }
function Write-Success { Write-Host "[OK]    $args" -ForegroundColor Green }
function Write-Warn    { Write-Host "[WARN]  $args" -ForegroundColor Yellow }
function Write-Error-Exit { Write-Host "[ERROR] $args" -ForegroundColor Red; exit 1 }

# --- Banner ---
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          EasyAgent - AI 编程助手 一键安装            ║" -ForegroundColor Cyan
Write-Host "║      集成中国主流大模型的全功能 AI Agent              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# --- 管理员权限检查 ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Warn "建议以管理员身份运行以获得最佳体验"
    Write-Warn "右键 PowerShell → 以管理员身份运行"
    Write-Host ""
}

# --- 系统检测 ---
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
Write-Info "检测到系统架构: $arch"

# --- 检查并安装 Node.js ---
function Check-NodeJS {
    try {
        $nodeVer = node -v 2>$null
        if ($nodeVer) {
            $verNum = [Version]($nodeVer -replace 'v', '')
            if ($verNum -ge [Version]"18.0.0") {
                Write-Success "Node.js $nodeVer ✓"
                return $true
            }
        }
    } catch {}

    Write-Warn "Node.js 未安装或版本过低，正在安装..."
    return Install-NodeJS
}

function Install-NodeJS {
    try {
        # 检查 winget
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Info "使用 winget 安装 Node.js LTS..."
            winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements
        } else {
            # 下载安装包
            $nodeUrl = "https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi"
            $installer = "$env:TEMP\nodejs-installer.msi"
            Write-Info "下载 Node.js 安装包..."
            Invoke-WebRequest -Uri $nodeUrl -OutFile $installer
            Write-Info "安装 Node.js..."
            Start-Process msiexec.exe -ArgumentList "/i `"$installer`" /quiet /norestart" -Wait
            Remove-Item $installer -Force
        }

        # 刷新环境变量
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Success "Node.js 安装完成 ✓"
        return $true
    } catch {
        Write-Error-Exit "Node.js 安装失败，请手动安装: https://nodejs.org/"
    }
}

# --- 检查 pnpm ---
function Check-Pnpm {
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        Write-Info "安装 pnpm..."
        npm install -g pnpm@latest
    }
    Write-Success "pnpm $(pnpm -v) ✓"
}

# --- 检查 git ---
function Check-Git {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Info "使用 winget 安装 Git..."
            winget install Git.Git --silent --accept-package-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        } else {
            Write-Error-Exit "请手动安装 Git: https://git-scm.com/download/win"
        }
    }
    Write-Success "git $(git --version) ✓"
}

# --- 安装 Windows 构建工具 ---
function Install-BuildTools {
    Write-Info "检查 C++ 构建工具..."
    
    # 检查是否已安装 Visual Studio Build Tools
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($vsPath) {
            Write-Success "Visual Studio Build Tools 已安装 ✓"
            return
        }
    }

    Write-Warn "需要安装 Visual Studio Build Tools 2022 (用于编译 native 模块)"
    Write-Info "下载安装程序..."
    $vsInstaller = "$env:TEMP\vs_buildtools.exe"
    Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_buildtools.exe" -OutFile $vsInstaller
    Write-Info "正在安装 (需要几分钟，请耐心等待)..."
    Start-Process -FilePath $vsInstaller -ArgumentList "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" -Wait
    Remove-Item $vsInstaller -Force
    Write-Success "Visual Studio Build Tools 安装完成 ✓"
}

# --- 核心安装 ---
function Install-EasyAgent {
    param([string]$Version, [string]$Directory)

    Write-Info "安装 EasyAgent $Version 到 $Directory..."

    # 准备目录
    if (Test-Path "$Directory\.git") {
        Write-Info "更新现有安装..."
        Push-Location $Directory
        git fetch --tags
        try { git checkout $Version } catch { git checkout main }
        git pull origin main
    } else {
        if (Test-Path $Directory) {
            $backupDir = "$Directory.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
            Write-Warn "安装目录非空，备份到 $backupDir"
            Move-Item $Directory $backupDir -Force
        }
        New-Item -ItemType Directory -Path $Directory -Force | Out-Null
        git clone "https://github.com/easyagent/easyagent" $Directory
        Push-Location $Directory
        try { git checkout $Version } catch {}
    }

    # 安装依赖
    Write-Info "安装项目依赖..."
    pnpm install --frozen-lockfile

    # 构建
    if (-not $SkipBuild) {
        Write-Info "构建 EasyAgent..."
        pnpm build
    }

    Pop-Location
    Write-Success "EasyAgent 安装完成!"
}

# --- 创建启动脚本 ---
function Create-Scripts {
    $binDir = "$env:USERPROFILE\.easyagent\bin"
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null

    # CLI 启动脚本
    @"
@echo off
set EASYAGENT_DIR=%USERPROFILE%\.easyagent
node "%EASYAGENT_DIR%\packages\cli\dist\main.js" %*
"@ | Out-File -FilePath "$binDir\easyagent-cli.cmd" -Encoding ASCII

    # Server 启动脚本
    @"
@echo off
set EASYAGENT_DIR=%USERPROFILE%\.easyagent
node "%EASYAGENT_DIR%\packages\server\dist\index.js" %*
"@ | Out-File -FilePath "$binDir\easyagent-server.cmd" -Encoding ASCII

    # Desktop 启动脚本
    @"
@echo off
set EASYAGENT_DIR=%USERPROFILE%\.easyagent
cd /d "%EASYAGENT_DIR%"
npx electron packages\desktop\dist\main.js %*
"@ | Out-File -FilePath "$binDir\easyagent-desktop.cmd" -Encoding ASCII

    # 添加到 PATH
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$binDir*") {
        Write-Warn "将 $binDir 添加到用户 PATH"
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binDir", "User")
        $env:Path = "$env:Path;$binDir"
        Write-Success "已添加到 PATH ✓"
    }

    Write-Success "全局命令已创建: easyagent-cli, easyagent-server, easyagent-desktop"
}

# --- DeepSeek 配置向导 ---
function Setup-DeepSeek {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║          DeepSeek 快速配置向导                       ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    if (-not $env:DEEPSEEK_API_KEY) {
        Write-Host "获取 API Key: https://platform.deepseek.com/api_keys" -ForegroundColor Blue
        Write-Host ""
        $apiKey = Read-Host "请输入 DeepSeek API Key"

        if ($apiKey) {
            [Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", $apiKey, "User")
            $env:DEEPSEEK_API_KEY = $apiKey
            Write-Success "DeepSeek API Key 已配置 ✓"
        } else {
            Write-Warn "跳过配置 (可稍后设置环境变量 DEEPSEEK_API_KEY)"
        }
    } else {
        Write-Success "检测到环境变量 DEEPSEEK_API_KEY 已配置 ✓"
    }

    Write-Host ""
    Write-Host "支持的模型:"
    Write-Host "  • deepseek-v4       - 旗舰模型 (默认)"
    Write-Host "  • deepseek-r1-0528  - 推理增强"
    Write-Host ""
    Write-Host "启动命令行: easyagent-cli"
    Write-Host "启动 Web UI: easyagent-server → http://localhost:3000"
    Write-Host ""
}

# --- 验证安装 ---
function Verify-Installation {
    param([string]$Directory)

    Write-Info "验证安装..."

    $files = @(
        @{Path="$Directory\packages\cli\dist\main.js"; Name="CLI 入口"},
        @{Path="$Directory\packages\server\dist\index.js"; Name="Server 入口"},
        @{Path="$Directory\packages\core\dist\index.js"; Name="Core 模块"},
        @{Path="$env:USERPROFILE\.easyagent\bin\easyagent-cli.cmd"; Name="CLI 全局命令"},
        @{Path="$env:USERPROFILE\.easyagent\bin\easyagent-server.cmd"; Name="Server 全局命令"}
    )

    $errors = 0
    foreach ($file in $files) {
        if (Test-Path $file.Path) {
            Write-Success "$($file.Name) ✓"
        } else {
            Write-Warn "$($file.Name) ✗ ($($file.Path))"
            $errors++
        }
    }

    if ($errors -eq 0) {
        Write-Success "所有文件验证通过!"
    } else {
        Write-Warn "发现 $errors 个问题，请检查安装日志"
    }
}

# --- 主流程 ---
try {
    # 依赖检查
    Check-NodeJS | Out-Null
    Check-Pnpm
    Check-Git
    Install-BuildTools

    # 核心安装
    Install-EasyAgent -Version $Version -Directory $InstallDir

    # 创建快捷命令
    Create-Scripts

    # 验证
    if (-not $NoVerify) {
        Verify-Installation -Directory $InstallDir
    }

    # DeepSeek 配置
    if ($WithDeepSeek) {
        Setup-DeepSeek
    }

    # 完成
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║              EasyAgent 安装完成! 🎉                  ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "快速开始:"
    Write-Host "  easyagent-cli             启动命令行"
    Write-Host "  easyagent-server          启动 Web UI (http://localhost:3000)"
    Write-Host "  easyagent-desktop         启动桌面应用"
    Write-Host ""
    Write-Host "配置模型:"
    Write-Host "  `$env:DEEPSEEK_API_KEY = ""你的Key"""
    Write-Host ""

    if (-not $WithDeepSeek) {
        Write-Host "提示: 运行 .\install.ps1 -WithDeepSeek 快速配置 DeepSeek" -ForegroundColor Yellow
        Write-Host ""
    }

} catch {
    Write-Host "[ERROR] 安装失败: $_" -ForegroundColor Red
    Write-Host "请查看详细错误信息并重试，或提交 Issue: https://github.com/easyagent/easyagent/issues" -ForegroundColor Yellow
    exit 1
}
