import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Trash2, Archive, Search, Clock, MessageSquare, Eye } from 'lucide-react';
import { getApiBase } from '../request';

interface Session {
  id: string;
  workspace: string;
  metadata: {
    title: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  };
}

export default function Sessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  const apiBase = getApiBase();

  const fetchSessions = () => {
    setLoading(true);
    fetch(`${apiBase}/api/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const handleDelete = async (id: string) => {
    await fetch(`${apiBase}/api/sessions/${id}`, { method: 'DELETE' });
    fetchSessions();
  };

  const handleArchive = async (id: string) => {
    await fetch(`${apiBase}/api/sessions/${id}/archive`, { method: 'POST' });
    fetchSessions();
  };

  const filtered = sessions.filter(
    (s) =>
      s.metadata.title.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">会话管理</h1>
          <p className="text-gray-400 mt-1">{sessions.length} 个会话</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索会话..."
            className="input pl-10 w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <History className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">暂无会话记录</p>
          <p className="text-sm text-gray-600 mt-1">开始对话后将自动创建会话</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((session) => (
            <div key={session.id} className="card flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center mt-1">
                  <MessageSquare className="w-5 h-5 text-primary-400" />
                </div>
                <div>
                  <h3 className="font-medium">{session.metadata.title}</h3>
                  <code className="text-xs text-gray-600">{session.id}</code>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(session.metadata.updatedAt).toLocaleString('zh-CN')}
                    </span>
                    <span>
                      Token: {(session.metadata.tokenUsage?.totalTokens || 0).toLocaleString()}
                    </span>
                    <span
                      className={`${
                        session.metadata.status === 'active' ? 'badge-green' : 'badge-yellow'
                      }`}
                    >
                      {session.metadata.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/chat?sessionId=${encodeURIComponent(session.id)}`)}
                  className="btn-primary text-xs py-1 px-3 gap-1"
                  title="查看会话"
                >
                  <Eye className="w-3 h-3" />
                  <span>查看</span>
                </button>
                <button
                  onClick={() => handleArchive(session.id)}
                  className="btn-secondary text-xs py-1 px-3"
                  title="归档"
                >
                  <Archive className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(session.id)}
                  className="btn-danger text-xs py-1 px-3"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
