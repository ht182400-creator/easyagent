/**
 * 语义分析模块导出
 */
export {
  buildSemanticMap,
  buildSemanticMapAsync,
  searchSymbol,
  findReferences,
  formatSemanticMap,
  getCodebaseOverview,
  getCodebaseOverviewAsync,
  analyzeFile,
  analyzeFileCached,
  clearAnalysisCache,
  extractSymbols,
  collectSourceFiles,
  findRepoRoot,
} from './SemanticAnalyzer.js';

export type {
  SymbolInfo,
  ReferenceInfo,
  FileSemanticInfo,
  SemanticMap,
  CodebaseOverview,
  SupportedLanguage,
} from './SemanticAnalyzer.js';
