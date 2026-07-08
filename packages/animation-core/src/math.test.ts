import { describe, expect, it } from 'vitest';
import { getWorldMatrix, invertLinear, transformVector } from './math';
import type { SceneDocument, SceneNode } from './types';
import { createDefaultTransform, createEmptySceneDocument } from './types';

function node(id: string, parentId: string | null, overrides?: Partial<SceneNode['base']>): SceneNode {
  return {
    id,
    name: id,
    assetId: `asset-${id}`,
    parentId,
    size: { width: 100, height: 100 },
    pivot: { x: 0, y: 0 },
    base: { ...createDefaultTransform(), ...overrides },
    visible: true,
    locked: false,
  };
}

function doc(nodes: SceneNode[]): SceneDocument {
  return { ...createEmptySceneDocument(), nodes };
}

describe('getWorldMatrix', () => {
  it('부모의 이동이 자식에게 누적된다', () => {
    const d = doc([node('parent', null, { x: 100, y: 50 }), node('child', 'parent', { x: 10, y: 20 })]);
    const m = getWorldMatrix(d, 'child', 0);
    expect(m.tx).toBeCloseTo(110);
    expect(m.ty).toBeCloseTo(70);
  });

  it('90도 회전한 부모 아래에서 자식의 x 이동은 월드 y 이동이 된다', () => {
    const d = doc([node('parent', null, { rotation: 90 }), node('child', 'parent', { x: 10 })]);
    const m = getWorldMatrix(d, 'child', 0);
    expect(m.tx).toBeCloseTo(0);
    expect(m.ty).toBeCloseTo(10);
  });

  it('역행렬로 화면 delta를 부모 공간 delta로 되돌릴 수 있다', () => {
    const d = doc([node('parent', null, { rotation: 90, scaleX: 2, scaleY: 2 })]);
    const parentWorld = getWorldMatrix(d, 'parent', 0);
    const inv = invertLinear(parentWorld)!;
    // 부모 공간에서 (1, 0)만큼 이동 → 월드에서 (0, 2). 그 역변환이 (1, 0)이어야 한다
    const back = transformVector(inv, 0, 2);
    expect(back.x).toBeCloseTo(1);
    expect(back.y).toBeCloseTo(0);
  });
});
