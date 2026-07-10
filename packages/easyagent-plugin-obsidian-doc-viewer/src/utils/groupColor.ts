import * as d3 from 'd3';

/**
 * 目录分组颜色映射工具
 * 统一图谱节点和文件树使用的颜色方案，确保视觉一致
 *
 * 颜色方案来自 d3.schemeCategory10（10 种区分度最高的颜色）
 * 按"分组首次出现顺序"分配索引，与 d3.scaleOrdinal 在图谱中的行为完全一致
 *
 * 用法：
 *   const colorMap = buildGroupColorMap(groups);
 *   colorMap.get('docs')  // 返回稳定颜色
 */

const CATEGORY_10 = d3.schemeCategory10 as readonly string[];

/**
 * 根据分组列表构建"首次出现顺序 → 颜色"映射表
 * @param groups 分组名列表（按希望分配颜色的顺序）
 * @returns Map<groupName, color>
 */
export function buildGroupColorMap(groups: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const g of groups) {
    if (map.has(g)) continue;
    map.set(g, CATEGORY_10[idx % CATEGORY_10.length]);
    idx++;
  }
  return map;
}

/**
 * 获取指定索引的颜色（用于按出现顺序取色）
 */
export function getColorByIndex(index: number): string {
  return CATEGORY_10[index % CATEGORY_10.length];
}
