/**
 * 插件 Manifest 定义与验证
 *
 * 每个第三方插件必须在其根目录提供 manifest.json，
 * 声明名称、版本、入口文件、所需权限等元信息。
 * 内置技能（BuiltinSkills）不需要 manifest。
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import type { PluginPermissions } from './PluginPermission.js';
import { checkPermissions, getDangerousPermissions } from './PluginPermission.js';
import { logger } from '../utils/logger.js';

// ===================== Manifest 类型 =====================

/**
 * 插件 manifest 结构
 * 对应插件根目录的 manifest.json 文件
 */
export interface PluginManifest {
  /** 插件唯一名称（kebab-case） */
  name: string;
  /** 语义化版本 */
  version: string;
  /** 用户可读描述 */
  description: string;
  /** 作者信息 */
  author?: string;
  /** 入口文件路径（相对于插件根目录） */
  main: string;
  /** 依赖的其他插件名列表 */
  dependencies?: string[];
  /** 兼容的引擎版本范围（semver） */
  engines?: {
    easyagent?: string;
    node?: string;
  };
  /** 插件所需权限声明 */
  permissions?: PluginPermissions;
  /** 插件关键词 */
  keywords?: string[];
  /** 仓库地址 */
  repository?: string;
  /** 许可证 */
  license?: string;
}

/**
 * Manifest 验证结果
 */
export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: PluginManifest;
}

// ===================== Manifest 验证 =====================

/** manifest 必需字段 */
const REQUIRED_FIELDS: Array<keyof PluginManifest> = ['name', 'version', 'description', 'main'];

/** 最大版本号 */
const MAX_VERSION = 999;

/**
 * 从插件目录加载并验证 manifest.json
 * @param pluginDir 插件根目录
 * @param allowedPermissions 系统允许该插件的最大权限（用于权限裁剪）
 * @returns 验证结果
 */
export function loadManifest(
  pluginDir: string,
  allowedPermissions?: PluginPermissions
): ManifestValidationResult {
  const result: ManifestValidationResult = {
    valid: false,
    errors: [],
    warnings: [],
  };

  const manifestPath = join(resolve(pluginDir), 'manifest.json');

  // 检查文件存在
  if (!existsSync(manifestPath)) {
    result.errors.push(`缺少 manifest.json 文件: ${manifestPath}`);
    return result;
  }

  // 解析 JSON
  let raw: unknown;
  try {
    const content = readFileSync(manifestPath, 'utf-8');
    raw = JSON.parse(content);
  } catch (error) {
    result.errors.push(
      `manifest.json 解析失败: ${error instanceof Error ? error.message : String(error)}`
    );
    return result;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    result.errors.push('manifest.json 根节点必须是对象');
    return result;
  }

  const manifest = raw as Record<string, unknown>;

  // 1. 验证必需字段
  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) {
      result.errors.push(`缺少必需字段: ${field}`);
    }
  }

  // 2. 验证 name（kebab-case）
  if (manifest.name) {
    const name = String(manifest.name);
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
      result.errors.push(
        `插件名 "${name}" 不符合 kebab-case 命名规范（小写字母+连字符）`
      );
    }
    // 名称长度限制
    if (name.length > 64) {
      result.errors.push(`插件名长度不能超过 64 字符，当前: ${name.length}`);
    }
  }

  // 3. 验证 version（semver）
  if (manifest.version) {
    const version = String(manifest.version);
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
    if (!semverRegex.test(version)) {
      result.errors.push(`版本号 "${version}" 不符合语义化版本格式（如 1.0.0）`);
    } else {
      const major = parseInt(version.split('.')[0], 10);
      if (major > MAX_VERSION) {
        result.warnings.push(`版本号 major 超过 ${MAX_VERSION}，可能是错误配置`);
      }
    }
  }

  // 4. 验证 main 入口文件
  if (manifest.main) {
    const main = String(manifest.main);
    if (main.includes('..') || main.startsWith('/')) {
      result.errors.push(`入口文件路径 "${main}" 不允许使用 ".." 或绝对路径（沙箱安全限制）`);
    }
    const entryPath = join(resolve(pluginDir), main);
    if (!existsSync(entryPath)) {
      result.errors.push(`入口文件不存在: ${entryPath}`);
    }
  }

  // 5. 验证 permissions
  if (manifest.permissions && typeof manifest.permissions === 'object') {
    const permissions = manifest.permissions as PluginPermissions;
    const permissionCheck = checkPermissions(
      permissions,
      allowedPermissions || permissions
    );
    if (!permissionCheck.allowed) {
      result.errors.push(
        `权限声明超出允许范围: ${permissionCheck.deniedPermission} - ${permissionCheck.reason}`
      );
    }

    // 警告危险权限
    const dangerous = getDangerousPermissions(permissions);
    for (const d of dangerous) {
      result.warnings.push(`危险权限 [${d.key}]: ${d.warning}，需要用户确认授权`);
    }
  }

  // 6. 验证 dependencies（数组格式）
  if (manifest.dependencies) {
    if (!Array.isArray(manifest.dependencies)) {
      result.errors.push('dependencies 字段必须是字符串数组');
    } else {
      for (const dep of manifest.dependencies) {
        if (typeof dep !== 'string') {
          result.errors.push(`依赖项 "${String(dep)}" 必须是字符串`);
        }
      }
    }
  }

  result.valid = result.errors.length === 0;
  if (result.valid) {
    result.manifest = {
      name: String(manifest.name),
      version: String(manifest.version),
      description: String(manifest.description),
      main: String(manifest.main),
      author: manifest.author ? String(manifest.author) : undefined,
      dependencies: manifest.dependencies
        ? (manifest.dependencies as string[])
        : undefined,
      engines: manifest.engines as PluginManifest['engines'],
      permissions: manifest.permissions as PluginPermissions,
      keywords: manifest.keywords as string[],
      repository: manifest.repository ? String(manifest.repository) : undefined,
      license: manifest.license ? String(manifest.license) : undefined,
    };
  }

  logger.info({ name: manifest.name, valid: result.valid, errors: result.errors.length },
    `Manifest 验证${result.valid ? '通过' : '失败'}`);
  return result;
}

/**
 * 快速获取 manifest 路径
 */
export function getManifestPath(pluginDir: string): string {
  return join(resolve(pluginDir), 'manifest.json');
}
