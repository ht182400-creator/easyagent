/**
 * 知识库页面 - 添加文档弹窗（P2-1 拆分产物，自 KnowledgeBase.tsx 纯搬迁）
 *
 * 表单状态（标题/内容/分类/标签/三种添加方式）全部内聚在弹窗内部 ——
 * 弹窗以 `{showAdd && <AddDocumentModal/>}` 条件挂载，每次打开即全新状态
 * （替代原先暴露在主组件里的 resetForm）。「浏览文件」按钮通过
 * onOpenBrowser 回调交给主组件渲染 FileBrowser。
 *
 * @module pages/knowledge-base/AddDocumentModal
 */

import { useRef, useState } from 'react';
import { Upload, FileText, FolderOpen, Plus, X } from 'lucide-react';
import { KB_CATEGORIES, useKnowledgeBaseStore } from '../../stores/knowledgeBaseStore';
import { useAppStore } from '../../stores/appStore';
import FileBrowser from '../../components/FileBrowser';

/** 添加文档弹窗属性 */
export interface AddDocumentModalProps {
  /** 当前作用域（决定文件路径的相对基准与提示文案） */
  scope: 'project' | 'global';
  /** 关闭弹窗 */
  onClose: () => void;
}

export function AddDocumentModal({ scope, onClose }: AddDocumentModalProps) {
  const { addDocument, importFromFile, uploadFile } = useKnowledgeBaseStore();
  const addNotification = useAppStore((s) => s.addNotification);
  /** 文件浏览器弹窗（项目作用域下选择文件路径） */
  const [showBrowser, setShowBrowser] = useState(false);

  // ── 表单状态（原主组件 125-133 行，纯搬迁）──
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formTags, setFormTags] = useState('');
  const [addType, setAddType] = useState<'text' | 'file' | 'upload'>('text');
  const [formFilePath, setFormFilePath] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 提交添加（文本 / 项目文件路径信息 / 上传） */
  const handleAdd = async () => {
    if (!formTitle.trim()) {
      addNotification({ type: 'warning', message: '请输入文档标题' });
      return;
    }
    if (addType === 'text' && !formContent.trim()) {
      addNotification({ type: 'warning', message: '请输入文档内容' });
      return;
    }
    if (addType === 'upload' && !uploadFileObj) {
      addNotification({ type: 'warning', message: '请选择要上传的文件' });
      return;
    }

    try {
      const tags = formTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (addType === 'upload' && uploadFileObj) {
        // 文件上传
        await uploadFile(uploadFileObj, formCategory, tags);
      } else {
        await addDocument({
          title: formTitle,
          content: addType === 'text' ? formContent : '',
          category: formCategory,
          tags,
          source: addType === 'file' ? formFilePath : '手动输入',
          size: addType === 'text' ? formContent.length : uploadFileObj?.size || 0,
        });
      }
      onClose();
    } catch (err) {
      addNotification({ type: 'error', message: `添加失败: ${(err as Error).message}` });
    }
  };

  /** 从项目文件路径导入 */
  const handleImportFile = async () => {
    if (!formFilePath.trim()) {
      addNotification({ type: 'warning', message: '请输入文件路径' });
      return;
    }
    try {
      await importFromFile(formFilePath);
      onClose();
    } catch (err) {
      addNotification({ type: 'error', message: `导入失败: ${(err as Error).message}` });
    }
  };

  /** 处理文件选择（通过系统文件对话框） */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFileObj(file);
      setUploadFileName(file.name);
      // 自动用文件名作为标题
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  /** 处理拖拽上传 */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadFileObj(file);
      setUploadFileName(file.name);
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-400" />
            添加文档
          </h2>
          <button className="p-1 hover:bg-gray-800 rounded-lg" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 添加方式 */}
          <div className="flex gap-2">
            <button
              className={`flex-1 py-2 rounded-lg text-sm transition-colors ${addType === 'text' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
              onClick={() => setAddType('text')}
            >
              手动输入
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm transition-colors ${addType === 'file' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
              onClick={() => setAddType('file')}
            >
              项目文件
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm transition-colors ${addType === 'upload' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
              onClick={() => setAddType('upload')}
            >
              <Upload className="w-3.5 h-3.5 inline mr-1" />
              上传文件
            </button>
          </div>

          {/* 标题 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">文档标题</label>
            <input
              type="text"
              className="input w-full"
              placeholder="给文档起个名字"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>

          {/* 内容 / 文件路径 / 上传 */}
          {addType === 'text' ? (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">文档内容</label>
              <textarea
                className="input w-full h-32 resize-none font-mono text-sm"
                placeholder="粘贴或输入文档内容..."
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
              />
            </div>
          ) : addType === 'file' ? (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                文件路径（相对于{scope === 'global' ? '用户目录' : '项目根目录'}）
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="例如: docs/README.md"
                  value={formFilePath}
                  onChange={(e) => setFormFilePath(e.target.value)}
                />
                {scope === 'project' && (
                  <button
                    type="button"
                    className="btn-secondary text-sm px-3 flex items-center gap-1 shrink-0"
                    onClick={() => setShowBrowser(true)}
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> 浏览...
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {scope === 'project'
                  ? '路径相对于项目根目录。可直接输入，或点击"浏览..."从文件树中选择。'
                  : '路径相对于用户目录 ~。仅支持用户目录下的文件。'}
              </p>
              <button
                className="mt-2 btn-secondary text-sm py-1.5 flex items-center gap-1"
                onClick={handleImportFile}
              >
                <Upload className="w-3.5 h-3.5" /> 从文件导入
              </button>
            </div>
          ) : (
            /* 上传文件 */
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                上传文件（支持任意本地文件）
              </label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".md,.txt,.json,.yaml,.yml,.toml,.xml,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.c,.cpp,.css,.html,.vue,.svelte,.sh,.bat,.ps1,.env"
                onChange={handleFileSelect}
              />
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${uploadFileName ? 'border-green-500/40 bg-green-500/5' : 'border-gray-700 hover:border-gray-600'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {uploadFileName ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-10 h-10 text-green-400" />
                    <span className="text-green-400 font-medium">{uploadFileName}</span>
                    <span className="text-xs text-gray-600">
                      {uploadFileObj ? `${(uploadFileObj.size / 1024).toFixed(1)}KB` : ''}
                    </span>
                    <span className="text-xs text-gray-500">点击或拖放更换文件</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-gray-600" />
                    <span className="text-gray-400">点击选择文件或拖放文件到此处</span>
                    <span className="text-xs text-gray-600">
                      支持 Markdown、代码文件、文本文件、配置文件等
                    </span>
                    <span className="text-xs text-gray-700">最大 10MB</span>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-600">
                上传的文件将导入到{scope === 'global' ? '全局' : '项目'}
                知识库中，可跨所有项目共享和检索。
              </p>
            </div>
          )}

          {/* 分类 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">分类</label>
            <div className="grid grid-cols-3 gap-2">
              {KB_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  className={`py-2 px-3 rounded-lg text-xs transition-colors ${formCategory === cat.id ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}`}
                  onClick={() => setFormCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 标签 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">标签 (逗号分隔)</label>
            <input
              type="text"
              className="input w-full"
              placeholder="例如: typescript, react, 教程"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={handleAdd}>
            <Plus className="w-4 h-4" /> 添加文档
          </button>
        </div>
      </div>

      {/* 文件浏览器（项目作用域下选择路径；渲染在弹窗树内，层级位于添加弹窗之上） */}
      {showBrowser && (
        <FileBrowser
          selectedPath={formFilePath}
          scope={scope}
          onSelect={(path) => {
            setFormFilePath(path);
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
