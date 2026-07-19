import type { Easing, Keyframe, NodeAnimations, Transform } from './types';

/**
 * 원클릭 애니메이션 프리셋. "프리셋 = 키프레임 생성기"일 뿐이므로
 * 문서 스키마나 렌더러는 프리셋의 존재를 모른다.
 * 노드의 현재 base 트랜스폼을 기준으로 상대적으로 움직인다.
 */

export interface PresetContext {
  base: Transform;
  fps: number;
  durationInFrames: number;
}

export interface AnimationPreset {
  id: string;
  emoji: string;
  label: string;
  description: string;
  generate: (ctx: PresetContext) => NodeAnimations;
}

const EASE: Easing = { type: 'easeInOut' };
const LINEAR: Easing = { type: 'linear' };

/**
 * offsets 패턴을 step 프레임 간격으로 장면 끝까지 반복한다.
 * 마지막에 offsets[0](기준값)으로 복귀시켜 루프 이음새를 없앤다.
 */
function loopSequence(
  base: number,
  offsets: number[],
  stepFrames: number,
  durationInFrames: number,
  easing: Easing = EASE,
): Keyframe[] {
  const step = Math.max(1, Math.round(stepFrames));
  const lastFrame = durationInFrames - 1;
  const keyframes: Keyframe[] = [];
  let i = 0;
  for (let frame = 0; frame <= lastFrame - step; frame += step) {
    keyframes.push({ frame, value: base + offsets[i % offsets.length]!, easing });
    i++;
  }
  const tail = keyframes.length > 0 ? keyframes[keyframes.length - 1]!.frame : 0;
  keyframes.push({
    frame: Math.min(tail + step, lastFrame),
    value: base + offsets[0]!,
    easing,
  });
  return keyframes;
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    id: 'breathe',
    emoji: '🫁',
    label: '숨쉬기',
    description: '살아있는 느낌의 미세한 커짐/작아짐 (idle)',
    generate: ({ base, fps, durationInFrames }) => ({
      scaleX: loopSequence(base.scaleX, [0, 0.03], fps, durationInFrames),
      scaleY: loopSequence(base.scaleY, [0, 0.04], fps, durationInFrames),
    }),
  },
  {
    id: 'nod',
    emoji: '🙂',
    label: '끄덕끄덕',
    description: '고개를 앞뒤로 끄덕이기',
    generate: ({ base, fps, durationInFrames }) => ({
      rotation: loopSequence(base.rotation, [0, 12], fps * 0.5, durationInFrames),
    }),
  },
  {
    id: 'sway',
    emoji: '🌿',
    label: '좌우 흔들',
    description: '좌우로 천천히 갸웃갸웃',
    generate: ({ base, fps, durationInFrames }) => ({
      rotation: loopSequence(base.rotation, [0, 14, 0, -14], fps * 0.4, durationInFrames),
    }),
  },
  {
    id: 'wave',
    emoji: '👋',
    label: '손 흔들기',
    description: '빠르게 흔들기 (팔에 적용해 보세요)',
    generate: ({ base, fps, durationInFrames }) => ({
      rotation: loopSequence(base.rotation, [0, 35], fps * 0.25, durationInFrames),
    }),
  },
  {
    id: 'bounce',
    emoji: '🏀',
    label: '콩콩',
    description: '통통 뛰기',
    generate: ({ base, fps, durationInFrames }) => ({
      y: loopSequence(base.y, [0, -Math.max(30, Math.abs(base.y) * 0.08)], fps * 0.35, durationInFrames),
    }),
  },
  {
    id: 'wiggle',
    emoji: '✨',
    label: '파르르',
    description: '가늘게 떨기',
    generate: ({ base, durationInFrames }) => ({
      x: loopSequence(base.x, [0, 6, 0, -6], 2, durationInFrames, LINEAR),
    }),
  },
  {
    id: 'spin',
    emoji: '🔄',
    label: '빙글빙글',
    description: '제자리 회전',
    generate: ({ base, fps, durationInFrames }) => {
      const turns = Math.max(1, Math.round(durationInFrames / fps / 2));
      return {
        rotation: [
          { frame: 0, value: base.rotation, easing: LINEAR },
          { frame: durationInFrames - 1, value: base.rotation + 360 * turns, easing: LINEAR },
        ],
      };
    },
  },
  {
    id: 'swingA',
    emoji: '🦵',
    label: '스윙 A',
    description: '관절 기준 앞뒤 스윙. 피벗을 관절(이미지 위쪽)에 두고 다리·팔에 적용하세요',
    generate: ({ base, fps, durationInFrames }) => ({
      rotation: loopSequence(base.rotation, [0, 22, 0, -22], fps * 0.2, durationInFrames),
    }),
  },
  {
    id: 'swingB',
    emoji: '🦿',
    label: '스윙 B',
    description: '스윙 A와 반대 위상. 반대쪽 다리·팔에 적용하면 달리기가 됩니다',
    generate: ({ base, fps, durationInFrames }) => ({
      rotation: loopSequence(base.rotation, [0, -22, 0, 22], fps * 0.2, durationInFrames),
    }),
  },
  {
    id: 'runBob',
    emoji: '🏃',
    label: '달리기 들썩',
    description: '달리는 리듬의 위아래 들썩임. 몸통이나 그룹 전체에 함께 적용해 보세요',
    generate: ({ base, fps, durationInFrames }) => ({
      y: loopSequence(base.y, [0, -16], fps * 0.2, durationInFrames),
    }),
  },
  {
    id: 'blink',
    emoji: '👁️',
    label: '눈 깜빡',
    description: '몇 초마다 빠르게 깜빡입니다. 분리된 눈 파츠에 적용하세요',
    generate: ({ base, fps, durationInFrames }) => {
      const last = durationInFrames - 1;
      const closed = base.scaleY * 0.08;
      // 약 2.4초마다 한 번, 감기 0.07초 → 감은 채 0.05초 → 뜨기 0.09초
      const interval = Math.max(4, Math.round(fps * 2.4));
      const shut = Math.max(1, Math.round(fps * 0.07));
      const hold = Math.max(1, Math.round(fps * 0.05));
      const open = Math.max(1, Math.round(fps * 0.09));
      const scaleY: Keyframe[] = [{ frame: 0, value: base.scaleY, easing: EASE }];
      for (let t = interval; t + shut + hold + open <= last; t += interval) {
        scaleY.push(
          { frame: t, value: base.scaleY, easing: EASE },
          { frame: t + shut, value: closed, easing: EASE },
          { frame: t + shut + hold, value: closed, easing: EASE },
          { frame: t + shut + hold + open, value: base.scaleY, easing: EASE },
        );
      }
      // 장면 끝은 항상 뜬 상태 — 루프 이음새가 없다
      if (scaleY[scaleY.length - 1]!.frame < last) {
        scaleY.push({ frame: last, value: base.scaleY, easing: EASE });
      }
      return { scaleY };
    },
  },
  {
    id: 'popIn',
    emoji: '🎬',
    label: '등장!',
    description: '뿅 하고 나타나기 (장면 시작)',
    generate: ({ base, fps, durationInFrames }) => {
      const lastFrame = durationInFrames - 1;
      const appear = Math.min(Math.max(2, Math.round(fps * 0.35)), Math.max(1, lastFrame));
      const settle = Math.min(appear + Math.max(2, Math.round(fps * 0.15)), lastFrame);

      const scaleTrack = (scale: number): Keyframe[] => {
        const keyframes: Keyframe[] = [
          { frame: 0, value: scale * 0.5, easing: { type: 'easeOut' } },
          { frame: appear, value: scale * 1.08, easing: EASE },
        ];
        // 장면이 아주 짧으면 오버슛 복귀 키프레임이 들어갈 자리가 없을 수 있다
        if (settle > appear) {
          keyframes.push({ frame: settle, value: scale, easing: EASE });
        }
        return keyframes;
      };

      return {
        opacity: [
          { frame: 0, value: 0, easing: { type: 'easeOut' } },
          { frame: appear, value: base.opacity, easing: EASE },
        ],
        scaleX: scaleTrack(base.scaleX),
        scaleY: scaleTrack(base.scaleY),
      };
    },
  },
];

export function getPreset(id: string): AnimationPreset | undefined {
  return ANIMATION_PRESETS.find((p) => p.id === id);
}
