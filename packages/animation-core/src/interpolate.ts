import { applyEasing } from './easing';
import type {
  AnimatableProperty,
  Keyframe,
  NodeAnimations,
  SceneDocument,
  SceneNode,
  Transform,
} from './types';
import { ANIMATABLE_PROPERTIES } from './types';

/**
 * 키프레임 배열에서 특정 프레임의 값을 샘플링한다.
 * - 키프레임 없음 → fallback (노드의 base 값)
 * - 첫 키 이전 / 마지막 키 이후 → 양 끝 값 고정
 * - 두 키 사이 → 앞 키의 easing으로 보간 (hold는 앞 키 값 고정)
 *
 * keyframes는 frame 오름차순 정렬이 불변식이다 (에디터가 보장).
 */
export function sampleKeyframes(
  keyframes: readonly Keyframe[] | undefined,
  frame: number,
  fallback: number,
): number {
  if (!keyframes || keyframes.length === 0) return fallback;

  const first = keyframes[0]!;
  if (frame <= first.frame) return first.value;

  const last = keyframes[keyframes.length - 1]!;
  if (frame >= last.frame) return last.value;

  // 프레임 수가 많아도 키프레임 수는 작으므로 이진 탐색으로 구간을 찾는다
  let lo = 0;
  let hi = keyframes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid]!.frame <= frame) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const from = keyframes[lo]!;
  const to = keyframes[hi]!;
  if (from.easing.type === 'hold') return from.value;

  const progress = (frame - from.frame) / (to.frame - from.frame);
  return from.value + (to.value - from.value) * applyEasing(from.easing, progress);
}

/** 특정 프레임에서 노드의 로컬(부모 기준) 트랜스폼을 계산한다. */
export function getLocalTransform(
  node: SceneNode,
  animations: NodeAnimations | undefined,
  frame: number,
): Transform {
  const result = { ...node.base };
  for (const property of ANIMATABLE_PROPERTIES) {
    result[property] = sampleKeyframes(animations?.[property], frame, node.base[property]);
  }
  return result;
}

export interface SceneTreeNode {
  node: SceneNode;
  children: SceneTreeNode[];
}

/**
 * 평면 노드 배열(parentId 참조)을 렌더링용 트리로 변환한다.
 * 각 계층의 순서는 원본 배열 순서(= 레이어 순서)를 유지한다.
 * 존재하지 않는 부모를 가리키는 노드는 루트로 취급한다 (방어적).
 */
export function buildSceneTree(nodes: readonly SceneNode[]): SceneTreeNode[] {
  const treeNodes = new Map<string, SceneTreeNode>();
  for (const node of nodes) {
    treeNodes.set(node.id, { node, children: [] });
  }

  const roots: SceneTreeNode[] = [];
  for (const node of nodes) {
    const treeNode = treeNodes.get(node.id)!;
    const parent = node.parentId ? treeNodes.get(node.parentId) : undefined;
    if (parent && node.parentId !== node.id) {
      parent.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }
  return roots;
}

/** 특정 프레임의 모든 노드 로컬 트랜스폼. 에디터의 속성 패널 표시 등에 사용한다. */
export function getFrameTransforms(document: SceneDocument, frame: number): Map<string, Transform> {
  const result = new Map<string, Transform>();
  for (const node of document.nodes) {
    result.set(node.id, getLocalTransform(node, document.animations[node.id], frame));
  }
  return result;
}
