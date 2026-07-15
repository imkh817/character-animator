import { describe, expect, it } from 'vitest';
import { sampleKeyframes } from './interpolate';
import { blockRanges, compileStoryboard, storyboardTotalFrames } from './storyboard';
import { createDefaultTransform, type SceneNode, type Storyboard } from './types';

const FPS = 30;

function makeNode(id: string): SceneNode {
  return {
    id,
    name: id,
    parentId: null,
    size: { width: 100, height: 100 },
    pivot: { x: 50, y: 50 },
    base: createDefaultTransform(),
    visible: true,
    locked: false,
  };
}

describe('blockRanges / storyboardTotalFrames', () => {
  it('블록을 순서대로 이어 붙인 시작 프레임을 계산한다', () => {
    const storyboard: Storyboard = {
      blocks: [
        { id: 'a', durationInFrames: 30, nodes: {} },
        { id: 'b', durationInFrames: 60, nodes: {} },
        { id: 'c', durationInFrames: 15, nodes: {} },
      ],
    };
    expect(blockRanges(storyboard)).toEqual([
      { id: 'a', start: 0, durationInFrames: 30 },
      { id: 'b', start: 30, durationInFrames: 60 },
      { id: 'c', start: 90, durationInFrames: 15 },
    ]);
    expect(storyboardTotalFrames(storyboard)).toBe(105);
  });

  it('0 이하 길이는 1프레임으로 보정한다', () => {
    const storyboard: Storyboard = { blocks: [{ id: 'a', durationInFrames: 0, nodes: {} }] };
    expect(storyboardTotalFrames(storyboard)).toBe(1);
  });
});

