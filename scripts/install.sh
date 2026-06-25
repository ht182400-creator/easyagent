#!/usr/bin/env bash
#=============================================================================
# EasyAgent 一键安装脚本 (Linux/macOS)
# 用法: curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
# 或:   bash install.sh [--with-deepseek] [--version v0.5.1]
#=============================================================================

set -euo pipefail

# --- 配置 ---
EASYAGENT_VERSION="${EASYAGENT_VERSION:-v0.5.1}"
EASYAGENT_INSTALL_DIR="${EASYAGENT_INSTALL_DIR:-$HOME/.easyagent}"
EASYAGENT_REPO="https://github.com/easyagent/easyagent"
NODE_MIN_VERSION="18.0.0"
NPM_MIN_VERSION="8.0.0"

# --- 颜色输出 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- 工具函数 ---
print_banner() {
    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}${BOLD}║          EasyAgent - AI 编程助手 一键安装            ║${NC}"
    echo -e "${CYAN}${BOLD}║      集成中国主流大模型的全功能 AI Agent              ║${NC}"
    echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# --- 系统检测 ---
detect_os() {
    case "$(uname -s)" in
        Linux*)  EASYAGENT_OS="linux";;
        Darwin*) EASYAGENT_OS="macos";;
        *)       error "不支持的操作系统: $(uname -s)";;
    esac
    info "检测到操作系统: ${EASYAGENT_OS}"
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64) EASYAGENT_ARCH="x64";;
        aarch64|arm64) EASYAGENT_ARCH="arm64";;
        *)             error "不支持的架构: $(uname -m)";;
    esac
    info "检测到架构: ${EASYAGENT_ARCH}"
}

# --- 依赖检查 ---
check_node() {
    if command -v node &> /dev/null; then
        NODE_VER=$(node -v | sed 's/v//')
        if [ "$(printf '%s\n' "$NODE_MIN_VERSION" "$NODE_VER" | sort -V | head -n1)" != "$NODE_MIN_VERSION" ]; then
            warn "Node.js 版本 ${NODE_VER} < ${NODE_MIN_VERSION}，正在安装最新 LTS..."
            install_node
        else
            success "Node.js ${NODE_VER} ✓"
        fi
    else
        warn "未检测到 Node.js，正在安装..."
        install_node
    fi
}

install_node() {
    if command -v nvm &> /dev/null; then
        info "使用 nvm 安装 Node.js LTS..."
        nvm install --lts
        nvm use --lts
    elif command -v fnm &> /dev/null; then
        info "使用 fnm 安装 Node.js LTS..."
        fnm install --lts
        fnm use lts-latest
    elif command -v brew &> /dev/null; then
        info "使用 Homebrew 安装 Node.js..."
        brew install node@22
    elif [ "$EASYAGENT_OS" = "linux" ]; then
        info "使用 NodeSource 安装 Node.js 22.x..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        error "请手动安装 Node.js >= 18: https://nodejs.org/"
    fi
}

check_pnpm() {
    if ! command -v pnpm &> /dev/null; then
        info "安装 pnpm..."
        npm install -g pnpm@latest
    fi
    success "pnpm $(pnpm -v) ✓"
}

check_git() {
    if ! command -v git &> /dev/null; then
        if [ "$EASYAGENT_OS" = "linux" ]; then
            info "安装 git..."
            sudo apt-get install -y git
        else
            error "请手动安装 git: https://git-scm.com/"
        fi
    fi
    success "git $(git --version | awk '{print $3}') ✓"
}

# --- 依赖安装 ---
install_deps() {
    check_node
    check_pnpm
    check_git

    # 安装系统依赖 (Linux 构建需要)
    if [ "$EASYAGENT_OS" = "linux" ]; then
        info "安装构建依赖..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update -qq
            sudo apt-get install -y -qq python3 make g++ 2>/dev/null || true
        elif command -v yum &> /dev/null; then
            sudo yum install -y python3 make gcc-c++ 2>/dev/null || true
        fi
    fi
}

