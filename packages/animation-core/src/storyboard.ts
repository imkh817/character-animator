import { sampleKeyframes } from './interpolate';
import { getPreset } from './presets';
import type {
  AnimatableProperty,
  Easing,
  Keyframe,
  NodeAnimations,
  SceneNode,
  Storyboard,
} from './types';

/**
 * 스토리보드 → 키프레임 컴파일러.
 *
 * 블록은 순서대로 이어 붙인 시간 구간이고, 각 블록의 프리셋은 블록 시작 프레임만큼
 * 밀어서 배치된다. 모든 프리셋은 base 값에서 시작해 base 값으로 돌아오므로
 * (presets.ts의 loopSequence 참고) 블록 경계에서 값이 튀지 않는다.
 */

const HOLD: Easing = { type: 'hold' };

export interface BlockRange {
  id: string;
  start: number;
  durationInFrames: number;
}

/** 각 블록의 시작 프레임과 길이. 블록 길이는 최소 1프레임으로 보정한다. */
export function blockRanges(storyboard: Storyboard): BlockRange[] {
  const ranges: BlockRange[] = [];
  let start = 0;
  for (const block of storyboard.blocks) {
    const durationInFrames = Math.max(1, Math.round(block.durationInFrames));
    ranges.push({ id: block.id, start, durationInFrames });
    start += durationInFrames;
  }
  return ranges;
}

export function storyboardTotalFrames(storyboard: Storyboard): number {
  return Math.max(
    1,
    storyboard.blocks.reduce((sum, b) => sum + Math.max(1, Math.round(b.durationInFrames)), 0),
  );
}

export interface CompiledStoryboard {
  durationInFrames: number;
  /**
   * 스토리보드가 상태를 가진 노드들의 애니메이션. 해당 노드의 기존 트랙을 통째로
   * 대체해야 한다 (빈 객체 = 애니메이션 없음). 언급되지 않은 노드는 건드리지 않는다.
   */
  animations: Record<string, NodeAnimations>;
}

export function compileStoryboard(
  storyboard: Storyboard,
  nodes: readonly SceneNode[],
  fps: number,
): CompiledStoryboard {
  const ranges = blockRanges(storyboard);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // 어떤 블록에서든 상태를 가진 노드만 관리 대상 — 나머지의 수동 키프레임은 보존된다
  const managed = new Set<string>();
  for (const block of storyboard.blocks) {
    for (const nodeId of Object.keys(block.nodes)) managed.add(nodeId);
  }

  const animations: Record<string, NodeAnimations> = {};
  for (const nodeId of managed) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    animations[nodeId] = compileNode(storyboard, ranges, node, fps);
  }

  return { durationInFrames: storyboardTotalFrames(storyboard), animations };
}

function compileNode(
  storyboard: Storyboard,
  ranges: BlockRange[],
  node: SceneNode,
  fps: number,
): NodeAnimations {
  const tracks: NodeAnimations = {};

  // 1) 블록별 프리셋을 블록 시작만큼 오프셋해 배치 (숨긴 블록에서는 실행하지 않는다)
  storyboard.blocks.forEach((block, i) => {
    const state = block.nodes[node.id];
    if (!state || state.hidden || !state.presetIds?.length) return;
    const { start, durationInFrames } = ranges[i]!;

    const generated: NodeAnimations = {};
    for (const presetId of state.presetIds) {
      const preset = getPreset(presetId);
      if (!preset) continue;
      Object.assign(generated, preset.generate({ base: node.base, fps, durationInFrames }));
    }

    const lastFrame = start + durationInFrames - 1;
    for (const property of Object.keys(generated) as AnimatableProperty[]) {
      const track = (tracks[property] ??= []);
      // 첫 키프레임 이전 구간은 그 값으로 고정되므로(sampleKeyframes), base가 아닌 값에서
      // 시작하는 프리셋(등장!의 opacity 0 등)이 앞 장면들로 새지 않게 직전 프레임에 base를 고정
      if (start > 0) {
        track.push({ frame: start - 1, value: node.base[property], easing: HOLD });
      }
      for (const kf of generated[property]!) {
        track.push({ ...kf, frame: Math.min(start + kf.frame, lastFrame) });
      }
    }
  });

  // 2) 숨김이 하나라도 있으면 opacity 트랙을 블록 단위 hold로 재구성
  const anyHidden = storyboard.blocks.some((b) => b.nodes[node.id]?.hidden);
  if (anyHidden) {
    tracks.opacity = buildVisibilityTrack(storyboard, ranges, node, tracks.opacity ?? []);
  }

  // 정렬 + 같은 프레임 중복 제거(뒤가 우선) — animations의 오름차순 불변식 유지
  for (const property of Object.keys(tracks) as AnimatableProperty[]) {
    const sorted = [...tracks[property]!].sort((a, b) => a.frame - b.frame);
    const dedup: Keyframe[] = [];
    for (const kf of sorted) {
      if (dedup.length > 0 && dedup[dedup.length - 1]!.frame === kf.frame) {
        dedup[dedup.length - 1] = kf;
      } else {
        dedup.push(kf);
      }
    }
    if (dedup.length > 0) tracks[property] = dedup;
    else delete tracks[property];
  }

  return tracks;
}

/**
 * 숨김 블록은 opacity 0, 보이는 블록은 프리셋 opacity(있으면) 또는 base 값.
 * hold easing으로 장면 경계에서 즉시 전환된다 — 서서히 사라지는 누출을 막기 위해
 * 숨김 블록 직전 프레임에도 현재 값을 고정하는 앵커를 넣는다.
 */
function buildVisibilityTrack(
  storyboard: Storyboard,
  ranges: BlockRange[],
  node: SceneNode,
  presetOpacity: Keyframe[],
): Keyframe[] {
  const track: Keyframe[] = [];
  storyboard.blocks.forEach((block, i) => {
    const { start, durationInFrames } = ranges[i]!;
    const end = start + durationInFrames - 1;

    if (block.nodes[node.id]?.hidden) {
      track.push({ frame: start, value: 0, easing: HOLD });
      return;
    }

    const inBlock = presetOpacity.filter((k) => k.frame >= start && k.frame <= end);
    if (inBlock.length === 0 || inBlock[0]!.frame > start) {
      track.push({ frame: start, value: node.base.opacity, easing: HOLD });
    }
    track.push(...inBlock);

    const nextBlock = storyboard.blocks[i + 1];
    if (nextBlock?.nodes[node.id]?.hidden && !inBlock.some((k) => k.frame === end)) {
      const value =
        inBlock.length > 0 ? sampleKeyframes(inBlock, end, node.base.opacity) : node.base.opacity;
      track.push({ frame: end, value, easing: HOLD });
    }
  });
  return track;
}
