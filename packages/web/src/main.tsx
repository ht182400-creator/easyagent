/**
 * EasyAgent Web - 入口文件
 * 使用统一前端 @easyagent/frontend，通过 ConfigProvider 设为 Web 模式
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ConfigProvider } from '@/config';
import App from '@/App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider config={{ apiBase: '', wsBase: '/ws', isDesktop: false }}>
      <HashRouter>
        <App />
      </HashRouter>
    </ConfigProvider>
  </React.StrictMode>
);
