/**
 * 知识库 API 路由（支持 project / global 双作用域）
 *
 * ── 从 index.ts 拆出的背景（P1-1）──
 * `packages/server/src/index.ts` 曾达 3800+ 行、注册 93 条路由，
 * 远超项目自身「单文件 ≤500 行」的规范。本模块是其拆分的第一阶段产物。
 *
 * ── 拆分原则 ──
 *   · 纯搬迁：路由路径、方法、处理逻辑、**注册顺序**全部保持不变
 *     （注册顺序对知识库很关键：`/stats/summary` 必须先于 `/:id`，否则被 `:id` 捕获）
 *   · 显式依赖注入：不引入"上帝上下文"，只声明本模块真正需要的依赖
 *   · 安全网：`__tests__/route-inventory.test.ts` 保证路由集合逐条等价
 *
 * @module routes/knowledge
 */

import { readFileSync, rmSync } from 'node:fs';
import type { Express, RequestHandler } from 'express';
import type { KnowledgeService } from '@easyagent/core';

// ===================== 依赖声明 =====================

/** 知识库路由所需依赖 */
export interface KnowledgeRoutesDeps {
  /** 按作用域解析知识库实例（'global' → 全局，其余 → 项目级） */
  resolveKnowledgeService: (scope?: string) => KnowledgeService;
  /** 项目级知识库实例（合并统计时直接使用） */
  projectKnowledgeService: KnowledgeService;
  /** 全局知识库实例 */
  globalKnowledgeService: KnowledgeService;
  /** multer 上传中间件（用于「上传文件导入知识库」） */
  upload: RequestHandler;
}

// ===================== 路由注册 =====================

/**
 * 注册知识库相关路由
 *
 * @param app - Express 应用
 * @param deps - 依赖（见 {@link KnowledgeRoutesDeps}）
 */
