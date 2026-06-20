/**
 * 模型目录注册中心
 * 负责从远程源下载最新模型信息并缓存到本地文件
 *
 * 设计思路：
 * - 启动时从远程 URL 下载模型目录 JSON → 缓存到 ~/.easyagent/models-catalog.json
 * - 缓存有效期 24 小时，过期后重新下载
 * - 网络失败时使用本地缓存 → 缓存不存在时回退到项目内置 models-catalog.json
 * - 内置也不可用时回退到 ProviderPresets 硬编码兜底
 * - 四级降级链：远程下载 → 本地缓存(24h) → 项目内置文件 → ProviderPresets 硬编码
 * - 所有模块统一从 ModelRegistry 读取模型列表，确保数据一致性
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../utils/logger.js';
/** 模型目录的远端 URL */
const CATALOG_URL = 'https://raw.githubusercontent.com/easyagent/easyagent/main/models-catalog.json';
/** 备用 URL（CDN） */
const CATALOG_URL_FALLBACK = 'https://cdn.jsdelivr.net/gh/easyagent/easyagent@main/models-catalog.json';
/** 缓存文件路径 */
const CACHE_DIR = join(homedir(), '.easyagent');
const CACHE_FILE = join(CACHE_DIR, 'models-catalog.json');
/** 缓存有效期：24 小时 */
const CACHE_TTL = 24 * 60 * 60 * 1000;
/** 下载超时：15 秒 */
const FETCH_TIMEOUT = 15000;
/**
 * 判断缓存是否过期
 */
function isCacheStale(cache) {
    return Date.now() - cache.downloadedAt > CACHE_TTL;
}
/**
 * 从 URL 下载数据
 * @param url - 下载 URL
 * @returns 响应文本，失败返回 null
 */