# --- 核心安装 ---
install_easyagent() {
    info "安装 EasyAgent ${EASYAGENT_VERSION}..."

    # 创建安装目录
    mkdir -p "$EASYAGENT_INSTALL_DIR"

    # 克隆仓库
    if [ -d "$EASYAGENT_INSTALL_DIR/.git" ]; then
        info "更新现有安装..."
        cd "$EASYAGENT_INSTALL_DIR"
        git fetch --tags
        git checkout "$EASYAGENT_VERSION" 2>/dev/null || git checkout main
        git pull origin main
    else
        # 如果目录不为空，先备份
        if [ "$(ls -A "$EASYAGENT_INSTALL_DIR" 2>/dev/null)" ]; then
            warn "安装目录非空，备份到 ${EASYAGENT_INSTALL_DIR}.bak"
            mv "$EASYAGENT_INSTALL_DIR" "${EASYAGENT_INSTALL_DIR}.bak.$(date +%s)"
            mkdir -p "$EASYAGENT_INSTALL_DIR"
        fi
        git clone "$EASYAGENT_REPO" "$EASYAGENT_INSTALL_DIR"
        cd "$EASYAGENT_INSTALL_DIR"
        git checkout "$EASYAGENT_VERSION" 2>/dev/null || true
    fi

    # 安装依赖
    info "安装项目依赖..."
    pnpm install --frozen-lockfile

    # 构建项目
    info "构建 EasyAgent..."
    pnpm build

    # 创建全局命令链接
    create_symlinks

    success "EasyAgent ${EASYAGENT_VERSION} 安装完成!"
}

create_symlinks() {
    local BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"

    # 创建 CLI 启动脚本
    cat > "$BIN_DIR/easyagent-cli" << 'SCRIPT'
#!/usr/bin/env bash
EASYAGENT_DIR="${EASYAGENT_DIR:-$HOME/.easyagent}"
exec node "$EASYAGENT_DIR/packages/cli/dist/main.js" "$@"
SCRIPT
    chmod +x "$BIN_DIR/easyagent-cli"

    # 创建 Server 启动脚本
    cat > "$BIN_DIR/easyagent-server" << 'SCRIPT'
#!/usr/bin/env bash
EASYAGENT_DIR="${EASYAGENT_DIR:-$HOME/.easyagent}"
exec node "$EASYAGENT_DIR/packages/server/dist/index.js" "$@"
SCRIPT
    chmod +x "$BIN_DIR/easyagent-server"

    # 创建 Desktop 启动脚本
    cat > "$BIN_DIR/easyagent-desktop" << 'SCRIPT'
#!/usr/bin/env bash
EASYAGENT_DIR="${EASYAGENT_DIR:-$HOME/.easyagent}"
cd "$EASYAGENT_DIR"
exec npx electron packages/desktop/dist/main.js "$@"
SCRIPT
    chmod +x "$BIN_DIR/easyagent-desktop"

    # 添加到 PATH 提示
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        warn "请将 ${BIN_DIR} 添加到 PATH:"
        echo ""
        echo -e "  ${BOLD}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc${NC}"
        echo -e "  ${BOLD}source ~/.bashrc${NC}"
        echo ""

        # 自动添加 (如果用户同意)
        read -r -p "是否自动添加到 ~/.bashrc? [Y/n] " response
        response=${response:-Y}
        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
            export PATH="$HOME/.local/bin:$PATH"
            success "已添加，运行 source ~/.bashrc 生效"
        fi
    fi
}

# --- DeepSeek 快速配置向导 ---
setup_deepseek() {
    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}${BOLD}║          DeepSeek 快速配置向导                       ║${NC}"
    echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
        echo -e "获取 API Key: ${BLUE}https://platform.deepseek.com/api_keys${NC}"
        echo ""
        read -r -p "请输入 DeepSeek API Key: " api_key

        if [ -n "$api_key" ]; then
            export DEEPSEEK_API_KEY="$api_key"
            echo "export DEEPSEEK_API_KEY=\"$api_key\"" >> "$HOME/.bashrc"
            success "DeepSeek API Key 已配置 (自动添加到 ~/.bashrc)"
        else
            warn "跳过配置 (可稍后设置环境变量 DEEPSEEK_API_KEY)"
        fi
    else
        success "检测到环境变量 DEEPSEEK_API_KEY 已配置 ✓"
    fi

    echo ""
    echo -e "支持的模型:"
    echo -e "  • ${BOLD}deepseek-v4${NC}     - 旗舰模型 (默认)"
    echo -e "  • ${BOLD}deepseek-r1-0528${NC} - 推理增强"
    echo ""
    echo -e "启动命令行: ${BOLD}easyagent-cli${NC}"
    echo -e "启动 Web UI: ${BOLD}easyagent-server${NC} → http://localhost:3000"
    echo ""
}

