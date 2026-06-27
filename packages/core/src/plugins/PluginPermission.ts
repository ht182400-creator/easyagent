/**
 * 插件权限系统
 * 定义插件可声明的权限白名单，用于沙箱隔离场景下的安全控制
 *
 * 安全模型：
 * - 默认拒绝（deny-by-default）：未声明的权限一律拒绝
 * - 最小权限原则：插件只申明其需要的权限
 * - 用户确认：危险权限（shell/write）需用户授权
 */

/**
 * 文件系统权限
 * 限制插件可访问的文件路径范围
 */
export interface FsPermission {
  /** 允许读取的路径（glob 模式），如 ['/workspace/**', '/tmp/*.log'] */
  read?: string[];
  /** 允许写入的路径（glob 模式），如 ['/workspace/output/**'] */
  write?: string[];
}

/**
 * 网络权限
 * 限制插件可访问的网络地址
 */
export interface NetworkPermission {
  /** 允许访问的域名/IP + 端口列表，如 ['api.github.com', 'localhost:3000'] */
  allow?: string[];
}

/**
 * Shell 命令权限
 * 限制插件可执行的系统命令
 */
export interface ShellPermission {
  /** 允许执行的命令名列表，如 ['git', 'node', 'npm'] */
  allow?: string[];
}

/**
 * 插件权限声明
 * 插件在 manifest.json 中声明所需权限
 *
 * @example 最小权限示例
 * ```json
 * { "permissions": { "fs": { "read": ["/workspace/**"] } } }
 * ```
 *
 * @example 完整权限示例
 * ```json
 * {
 *   "permissions": {
 *     "fs": { "read": ["/workspace/**"], "write": ["/workspace/output/**"] },
 *     "network": { "allow": ["api.github.com"] },
 *     "shell": { "allow": ["git", "node"] }
 *   }
 * }
 * ```
 */
export interface PluginPermissions {
  /** 文件系统权限 */
  fs?: FsPermission;
  /** 网络访问权限 */
  network?: NetworkPermission;
  /** Shell 命令执行权限 */
  shell?: ShellPermission;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 是否通过 */
  allowed: boolean;
  /** 被拒绝的权限类型 */
  deniedPermission?: string;
  /** 拒绝原因 */
  reason?: string;
}

// ==================== 权限级别预设 ====================

/**
 * 权限级别
 * 预定义的权限组合，便于用户快速授权
 */
export type PermissionLevel = 'none' | 'readonly' | 'standard' | 'full';

/**
 * 只读权限：仅可读取工作区文件
 * 适用于代码审查、分析类插件
 */
export const PermissionLevels = {
  /** 无权限 - 插件不访问任何外部资源 */
  none: {} as PluginPermissions,

  /** 只读 - 可读取工作区文件 */
  readonly: {
    fs: { read: ['**/*'] },
  } as PluginPermissions,

  /** 标准权限 - 读取工作区 + 公网网络 */
  standard: {
    fs: { read: ['**/*'], write: ['**/*.md', '**/*.json', '**/*.txt'] },
    network: { allow: ['raw.githubusercontent.com', 'api.github.com'] },
  } as PluginPermissions,

  /** 完整权限 - 读写工作区 + 网络 + Git/Node */
  full: {
    fs: { read: ['**/*'], write: ['**/*'] },
    network: { allow: ['*'] },
    shell: { allow: ['git', 'node', 'npm', 'npx', 'pnpm', 'yarn'] },
  } as PluginPermissions,
} as const satisfies Record<PermissionLevel, PluginPermissions>;

// ==================== 权限验证 ====================

/** 危险权限分类 */
export const DANGEROUS_PERMISSIONS: Partial<Record<keyof PluginPermissions, string>> = {
  shell: '允许执行系统命令可能危害系统安全',
};

/**
 * 检查 manifest 中声明的权限是否与允许的权限兼容
 * @param requested 插件声明的权限
 * @param allowed 系统允许的最大权限（默认与请求一致即通过）
 * @returns 权限检查结果
 */
export function checkPermissions(
  requested: PluginPermissions,
  allowed: PluginPermissions = PermissionLevels.full,
): PermissionCheckResult {
  // 1. 检查 shell 权限
  if (requested.shell && !allowed.shell) {
    return {
      allowed: false,
      deniedPermission: 'shell',
      reason: '插件请求了 shell 权限，但该权限未被授权',
    };
  }
  if (requested.shell && allowed.shell) {
    const reqCommands = new Set(requested.shell.allow || []);
    const allowedCommands = new Set(allowed.shell.allow || []);
    // shell.allow 中的 '*' 表示允许所有命令
    if (!allowedCommands.has('*')) {
      for (const cmd of reqCommands) {
        if (!allowedCommands.has(cmd)) {
          return {
            allowed: false,
            deniedPermission: `shell.allow.${cmd}`,
            reason: `命令 '${cmd}' 不在允许列表中`,
          };
        }
      }
    }
  }

  // 2. 检查网络权限
  if (requested.network && !allowed.network) {
    return {
      allowed: false,
      deniedPermission: 'network',
      reason: '插件请求了网络权限，但该权限未被授权',
    };
  }

  // 3. 检查文件系统权限
  if (requested.fs) {
    if (requested.fs.write && !allowed.fs?.write) {
      return {
        allowed: false,
        deniedPermission: 'fs.write',
        reason: '插件请求了文件写入权限，但该权限未被授权',
      };
    }
  }

  return { allowed: true };
}

/**
 * 检查权限声明是否包含危险权限（需用户额外确认）
 * @param permissions 权限声明
 * @returns 危险权限列表
 */
export function getDangerousPermissions(
  permissions: PluginPermissions,
): Array<{ key: string; warning: string }> {
  const dangerous: Array<{ key: string; warning: string }> = [];

  for (const [key, warning] of Object.entries(DANGEROUS_PERMISSIONS)) {
    if (permissions[key as keyof PluginPermissions]) {
      dangerous.push({ key, warning });
    }
  }

  return dangerous;
}
