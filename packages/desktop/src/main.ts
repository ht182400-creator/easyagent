/**
 * EasyAgent Desktop - Electron 主进程
 * 内嵌 Express 后端 + 原生窗口 + 系统托盘 + 自动更新
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain, Notification } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { AgentEngine, ToolRegistry, SessionManager, ConfigManager, AdapterFactory, getAllBuiltinTools, getModelRegistry } from '@easyagent/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==================== 模块级变量 ====================
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agent: AgentEngine | null = null;
let configManager: ConfigManager;
let toolRegistry: ToolRegistry;
let sessionManager: SessionManager;
let updateDownloaded = false;
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
const APP_VERSION = getAppVersion();

/** 设置 EASYAGENT_VERSION 环境变量，确保内嵌 Server 的版本号正确 */
process.env.EASYAGENT_VERSION = APP_VERSION;

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
      preload: path.join(__dirname, 'preload.js'),
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

async function initAutoUpdater(): Promise<void> {
  try {
    const updater = await import('electron-updater');
    autoUpdater = updater.autoUpdater;
    isUpdateSupported = true;

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'ht182400-creator',
      repo: 'easyagent',
    });

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-status', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update-status', {
        status: 'downloading',
        percent: progress.percent,
      });
    });

    autoUpdater.on('update-downloaded', () => {
      updateDownloaded = true;
      mainWindow?.webContents.send('update-status', { status: 'downloaded' });
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: '更新已下载',
        message: '新版本已下载完成，是否立即重启安装？',
        buttons: ['稍后', '重启'],
        defaultId: 1,
      }).then(({ response }) => {
        if (response === 1) autoUpdater?.quitAndInstall();
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('[EasyAgent Desktop] 自动更新错误:', err.message);
    });

    // 启动后 10 秒自动检查更新并下载
    setTimeout(() => {
      autoUpdater?.checkForUpdatesAndNotify().catch((err) => {
        console.log('[EasyAgent Desktop] 检查更新跳过:', err.message);
      });
    }, 10000);

    console.log('[EasyAgent Desktop] 自动更新系统已启用');
  } catch (err) {
    console.log('[EasyAgent Desktop] 自动更新未启用 (electron-updater 未安装)');
    isUpdateSupported = false;
  }
}

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
  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    dialog.showErrorBox('检查更新失败', `无法连接更新服务器:\n${(err as Error).message}`);
  }
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

ipcMain.handle('check-update', async () => {
  await checkForUpdates();
});

ipcMain.handle('get-update-status', async () => ({
  isUpdateSupported,
  currentVersion: APP_VERSION,
  updateDownloaded,
}));

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