# --- 验证安装 ---
verify_installation() {
    info "验证安装..."

    # 检查关键文件
    local errors=0

    check_file() {
        if [ -f "$1" ]; then
            success "$2 ✓"
        else
            warn "$2 ✗ (文件不存在: $1)"
            errors=$((errors + 1))
        fi
    }

    check_file "$EASYAGENT_INSTALL_DIR/packages/cli/dist/main.js" "CLI 入口"
    check_file "$EASYAGENT_INSTALL_DIR/packages/server/dist/index.js" "Server 入口"
    check_file "$EASYAGENT_INSTALL_DIR/packages/core/dist/index.js" "Core 模块"
    check_file "$HOME/.local/bin/easyagent-cli" "CLI 全局命令"
    check_file "$HOME/.local/bin/easyagent-server" "Server 全局命令"

    if [ $errors -eq 0 ]; then
        success "所有文件验证通过!"
    else
        warn "发现 ${errors} 个问题，请检查安装日志"
    fi
}

# --- 使用帮助 ---
show_usage() {
    echo "用法: bash install.sh [选项]"
    echo ""
    echo "选项:"
    echo "  --with-deepseek    安装后运行 DeepSeek 配置向导"
    echo "  --version VERSION  指定安装版本 (默认: v0.5.1)"
    echo "  --dir PATH          指定安装目录 (默认: ~/.easyagent)"
    echo "  --skip-build        跳过构建步骤 (仅安装依赖)"
    echo "  --no-verify         跳过安装验证"
    echo "  -h, --help          显示此帮助"
    echo ""
    echo "示例:"
    echo "  curl -fsSL https://.../install.sh | bash -s -- --with-deepseek"
    echo "  bash install.sh --version v0.4.0 --dir /opt/easyagent"
}

# --- 主函数 ---
main() {
    print_banner

    # 解析参数
    WITH_DEEPSEEK=false
    SKIP_BUILD=false
    SKIP_VERIFY=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --with-deepseek) WITH_DEEPSEEK=true; shift;;
            --version)      EASYAGENT_VERSION="$2"; shift 2;;
            --dir)          EASYAGENT_INSTALL_DIR="$2"; shift 2;;
            --skip-build)   SKIP_BUILD=true; shift;;
            --no-verify)   SKIP_VERIFY=true; shift;;
            -h|--help)      show_usage; exit 0;;
            *)              error "未知参数: $1";;
        esac
    done

    # 系统检测与依赖安装
    detect_os
    detect_arch
    install_deps

    # 核心安装
    install_easyagent

    # 验证安装
    if ! $SKIP_VERIFY; then
        verify_installation
    fi

    # DeepSeek 配置
    if $WITH_DEEPSEEK; then
        setup_deepseek
    fi

    # 完成
    echo ""
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║              EasyAgent 安装完成! 🎉                  ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "快速开始:"
    echo -e "  ${BOLD}easyagent-cli${NC}             启动命令行"
    echo -e "  ${BOLD}easyagent-server${NC}          启动 Web UI (http://localhost:3000)"
    echo -e "  ${BOLD}easyagent-desktop${NC}        启动桌面应用"
    echo ""
    echo -e "配置模型:"
    echo -e "  ${BOLD}export DEEPSEEK_API_KEY=\"你的Key\"${NC}"
    echo -e "  ${BOLD}source ~/.bashrc${NC}"
    echo ""

    if ! $WITH_DEEPSEEK; then
        echo -e "${YELLOW}提示: 运行 ${BOLD}bash install.sh --with-deepseek${NC} 快速配置 DeepSeek${NC}"
        echo ""
    fi
}

# 运行主函数
main "$@"
