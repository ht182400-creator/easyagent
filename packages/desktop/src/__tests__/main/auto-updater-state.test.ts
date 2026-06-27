/**
 * 自动更新状态机测试
 * 测试 main.ts 中 UpdateStatus 状态机的核心逻辑
 *
 * 通过提取状态转移决策逻辑进行纯函数测试，
 * 避免对 Electron 和 electron-updater 的依赖。
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ==================== 类型定义（与 main.ts 保持一致） ====================

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'installing';

interface UpdateInfoData {
  version?: string;
  releaseDate?: string;
  error?: string;
  percent?: number;
}

// ==================== 状态机决策逻辑（从 main.ts 提取） ====================

/**
 * check-update IPC handler 的决策函数
 * 返回处理结果和新的状态
 */
function decideCheckUpdateAction(
  currentStatus: UpdateStatus,
  currentInfo: UpdateInfoData,
): {
  action:
    | 'return-downloaded'
    | 'return-checking'
    | 'return-available'
    | 'return-downloading'
    | 'start-check'
    | 'retry';
  response: { status: UpdateStatus; message?: string; version?: string; percent?: number };
} {
  // ----- 场景1: 已下载完成 -----
  if (currentStatus === 'downloaded') {
    return {
      action: 'return-downloaded',
      response: { status: 'downloaded', version: currentInfo?.version },
    };
  }

  // ----- 场景2: 正在检查中 -----
  if (currentStatus === 'checking') {
    return {
      action: 'return-checking',
      response: { status: 'checking', message: '正在检查更新，请稍候...' },
    };
  }

  // ----- 场景3: 发现更新但尚未开始下载 -----
  if (currentStatus === 'available') {
    return {
      action: 'return-available',
      response: { status: 'available', version: currentInfo?.version },
    };
  }

  // ----- 场景4: 正在下载中 -----
  if (currentStatus === 'downloading') {
    return {
      action: 'return-downloading',
      response: {
        status: 'downloading',
        version: currentInfo?.version,
        percent: currentInfo?.percent ?? 0,
      },
    };
  }

  // ----- 场景5: 之前出错，重试 -----
  if (currentStatus === 'error') {
    return {
      action: 'retry',
      response: { status: 'checking', message: '清除错误，重新检查...' },
    };
  }

  // ----- 场景6: idle → 开始检查 -----
  return {
    action: 'start-check',
    response: { status: 'checking' },
  };
}

/**
 * install-update IPC handler 的决策函数
 */
function decideInstallAction(currentStatus: UpdateStatus): {
  allowed: boolean;
  error?: string;
} {
  if (currentStatus !== 'downloaded') {
    return { allowed: false, error: '没有可安装的更新' };
  }
  return { allowed: true };
}

/**
 * 判断状态转移是否合法
 */
function isValidTransition(from: UpdateStatus, to: UpdateStatus): boolean {
  const validTransitions: Record<UpdateStatus, UpdateStatus[]> = {
    idle: ['checking'],
    checking: ['available', 'idle', 'error'],
    available: ['downloading', 'error'],
    downloading: ['downloaded', 'error', 'downloading'],
    downloaded: ['installing'],
    error: ['checking', 'idle'],
    installing: [],
  };
  return validTransitions[from]?.includes(to) ?? false;
}

// ==================== 测试套件 1: check-update 决策逻辑 ====================

