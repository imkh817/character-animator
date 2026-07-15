import { describe, expect, it } from 'vitest';
import {
  decomposeMatrix,
  getLocalMatrix,
  getWorldMatrix,
  invertLinear,
  invertMat,
  multiplyMat,
  transformPoint,
  transformVector,
} from './math';
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

describe('invertMat', () => {
  it('m × m⁻¹ = 항등행렬', () => {
    const m = getLocalMatrix(
      { x: 300, y: 200, rotation: 30, scaleX: 1.5, scaleY: 0.8, opacity: 1 },
      { x: 100, y: 100 },
    );
    const inv = invertMat(m)!;
    const identity = multiplyMat(m, inv);
    expect(identity.a).toBeCloseTo(1);
    expect(identity.b).toBeCloseTo(0);
    expect(identity.c).toBeCloseTo(0);
    expect(identity.d).toBeCloseTo(1);
    expect(identity.tx).toBeCloseTo(0);
    expect(identity.ty).toBeCloseTo(0);
  });

  it('스케일 0(특이 행렬)이면 null을 반환한다', () => {
    const m = getLocalMatrix(
      { x: 0, y: 0, rotation: 0, scaleX: 0, scaleY: 1, opacity: 1 },
      { x: 0, y: 0 },
    );
    expect(invertMat(m)).toBeNull();
  });
});

describe('decomposeMatrix', () => {
  it('getLocalMatrix와 라운드트립: TRS를 그대로 복원한다', () => {
    const t = { x: 123, y: -45, rotation: 37, scaleX: 1.4, scaleY: 0.6, opacity: 1 };
    const pivot = { x: 50, y: 80 };
    const back = decomposeMatrix(getLocalMatrix(t, pivot), pivot);
    expect(back.x).toBeCloseTo(t.x);
    expect(back.y).toBeCloseTo(t.y);
    expect(back.rotation).toBeCloseTo(t.rotation);
    expect(back.scaleX).toBeCloseTo(t.scaleX);
    expect(back.scaleY).toBeCloseTo(t.scaleY);
  });

  it('재부모화: (새 부모 월드)⁻¹ × 기존 월드로 보정하면 월드 위치가 유지된다', () => {
    const pivot = { x: 100, y: 100 };
    const parent = node('parent', null, { x: 300, y: 200, rotation: 30, scaleX: 1.5, scaleY: 1.5 });
    parent.pivot = pivot;
    const child = node('child', null, { x: 500, y: 400 });
    child.pivot = pivot;
    const d = doc([parent, child]);

    const oldWorld = getWorldMatrix(d, 'child', 0);
    const parentWorld = getWorldMatrix(d, 'parent', 0);
    const newLocal = decomposeMatrix(multiplyMat(invertMat(parentWorld)!, oldWorld), child.pivot);

    child.parentId = 'parent';
    Object.assign(child.base, newLocal);
    const newWorld = getWorldMatrix(d, 'child', 0);

    // pivot 지점의 월드 위치가 재부모화 전후로 동일해야 한다
    const before = transformPoint(oldWorld, pivot.x, pivot.y);
    const after = transformPoint(newWorld, pivot.x, pivot.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});
