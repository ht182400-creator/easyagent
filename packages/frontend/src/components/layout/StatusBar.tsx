/**
 * StatusBar - 底部状态栏
 * 显示模型信息、Token用量、连接状态
 */
import { useState, useEffect } from 'react';
import { Zap, Activity, Download } from 'lucide-react';
import type { FC } from 'react';

interface UpdateInfo {
  status: string;
  percent?: number;
  version?: string;
}

export const StatusBar: FC = () => {
  const [appVersion, setAppVersion] = useState('0.3.0');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const api = (window as any).easyAgent;
    if (api) {
      // 获取版本号
      api.getAppVersion().then((v: string) => setAppVersion(v)).catch(() => {});
      // 监听更新状态
      api.onUpdateStatus((s: UpdateInfo) => setUpdateInfo(s));
    }
  }, []);

  const isUpdating = updateInfo?.status === 'downloading';

  return (
    <div
      className="flex items-center justify-between h-[var(--statusbar-height)] px-3 
        bg-surface-shell border-t border-border-subtle text-xs text-text-muted select-none"
    >
      {/* 左侧：应用版本 + 更新状态 */}
      <div className="flex items-center gap-2">
        <Zap className="w-3 h-3" />
        <span>v{appVersion}</span>
        {updateInfo?.status === 'available' && (
          <span className="text-yellow-400 cursor-pointer" title={`新版本 ${updateInfo.version} 可用`}>
            <Download className="w-3 h-3 inline mr-1" />
            更新可用
          </span>
        )}
        {isUpdating && (
          <span className="text-blue-400">
            下载中... {updateInfo?.percent?.toFixed(0)}%
          </span>
        )}
        {updateInfo?.status === 'downloaded' && (
          <span className="text-green-400">重启以安装更新</span>
        )}
        <span className="w-1 h-1 rounded-full bg-green-500" title="已连接" />
      </div>

      {/* 右侧：系统状态 */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          Tokens: 0
        </span>
        <span>会话: 1</span>
        <span>工具: 51</span>
      </div>
    </div>
  );
};
