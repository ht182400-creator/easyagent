/**
 * EasyAgent VS Code 扩展入口
 * 提供 IDE 深度集成：代码分析/解释、状态监控、Dashboard 联动
 */
import * as vscode from 'vscode';
import * as http from 'http';

// ---- 状态管理 ----
let statusBarItem: vscode.StatusBarItem;
let isConnected = false;
let serverVersion = '';

/** EasyAgent 后端基地址 */
function getBaseUrl(): string {
  return (
    vscode.workspace.getConfiguration('easyagent').get<string>('serverUrl') ||
    'http://127.0.0.1:3456'
  );
}

// ---- HTTP 请求封装 ----

/**
 * 向 EasyAgent 后端发送 HTTP 请求
 * @param path - API 路径（如 /api/health）
 * @param method - HTTP 方法
 * @param body - 请求体（POST 时使用）
 * @returns Promise<响应数据>
 */
function apiRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, getBaseUrl());
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          resolve(data as unknown as T);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ---- 连接状态检查 ----

/** 检查 EasyAgent 后端是否在线 */
async function checkConnection(): Promise<boolean> {
  try {
    const health = await apiRequest<{ status: string; version: string }>('/api/health');
    if (health?.status === 'ok') {
      isConnected = true;
      serverVersion = health.version || '';
      return true;
    }
  } catch {
    // 后端不可达
  }
  isConnected = false;
  serverVersion = '';
  return false;
}

// ---- 状态栏 ----

/** 更新状态栏显示 */
function updateStatusBar(): void {
  if (isConnected) {
    statusBarItem.text = `$(debug-start) EasyAgent ${serverVersion ? `v${serverVersion}` : ''}`;
    statusBarItem.tooltip = `EasyAgent 在线 · ${getBaseUrl()} · 点击打开 Dashboard`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = '$(debug-disconnect) EasyAgent';
    statusBarItem.tooltip = `EasyAgent 离线 · ${getBaseUrl()} · 点击重试连接`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  statusBarItem.show();
}

// ---- 代码分析 ----

/** 将选中代码发送给 EasyAgent 分析 */
async function analyzeCode(context: 'selection' | 'file'): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('请先打开一个文件');
    return;
  }

  let code: string;
  let sourceLabel: string;

  if (context === 'selection') {
    if (editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选中代码');
      return;
    }
    code = editor.document.getText(editor.selection);
    sourceLabel = '选中代码';
  } else {
    code = editor.document.getText();
    sourceLabel = editor.document.fileName.split(/[/\\]/).pop() || '当前文件';
  }

  // 截断过长代码
  const maxLen = 8000;
  if (code.length > maxLen) {
    code = code.substring(0, maxLen) + '\n// ... (已截断)';
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `EasyAgent 正在分析 ${sourceLabel}...`,
    },
    async () => {
      try {
        // 通过 chat API 发送分析请求
        const response = await apiRequest<{ content: string }>('/api/chat', 'POST', {
          message: `请分析以下代码，指出潜在问题并提供改进建议：\n\`\`\`\n${code}\n\`\`\``,
        });

        if (response?.content) {
          // 在输出面板显示结果
          showInOutputPanel(sourceLabel, response.content);
        } else {
          vscode.window.showInformationMessage('EasyAgent 分析完成，但未返回内容');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`EasyAgent 分析失败: ${msg}`);
      }
    },
  );
}

/** 解释选中代码 */
async function explainCode(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('请先选中需要解释的代码');
    return;
  }

  const code = editor.document.getText(editor.selection);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'EasyAgent 正在解释代码...' },
    async () => {
      try {
        const response = await apiRequest<{ content: string }>('/api/chat', 'POST', {
          message: `请用中文详细解释以下代码的功能和实现原理：\n\`\`\`\n${code}\n\`\`\``,
        });

        if (response?.content) {
          showInOutputPanel('代码解释', response.content);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`代码解释失败: ${msg}`);
      }
    },
  );
}

/** 在输出面板中显示 EasyAgent 响应 */
function showInOutputPanel(title: string, content: string): void {
  const channel = vscode.window.createOutputChannel('EasyAgent');
  channel.clear();
  channel.appendLine(`━━━ ${title} ━━━`);
  channel.appendLine('');
  channel.appendLine(content);
  channel.appendLine('');
  channel.appendLine('━━━ 分析完成 ━━━');
  channel.show(true);
}

// ---- 扩展激活 ----

/** 插件激活入口 */
export function activate(context: vscode.ExtensionContext): void {
  // 状态栏
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'easyagent.openDashboard';
  context.subscriptions.push(statusBarItem);

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('easyagent.analyzeCode', () => analyzeCode('selection')),
    vscode.commands.registerCommand('easyagent.analyzeFile', () => analyzeCode('file')),
    vscode.commands.registerCommand('easyagent.explainCode', () => explainCode()),
    vscode.commands.registerCommand('easyagent.openDashboard', () => {
      vscode.env.openExternal(vscode.Uri.parse(getBaseUrl()));
    }),
    vscode.commands.registerCommand('easyagent.checkStatus', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '检查 EasyAgent 连接...' },
        async () => {
          const ok = await checkConnection();
          updateStatusBar();
          if (ok) {
            vscode.window.showInformationMessage(
              `✅ EasyAgent v${serverVersion} 在线 · ${getBaseUrl()}`,
            );
          } else {
            vscode.window.showErrorMessage(`❌ EasyAgent 离线 · 请确认后端已启动: ${getBaseUrl()}`);
          }
        },
      );
    }),
  );

  // 延迟检查连接
  if (vscode.workspace.getConfiguration('easyagent').get<boolean>('autoConnect', true)) {
    setTimeout(async () => {
      await checkConnection();
      updateStatusBar();
    }, 2000);
  } else {
    updateStatusBar();
  }
}

/** 插件停用 */
export function deactivate(): void {
  // 清理资源
}
