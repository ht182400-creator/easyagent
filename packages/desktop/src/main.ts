/**
 * EasyAgent Desktop - Electron 主进程
 * 内嵌 Express 后端 + 原生窗口 + 系统托盘 + 自动更新
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain, Notification } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { AgentEngine, ToolRegistry, SessionManager, ConfigManager, AdapterFactory, getAllBuiltinTools, getModelRegistry } from '@easyagent/core';

/** CJS require 桥接 — 用于加载 electron-updater 等 CJS 模块（ESM 动态 import 在 ASAR 内可能失败） */
const _require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==================== 模块级变量 ====================
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agent: AgentEngine | null = null;
let configManager: ConfigManager;
let toolRegistry: ToolRegistry;
let sessionManager: SessionManager;
let backendServer: any = null;

/** 获取应用版本号（构建时由 scripts/sync-version.mjs 同步） */
function getAppVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.3.0';
    }
  } catch (err) { /* ignore */ }
  return '0.3.0';
}

/** 设置版本相关信息到环境变量（供内嵌 Server 使用，避免 ASAR 内读不到文件） */
function setupVersionEnv(): void {
  try {
    // 尝试从 asar 外的 version.json 读取
    const versionPath = path.join(__dirname, '..', '..', 'version.json');
    if (fs.existsSync(versionPath)) {
      const v = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
      if (v.codename) process.env.EASYAGENT_CODENAME = v.codename;
      if (v.releaseDate) process.env.EASYAGENT_RELEASE_DATE = v.releaseDate;
    }
  } catch (err) { /* 读不到就用空值 */ }
  // 确保有默认值
  if (!process.env.EASYAGENT_CODENAME) process.env.EASYAGENT_CODENAME = '';
  if (!process.env.EASYAGENT_RELEASE_DATE) process.env.EASYAGENT_RELEASE_DATE = new Date().toISOString().slice(0, 10);
}
const APP_VERSION = getAppVersion();

/** 设置版本相关环境变量，确保内嵌 Server 读取正确 */
process.env.EASYAGENT_VERSION = APP_VERSION;
setupVersionEnv();

// ==================== 内嵌后端服务器 ====================

/** API 服务器端口 */
const API_PORT = 3456;

/**
 * 启动内嵌 Express 后端服务
 * 调用 @easyagent/server 的 createApp() 获取服务对象，然后手动监听端口
 */
async function startBackendServer(): Promise<void> {
  console.log('[EasyAgent Desktop] [DEBUG] startBackendServer called');
  try {
    // 动态导入 server 包（避免 Electron 启动时的循环依赖）
    console.log('[EasyAgent Desktop] [DEBUG] importing @easyagent/server...');
    const { createApp } = await import('@easyagent/server');
    console.log('[EasyAgent Desktop] [DEBUG] @easyagent/server imported, createApp type:', typeof createApp);

    if (typeof createApp !== 'function') {
      throw new Error('server 包未导出 createApp 函数');
    }

    // createApp 返回 { app, server: httpServer, wss, ... }，但不启动监听
    // 显式传入 projectRoot 为用户 home 目录，避免 asar 内只读路径问题
    console.log('[EasyAgent Desktop] [DEBUG] calling createApp() with projectRoot:', homedir());
    const appContext = await createApp({ projectRoot: homedir() });
    console.log('[EasyAgent Desktop] [DEBUG] createApp() returned, has server:', !!appContext.server);
    backendServer = appContext.server;

    // 手动启动 HTTP 服务器监听（Promise 化，确保后端就绪后才返回）
    await new Promise<void>((resolve, reject) => {
      backendServer.listen(API_PORT, '127.0.0.1', () => {
        console.log(`[EasyAgent Desktop] 内嵌后端已启动: http://localhost:${API_PORT}`);
        console.log(`[EasyAgent Desktop] WebSocket 端点: ws://localhost:${API_PORT}/ws`);
        resolve();
      });
      backendServer.on('error', (err: Error) => {
        console.error('[EasyAgent Desktop] 后端服务运行时错误:', err.message);
        reject(err);
      });
    });
  } catch (error: any) {
    const errMsg = `[EasyAgent Desktop] 后端启动失败: ${error.message}`;
    const errStack = `[EasyAgent Desktop] 错误堆栈: ${error.stack}`;
    console.error(errMsg);
    console.error(errStack);
    console.error('[EasyAgent Desktop] 请确认 @easyagent/server 包已构建: pnpm --filter @easyagent/server build');
    console.error('[EasyAgent Desktop] 应用将以离线模式运行');
    // 写入错误日志到用户目录方便调试
    try {
      const os = await import('node:os');
      const logDir = path.join(os.homedir(), '.easyagent', 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, 'startup-error.log');
      fs.writeFileSync(logFile, `Time: ${new Date().toISOString()}\n${errMsg}\n${errStack}\n`);
      console.error('[EasyAgent Desktop] 详细错误已写入:', logFile);
    } catch (logErr: any) {
      console.error('[EasyAgent Desktop] 日志写入失败:', logErr.message);
    }
  }
}

