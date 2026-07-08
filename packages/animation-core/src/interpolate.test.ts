import { describe, expect, it } from 'vitest';
import { buildSceneTree, getLocalTransform, sampleKeyframes } from './interpolate';
import type { Keyframe, SceneNode } from './types';
import { createDefaultTransform } from './types';

const linear = { type: 'linear' } as const;

function kf(frame: number, value: number, easing: Keyframe['easing'] = linear): Keyframe {
  return { frame, value, easing };
}

function node(id: string, parentId: string | null = null): SceneNode {
  return {
    id,
    name: id,
    assetId: `asset-${id}`,
    parentId,
    size: { width: 100, height: 100 },
    pivot: { x: 0, y: 0 },
    base: createDefaultTransform(),
    visible: true,
    locked: false,
  };
}

describe('sampleKeyframes', () => {
  it('키프레임이 없으면 fallback(base 값)을 반환한다', () => {
    expect(sampleKeyframes(undefined, 10, 42)).toBe(42);
    expect(sampleKeyframes([], 10, 42)).toBe(42);
  });

  it('첫 키 이전과 마지막 키 이후는 양 끝 값으로 고정된다', () => {
    const keyframes = [kf(10, 100), kf(20, 200)];
    expect(sampleKeyframes(keyframes, 0, 0)).toBe(100);
    expect(sampleKeyframes(keyframes, 30, 0)).toBe(200);
  });

  it('linear 구간의 중간값을 선형 보간한다', () => {
    const keyframes = [kf(0, 0), kf(10, 100)];
    expect(sampleKeyframes(keyframes, 5, 0)).toBe(50);
    expect(sampleKeyframes(keyframes, 3, 0)).toBeCloseTo(30);
  });

  it('hold는 다음 키프레임까지 값을 고정한다', () => {
    const keyframes = [kf(0, 0, { type: 'hold' }), kf(10, 100)];
    expect(sampleKeyframes(keyframes, 9, 0)).toBe(0);
    expect(sampleKeyframes(keyframes, 10, 0)).toBe(100);
  });

  it('세 개 이상의 키프레임에서 올바른 구간을 찾는다 (이진 탐색)', () => {
    const keyframes = [kf(0, 0), kf(10, 100), kf(20, 0), kf(30, 50)];
    expect(sampleKeyframes(keyframes, 5, 0)).toBe(50);
    expect(sampleKeyframes(keyframes, 15, 0)).toBe(50);
    expect(sampleKeyframes(keyframes, 25, 0)).toBe(25);
  });

  it('easeInOut 구간은 중간점에서 linear와 같고 1/4 지점에서는 더 느리다', () => {
    const eased = [kf(0, 0, { type: 'easeInOut' }), kf(100, 100)];
    expect(sampleKeyframes(eased, 50, 0)).toBeCloseTo(50, 2);
    expect(sampleKeyframes(eased, 25, 0)).toBeLessThan(25);
  });
});

describe('getLocalTransform', () => {
  it('애니메이션이 없는 속성은 base 값을 유지한다', () => {
    const n = node('a');
    n.base.x = 7;
    n.base.opacity = 0.5;

    const t = getLocalTransform(n, { y: [kf(0, 0), kf(10, 100)] }, 5);

    expect(t.x).toBe(7);
    expect(t.y).toBe(50);
    expect(t.opacity).toBe(0.5);
    expect(t.scaleX).toBe(1);
  });
});

describe('buildSceneTree', () => {
  it('parentId로 트리를 구성하고 배열 순서를 유지한다', () => {
    const body = node('body');
    const leftArm = node('left-arm', 'body');
    const rightArm = node('right-arm', 'body');
    const head = node('head');

    const tree = buildSceneTree([body, leftArm, rightArm, head]);

    expect(tree.map((t) => t.node.id)).toEqual(['body', 'head']);
    expect(tree[0]!.children.map((t) => t.node.id)).toEqual(['left-arm', 'right-arm']);
  });

  it('존재하지 않는 부모를 가리키면 루트로 취급한다', () => {
    const orphan = node('orphan', 'ghost');
    const tree = buildSceneTree([orphan]);
    expect(tree.map((t) => t.node.id)).toEqual(['orphan']);
  });
});
