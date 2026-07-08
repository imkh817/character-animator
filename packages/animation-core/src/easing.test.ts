import { describe, expect, it } from 'vitest';
import { applyEasing, cubicBezier } from './easing';

describe('cubicBezier', () => {
  it('경계에서 0과 1을 반환한다', () => {
    expect(cubicBezier(0.42, 0, 0.58, 1, 0)).toBe(0);
    expect(cubicBezier(0.42, 0, 0.58, 1, 1)).toBe(1);
  });

  it('linear에 해당하는 제어점은 항등 함수다', () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3, t)).toBeCloseTo(t, 4);
    }
  });

  it('easeInOut은 중간점에서 0.5를 지나고 단조 증가한다', () => {
    expect(cubicBezier(0.42, 0, 0.58, 1, 0.5)).toBeCloseTo(0.5, 4);

    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const y = cubicBezier(0.42, 0, 0.58, 1, i / 20);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('easeIn은 초반이 느리고, easeOut은 초반이 빠르다', () => {
    expect(cubicBezier(0.42, 0, 1, 1, 0.25)).toBeLessThan(0.25);
    expect(cubicBezier(0, 0, 0.58, 1, 0.25)).toBeGreaterThan(0.25);
  });
});

describe('applyEasing', () => {
  it('linear는 진행도를 그대로 반환한다', () => {
    expect(applyEasing({ type: 'linear' }, 0.3)).toBe(0.3);
  });

  it('진행도를 0~1로 클램프한다', () => {
    expect(applyEasing({ type: 'linear' }, -0.5)).toBe(0);
    expect(applyEasing({ type: 'linear' }, 1.5)).toBe(1);
  });

  it('bezier 타입은 제어점을 사용한다', () => {
    expect(applyEasing({ type: 'bezier', values: [0.42, 0, 0.58, 1] }, 0.5)).toBeCloseTo(0.5, 4);
  });
});