/** 停止后端服务 */
function stopBackendServer(): void {
  if (backendServer) {
    try {
      backendServer.close?.();
      console.log('[EasyAgent Desktop] 后端服务已停止');
    } catch (e) {
      console.error('[EasyAgent Desktop] 停止后端服务时出错:', e);
    }
  }
}

// ==================== 窗口管理 ====================

/** 创建主窗口 */
function createWindow(): void {
  console.log('[EasyAgent Desktop] 正在创建主窗口...');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: 'EasyAgent - AI编程助手',
    icon: path.join(__dirname, '../assets/icon.png'),
    frame: true,
    show: true,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 加载渲染进程
  const rendererPath = path.join(__dirname, 'renderer/index.html');

  if (fs.existsSync(rendererPath)) {
    console.log('[EasyAgent Desktop] 生产模式: 加载 dist/renderer/index.html');
    mainWindow.loadFile(rendererPath).catch((err: Error) => {
      console.error('[EasyAgent Desktop] 加载渲染进程失败:', err.message);
      showErrorPage(err.message);
    });
  } else {
    // 开发模式: 连接 Vite dev server
    console.log('[EasyAgent Desktop] 开发模式: 连接 Vite dev server http://localhost:5183');
    mainWindow.loadURL('http://localhost:5183').catch((err: Error) => {
      console.error('[EasyAgent Desktop] Vite dev server 未启动:', err.message);
      showErrorPage('开发模式: 请先启动 npm run dev:renderer');
    });
  }

  // 开发工具
  if (process.argv.includes('--devtools') || !fs.existsSync(rendererPath)) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log('[EasyAgent Desktop] 主窗口创建完成');
}

/** 显示错误页面 */
function showErrorPage(message: string): void {
  const encoded = encodeURIComponent(message);
  mainWindow?.loadURL(`data:text/html,
    <html>
      <body style="background:#09090b;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;max-width:500px">
          <h1 style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:28px;margin-bottom:16px">EasyAgent</h1>
          <p style="color:#94a3b8;line-height:1.6">${encoded}</p>
        </div>
      </body>
    </html>
  `);
}

// ==================== 系统托盘 ====================