export function registerKnowledgeRoutes(app: Express, deps: KnowledgeRoutesDeps): void {
  const { resolveKnowledgeService, projectKnowledgeService, globalKnowledgeService, upload } = deps;

  // ========== 知识库 API（支持 project/global 双作用域） ==========

  /** 获取知识库文档列表 */
  app.get('/api/knowledge', (req, res) => {
    try {
      const { category, tag, scope } = req.query;
      const kbService = resolveKnowledgeService(scope as string);
      const docs = kbService.listDocuments({
        category: category as string | undefined,
        tag: tag as string | undefined,
      });
      const stats = kbService.getStats();
      const allTags = kbService.getAllTags();
      res.json({
        success: true,
        documents: docs,
        stats,
        tags: allTags,
        scope: kbService.getScope(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 添加知识库文档 */
  app.post('/api/knowledge', (req, res) => {
    try {
      const { title, content, filePath, category, tags, scope } = req.body;
      if (!title) {
        return res.status(400).json({ success: false, error: '缺少 title 参数' });
      }
      const kbService = resolveKnowledgeService(scope);
      const result = kbService.addDocument({ title, content, filePath, category, tags });
      if (result.success) {
        const doc = kbService.getDocument(result.docId!);
        res.json({
          success: true,
          document: doc.doc,
          content: doc.content,
          scope: kbService.getScope(),
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 删除知识库文档 */
  app.delete('/api/knowledge/:id', (req, res) => {
    try {
      const { scope } = req.query;
      const kbService = resolveKnowledgeService(scope as string);
      const result = kbService.removeDocument(req.params.id);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 搜索知识库 */
  app.get('/api/knowledge/search', (req, res) => {
    try {
      const { q, category, tag, maxResults, scope } = req.query;
      if (!q) {
        return res.status(400).json({ success: false, error: '缺少 q 参数' });
      }
      const kbService = resolveKnowledgeService(scope as string);
      const result = kbService.search({
        query: q as string,
        category: category as string | undefined,
        tag: tag as string | undefined,
        maxResults: maxResults ? parseInt(maxResults as string) : 20,
      });
      res.json({ success: true, ...result, scope: kbService.getScope() });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 从文件导入知识库（项目内相对路径） */
  app.post('/api/knowledge/import', (req, res) => {
    try {
      const { filePath, scope } = req.body;
      if (!filePath) {
        return res.status(400).json({ success: false, error: '缺少 filePath 参数' });
      }
      const kbService = resolveKnowledgeService(scope);
      const result = kbService.importFromFile(filePath);
      if (result.success) {
        const doc = kbService.getDocument(result.docId!);
        res.json({
          success: true,
          document: doc.doc,
          content: doc.content,
          scope: kbService.getScope(),
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 上传文件导入知识库（支持任意本地文件） */
  app.post('/api/knowledge/upload', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '缺少上传文件' });
      }
      const { scope, category, tags: tagsStr } = req.body;
      const kbService = resolveKnowledgeService(scope);

      // 修复中文文件名乱码：multer/busboy 在某些环境下将 UTF-8 字节按 Latin-1 误解码
      let fileName = req.file.originalname;
      try {
        const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
        // 仅当解码结果含中文字符且不同时才替换
        if (decoded !== fileName && /[\u4e00-\u9fff]/.test(decoded)) {
          fileName = decoded;
        } else {
          // 尝试 URL 解码（部分旧版浏览器使用 %E6%96 format）
          const urlDecoded = decodeURIComponent(fileName);
          if (urlDecoded !== fileName) fileName = urlDecoded;
        }
      } catch (err) {
        /* 保持原始文件名 */
      }
      const filePath = req.file.path;
      // 读取文件内容，尝试 UTF-8 优先，降级 GBK
      const raw = readFileSync(filePath);
      let content = raw.toString('utf-8');
      // 如果包含乱码字符 (\ufffd)，尝试 GBK 解码
      if (content.includes('\ufffd')) {
        try {
          const { decode } = require('iconv-lite');
          content = decode(raw, 'gbk');
        } catch (err) {
          /* 无 iconv-lite 则保留 UTF-8 结果 */
        }
      }
      const tags = tagsStr
        ? tagsStr
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];

      const result = kbService.importFromContent(fileName, content, category, tags);

      // 清理临时上传文件
      try {
        rmSync(filePath);
      } catch (err) {
        /* ignore */
      }

      if (result.success) {
        const doc = kbService.getDocument(result.docId!);
        res.json({
          success: true,
          document: doc.doc,
          content: doc.content,
          scope: kbService.getScope(),
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取知识库统计（支持合并双作用域） */
  app.get('/api/knowledge/stats/summary', (req, res) => {
    try {
      const { scope } = req.query;
      if (scope === 'global' || scope === 'project') {
        // 单一作用域
        const kbService = resolveKnowledgeService(scope);
        const stats = kbService.getStats();
        const tags = kbService.getAllTags();
        res.json({ success: true, ...stats, tags, scope: kbService.getScope() });
      } else {
        // 合并双作用域统计
        const projectStats = projectKnowledgeService.getStats();
        const globalStats = globalKnowledgeService.getStats();
        const projectTags = projectKnowledgeService.getAllTags();
        const globalTags = globalKnowledgeService.getAllTags();

        // 合并分类统计
        const categories: Record<string, number> = { ...projectStats.categories };
        for (const [cat, count] of Object.entries(globalStats.categories)) {
          categories[cat] = (categories[cat] || 0) + count;
        }

        res.json({
          success: true,
          totalDocs: projectStats.totalDocs + globalStats.totalDocs,
          totalSize: projectStats.totalSize + globalStats.totalSize,
          categories,
          tags: [...new Set([...projectTags, ...globalTags])].sort(),
          project: { totalDocs: projectStats.totalDocs, totalSize: projectStats.totalSize },
          global: { totalDocs: globalStats.totalDocs, totalSize: globalStats.totalSize },
          scope: 'merged',
        });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取单个知识库文档（注意：必须注册在 stats/summary 之后，避免 :id 捕获 'stats'） */
  app.get('/api/knowledge/:id', (req, res) => {
    try {
      const { scope } = req.query;
      const kbService = resolveKnowledgeService(scope as string);
      const result = kbService.getDocument(req.params.id);
      if (result.success) {
        res.json({
          success: true,
          document: result.doc,
          content: result.content,
          scope: kbService.getScope(),
        });
      } else {
        // 如果当前作用域找不到，尝试另一个作用域
        const altService =
          kbService === projectKnowledgeService ? globalKnowledgeService : projectKnowledgeService;
        const altResult = altService.getDocument(req.params.id);
        if (altResult.success) {
          res.json({
            success: true,
            document: altResult.doc,
            content: altResult.content,
            scope: altService.getScope(),
          });
        } else {
          res.status(404).json({ success: false, error: result.error });
        }
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
}
