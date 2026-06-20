import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ChatPage from './pages/Chat';
import Providers from './pages/Providers';
import Sessions from './pages/Sessions';
import Tools from './pages/Tools';
import SettingsPage from './pages/Settings';
import KnowledgeBase from './pages/KnowledgeBase';
import Automation from './pages/Automation';
import TokenUsage from './pages/TokenUsage';
import SkillsPage from './pages/Skills';
import IMSettings from './pages/IMSettings';
import SandboxPage from './pages/Sandbox';
import SemanticPage from './pages/Semantic';
import { useAppStore, initializeTheme } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';

export default function App() {
  const setServerConnected = useAppStore((s) => s.setServerConnected);
  const addNotification = useAppStore((s) => s.addNotification);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  // 初始化主题
  useEffect(() => {
    initializeTheme();
  }, []);

  // 加载持久化设置
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // 检测服务端连接
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/status');
        if (!cancelled) {
          setServerConnected(res.ok);
        }
      } catch (err) {
        if (!cancelled) {
          setServerConnected(false);
        }
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setServerConnected]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/knowledge" element={<KnowledgeBase />} />
        <Route path="/automation" element={<Automation />} />
        <Route path="/token-usage" element={<TokenUsage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/im" element={<IMSettings />} />
        <Route path="/sandbox" element={<SandboxPage />} />
        <Route path="/semantic" element={<SemanticPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