function createTray(): void {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  if (fs.existsSync(iconPath)) {
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } else {
    tray = new Tray(nativeImage.createEmpty());
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow?.show() },
    { label: '隐藏窗口', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: '退出', click: () => { (app as any).isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('EasyAgent - AI编程助手');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

// ==================== 应用菜单 ====================

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建会话', accelerator: 'CmdOrCtrl+N', click: () => handleNewSession() },
        { label: '打开工作区...', accelerator: 'CmdOrCtrl+O', click: () => handleOpenWorkspace() },
        { type: 'separator' },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('navigate', '/settings') },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 EasyAgent', click: () => showAboutDialog() },
        { label: '检查更新', click: () => checkForUpdates() },
        { label: '文档', click: () => shell.openExternal('https://easyagent.dev/docs') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ==================== Agent 引擎 ====================

async function initAgent(): Promise<void> {
  try {
    // 后台更新模型目录
    getModelRegistry().initialize().catch((err: Error) => {
      console.warn('[EasyAgent Desktop] 模型目录更新失败:', err.message);
    });

    configManager = new ConfigManager();
    const config = await configManager.load();

    toolRegistry = new ToolRegistry();
    toolRegistry.registerAll(getAllBuiltinTools());

    sessionManager = new SessionManager();

    const provider = configManager.getCurrentProvider();
    if (provider) {
      agent = new AgentEngine(provider, toolRegistry, sessionManager, {
        provider: config.currentModel.provider,
        model: config.currentModel.model,
        maxTurns: config.agent.maxTurns,
        temperature: config.agent.temperature,
      });

      agent.onEvent(event => {
        mainWindow?.webContents.send('agent-event', event);
      });

      console.log('[EasyAgent Desktop] Agent 引擎初始化成功');
    } else {
      console.warn('[EasyAgent Desktop] 未配置API密钥，Agent引擎未启动 - 请在设置中配置模型');
    }
  } catch (error) {
    console.error('[EasyAgent Desktop] Agent 引擎初始化失败:', error);
  }
}

// ==================== 菜单操作 ====================

function handleNewSession(): void {
  mainWindow?.webContents.send('new-session');
}

async function handleOpenWorkspace(): Promise<void> {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择工作区目录',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    mainWindow.webContents.send('workspace-changed', result.filePaths[0]);
  }
}

function showAboutDialog(): void {
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: '关于 EasyAgent',
    message: `EasyAgent v${APP_VERSION}`,
    detail: 'AI编程助手 - 集成中国主流大模型\n\n'
      + '支持 DeepSeek · 通义千问 · 智谱GLM · Kimi\n'
      + '文心一言 · 豆包 · 混元 · MiniMax · Ollama\n\n'
      + `Electron: ${process.versions.electron} | Node: ${process.versions.node}\n`
      + `平台: ${process.platform}-${process.arch}\n\n`
      + '© 2026 EasyAgent Team',
  });
}

// ==================== 自动更新 ====================

let autoUpdater: typeof import('electron-updater').autoUpdater | null = null;
let isUpdateSupported = false;

/**
 * 更新状态机 — 全场景状态定义
 *
 * idle        → 无更新活动 / 无可用更新
 * checking    → 正在检查更新（防重复检查）
 * available   → 发现新版本，即将/正在准备下载
 * downloading → 正在下载（progress 可供读取）
 * downloaded  → 下载完成，等待用户确认安装
 * error       → 检查或下载失败（含错误信息）
 * installing  → 正在执行 quitAndInstall（即刻退出，前端无须处理）
 */
type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'installing';

/** 当前更新状态（供 Settings 页面查询 — 解决页面挂载滞后错过事件的问题） */
let lastUpdateStatus: UpdateStatus = 'idle';
let lastUpdateInfo: { version?: string; releaseDate?: string; error?: string; percent?: number } = {};

