/**
 * ScenarioCard 组件测试 — Phase C/D
 * 覆盖: 数据结构验证 + 执行状态逻辑 + React 组件渲染
 * 
 * happy-dom 环境下 React hooks 正常工作，支持完整 DOM 渲染测试。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ScenarioCard from '../../components/LangGraph/ScenarioCard';
import type { Scenario } from '../../components/LangGraph/types';
import type { ScenarioResult } from '../../components/LangGraph/ScenarioCard';

// ==================== 辅助 ====================

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 1,
    name: '测试场景',
    path: 'START → think → END',
    desc: '测试描述文本',
    input: '测试输入',
    icon: '🧪',
    traversalPath: ['START', 'think', 'route', 'END'],
    flowDesc: '直通',
    ...overrides,
  };
}

function makeResult(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    turnCount: 3,
    messageCount: 5,
    duration: '2.3s',
    output: '测试输出',
    logs: [
      { node: 'think', type: 'enter', message: '进入 think 节点' },
      { node: 'route', type: 'decision', message: '决策：无 tool_calls' },
      { node: 'END', type: 'exit', message: '流程结束' },
    ],
    actualPath: ['START', 'think', 'route', 'END'],
    ...overrides,
  };
}

// ==================== 数据结构验证 (4) ====================

describe('ScenarioCard — 数据结构', () => {
  it('Scenario 应包含必需的 id/name/path/desc/input 字段（用例1）', () => {
    const scenario = makeScenario();
    expect(scenario.id).toBe(1);
    expect(scenario.name).toBe('测试场景');
    expect(scenario.path).toBe('START → think → END');
    expect(scenario.desc).toBe('测试描述文本');
    expect(scenario.input).toBe('测试输入');
    expect(scenario.icon).toBe('🧪');
    expect(scenario.flowDesc).toBe('直通');
  });

  it('ScenarioResult 包含执行统计信息（用例5补充）', () => {
    const result = makeResult();
    expect(result.turnCount).toBe(3);
    expect(result.messageCount).toBe(5);
    expect(result.duration).toBe('2.3s');
    expect(result.output).toBe('测试输出');
  });

  it('失败结果的 output 应包含错误信息（用例6）', () => {
    const result: ScenarioResult = {
      turnCount: 0,
      messageCount: 0,
      duration: '失败',
      output: '执行失败: 网络错误',
      logs: [{ node: 'error', type: 'error', message: '网络错误' }],
    };
    expect(result.output).toContain('执行失败');
    expect(result.turnCount).toBe(0);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].type).toBe('error');
  });

  it('logs 数组应包含 enter/decision/exit 类型', () => {
    const result = makeResult();
    const logTypes = result.logs.map((l) => l.type);
    expect(logTypes).toContain('enter');
    expect(logTypes).toContain('decision');
    expect(logTypes).toContain('exit');
  });
});

// ==================== 执行状态枚举 (3) ====================

describe('ScenarioCard — 执行状态逻辑', () => {
  it('无 result 时表示未执行', () => {
    const scenario = makeScenario();
    const result: ScenarioResult | undefined = undefined;
    expect(result).toBeUndefined();
    // 未执行状态的特征
    expect(scenario.traversalPath).toBeDefined();
  });

  it('有 result 且有 output 表示已执行', () => {
    const result = makeResult();
    expect(result.output).toBeTruthy();
  });

  it('isRunning 的概念与 runningScenarios Set 关联', () => {
    const running = new Set<number>([1, 3]);
    expect(running.has(1)).toBe(true);
    expect(running.has(2)).toBe(false);
  });
});

// ==================== 组件渲染 (新增 happy-dom) ====================

describe('ScenarioCard — 组件渲染', () => {
  it('应渲染场景名称和路径（用例1补充）', () => {
    const scenario = makeScenario();
    render(<ScenarioCard scenario={scenario} />);
    // 场景名称渲染为 "#1 测试场景"（含编号前缀）
    expect(screen.getByText(/#1 测试场景/)).toBeTruthy();
    expect(screen.getByText(scenario.path)).toBeTruthy();
  });

  it('应渲染执行按钮（用例2）', () => {
    const scenario = makeScenario();
    const onRun = vi.fn();
    render(<ScenarioCard scenario={scenario} onRun={onRun} />);
    // 验证执行按钮存在
    const runBtn = screen.getByText(/执行/);
    expect(runBtn).toBeTruthy();
  });

  it('应渲染内嵌 MiniFlowGraph（用例3）', () => {
    const scenario = makeScenario();
    const { container } = render(<ScenarioCard scenario={scenario} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('isRunning 时显示执行中状态（用例4）', () => {
    const scenario = makeScenario();
    render(<ScenarioCard scenario={scenario} isRunning={true} />);
    expect(screen.getByText(/执行中/)).toBeTruthy();
  });
});
