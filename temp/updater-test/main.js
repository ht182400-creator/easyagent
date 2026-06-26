/**
 * 最小化 auto-updater 进度 UI 测试工具
 * 模拟 electron-updater 的所有下载事件，验证前端 UI 逻辑
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let simulateTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 启动后 5 秒自动模拟更新 → 测试 "延迟挂载" 场景
  setTimeout(() => {
    console.log('[Test] 自动模拟更新（模拟 10 秒后后台触发）...');
    runSimulation();
  }, 5000);
}

/** 模拟完整更新流程 */
function runSimulation() {
  if (simulateTimer) clearInterval(simulateTimer);

  const version = '9.9.9';

  // 1. 发现新版本
  mainWindow?.webContents.send('update-status', { status: 'available', version });
  console.log('[Test] → available v' + version);

  // 2. 模拟下载进度
  let percent = 0;
  simulateTimer = setInterval(() => {
    percent = Math.min(100, percent + (Math.random() * 12 + 3));
    mainWindow?.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(percent * 10) / 10,
    });

    if (percent >= 100) {
      clearInterval(simulateTimer);
      simulateTimer = null;
      setTimeout(() => {
        mainWindow?.webContents.send('update-status', { status: 'downloaded', version });
        console.log('[Test] → downloaded v' + version);
      }, 600);
    }
  }, 250);
}

// ==================== IPC Handlers ====================

ipcMain.handle('get-update-status', () => ({
  isUpdateSupported: true,
  currentVersion: '0.5.15',
  updateDownloaded: false,
  lastUpdateStatus: 'idle',
  lastUpdateInfo: {},
}));

ipcMain.handle('simulate-update', () => {
  runSimulation();
  return { success: true };
});

ipcMain.handle('get-api-port', () => 3456);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (simulateTimer) clearInterval(simulateTimer);
  app.quit();
});
