/**
 * EasyAgent 统一前端 - 入口文件
 * Web/Desktop 各自包裹自己的 ConfigProvider
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ConfigProvider } from './config';
import './styles/index.css';

/**
 * 初始化前端应用
 *
 * @param config - 运行时配置（apiBase / wsBase / isDesktop）
 * @param useHashRouter - 是否使用 HashRouter（桌面版需要，避免 Electron file:// 协议路由问题）
 * @param containerId - 挂载容器 ID
 */
export function mountApp(
  config: { apiBase?: string; wsBase?: string; isDesktop?: boolean } = {},
  useHashRouter = false,
  containerId = 'root'
): void {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`找不到挂载容器 #${containerId}`);
  }

  const Router = useHashRouter ? HashRouter : HashRouter; // 统一使用 HashRouter（兼容性最好）

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ConfigProvider config={config}>
        <Router>
          <App />
        </Router>
      </ConfigProvider>
    </React.StrictMode>
  );
}