async function initAutoUpdater(): Promise<void> {
  try {
    // [v0.5.28 修复] 使用 createRequire 加载 CJS 的 electron-updater
    // ESM 的 await import() 在 ASAR 内可能无法正确解析 CJS 模块
    const updater = _require('electron-updater');
    autoUpdater = updater.autoUpdater;
    isUpdateSupported = true;

    // [v0.5.26 彻底修复] 3 大改动:
    // 1) autoDownload=false — 全显式管理，不依赖 electron-updater 自动行为
    // 2) 代码路径直接设 lastUpdateStatus — 不再依赖事件回调，（事件可能延迟触发导致竞态）
    // 3) 密集日志 + 时间戳 — 每个决策点可追踪
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    /**
     * 带时间戳的更新日志
     */
    const updLog = (...args: unknown[]) => {
      const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
      console.log(`[Upd ${ts}]`, ...args);
    };

    updLog('init: autoDownload=', autoUpdater.autoDownload, ' autoInstallOnAppQuit=', autoUpdater.autoInstallOnAppQuit);

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'ht182400-creator',
      repo: 'easyagent',
    });

    // ── 事件监听 (仅负责推送前端 + 辅助日志，不驱动主状态机) ──

    autoUpdater.on('update-available', (info) => {
      updLog('[EVENT] update-available version=', info.version, ' 当前 lastUpdateStatus=', lastUpdateStatus);
      // 事件回调中设置状态（可能在代码路径之后异步到达）
      lastUpdateStatus = 'available';
      lastUpdateInfo = { version: info.version, releaseDate: info.releaseDate };
      mainWindow?.webContents.send('update-status', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      updLog(`[EVENT] download-progress ${progress.percent.toFixed(1)}% speed=${((progress.bytesPerSecond || 0) / 1024 / 1024).toFixed(2)}MB/s transferred=${((progress.transferred || 0) / 1024 / 1024).toFixed(1)}MB total=${((progress.total || 0) / 1024 / 1024).toFixed(1)}MB`);
      if (lastUpdateStatus !== 'downloading') {
        updLog(`  → 状态切换: ${lastUpdateStatus} → downloading`);
      }
      lastUpdateStatus = 'downloading';
      if (lastUpdateInfo) lastUpdateInfo.percent = progress.percent;
      mainWindow?.webContents.send('update-status', {
        status: 'downloading',
        percent: progress.percent,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      updLog('[EVENT] update-downloaded version=', info.version, ' files=', JSON.stringify(info.downloadedFile));
      lastUpdateStatus = 'downloaded';
      lastUpdateInfo = { version: info.version };
      mainWindow?.webContents.send('update-status', { status: 'downloaded', version: info.version });
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: '更新已下载',
        message: `新版本 v${info.version} 已下载完成，是否立即重启安装？`,
        buttons: ['稍后提醒', '立即重启'],
        defaultId: 1,
      }).then(({ response }) => {
        if (response === 1) {
          updLog('用户选择立即重启，quitAndInstall()...');
          lastUpdateStatus = 'installing';
          autoUpdater?.quitAndInstall();
        } else {
          updLog('用户选择稍后，状态保持 downloaded');
        }
      });
    });

    autoUpdater.on('error', (err) => {
      updLog('[EVENT] error message=', err.message, ' stack=', (err as any).stack?.slice(0, 200));
      lastUpdateStatus = 'error';
      lastUpdateInfo = { ...lastUpdateInfo, error: err.message };
      mainWindow?.webContents.send('update-status', {
        status: 'error',
        message: err.message,
      });
    });

    // [v0.5.26 关键修复] 下载过程中可能抛的其他事件
    autoUpdater.on('checking-for-update', () => {
      updLog('[EVENT] checking-for-update');
    });
    autoUpdater.on('update-not-available', (info) => {
      updLog('[EVENT] update-not-available version=', info?.version);
    });

    // 启动后 10 秒自动检查更新并下载
    setTimeout(async () => {
      updLog('[AUTO] ===== 自动检查开始 ===== autoDownload=', autoUpdater?.autoDownload);
      lastUpdateStatus = 'checking';
      try {
        const result = await autoUpdater!.checkForUpdates();
        updLog('[AUTO] checkForUpdates 返回: hasUpdate=', !!result?.updateInfo,
          ' version=', result?.updateInfo?.version || 'N/A',
          ' lastUpdateStatus=', lastUpdateStatus,
          ' cancellationToken=', !!result?.cancellationToken);

        // [v0.5.26 关键修复] 不依赖事件回调的 lastUpdateStatus
        // checkForUpdates 后直接设状态为 available，再调用 downloadUpdate
        if (result?.updateInfo) {
          updLog('[AUTO] 发现更新 → 强制设状态为 available (防御竞态)');
          lastUpdateStatus = 'available';
          lastUpdateInfo = { version: result.updateInfo.version, releaseDate: result.updateInfo.releaseDate };

          updLog('[AUTO] 调用 downloadUpdate()...');
          try {
            await autoUpdater!.downloadUpdate();
            updLog('[AUTO] downloadUpdate() resolve lastUpdateStatus=', lastUpdateStatus);
            // downloadUpdate 完成后可能事件还未到达，强制设下载完成
            if (lastUpdateStatus !== 'downloaded') {
              updLog('[AUTO] ⚠️ downloadUpdate 完成但 lastUpdateStatus!=downloaded, 强制设为 downloaded');
              lastUpdateStatus = 'downloaded';
              mainWindow?.webContents.send('update-status', {
                status: 'downloaded',
                version: result.updateInfo.version,
              });
            }
          } catch (downloadErr) {
            const dErrMsg = (downloadErr as Error).message;
            updLog('[AUTO] downloadUpdate() REJECTED:', dErrMsg);
            if (dErrMsg.includes('already')) {
              updLog('[AUTO] 下载已在其他路径进行中，忽略');
            } else {
              lastUpdateStatus = 'error';
              lastUpdateInfo = { ...lastUpdateInfo, error: dErrMsg };
              mainWindow?.webContents.send('update-status', { status: 'error', message: dErrMsg });
            }
          }
        } else {
          updLog('[AUTO] 无可用更新 → idle');
          lastUpdateStatus = 'idle';
        }
      } catch (err) {
        const errMsg = (err as Error).message;
        updLog('[AUTO] checkForUpdates REJECTED:', errMsg);
        if (errMsg.includes('up to date') || errMsg.includes('no update available')) {
          lastUpdateStatus = 'idle';
        } else {
          lastUpdateStatus = 'error';
          lastUpdateInfo = { ...lastUpdateInfo, error: errMsg };
          mainWindow?.webContents.send('update-status', { status: 'error', message: errMsg });
        }
      }
      updLog('[AUTO] ===== 自动检查结束 lastUpdateStatus=', lastUpdateStatus, ' =====');
    }, 10000);

    console.log('[EasyAgent Desktop] 自动更新系统已启用');
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err);
    console.error(`[EasyAgent Desktop] 自动更新初始化失败: ${errMsg}`);
    isUpdateSupported = false;
  }
}

