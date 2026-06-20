/**
 * 知识库与RAG工具集
 * 提供知识库文档管理、语义检索、RAG查询等功能
 * 支持文档存储、分块检索、连接外部知识库
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { logger } from '../utils/logger.js';
/** 知识库存储目录 */
function getKnowledgeDir(workspace) {
    const dir = resolve(workspace, '.easyagent', 'knowledge');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    return dir;
}
/** 知识库索引文件 */
function getIndexFile(workspace) {
    return join(getKnowledgeDir(workspace), 'index.json');
}
/** 读取索引 */
function loadIndex(workspace) {
    const indexFile = getIndexFile(workspace);
    if (!existsSync(indexFile))
        return [];
    try {
        return JSON.parse(readFileSync(indexFile, 'utf-8'));
    }
    catch {
        return [];
    }
}
/** 保存索引 */
function saveIndex(workspace, index) {
    writeFileSync(getIndexFile(workspace), JSON.stringify(index, null, 2), 'utf-8');
}
/**
 * 添加文档到知识库
 * 支持 .md/.txt/.json/.csv 等文本文件
 */
export const KnowledgeAddTool = {
    name: 'knowledge_add',
    description: '将文档、笔记或文本添加到工作区知识库中。支持自动分块和索引，便于后续检索。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string', description: '文档标题' },
            content: { type: 'string', description: '文档内容(直接提供文本)' },
            filePath: { type: 'string', description: '或者从文件导入: 文件路径(相对于工作区)' },
            category: { type: 'string', description: '文档分类, 如 "api"/"guide"/"note"/"reference", 默认 "general"' },
            tags: { type: 'array', items: { type: 'string', description: '标签' }, description: '文档标签列表' },
        },
        required: ['title'],
    },
    async execute(params, context) {
        try {
            const title = params.title;
            let content = params.content;
            const filePath = params.filePath;
            const category = params.category || 'general';
            const tags = params.tags || [];
            // 从文件读取内容
            if (!content && filePath) {
                const fullPath = resolve(context.workspace, filePath);
                if (!existsSync(fullPath)) {
                    return { success: false, content: `文件不存在: ${filePath}` };
                }
                content = readFileSync(fullPath, 'utf-8');
            }
            if (!content) {
                return { success: false, content: '请提供 content 或 filePath 参数' };
            }
            const kbDir = getKnowledgeDir(context.workspace);
            const docId = `doc_${Date.now()}_${createHash('md5').update(title).digest('hex').slice(0, 8)}`;
            // 分块存储（每块约1000字符）
            const chunkSize = 1000;
            const chunks = [];
            for (let i = 0; i < content.length; i += chunkSize) {
                chunks.push(content.slice(i, i + chunkSize));
            }
            // 保存分块文件
            const chunkDir = join(kbDir, docId);
            mkdirSync(chunkDir, { recursive: true });
            chunks.forEach((chunk, i) => {
                writeFileSync(join(chunkDir, `chunk_${String(i).padStart(4, '0')}.txt`), chunk, 'utf-8');
            });
            // 更新索引
            const index = loadIndex(context.workspace);
            const existingIdx = index.findIndex((d) => d.title === title);
            const docEntry = {
                id: docId,
                title,
                source: filePath || '手动输入',
                category,
                type: filePath ? extname(filePath).slice(1) : 'text',
                chunkCount: chunks.length,
                size: content.length,
                addedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags,
            };
            if (existingIdx >= 0) {
                // 更新已有文档
                index[existingIdx] = { ...index[existingIdx], ...docEntry, id: index[existingIdx].id };
            }
            else {
                index.push(docEntry);
            }
            saveIndex(context.workspace, index);
            return {
                success: true,
                content: [
                    `✅ 已添加到知识库`,
                    `  标题: ${title}`,
                    `  分类: ${category}`,
                    `  标签: ${tags.length > 0 ? tags.join(', ') : '(无)'}`,
                    `  大小: ${content.length} 字符, ${chunks.length} 个分块`,
                    `  ID: ${docId}`,
                    ``,
                    `知识库共 ${index.length} 篇文档`,
                ].join('\n'),
                metadata: { docId, title, size: content.length, chunkCount: chunks.length, totalDocs: index.length },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '添加知识失败');
            return { success: false, content: `添加知识失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 检索知识库
 * 按关键词、分类、标签检索文档
 */
export const KnowledgeSearchTool = {
    name: 'knowledge_search',
    description: '在工作区知识库中搜索文档。支持关键词匹配、分类筛选、标签过滤。返回相关文档内容和摘要。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: '搜索关键词' },
            category: { type: 'string', description: '可选: 按分类筛选' },
            tag: { type: 'string', description: '可选: 按标签筛选' },
            maxResults: { type: 'number', description: '最大返回结果数, 默认5' },
        },
        required: ['query'],
    },
    async execute(params, context) {
        try {
            const query = params.query.toLowerCase();
            const category = params.category;
            const tag = params.tag;
            const maxResults = params.maxResults || 5;
            const index = loadIndex(context.workspace);
            if (index.length === 0) {
                return { success: true, content: '知识库为空。使用 knowledge_add 工具添加文档。' };
            }
            // 筛选匹配的文档
            let matched = index.filter((doc) => {
                if (category && doc.category !== category)
                    return false;
                if (tag && !doc.tags.includes(tag))
                    return false;
                // 关键词匹配（标题或内容预览）
                if (query) {
                    const titleMatch = doc.title.toLowerCase().includes(query);
                    const tagMatch = doc.tags.some((t) => t.toLowerCase().includes(query));
                    const categoryMatch = doc.category.toLowerCase().includes(query);
                    const sourceMatch = doc.source.toLowerCase().includes(query);
                    // 也搜索内容
                    const kbDir = getKnowledgeDir(context.workspace);
                    const chunkDir = join(kbDir, doc.id);
                    let contentMatch = false;
                    if (existsSync(chunkDir)) {
                        try {
                            const chunkFiles = readdirSync(chunkDir).filter((f) => f.startsWith('chunk_'));
                            for (const chunkFile of chunkFiles.slice(0, 3)) {
                                const chunkContent = readFileSync(join(chunkDir, chunkFile), 'utf-8');
                                if (chunkContent.toLowerCase().includes(query)) {
                                    contentMatch = true;
                                    break;
                                }
                            }
                        }
                        catch { /* ignore */ }
                    }
                    return titleMatch || tagMatch || categoryMatch || sourceMatch || contentMatch;
                }
                return true;
            });
            // 按相关性排序(标题匹配 > 内容匹配)
            matched.sort((a, b) => {
                const aTitle = a.title.toLowerCase().includes(query) ? 1 : 0;
                const bTitle = b.title.toLowerCase().includes(query) ? 1 : 0;
                return bTitle - aTitle || b.updatedAt.localeCompare(a.updatedAt);
            });
            matched = matched.slice(0, maxResults);
            if (matched.length === 0) {
                return { success: true, content: `未找到匹配 "${query}" 的文档。` };
            }
            // 提取内容预览
            const results = [];
            for (const doc of matched) {
                const kbDir = getKnowledgeDir(context.workspace);
                const chunkDir = join(kbDir, doc.id);
                let preview = '';
                if (existsSync(chunkDir)) {
                    try {
                        const chunkFiles = readdirSync(chunkDir)
                            .filter((f) => f.startsWith('chunk_'))
                            .sort();
                        if (chunkFiles.length > 0) {
                            preview = readFileSync(join(chunkDir, chunkFiles[0]), 'utf-8').slice(0, 300);
                        }
                    }
                    catch {
                        preview = '(无法读取内容)';
                    }
                }
                results.push([
                    `📄 ${doc.title}`,
                    `   分类: ${doc.category} | 标签: ${doc.tags.join(', ') || '(无)'}`,
                    `   大小: ${doc.size} 字符 | ${doc.chunkCount} 分块 | 更新: ${doc.updatedAt.slice(0, 10)}`,
                    `   预览: ${preview || '(空)'}...`,
                    `   ID: ${doc.id}`,
                ].join('\n'));
            }
            return {
                success: true,
                content: [
                    `🔍 知识库搜索结果 (${matched.length}/${index.length}):`,
                    ``,
                    results.join('\n\n'),
                    ``,
                    `使用 knowledge_get {id} 获取完整文档内容。`,
                ].join('\n'),
                metadata: { query, matchedCount: matched.length, totalDocs: index.length },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `知识检索失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 获取知识库文档详情
 */
export const KnowledgeGetTool = {
    name: 'knowledge_get',
    description: '获取知识库中文档的完整内容和元数据。通过ID精确查找。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            docId: { type: 'string', description: '文档ID(从knowledge_list或knowledge_search获取)' },
        },
        required: ['docId'],
    },
    async execute(params, context) {
        try {
            const docId = params.docId;
            const index = loadIndex(context.workspace);
            const doc = index.find((d) => d.id === docId);
            if (!doc) {
                return { success: false, content: `未找到ID为 "${docId}" 的文档。使用 knowledge_list 查看所有文档。` };
            }
            const kbDir = getKnowledgeDir(context.workspace);
            const chunkDir = join(kbDir, docId);
            let fullContent = '';
            if (existsSync(chunkDir)) {
                const chunkFiles = readdirSync(chunkDir)
                    .filter((f) => f.startsWith('chunk_'))
                    .sort();
                for (const f of chunkFiles) {
                    fullContent += readFileSync(join(chunkDir, f), 'utf-8');
                }
            }
            const metadata = [
                `📄 ${doc.title}`,
                `ID: ${doc.id}`,
                `分类: ${doc.category}`,
                `标签: ${doc.tags.join(', ') || '(无)'}`,
                `来源: ${doc.source}`,
                `添加时间: ${doc.addedAt}`,
                `更新时间: ${doc.updatedAt}`,
                `大小: ${doc.size} 字符, ${doc.chunkCount} 分块`,
                ``,
                `--- 内容 ---`,
            ].join('\n');
            const maxContent = 20000;
            const content = fullContent.slice(0, maxContent);
            const truncated = fullContent.length > maxContent
                ? `\n\n... (内容已截断，共 ${fullContent.length} 字符，显示前 ${maxContent} 字符)`
                : '';
            return {
                success: true,
                content: `${metadata}\n${content}${truncated}`,
                metadata: { docId, title: doc.title, size: doc.size },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `获取文档失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 列出知识库所有文档
 */
export const KnowledgeListTool = {
    name: 'knowledge_list',
    description: '列出工作区知识库中的所有文档及其元数据。支持按分类、标签筛选。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            category: { type: 'string', description: '可选: 按分类筛选' },
            tag: { type: 'string', description: '可选: 按标签筛选' },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            let index = loadIndex(context.workspace);
            if (params.category) {
                index = index.filter((d) => d.category === params.category);
            }
            if (params.tag) {
                index = index.filter((d) => d.tags.includes(params.tag));
            }
            if (index.length === 0) {
                return { success: true, content: '知识库为空。使用 knowledge_add 工具添加文档。' };
            }
            // 按分类分组
            const grouped = {};
            for (const doc of index) {
                if (!grouped[doc.category])
                    grouped[doc.category] = [];
                grouped[doc.category].push(doc);
            }
            const lines = [
                `📚 知识库 (${index.length} 篇文档)`,
                ``,
            ];
            for (const [cat, docs] of Object.entries(grouped).sort()) {
                lines.push(`[${cat}] (${docs.length}篇)`);
                for (const doc of docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
                    const tagsStr = doc.tags.length > 0 ? ` [${doc.tags.join(', ')}]` : '';
                    lines.push(`  📄 ${doc.title}${tagsStr}`);
                    lines.push(`     ID: ${doc.id} | ${doc.size}字符 | ${doc.updatedAt.slice(0, 10)}`);
                }
                lines.push('');
            }
            return {
                success: true,
                content: lines.join('\n'),
                metadata: {
                    totalDocs: index.length,
                    categories: Object.keys(grouped),
                    totalSize: index.reduce((sum, d) => sum + d.size, 0),
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `列出知识库失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 删除知识库文档
 */
export const KnowledgeRemoveTool = {
    name: 'knowledge_remove',
    description: '从知识库中移除指定文档(不可恢复)。需要确认执行。',
    requiresConfirm: true,
    parameters: {
        type: 'object',
        properties: {
            docId: { type: 'string', description: '要删除的文档ID' },
        },
        required: ['docId'],
    },
    async execute(params, context) {
        try {
            const docId = params.docId;
            const index = loadIndex(context.workspace);
            const doc = index.find((d) => d.id === docId);
            if (!doc) {
                return { success: false, content: `未找到ID为 "${docId}" 的文档。` };
            }
            // 删除分块目录
            const kbDir = getKnowledgeDir(context.workspace);
            const chunkDir = join(kbDir, docId);
            if (existsSync(chunkDir)) {
                const { rmSync } = await import('node:fs');
                rmSync(chunkDir, { recursive: true, force: true });
            }
            // 更新索引
            const newIndex = index.filter((d) => d.id !== docId);
            saveIndex(context.workspace, newIndex);
            return {
                success: true,
                content: `✅ 已删除文档: ${doc.title} (ID: ${docId})`,
                metadata: { deleted: doc.title, remainingDocs: newIndex.length },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `删除文档失败: ${msg}`, error: msg };
        }
    },
};
/** 知识库工具集 */
export const KnowledgeTools = [KnowledgeAddTool, KnowledgeSearchTool, KnowledgeGetTool, KnowledgeListTool, KnowledgeRemoveTool];
//# sourceMappingURL=KnowledgeTools.js.map