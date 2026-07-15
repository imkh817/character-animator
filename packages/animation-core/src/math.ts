import { getLocalTransform } from './interpolate';
import type { SceneDocument, SceneNode, Transform, Vec2 } from './types';

/**
 * 2D 아핀 행렬. CSS matrix(a, b, c, d, tx, ty)와 같은 표기.
 * | a c tx |
 * | b d ty |
 */
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY_MAT: Mat2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/** m1 × m2 (m2를 먼저 적용) */
export function multiplyMat(m1: Mat2D, m2: Mat2D): Mat2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
    ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty,
  };
}

function translation(x: number, y: number): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y };
}

function rotationDeg(deg: number): Mat2D {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
}

function scaling(sx: number, sy: number): Mat2D {
  return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
}

/**
 * 노드의 로컬 행렬. CharacterScene의 CSS
 * `translate(x,y) rotate(r) scale(sx,sy)` + `transform-origin: pivot`과 정확히 동치다.
 */
export function getLocalMatrix(transform: Transform, pivot: Vec2): Mat2D {
  let m = translation(transform.x + pivot.x, transform.y + pivot.y);
  m = multiplyMat(m, rotationDeg(transform.rotation));
  m = multiplyMat(m, scaling(transform.scaleX, transform.scaleY));
  m = multiplyMat(m, translation(-pivot.x, -pivot.y));
  return m;
}

/** 루트→노드 체인을 합성한 월드 행렬. 캔버스 히트테스트/드래그 좌표 변환에 사용한다. */
export function getWorldMatrix(document: SceneDocument, nodeId: string, frame: number): Mat2D {
  const byId = new Map(document.nodes.map((n) => [n.id, n]));
  const chain: SceneNode[] = [];
  const visited = new Set<string>();
  let cursor = byId.get(nodeId);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  let m = IDENTITY_MAT;
  for (const node of chain) {
    const local = getLocalTransform(node, document.animations[node.id], frame);
    m = multiplyMat(m, getLocalMatrix(local, node.pivot));
  }
  return m;
}

/** 선형 부분(회전·스케일)의 역행렬. 화면 delta → 부모 공간 delta 변환에 사용한다. */
export function invertLinear(m: Mat2D): Pick<Mat2D, 'a' | 'b' | 'c' | 'd'> | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-9) return null;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det };
}

export function transformVector(m: Pick<Mat2D, 'a' | 'b' | 'c' | 'd'>, x: number, y: number): Vec2 {
  return { x: m.a * x + m.c * y, y: m.b * x + m.d * y };
}

export function transformPoint(m: Mat2D, x: number, y: number): Vec2 {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty };
}

/** 이동까지 포함한 완전한 아핀 역행렬. 재부모화 시 월드 좌표 보존에 사용한다. */
export function invertMat(m: Mat2D): Mat2D | null {
  const lin = invertLinear(m);
  if (!lin) return null;
  return {
    ...lin,
    tx: -(lin.a * m.tx + lin.c * m.ty),
    ty: -(lin.b * m.tx + lin.d * m.ty),
  };
}

/**
 * getLocalMatrix의 역연산: 행렬을 pivot 기준 TRS(Transform의 x/y/rotation/scale)로 분해한다.
 * 부모의 회전 × 비균일 스케일 조합이 만드는 skew는 TRS로 표현할 수 없어 버려지지만,
 * pivot 지점은 getLocalMatrix에서 항상 (x+pivot, y+pivot)으로 사상되므로
 * pivot의 월드 위치만은 skew 여부와 무관하게 정확히 보존된다.
 */
export function decomposeMatrix(
  m: Mat2D,
  pivot: Vec2,
): Pick<Transform, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'> {
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const scaleX = Math.hypot(m.a, m.b);
  const det = m.a * m.d - m.b * m.c;
  // det/scaleX로 구해야 반전(음수 스케일)이 scaleY 부호로 보존된다
  const scaleY = scaleX < 1e-9 ? Math.hypot(m.c, m.d) : det / scaleX;
  const p = transformPoint(m, pivot.x, pivot.y);
  return { x: p.x - pivot.x, y: p.y - pivot.y, rotation, scaleX, scaleY };
}
