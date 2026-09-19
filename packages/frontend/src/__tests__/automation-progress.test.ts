/**
 * 自动化进度事件归一化测试（2026-09-19 修复回归）
 *
 * 背景：后端广播的载荷写法是 `{ type: 'automation_progress', ...event }`，
 * 而 event 自带 `type: 'agent_start' / 'tool_call' / …` —— 展开顺序把**信封类型覆盖**了，
 * 真正到达前端的是 `{ type: 'agent_start', … }`。
 * 前端此前只匹配 `'automation_progress'`，于是实时进度日志永远为空：
 * 用户只看到「执行中」，不知道 Agent 在干什么（用户实报）。
 */
import { describe, it, expect } from 'vitest';
import { normalizeAutomationStep } from '../stores/automationStore';

describe('normalizeAutomationStep - 进度消息归一化', () => {
  it('步骤类型直接作 type（后端现状）应被识别', () => {
    expect(normalizeAutomationStep({ type: 'agent_start' })).toBe('agent_start');
    expect(normalizeAutomationStep({ type: 'tool_call' })).toBe('tool_call');
    expect(normalizeAutomationStep({ type: 'agent_error' })).toBe('agent_error');
  });

  it('信封形态（type=automation_progress + step）也能识别', () => {
    expect(normalizeAutomationStep({ type: 'automation_progress', step: 'tool_result' })).toBe(
      'tool_result',
    );
  });

  it('step 优先于 type', () => {
    expect(normalizeAutomationStep({ type: 'automation_progress', step: 'agent_done' })).toBe(
      'agent_done',
    );
  });

  it('非步骤消息返回 null（connected / automation_subscribed 等）', () => {
    expect(normalizeAutomationStep({ type: 'connected' })).toBeNull();
    expect(normalizeAutomationStep({ type: 'automation_subscribed' })).toBeNull();
    expect(normalizeAutomationStep({})).toBeNull();
  });
});