describe('自动更新状态机 - check-update IPC 决策', () => {
  describe('S1: downloaded 状态 → 返回安装提示', () => {
    it('应返回 downloaded 状态和版本号', () => {
      const result = decideCheckUpdateAction('downloaded', { version: '0.5.21' });
      expect(result.action).toBe('return-downloaded');
      expect(result.response.status).toBe('downloaded');
      expect(result.response.version).toBe('0.5.21');
    });

    it('即使没有版本号也应返回 downloaded', () => {
      const result = decideCheckUpdateAction('downloaded', {});
      expect(result.action).toBe('return-downloaded');
      expect(result.response.status).toBe('downloaded');
    });
  });

  describe('S2: checking 状态 → 防重复', () => {
    it('应返回 checking 状态和提示消息', () => {
      const result = decideCheckUpdateAction('checking', {});
      expect(result.action).toBe('return-checking');
      expect(result.response.status).toBe('checking');
      expect(result.response.message).toContain('请稍候');
    });
  });

  describe('S3: available 状态 → 返回已发现', () => {
    it('应返回 available 状态和版本号', () => {
      const result = decideCheckUpdateAction('available', { version: '0.5.21' });
      expect(result.action).toBe('return-available');
      expect(result.response.status).toBe('available');
      expect(result.response.version).toBe('0.5.21');
    });
  });

  describe('S4: downloading 状态 → 返回进度', () => {
    it('应返回 downloading 状态和进度百分比', () => {
      const result = decideCheckUpdateAction('downloading', { version: '0.5.21', percent: 65.5 });
      expect(result.action).toBe('return-downloading');
      expect(result.response.status).toBe('downloading');
      expect(result.response.percent).toBe(65.5);
    });

    it('没有 percent 时应默认为 0', () => {
      const result = decideCheckUpdateAction('downloading', { version: '0.5.21' });
      expect(result.response.percent).toBe(0);
    });
  });

  describe('S5: error 状态 → 重试', () => {
    it('应返回重试动作，状态转为 checking', () => {
      const result = decideCheckUpdateAction('error', { version: '0.5.21', error: 'ETIMEDOUT' });
      expect(result.action).toBe('retry');
      expect(result.response.status).toBe('checking');
    });
  });

  describe('S6: idle 状态 → 开始检查', () => {
    it('应返回开始检查动作', () => {
      const result = decideCheckUpdateAction('idle', {});
      expect(result.action).toBe('start-check');
      expect(result.response.status).toBe('checking');
    });
  });

  describe('installing 状态', () => {
    it('installing 状态应走 start-check 分支（实际不太可能触发）', () => {
      const result = decideCheckUpdateAction('installing', {});
      // installing 不在前5个分支中，走 idle 逻辑
      expect(result.action).toBe('start-check');
    });
  });
});

// ==================== 测试套件 2: install-update 决策逻辑 ====================