/**
 * 菜单"检查更新"点击 — 直接跳转到设置页面的更新区域
 * （实际更新逻辑由 Settings 页面通过 IPC 驱动）
 */
async function checkForUpdates(): Promise<void> {
  if (!isUpdateSupported || !autoUpdater) {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '检查更新',
      message: '自动更新未启用',
      detail: `当前版本: v${APP_VERSION}\n请前往 GitHub Releases 手动下载。`,
    });
    shell.openExternal('https://github.com/ht182400-creator/easyagent/releases');
    return;
  }
  // 导航到设置页面（触发页面上的更新检查逻辑）
  mainWindow?.webContents.send('navigate', '/settings');
}

// ==================== IPC 通信 ====================

ipcMain.handle('agent-chat', async (_event, message: string) => {
  if (!agent) return { error: 'Agent未初始化，请在设置中配置模型' };
  try {
    const response = await agent.run(message, {
      onPartialResponse: (text) => {
        mainWindow?.webContents.send('chat-chunk', text);
      },
    });
    return { content: response };
  } catch (error) {
    return { error: (error as Error).message };
  }
});

ipcMain.handle('switch-model', async (_event, providerId: string, modelName: string) => {
  try {
    const provider = configManager.getProvider(providerId);
    if (!provider) throw new Error(`未知提供商: ${providerId}`);
    agent?.switchModel(provider, modelName);
    configManager.switchModel(providerId, modelName);
    await configManager.save();
    return { success: true };
  } catch (error) {
    return { error: (error as Error).message };
  }
});

ipcMain.handle('get-config', async () => configManager.getConfig());

ipcMain.handle('get-models', async () => {
  const config = configManager.getConfig();
  return config.providers.map(p => ({
    provider: p.id,
    name: p.name,
    defaultModel: p.defaultModel,
    models: p.models.map(m => ({
      id: m.id,
      name: m.name,
      maxContextTokens: m.maxContextTokens,
      maxOutputTokens: m.maxOutputTokens,
      supportsTools: m.supportsTools,
      supportsVision: m.supportsVision,
      pricing: m.pricing,
    })),
  }));
});

