/**
 * EasyAgent 桌面版 - Electron主进程
 * 管理窗口、原生菜单、系统托盘、自动更新
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentEngine, ToolRegistry, SessionManager, ConfigManager, getAllBuiltinTools, getModelRegistry } from '@easyagent/core';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 读取应用版本号 */
function getAppVersion() {
    try {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '0.0.0';
    }
    catch {
        return '0.2.0';
    }
}
/** 主窗口引用 */
let mainWindow = null;
/** 系统托盘 */
let tray = null;
/** Agent引擎实例 */
let agent = null;
/** 配置管理器 */
let configManager;
/** 工具注册表 */
let toolRegistry;
/** 会话管理器 */
let sessionManager;
/** 更新状态 */
let updateDownloaded = false;
/** 当前版本 */
const APP_VERSION = getAppVersion();
/**
 * 创建主窗口
 */
function createWindow() {
    console.log('[EasyAgent] 正在创建主窗口...');
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'EasyAgent - AI编程助手',
        icon: path.join(__dirname, '../assets/icon.png'),
        frame: true,
        show: true, // 立即显示窗口
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    // 加载 Desktop 原生 UI (renderer)
    const rendererPath = path.join(__dirname, 'renderer/index.html');
    console.log('[EasyAgent] 渲染进程路径:', rendererPath, '存在:', fs.existsSync(rendererPath));
    if (fs.existsSync(rendererPath)) {
        mainWindow.loadFile(rendererPath).catch((err) => {
            console.error('[EasyAgent] 加载渲染进程失败:', err.message);
            // 显示错误页面
            mainWindow?.loadURL(`data:text/html,<html><body style="background:#0F172A;color:#E2E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div><h1>EasyAgent</h1><p>加载UI失败: ${encodeURIComponent(err.message)}</p><p>请确认 dist/renderer/index.html 存在</p></div></body></html>`);
        });
    }
    else {
        // 开发模式: Vite dev server
        console.log('[EasyAgent] 开发模式: 尝试连接 Vite dev server');
        mainWindow.loadURL('http://localhost:5183').catch((err) => {
            console.error('[EasyAgent] Vite dev server 未启动:', err.message);
            mainWindow?.loadURL(`data:text/html,<html><body style="background:#0F172A;color:#E2E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div><h1>EasyAgent</h1><p>开发模式: 请先启动 vite dev server</p><p>npm run dev:renderer</p></div></body></html>`);
        });
    }
    // 打开开发者工具以便调试
    if (process.argv.includes('--devtools') || !fs.existsSync(rendererPath)) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    console.log('[EasyAgent] 主窗口创建完成');
}
/**
 * 创建系统托盘
 */