describe('自动更新状态机 - install-update IPC 决策', () => {
  describe('合法安装', () => {
    it('downloaded 状态允许安装', () => {
      const result = decideInstallAction('downloaded');
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('拒绝安装', () => {
    const notDownloadedStates: UpdateStatus[] = [
      'idle',
      'checking',
      'available',
      'downloading',
      'error',
      'installing',
    ];

    notDownloadedStates.forEach((state) => {
      it(`${state} 状态应拒绝安装`, () => {
        const result = decideInstallAction(state);
        expect(result.allowed).toBe(false);
        expect(result.error).toBe('没有可安装的更新');
      });
    });
  });
});

// ==================== 测试套件 3: 状态转移合法性 ====================

describe('自动更新状态机 - 状态转移合法性', () => {
  describe('合法转移', () => {
    const validCases: [UpdateStatus, UpdateStatus][] = [
      ['idle', 'checking'],
      ['checking', 'available'],
      ['checking', 'idle'],
      ['checking', 'error'],
      ['available', 'downloading'],
      ['available', 'error'],
      ['downloading', 'downloaded'],
      ['downloading', 'error'],
      ['downloading', 'downloading'], // 进度更新
      ['downloaded', 'installing'],
      ['error', 'checking'],
      ['error', 'idle'],
    ];

    validCases.forEach(([from, to]) => {
      it(`${from} → ${to} 应为合法转移`, () => {
        expect(isValidTransition(from, to)).toBe(true);
      });
    });
  });

  describe('非法转移', () => {
    const invalidCases: [UpdateStatus, UpdateStatus][] = [
      ['idle', 'downloaded'], // 不能跳过下载
      ['idle', 'error'], // 不能直接到 error
      ['checking', 'downloaded'], // 不能跳过 available+downloading
      ['downloaded', 'downloading'], // 下载完不能回到下载中
      ['downloaded', 'idle'], // 下载完不能重置为空闲
      ['installing', 'checking'], // 安装中不可逆
      ['installing', 'idle'], // 安装中不可逆
      ['error', 'downloaded'], // 错误不能直接到下载完成
    ];

    invalidCases.forEach(([from, to]) => {
      it(`${from} → ${to} 应为非法转移`, () => {
        expect(isValidTransition(from, to)).toBe(false);
      });
    });
  });
});

// ==================== 测试套件 4: 全场景模拟 ====================

describe('自动更新状态机 - 全场景端到端模拟', () => {
  /** 模拟完整的状态机运行 */
  class MockUpdateStateMachine {
    status: UpdateStatus = 'idle';
    info: UpdateInfoData = {};

    /** 自动检查触发 */
    autoCheck() {
      if (this.status !== 'idle') return;
      this.status = 'checking';
    }

    /** electron-updater: update-available 事件 */
    onUpdateAvailable(version: string) {
      if (this.status === 'checking') {
        this.status = 'available';
        this.info = { version };
      }
    }

    /** electron-updater: download-progress 事件 */
    onDownloadProgress(percent: number) {
      if (this.status === 'available' || this.status === 'downloading') {
        this.status = 'downloading';
        this.info = { ...this.info, percent };
      }
    }

    /** electron-updater: update-downloaded 事件 */
    onUpdateDownloaded(version: string) {
      if (this.status === 'downloading') {
        this.status = 'downloaded';
        this.info = { version };
      }
    }

    /** electron-updater: error 事件 */
    onError(errorMsg: string) {
      if (['checking', 'available', 'downloading'].includes(this.status)) {
        this.status = 'error';
        this.info = { ...this.info, error: errorMsg };
      }
    }

    /** 用户确认安装 */
    install() {
      if (this.status === 'downloaded') {
        this.status = 'installing';
        return true;
      }
      return false;
    }

    /** IPC check-update 处理 */
    checkUpdate(): { action: string; response: any } {
      return decideCheckUpdateAction(this.status, this.info);
    }
  }

  let sm: MockUpdateStateMachine;

  beforeEach(() => {
    sm = new MockUpdateStateMachine();
  });

  describe('T1: 正常完整流程', () => {
    it('idle → checking → available → downloading → downloaded → installing', () => {
      // 初始状态
      expect(sm.status).toBe('idle');

      // 用户点击检查更新
      const decision1 = sm.checkUpdate();
      expect(decision1.action).toBe('start-check');

      // 自动检查开始
      sm.autoCheck();
      expect(sm.status).toBe('checking');

      // 发现新版本
      sm.onUpdateAvailable('0.5.21');
      expect(sm.status).toBe('available');
      expect(sm.info.version).toBe('0.5.21');

      // 下载进度
      sm.onDownloadProgress(45);
      expect(sm.status).toBe('downloading');
      expect(sm.info.percent).toBe(45);

      sm.onDownloadProgress(100);
      expect(sm.status).toBe('downloading');

      // 下载完成
      sm.onUpdateDownloaded('0.5.21');
      expect(sm.status).toBe('downloaded');

      // 用户确认安装
      const installed = sm.install();
      expect(installed).toBe(true);
      expect(sm.status).toBe('installing');
    });
  });

  describe('T2: 后台下载中手动检查', () => {
    it('downloading 状态下手动检查应返回当前进度', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(65.5);

      // 手动点击检查更新
      const result = sm.checkUpdate();
      expect(result.action).toBe('return-downloading');
      expect(result.response.status).toBe('downloading');
      expect(result.response.percent).toBe(65.5);
      // 状态不变
      expect(sm.status).toBe('downloading');
    });
  });

  describe('T3: 下载完成后手动检查', () => {
    it('downloaded 状态下手动检查应返回安装提示', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(100);
      sm.onUpdateDownloaded('0.5.21');

      const result = sm.checkUpdate();
      expect(result.action).toBe('return-downloaded');
      expect(result.response.status).toBe('downloaded');
      expect(result.response.version).toBe('0.5.21');
    });
  });

  describe('T4: 弹窗点"稍后"后状态保持', () => {
    it('downloaded 保持，可再次安装', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(100);
      sm.onUpdateDownloaded('0.5.21');

      // 弹窗点"稍后" — 状态保持 downloaded
      expect(sm.status).toBe('downloaded');

      // 用户稍后进入设置页
      const result = sm.checkUpdate();
      expect(result.action).toBe('return-downloaded');

      // 点击安装
      expect(sm.install()).toBe(true);
      expect(sm.status).toBe('installing');
    });
  });

  describe('T5: 下载失败后重试', () => {
    it('error → 手动检查 → checking', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(50);
      sm.onError('ETIMEDOUT');

      expect(sm.status).toBe('error');

      // 用户点击重试/检查更新
      const result = sm.checkUpdate();
      expect(result.action).toBe('retry');
      expect(result.response.status).toBe('checking');
    });
  });

  describe('T6: 错误状态后恢复正常流程', () => {
    it('error → retry → checking → available → downloading → downloaded', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onError('ETIMEDOUT');
      expect(sm.status).toBe('error');

      // 重试
      const retry = sm.checkUpdate();
      expect(retry.action).toBe('retry');

      // 模拟重新开始
      sm.status = 'checking';
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(0);
      sm.onDownloadProgress(100);
      sm.onUpdateDownloaded('0.5.21');

      expect(sm.status).toBe('downloaded');
    });
  });

  describe('T8: 正在检查时重复点击', () => {
    it('checking 状态下再次检查应返回"请稍候"', () => {
      sm.autoCheck();
      expect(sm.status).toBe('checking');

      const result = sm.checkUpdate();
      expect(result.action).toBe('return-checking');
      expect(result.response.message).toContain('请稍候');
    });
  });

  describe('T9: 自动+手动检查并发', () => {
    it('idle 状态下先自动检查再手动检查不冲突', () => {
      // 先自动检查
      sm.autoCheck();
      expect(sm.status).toBe('checking');

      // 同时手动检查
      const manualResult = sm.checkUpdate();
      expect(manualResult.action).toBe('return-checking');

      // 自动检查完成后手动检查
      sm.onUpdateAvailable('0.5.21');
      expect(sm.status).toBe('available');

      const laterManualResult = sm.checkUpdate();
      expect(laterManualResult.action).toBe('return-available');
    });
  });

  /**
   * T10: 竞态条件测试 — available 事件不应覆盖 downloading 状态
   *
   * 真实场景: checkForUpdates() 返回 downloading 后，
   * update-available 事件异步到达，Settings.tsx 必须用 prev 判断不降级
   */
  describe('T10: 竞态条件 — available 不覆盖 downloading', () => {
    /**
     * 模拟 Settings.tsx 中的事件处理逻辑（修复版 vs 修复前）
     */
    function simulateEventHandling(
      currentStatus: UpdateStatus,
      incomingEvent: UpdateStatus,
      useGuard: boolean,
    ): UpdateStatus {
      if (useGuard && incomingEvent === 'available') {
        // 修复版：不降级
        if (currentStatus === 'downloading' || currentStatus === 'downloaded') {
          return currentStatus;
        }
      }
      return incomingEvent;
    }

    it('available 事件不应覆盖 downloading（修复版）', () => {
      // IPC 返回 downloading → UI 设为 downloading
      let uiStatus: UpdateStatus = 'downloading';
      expect(uiStatus).toBe('downloading');

      // update-available 事件到达
      uiStatus = simulateEventHandling(uiStatus, 'available', true);
      expect(uiStatus).toBe('downloading'); // 不被覆盖！
    });

    it('available 事件不应覆盖 downloaded（修复版）', () => {
      let uiStatus: UpdateStatus = 'downloaded';
      uiStatus = simulateEventHandling(uiStatus, 'available', true);
      expect(uiStatus).toBe('downloaded'); // 不被覆盖！
    });

    it('available 事件可以覆盖 checking（正常流程）', () => {
      let uiStatus: UpdateStatus = 'checking';
      uiStatus = simulateEventHandling(uiStatus, 'available', true);
      expect(uiStatus).toBe('available'); // 正常推进
    });

    it('available 事件可以覆盖 idle（正常流程）', () => {
      let uiStatus: UpdateStatus = 'idle' as UpdateStatus;
      uiStatus = simulateEventHandling(uiStatus, 'available', true);
      expect(uiStatus).toBe('available'); // 正常推进
    });

    it('available 事件会覆盖 downloading（修复前 — BUG）', () => {
      // 模拟修复前的行为：直接用事件覆盖
      let uiStatus: UpdateStatus = 'downloading';
      uiStatus = simulateEventHandling(uiStatus, 'available', false);
      expect(uiStatus).toBe('available'); // BUG! downloading 被覆盖
    });

    it('download-progress 事件应正常更新 downloading', () => {
      let uiStatus: UpdateStatus = 'available';
      uiStatus = simulateEventHandling(uiStatus, 'downloading', false);
      expect(uiStatus).toBe('downloading'); // 正常推进，不需要 guard
    });

    it('完整竞态序列模拟', () => {
      // 模拟真实时间线:
      // t1: check-update IPC 返回 → UI=downloading
      // t2: update-available 事件 → 修复版保持 downloading
      // t3: download-progress 事件 → UI=downloading (进度更新)
      // t4: update-downloaded 事件 → UI=downloaded

      let uiStatus: UpdateStatus = 'idle' as UpdateStatus;

      // t1
      uiStatus = 'downloading'; // IPC 返回
      expect(uiStatus).toBe('downloading');

      // t2
      uiStatus = simulateEventHandling(uiStatus, 'available', true);
      expect(uiStatus).toBe('downloading'); // 不被覆盖

      // t3
      uiStatus = simulateEventHandling(uiStatus, 'downloading', false);
      expect(uiStatus).toBe('downloading'); // 正常

      // t4
      uiStatus = 'downloaded';
      expect(uiStatus).toBe('downloaded');
    });
  });

  describe('边界条件测试', () => {
    it('idle 状态下调用 onDownloadProgress 应无效果', () => {
      sm.onDownloadProgress(50);
      expect(sm.status).toBe('idle');
    });

    it('idle 状态下调用 onUpdateAvailable 应无效果', () => {
      sm.onUpdateAvailable('0.5.21');
      expect(sm.status).toBe('idle');
    });

    it('idle 状态下调用 install 应返回 false', () => {
      expect(sm.install()).toBe(false);
      expect(sm.status).toBe('idle');
    });

    it('error 状态下调用 install 应返回 false', () => {
      sm.autoCheck();
      sm.onError('FAIL');
      expect(sm.install()).toBe(false);
    });

    it('downloading 状态可以收到多次 progress 更新', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(30);
      sm.onDownloadProgress(60);
      sm.onDownloadProgress(90);
      expect(sm.status).toBe('downloading');
      expect(sm.info.percent).toBe(90);
    });

    it('checking 状态遇到 error 应转为 error', () => {
      sm.autoCheck();
      sm.onError('检查超时');
      expect(sm.status).toBe('error');
      expect(sm.info.error).toBe('检查超时');
    });

    it('available 状态遇到 error 应转为 error', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onError('下载启动失败');
      expect(sm.status).toBe('error');
      expect(sm.info.version).toBe('0.5.21'); // 保留版本信息
    });
  });

  describe('installing 状态保护', () => {
    it('installing 状态下不允许安装', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(100);
      sm.onUpdateDownloaded('0.5.21');
      sm.install();
      expect(sm.status).toBe('installing');

      // 重复安装应被拒绝
      expect(sm.install()).toBe(false);
    });

    it('installing 状态下任何转移都应无效', () => {
      sm.autoCheck();
      sm.onUpdateAvailable('0.5.21');
      sm.onDownloadProgress(100);
      sm.onUpdateDownloaded('0.5.21');
      sm.install();
      expect(sm.status).toBe('installing');

      // 这些操作不应改变 installing 状态
      sm.onUpdateAvailable('0.5.22');
      expect(sm.status).toBe('installing');
      sm.onDownloadProgress(50);
      expect(sm.status).toBe('installing');
      sm.onError('err');
      expect(sm.status).toBe('installing');
    });
  });
});