async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'EasyAgent/1.0',
                'Accept': 'application/json',
            },
        });
        if (!res.ok) {
            logger.warn({ url, status: res.status }, '模型目录下载失败(HTTP错误)');
            return null;
        }
        return await res.text();
    }
    catch (error) {
        logger.warn({ url, error: error.message }, '模型目录下载失败(网络错误)');
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * 从远程下载模型目录
 * 依次尝试主 URL 和备用 URL
 */
async function downloadCatalog() {
    // 尝试主 URL
    let raw = await fetchWithTimeout(CATALOG_URL);
    // 回退到备用 URL
    if (!raw) {
        raw = await fetchWithTimeout(CATALOG_URL_FALLBACK);
    }
    if (!raw)
        return null;
    try {
        const catalog = JSON.parse(raw);
        // 基本校验
        if (!catalog.providers || !Array.isArray(catalog.providers)) {
            logger.warn('模型目录格式无效(缺少providers字段)');
            return null;
        }
        return catalog;
    }
    catch (error) {
        logger.error({ error: error.message }, '模型目录JSON解析失败');
        return null;
    }
}
/**
 * 读取本地缓存的模型目录
 */
function readLocalCache() {
    try {
        if (!existsSync(CACHE_FILE))
            return null;
        const raw = readFileSync(CACHE_FILE, 'utf-8');
        const cache = JSON.parse(raw);
        if (!cache.catalog || !cache.catalog.providers)
            return null;
        return cache;
    }
    catch (error) {
        logger.warn({ error: error.message }, '读取模型缓存失败');
        return null;
    }
}
/**
 * 将目录写入本地缓存
 */
function writeLocalCache(catalog, source) {
    try {
        if (!existsSync(CACHE_DIR)) {
            mkdirSync(CACHE_DIR, { recursive: true });
        }
        const cache = {
            downloadedAt: Date.now(),
            source,
            catalog,
        };
        writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
        logger.info('模型目录已缓存到本地');
    }
    catch (error) {
        logger.warn({ error: error.message }, '写入模型缓存失败');
    }
}
/**
 * 尝试从项目目录读取内置的 models-catalog.json 作为兜底
 * 搜索路径：1) process.cwd()/models-catalog.json  2) ../../models-catalog.json (相对于 dist 目录)
 * @returns 模型目录，如果都不存在返回 null
 */
function readBundledCatalog() {
    // 查找路径：项目根目录
    const searchPaths = [
        resolve(process.cwd(), 'models-catalog.json'),
        resolve(process.cwd(), '..', 'models-catalog.json'),
        resolve(process.cwd(), '..', '..', 'models-catalog.json'),
    ];
    for (const filePath of searchPaths) {
        try {
            if (existsSync(filePath)) {
                const raw = readFileSync(filePath, 'utf-8');
                const catalog = JSON.parse(raw);
                if (catalog.providers && Array.isArray(catalog.providers)) {
                    logger.info({ path: filePath }, '使用项目内置的模型目录作为兜底');
                    return catalog;
                }
            }
        }
        catch {
            // 继续尝试下一个路径
        }
    }
    return null;
}
/**
 * 模型目录注册中心
 * 单例模式，负责管理模型目录的下载和缓存
 */
export class ModelRegistry {
    catalog = null;
    initialized = false;
    initPromise = null;
    /**
     * 初始化：加载本地缓存，必要时从远程更新
     * @param forceRefresh - 是否强制刷新（跳过缓存有效期检查）
     */
    async initialize(forceRefresh = false) {
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = this.doInitialize(forceRefresh);
        return this.initPromise;
    }
    async doInitialize(forceRefresh) {
        try {
            // 1. 读取本地缓存
            const localCache = readLocalCache();
            // 2. 决定是否需要远程更新
            const needFetch = forceRefresh || !localCache || isCacheStale(localCache);
            if (needFetch) {
                logger.info('正在从远程获取最新模型目录...');
                const catalog = await downloadCatalog();
                if (catalog) {
                    this.catalog = catalog;
                    writeLocalCache(catalog, CATALOG_URL);
                    logger.info({ version: catalog.version, providers: catalog.providers.length }, '模型目录已更新');
                }
                else if (localCache) {
                    // 远程获取失败，使用本地缓存
                    this.catalog = localCache.catalog;
                    logger.info('远程更新失败，使用本地缓存模型目录');
                }
                else {
                    // 远程和缓存都失败，尝试项目内置的 models-catalog.json 兜底
                    const bundled = readBundledCatalog();
                    if (bundled) {
                        this.catalog = bundled;
                        // 将内置目录写入缓存，下次启动可直接使用
                        writeLocalCache(bundled, 'bundled:models-catalog.json');
                        logger.info({ version: bundled.version, providers: bundled.providers.length }, '使用内置模型目录(已写入缓存)');
                    }
                }
            }
            else {
                // 缓存未过期，直接使用
                this.catalog = localCache.catalog;
                logger.info('使用本地缓存模型目录');
            }
            this.initialized = true;
        }
        catch (error) {
            logger.error({ error: error.message }, '模型目录初始化失败');
            // 尝试从本地缓存恢复
            const localCache = readLocalCache();
            if (localCache) {
                this.catalog = localCache.catalog;
                this.initialized = true;
            }
            else {
                // 最后尝试内置兜底
                const bundled = readBundledCatalog();
                if (bundled) {
                    this.catalog = bundled;
                    writeLocalCache(bundled, 'bundled:models-catalog.json');
                    this.initialized = true;
                }
            }
        }
    }
    /**
     * 获取指定提供商的模型列表
     * @param providerId - 提供商 ID
     * @returns 模型列表，如果未初始化返回 null
     */
    getModels(providerId) {
        if (!this.catalog)
            return null;
        const entry = this.catalog.providers.find(p => p.provider === providerId);
        return entry?.models || null;
    }
    /**
     * 获取指定提供商的完整目录条目
     * @param providerId - 提供商 ID
     * @returns 目录条目，如果未初始化返回 null
     */
    getProviderEntry(providerId) {
        if (!this.catalog)
            return null;
        return this.catalog.providers.find(p => p.provider === providerId) || null;
    }
    /**
     * 获取所有提供商的目录条目
     * @returns 所有条目的数组，如果未初始化返回 null
     */
    getAllEntries() {
        if (!this.catalog)
            return null;
        return this.catalog.providers;
    }
    /**
     * 获取完整的模型目录
     */
    getCatalog() {
        return this.catalog;
    }
    /**
     * 获取目录版本信息
     */
    getVersion() {
        return this.catalog?.version || null;
    }
    /**
     * 获取上次更新时间
     */
    getGeneratedAt() {
        return this.catalog?.generatedAt || null;
    }
    /**
     * 是否已初始化
     */
    isReady() {
        return this.initialized;
    }
    /**
     * 强制刷新：忽略缓存，从远程重新下载
     */
    async refresh() {
        this.initPromise = null;
        await this.initialize(true);
    }
}
/** 全局单例 */
let registryInstance = null;
/**
 * 获取模型目录注册中心实例
 */
export function getModelRegistry() {
    if (!registryInstance) {
        registryInstance = new ModelRegistry();
    }
    return registryInstance;
}
/**
 * 重置单例（主要用于测试）
 */
export function resetModelRegistry() {
    registryInstance = null;
}