function createTray() {
    const iconPath = path.join(__dirname, '../assets/tray-icon.png');
    if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        tray = new Tray(icon.resize({ width: 16, height: 16 }));
    }
    else {
        // 使用空图标
        tray = new Tray(nativeImage.createEmpty());
    }
    const contextMenu = Menu.buildFromTemplate([
        { label: '显示窗口', click: () => mainWindow?.show() },
        { label: '隐藏窗口', click: () => mainWindow?.hide() },
        { type: 'separator' },
        { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setToolTip('EasyAgent - AI编程助手');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());
}
/**
 * 创建应用菜单
 */
function createMenu() {
    const template = [
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
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        {
            label: '视图',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
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
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
/**
 * 初始化Agent引擎
 */
async function initAgent() {
    try {
        // 启动时后台更新模型目录
        getModelRegistry().initialize().catch((err) => {
            console.warn('[EasyAgent] 模型目录更新失败:', err.message);
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
            console.log('[EasyAgent] Agent 引擎初始化成功');
        }
        else {
            console.warn('[EasyAgent] 未配置API密钥，Agent引擎未启动 - 请在设置中配置模型');
        }
    }
    catch (error) {
        console.error('[EasyAgent] Agent 引擎初始化失败:', error);
        // 不影响窗口创建，用户可以在设置中手动配置
    }
}
/**
 * 处理新建会话
 */
function handleNewSession() {
    mainWindow?.webContents.send('new-session');
}
/**
 * 处理打开工作区
 */
async function handleOpenWorkspace() {
    if (!mainWindow)
        return;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择工作区目录',
    });
    if (!result.canceled && result.filePaths.length > 0) {
        mainWindow.webContents.send('workspace-changed', result.filePaths[0]);
    }
}
/**
 * 显示关于对话框
 */
function showAboutDialog() {
    dialog.showMessageBox(mainWindow, {
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
// ==================== 自动更新系统 ====================
/** 自动更新模块延迟导入 (可选依赖) */
let autoUpdater = null;
let isUpdateSupported = false;
/**
 * 初始化自动更新
 */
async function initAutoUpdater() {
    try {
        const updater = await import('electron-updater');
        autoUpdater = updater.autoUpdater;
        isUpdateSupported = true;
        // 配置更新源 - GitHub Releases
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'easyagent',
            repo: 'easyagent',
        });
        /** 检查到可用更新 */
        autoUpdater.on('update-available', (info) => {
            mainWindow?.webContents.send('update-status', {
                status: 'available',
                version: info.version,
                releaseDate: info.releaseDate,
                releaseNotes: info.releaseNotes,
            });
        });
        /** 更新下载进度 */
        autoUpdater.on('download-progress', (progress) => {
            mainWindow?.webContents.send('update-status', {
                status: 'downloading',
                percent: progress.percent,
                transferred: progress.transferred,
                total: progress.total,
            });
        });
        /** 更新已下载 */
        autoUpdater.on('update-downloaded', () => {
            updateDownloaded = true;
            mainWindow?.webContents.send('update-status', {
                status: 'downloaded',
            });
            // 非静默更新时弹出通知
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '更新已下载',
                message: '新版本已下载完成，是否立即重启安装？',
                detail: `EasyAgent ${autoUpdater?.currentVersion?.version} → ${APP_VERSION}\n点击"重启"将立即安装更新。`,
                buttons: ['稍后', '重启'],
                defaultId: 1,
            }).then(({ response }) => {
                if (response === 1) {
                    autoUpdater?.quitAndInstall();
                }
            });
        });
        /** 无可用更新 */
        autoUpdater.on('update-not-available', () => {
            mainWindow?.webContents.send('update-status', {
                status: 'not-available',
                currentVersion: APP_VERSION,
            });
        });
        /** 更新错误 */
        autoUpdater.on('error', (err) => {
            console.error('[EasyAgent] 自动更新错误:', err.message);
            mainWindow?.webContents.send('update-status', {
                status: 'error',
                message: err.message,
            });
        });
        // 启动后5秒静默检查更新
        setTimeout(() => {
            autoUpdater?.checkForUpdates().catch((err) => {
                console.log('[EasyAgent] 检查更新失败 (可能是网络问题):', err.message);
            });
        }, 5000);
        console.log('[EasyAgent] 自动更新系统已启用');
    }
    catch {
        // electron-updater 未安装，静默跳过
        console.log('[EasyAgent] 自动更新未启用 (electron-updater 未安装)');
        isUpdateSupported = false;
    }
}
/**
 * 手动检查更新
 */
async function checkForUpdates() {
    if (!isUpdateSupported || !autoUpdater) {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '检查更新',
            message: '自动更新未启用',
            detail: `当前版本: v${APP_VERSION}\n自动更新需要安装 electron-updater 包。\n请前往 GitHub Releases 手动下载最新版本。`,
        });
        // 打开 GitHub releases 页面作为备选
        shell.openExternal('https://github.com/easyagent/easyagent/releases');
        return;
    }
    try {
        await autoUpdater.checkForUpdates();
    }
    catch (err) {
        dialog.showErrorBox('检查更新失败', `无法连接到更新服务器:\n${err.message}`);
    }
}
// ==================== IPC通信处理 ====================
/** 处理Agent对话请求 */
ipcMain.handle('agent-chat', async (_event, message) => {
    if (!agent)
        return { error: 'Agent未初始化' };
    try {
        const response = await agent.run(message, {
            onPartialResponse: (text) => {
                mainWindow?.webContents.send('chat-chunk', text);
            },
        });
        return { content: response };
    }
    catch (error) {
        return { error: error.message };
    }
});
/** 处理模型切换 */
ipcMain.handle('switch-model', async (_event, providerId, modelName) => {
    try {
        const provider = configManager.getProvider(providerId);
        if (!provider)
            throw new Error(`未知提供商: ${providerId}`);
        agent?.switchModel(provider, modelName);
        configManager.switchModel(providerId, modelName);
        await configManager.save();
        return { success: true };
    }
    catch (error) {
        return { error: error.message };
    }
});
/** 获取配置 */
ipcMain.handle('get-config', async () => {
    return configManager.getConfig();
});
/** 获取可用模型(含完整信息: pricing, context, supportsTools等) */
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
/** 中止Agent执行 */
ipcMain.handle('abort-agent', async () => {
    agent?.abort();
    return { success: true };
});
/** 获取应用版本 */
ipcMain.handle('get-app-version', async () => APP_VERSION);
/** 手动检查更新 */
ipcMain.handle('check-update', async () => {
    await checkForUpdates();
});
/** 获取更新状态 */
ipcMain.handle('get-update-status', async () => ({
    isUpdateSupported,
    currentVersion: APP_VERSION,
    updateDownloaded,
}));
// ==================== 应用生命周期 ====================
app.whenReady().then(async () => {
    console.log('[EasyAgent] 应用就绪，正在初始化...');
    await initAgent();
    await initAutoUpdater();
    createMenu();
    createWindow();
    createTray();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
        else {
            mainWindow?.show();
        }
    });
    console.log('[EasyAgent] 应用启动完成');
}).catch((error) => {
    console.error('[EasyAgent] 应用启动失败:', error);
    dialog.showErrorBox('启动失败', `EasyAgent 启动时遇到错误:\n${error.message}`);
    app.quit();
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', () => {
    sessionManager?.close();
});
// 防止多实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
}
else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
}
//# sourceMappingURL=main.js.map