ipcMain.handle('abort-agent', async () => {
  agent?.abort();
  return { success: true };
});

ipcMain.handle('get-app-version', async () => APP_VERSION);

/**
 * 手动检查更新 (v0.5.26 彻底修复)
 *
 * 核心改动:
 *   1. 每个 await 后直接设 lastUpdateStatus，不依赖事件回调
 *   2. 密集日志 + 毫秒时间戳
 *   3. 竞态防御: 每次决策前重新读取 lastUpdateStatus
 *
 * 状态机:
 *   downloaded  → 返回已下载
 *   checking    → 返回正在检查（防重复点击）
 *   downloading → 返回进度
 *   available   → 调用 downloadUpdate()
 *   idle/error  → checkForUpdates + downloadUpdate
 */
ipcMain.handle('check-update', async () => {
  const updLog = (...args: unknown[]) => {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[Upd ${ts}] [IPC]`, ...args);
  };

  updLog('========== IPC check-update 被调用 ==========');
  updLog('入口 lastUpdateStatus=', lastUpdateStatus, ' lastUpdateInfo=', JSON.stringify(lastUpdateInfo));

  if (!isUpdateSupported || !autoUpdater) {
    updLog('自动更新未启用');
    return { success: false, error: '自动更新未启用' };
  }

  // ── 已下载完成 ──
  if (lastUpdateStatus === 'downloaded') {
    updLog('已下载完成，直接返回');
    mainWindow?.webContents.send('update-status', {
      status: 'downloaded',
      version: lastUpdateInfo?.version,
    });
    return { success: true, status: 'downloaded', version: lastUpdateInfo?.version, lastUpdateInfo };
  }

  // ── 正在检查中 ──
  if (lastUpdateStatus === 'checking') {
    updLog('正在检查中，防重复点击');
    return { success: true, status: 'checking', message: '正在检查更新，请稍候...' };
  }

  // ── 正在下载中 ──
  if (lastUpdateStatus === 'downloading') {
    updLog('正在下载中 (进度:', lastUpdateInfo?.percent ?? 'N/A', '%)');
    mainWindow?.webContents.send('update-status', {
      status: 'downloading',
      percent: lastUpdateInfo?.percent ?? 0,
    });
    return { success: true, status: 'downloading', version: lastUpdateInfo?.version, lastUpdateInfo };
  }

  // ── 发现更新但未下载 → 显式触发下载 ──
  if (lastUpdateStatus === 'available') {
    updLog('已发现更新但未下载 → 调用 downloadUpdate()');
    try {
      await autoUpdater.downloadUpdate();
      updLog('downloadUpdate() resolve lastUpdateStatus=', lastUpdateStatus);
      // 防御：如果事件未设 downloaded，强制设
      if (lastUpdateStatus !== 'downloaded') {
        updLog('⚠️ downloadUpdate 完成但 lastUpdateStatus!=downloaded, 强制设为 downloaded');
        lastUpdateStatus = 'downloaded';
        mainWindow?.webContents.send('update-status', {
          status: 'downloaded',
          version: lastUpdateInfo?.version,
        });
      }
    } catch (e) {
      updLog('downloadUpdate() REJECTED:', (e as Error).message);
      return { success: false, error: `下载失败: ${(e as Error).message}` };
    }
    return {
      success: true,
      status: lastUpdateStatus,
      version: lastUpdateInfo?.version,
      lastUpdateInfo,
    };
  }

  // ── idle / error / installing → 完整检查+下载 ──
  updLog('开始完整检查流程 currentStatus=', lastUpdateStatus);

  try {
    lastUpdateStatus = 'checking';
    mainWindow?.webContents.send('update-status', { status: 'checking' });

    updLog('调用 checkForUpdates()...');
    const checkResult = await autoUpdater.checkForUpdates();
    updLog('checkForUpdates() resolve hasUpdate=', !!checkResult?.updateInfo,
      ' version=', checkResult?.updateInfo?.version || 'N/A',
      ' lastUpdateStatus=', lastUpdateStatus);

    if (!checkResult || !checkResult.updateInfo) {
      updLog('无可用更新 → idle');
      lastUpdateStatus = 'idle';
      mainWindow?.webContents.send('update-status', { status: 'idle' });
      return { success: true, status: 'idle' };
    }

    const newVersion = checkResult.updateInfo.version;
    updLog('发现新版本:', newVersion, ' lastUpdateStatus=', lastUpdateStatus);

    // [v0.5.26 关键修复] 强制设为 available（不依赖事件回调）
    updLog('强制设 lastUpdateStatus=available（防御竞态）');
    lastUpdateStatus = 'available';
    lastUpdateInfo = { version: newVersion, releaseDate: checkResult.updateInfo.releaseDate };
    mainWindow?.webContents.send('update-status', {
      status: 'available',
      version: newVersion,
    });

    // 显式下载
    updLog('调用 downloadUpdate()...');
    try {
      await autoUpdater.downloadUpdate();
      updLog('downloadUpdate() resolve lastUpdateStatus=', lastUpdateStatus);
      // 防御
      if (lastUpdateStatus !== 'downloaded') {
        updLog('⚠️ downloadUpdate 完成但状态!==downloaded, 强制设 downloaded');
        lastUpdateStatus = 'downloaded';
        mainWindow?.webContents.send('update-status', {
          status: 'downloaded',
          version: newVersion,
        });
      }
    } catch (downloadErr) {
      const dErrMsg = (downloadErr as Error).message;
      updLog('downloadUpdate() REJECTED:', dErrMsg);
      if (dErrMsg.includes('already')) {
        updLog('下载已在其他路径进行中');
      } else {
        lastUpdateStatus = 'error';
        lastUpdateInfo = { ...lastUpdateInfo, error: dErrMsg };
        mainWindow?.webContents.send('update-status', { status: 'error', message: dErrMsg });
        return { success: false, error: dErrMsg };
      }
    }

    updLog('IPC check-update 返回: status=', lastUpdateStatus);
    return {
      success: true,
      status: lastUpdateStatus,
      version: newVersion,
      lastUpdateInfo,
    };
  } catch (err) {
    const errMsg = (err as Error).message;
    updLog('checkForUpdates REJECTED:', errMsg);

    if (errMsg.includes('up to date') || errMsg.includes('no update available')) {
      lastUpdateStatus = 'idle';
      mainWindow?.webContents.send('update-status', { status: 'idle' });
      return { success: true, status: 'idle', lastUpdateInfo };
    }

    lastUpdateStatus = 'error';
    lastUpdateInfo = { ...lastUpdateInfo, error: errMsg };
    mainWindow?.webContents.send('update-status', { status: 'error', message: errMsg });
    return { success: false, error: errMsg };
  }
});

/**
 * 用户确认安装更新
 * 仅在 downloaded 状态下可用，其他状态返回错误
 */
ipcMain.handle('install-update', async () => {
  if (!isUpdateSupported || !autoUpdater) {
    return { success: false, error: '自动更新未启用' };
  }
  if (lastUpdateStatus !== 'downloaded') {
    return { success: false, error: '没有可安装的更新' };
  }
  console.log('[EasyAgent Desktop] 用户确认安装更新 v' + lastUpdateInfo?.version);
  lastUpdateStatus = 'installing';
  autoUpdater.quitAndInstall();
  // quitAndInstall 会立即退出应用，以下代码大概率不会执行
  return { success: true, status: 'installing' };
});

ipcMain.handle('get-update-status', async () => ({
  isUpdateSupported,
  currentVersion: APP_VERSION,
  lastUpdateStatus,
  lastUpdateInfo,
}));

/**
 * 模拟更新进度（开发测试用，发送假事件验证 UI 逻辑）
 * 支持参数: { scenario?: 'success' | 'error' | 'check-only', version?: string }
 */
let simulateTimer: NodeJS.Timeout | null = null;
ipcMain.handle('simulate-update', async (_event, params?: { scenario?: string; version?: string }) => {
  let percent = 0;
  const version = params?.version || '9.9.9-test';
  const scenario = params?.scenario || 'success';

  // 清除之前的模拟
  if (simulateTimer) clearInterval(simulateTimer);

  // 重置状态便于测试
  lastUpdateStatus = 'checking';
  lastUpdateInfo = {};

  console.log('[Simulate] 开始模拟更新流程... scenario:', scenario);

  // 1. 发现新版本
  mainWindow?.webContents.send('update-status', { status: 'available', version });
  lastUpdateStatus = 'available';
  lastUpdateInfo = { version };
  console.log('[Simulate] -> available', version);

  await new Promise(r => setTimeout(r, 1500));

  if (scenario === 'check-only') {
    // 仅检查场景：直接结束
    lastUpdateStatus = 'downloaded';
    lastUpdateInfo = { version };
    mainWindow?.webContents.send('update-status', { status: 'downloaded', version });
    return { success: true, message: '模拟检查完成 (仅检查)' };
  }

  // 2. 模拟下载进度
  const totalSize = 50 * 1024 * 1024;
  simulateTimer = setInterval(() => {
    percent = Math.min(100, percent + (Math.random() * 15 + 5));
    lastUpdateStatus = 'downloading';
    lastUpdateInfo = { ...lastUpdateInfo, percent: Math.round(percent * 10) / 10 };
    mainWindow?.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(percent * 10) / 10,
      transferred: Math.round((percent / 100) * totalSize),
      total: totalSize,
    });
    console.log(`[Simulate] downloading ${percent.toFixed(1)}%`);

    if (percent >= 100) {
      clearInterval(simulateTimer!);
      simulateTimer = null;

      if (scenario === 'error') {
        // 模拟下载失败
        setTimeout(() => {
          const errMsg = '模拟网络错误: 下载中断 (ETIMEDOUT)';
          lastUpdateStatus = 'error';
          lastUpdateInfo = { ...lastUpdateInfo, error: errMsg };
          mainWindow?.webContents.send('update-status', { status: 'error', message: errMsg });
          console.log('[Simulate] -> error', errMsg);
        }, 500);
      } else {
        // 模拟成功
        setTimeout(() => {
          lastUpdateStatus = 'downloaded';
          lastUpdateInfo = { version };
          mainWindow?.webContents.send('update-status', { status: 'downloaded', version });
          console.log('[Simulate] -> downloaded', version);
        }, 500);
      }
    }
  }, 300);

  return { success: true, message: `模拟更新已开始 (scenario: ${scenario})` };
});

/** 获取后端 API 端口 (供渲染进程查询) */
ipcMain.handle('get-api-port', async () => API_PORT);

/** 打开文件选择对话框 */
ipcMain.handle('open-file-dialog', async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters,
  });
});

/** 打开目录选择对话框 */
ipcMain.handle('open-directory-dialog', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择目录',
  });
});

/** 在系统文件管理器中显示文件 */
ipcMain.handle('show-item-in-folder', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

/** 用系统默认应用打开 URL */
ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
});

// ==================== 应用生命周期 ====================

app.whenReady().then(async () => {
  console.log('[EasyAgent Desktop] ========================================');
  console.log(`[EasyAgent Desktop]  EasyAgent v${APP_VERSION} 启动中...`);
  console.log('[EasyAgent Desktop] ========================================');

  // 1. 启动内嵌后端服务
  await startBackendServer();

  // 2. 初始化 Agent 引擎
  await initAgent();

  // 3. 初始化自动更新
  await initAutoUpdater();

  // 4. 创建 UI
  createMenu();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });

  console.log('[EasyAgent Desktop] 应用启动完成');
}).catch((error) => {
  console.error('[EasyAgent Desktop] 应用启动失败:', error);
  dialog.showErrorBox('启动失败', `EasyAgent 启动时遇到错误:\n${error.message}`);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackendServer();
  sessionManager?.close();
});

// 防止多实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