describe('compileStoryboard', () => {
  it('두 번째 블록의 프리셋은 블록 시작만큼 밀려 배치되고 블록을 벗어나지 않는다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [
        { id: 'a', durationInFrames: 30, nodes: {} },
        { id: 'b', durationInFrames: 60, nodes: { n1: { presetIds: ['nod'] } } },
      ],
    };
    const { durationInFrames, animations } = compileStoryboard(storyboard, [node], FPS);

    expect(durationInFrames).toBe(90);
    const rotation = animations.n1!.rotation!;
    // 첫 키는 블록 직전 프레임의 base 고정 앵커, 나머지는 블록 안
    expect(rotation[0]).toMatchObject({ frame: 29, value: node.base.rotation, easing: { type: 'hold' } });
    for (const kf of rotation.slice(1)) {
      expect(kf.frame).toBeGreaterThanOrEqual(30);
      expect(kf.frame).toBeLessThanOrEqual(89);
    }
    // 프리셋 앞 구간(블록 a)에서는 첫 키프레임 값 = base로 고정되어 튀지 않는다
    expect(sampleKeyframes(rotation, 0, node.base.rotation)).toBeCloseTo(node.base.rotation);
  });

  it('프리셋을 겹치면 뒤 프리셋이 겹치는 속성을 덮는다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [{ id: 'a', durationInFrames: 60, nodes: { n1: { presetIds: ['breathe', 'nod'] } } }],
    };
    const { animations } = compileStoryboard(storyboard, [node], FPS);
    // breathe(scaleX/Y) + nod(rotation) — 겹치는 속성이 없어 셋 다 존재
    expect(Object.keys(animations.n1!).sort()).toEqual(['rotation', 'scaleX', 'scaleY']);
  });

  it('숨긴 블록에서는 opacity 0, 보이는 블록에서는 base opacity가 된다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [
        { id: 'a', durationInFrames: 30, nodes: {} },
        { id: 'b', durationInFrames: 30, nodes: { n1: { hidden: true } } },
        { id: 'c', durationInFrames: 30, nodes: {} },
      ],
    };
    const { animations } = compileStoryboard(storyboard, [node], FPS);
    const opacity = animations.n1!.opacity!;

    expect(sampleKeyframes(opacity, 0, 1)).toBe(1);
    expect(sampleKeyframes(opacity, 29, 1)).toBe(1); // 숨김 직전까지 유지 (fade-out 없음)
    expect(sampleKeyframes(opacity, 30, 1)).toBe(0);
    expect(sampleKeyframes(opacity, 59, 1)).toBe(0);
    expect(sampleKeyframes(opacity, 60, 1)).toBe(1);
  });

  it('숨긴 블록에서는 프리셋을 실행하지 않는다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [{ id: 'a', durationInFrames: 30, nodes: { n1: { hidden: true, presetIds: ['nod'] } } }],
    };
    const { animations } = compileStoryboard(storyboard, [node], FPS);
    expect(animations.n1!.rotation).toBeUndefined();
    expect(sampleKeyframes(animations.n1!.opacity, 10, 1)).toBe(0);
  });

  it('opacity 프리셋(등장!)과 숨김이 공존해도 경계가 깨지지 않는다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [
        { id: 'a', durationInFrames: 30, nodes: { n1: { hidden: true } } },
        { id: 'b', durationInFrames: 60, nodes: { n1: { presetIds: ['popIn'] } } },
      ],
    };
    const { animations } = compileStoryboard(storyboard, [node], FPS);
    const opacity = animations.n1!.opacity!;

    expect(sampleKeyframes(opacity, 15, 1)).toBe(0); // 숨김
    expect(sampleKeyframes(opacity, 30, 1)).toBe(0); // popIn 시작 (0에서 등장)
    expect(sampleKeyframes(opacity, 89, 1)).toBeCloseTo(1); // 등장 완료
  });

  it('뒤 장면의 등장! 프리셋이 앞 장면들을 투명하게 만들지 않는다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [
        { id: 'a', durationInFrames: 30, nodes: {} },
        { id: 'b', durationInFrames: 30, nodes: {} },
        { id: 'c', durationInFrames: 60, nodes: { n1: { presetIds: ['popIn'] } } },
      ],
    };
    const { animations } = compileStoryboard(storyboard, [node], FPS);

    // 장면 1~2: base 그대로 보인다
    for (const frame of [0, 29, 30, 59]) {
      expect(sampleKeyframes(animations.n1!.opacity, frame, 1), `opacity@${frame}`).toBe(1);
      expect(sampleKeyframes(animations.n1!.scaleX, frame, 1), `scaleX@${frame}`).toBe(1);
    }
    // 장면 3 시작: 등장! 효과 (투명 + 절반 크기에서 시작)
    expect(sampleKeyframes(animations.n1!.opacity, 60, 1)).toBe(0);
    expect(sampleKeyframes(animations.n1!.scaleX, 60, 1)).toBeCloseTo(0.5);
    // 등장 완료 후에는 base로 정착
    expect(sampleKeyframes(animations.n1!.opacity, 119, 1)).toBeCloseTo(1);
  });

  it('상태가 비면 빈 트랙을 반환해 기존 컴파일 결과를 지울 수 있다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [{ id: 'a', durationInFrames: 30, nodes: { n1: { presetIds: [] } } }],
    };
    const { animations } = compileStoryboard(storyboard, [node], FPS);
    expect(animations.n1).toEqual({});
  });

  it('존재하지 않는 노드/프리셋은 무시한다', () => {
    const storyboard: Storyboard = {
      blocks: [{ id: 'a', durationInFrames: 30, nodes: { ghost: { presetIds: ['nope'] } } }],
    };
    const { animations } = compileStoryboard(storyboard, [], FPS);
    expect(animations).toEqual({});
  });

  it('모든 트랙은 frame 오름차순이고 같은 프레임 중복이 없다', () => {
    const node = makeNode('n1');
    const storyboard: Storyboard = {
      blocks: [
        { id: 'a', durationInFrames: 20, nodes: { n1: { presetIds: ['popIn'] } } },
        { id: 'b', durationInFrames: 20, nodes: { n1: { hidden: true } } },
        { id: 'c', durationInFrames: 20, nodes: { n1: { presetIds: ['wiggle', 'bounce'] } } },
      ],
    };
    const { animations } = compileStoryboard(storyboard, [node], FPS);
    for (const track of Object.values(animations.n1!)) {
      for (let i = 1; i < track.length; i++) {
        expect(track[i]!.frame).toBeGreaterThan(track[i - 1]!.frame);
      }
    }
  });
});
